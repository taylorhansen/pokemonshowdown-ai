// eslint-disable-next-line max-classes-per-file
import {serialize} from "v8";
import {MessageChannel, MessagePort} from "worker_threads";
import * as tf from "@tensorflow/tfjs";
import {ListenerSignature, TypedEmitter} from "tiny-typed-emitter";
import {ExperienceConfig} from "../config/types";
import {Experience} from "../game/experience";
import {createSupport, ModelMetadata, verifyModel} from "../model/model";
import {
    PredictMessage,
    PredictWorkerResult,
    PredictResult,
    ModelPortMessage,
    ModelPortResult,
    FinalizeMessage,
    FinalizeResult,
} from "../model/port";
import {PredictBatch} from "../model/worker/PredictBatch";
import {intToChoice} from "../psbot/handlers/battle/agent";
import {RawPortResultError} from "../util/port/PortProtocol";

/** Event for when a model prediction is requested. */
const predictRequest = Symbol("predictRequest");

/** Defines events that the RolloutModel implements. */
interface Events extends ListenerSignature<{[predictRequest]: true}> {
    /** When the model is requested to make a prediction. */
    readonly [predictRequest]: () => void;
}

/**
 * Wraps a model for use in the rollout stage of training. Manages batched
 * synchronized time steps with both the learn stage and the rollout game
 * threads for experience generation.
 */
export class RolloutModel {
    /** Currently held game worker ports. */
    private readonly ports = new Map<MessagePort, ExperienceContext>();
    /** Event manager for predict requests. */
    private readonly events = new TypedEmitter<Events>();

    /** Current pending predict request batch. */
    private predictBatch: PredictBatch;

    /**
     * Stores experiences that haven't yet been emitted into the replay buffer.
     */
    private experienceBuffer: Experience[] = [];

    /**
     * Support of the Q value distribution. Used for distributional RL if
     * configured.
     */
    private readonly support?: tf.Tensor;

    /**
     * Creates a RolloutModel object.
     *
     * @param name Name of the model.
     * @param model Model to wrap. Does not assume ownership since it's assumed
     * that a ModelRegistry already owns it.
     * @param config Experience config.
     */
    public constructor(
        public readonly name: string,
        public readonly model: tf.LayersModel,
        private readonly config: ExperienceConfig,
    ) {
        verifyModel(model);

        const metadata = model.getUserDefinedMetadata() as
            | ModelMetadata
            | undefined;
        if (metadata?.config?.dist) {
            this.support = createSupport(metadata.config.dist).reshape([
                1,
                1,
                metadata.config.dist,
            ]);
        }
        this.predictBatch = new PredictBatch(this.support);
    }

    /** Safely closes ports. */
    public unload(): void {
        for (const [port] of this.ports) {
            port.close();
        }
        this.support?.dispose();
    }

    /**
     * Indicates that a game worker is subscribing to a model.
     *
     * @returns A port for queueing predictions that the game worker will use.
     */
    public subscribe(): MessagePort {
        const ec = new ExperienceContext(this.config, exp =>
            this.experienceBuffer.push(exp),
        );
        const {port1, port2} = new MessageChannel();
        this.ports.set(port1, ec);
        port1.on(
            "message",
            (msg: ModelPortMessage) =>
                void this.handle(msg, ec)
                    .then(result => {
                        port1.postMessage(
                            result,
                            result.type === "predict"
                                ? [result.output.buffer]
                                : [],
                        );
                    })
                    .catch(err => {
                        const result: RawPortResultError = {
                            type: "error",
                            rid: msg.rid,
                            done: true,
                            err: serialize(err),
                        };
                        port1.postMessage(result, [result.err.buffer]);
                    }),
        );
        port1.on("close", () => this.ports.delete(port1));
        return port2;
    }

    /** Handles a ModelPort message. */
    private async handle(
        msg: ModelPortMessage,
        ec: ExperienceContext,
    ): Promise<ModelPortResult> {
        switch (msg.type) {
            case "predict":
                return await this.predict(msg, ec);
            case "finalize":
                return this.finalize(msg, ec);
        }
    }

    /**
     * Queues a prediction for the neural network. Can be called multiple times
     * while other predict requests are still queued.
     */
    private async predict(
        msg: PredictMessage,
        ec: ExperienceContext,
    ): Promise<PredictWorkerResult> {
        ec.add(msg.state, msg.choices, msg.lastAction, msg.reward);

        const result = await new Promise<PredictResult>(res => {
            this.predictBatch.add(msg.state, res);
            this.events.emit(predictRequest);
        });
        return {
            type: "predict",
            rid: msg.rid,
            done: true,
            ...result,
        };
    }

    /** Finalizes experience generation. */
    private finalize(
        msg: FinalizeMessage,
        ec: ExperienceContext,
    ): FinalizeResult {
        ec.finalize(msg.state, msg.lastAction, msg.reward);
        return {
            type: "finalize",
            rid: msg.rid,
            done: true,
        };
    }

    /**
     * Flushes the predict buffer and executes the queued batch predict requests
     * from the game thread pool, returning the generated experiences from each
     * request.
     */
    public async step(): Promise<Experience[]> {
        while (this.predictBatch.length <= 0) {
            await new Promise<void>(res =>
                this.events.once(predictRequest, res),
            );
        }
        // Give time for rollout game threads to make predict requests.
        // Without this, all batch predicts will just have size=1.
        await tf.nextFrame();

        const batch = this.predictBatch;
        this.predictBatch = new PredictBatch(this.support);

        const results = tf.tidy(
            () => this.model.predictOnBatch(batch.toTensors()) as tf.Tensor,
        );
        await batch.resolve(results);
        results.dispose();

        const exps = this.experienceBuffer;
        this.experienceBuffer = [];
        return exps;
    }
}

/** Tracks Experience generation for one side of a game. */
class ExperienceContext {
    /** Contains last `steps-1` states. */
    private readonly states: Float32Array[][] = [];
    /** Contains last `steps-1` actions. */
    private readonly actions: number[] = [];
    /** Contains last `steps-1` rewards. */
    private readonly rewards: number[] = [];

    /** Most recent state. */
    private latestState: Float32Array[] | null = null;

    /**
     * Creates an ExperienceContext.
     *
     * @param config Experience config.
     * @param callback Callback to emit experiences.
     */
    public constructor(
        private readonly config: ExperienceConfig,
        private readonly callback: (exp: Experience) => void,
    ) {}

    /**
     * Adds data for generating experience.
     *
     * @param state Resultant state.
     * @param choices Available choices for the new state.
     * @param action Action used to get to state.
     * @param reward Net reward from state transition.
     */
    public add(
        state: Float32Array[],
        choices: Uint8Array,
        action?: number,
        reward?: number,
    ): void {
        if (!this.latestState) {
            // First decision doesn't have past action/reward yet.
            this.latestState = state;
            return;
        }

        if (action === undefined) {
            throw new Error(
                "Predict requests after first must include previous action",
            );
        }
        if (reward === undefined) {
            throw new Error(
                "Predict requests after first must include previous reward",
            );
        }

        this.states.push(this.latestState);
        this.latestState = state;
        this.actions.push(action);
        this.rewards.push(reward);

        if (this.states.length < this.config.steps) {
            return;
        }

        const lastState = this.states.shift()!;
        const lastAction = this.actions.shift()!;

        // Get n-step returns for current experience.
        let returns = this.rewards[this.rewards.length - 1];
        for (let i = this.rewards.length - 2; i >= 0; --i) {
            returns = this.rewards[i] + this.config.rewardDecay * returns;
        }
        this.rewards.shift();

        this.callback({
            state: lastState,
            action: lastAction,
            reward: returns,
            nextState: state,
            choices,
            done: false,
        });
    }

    /**
     * Generates the final experience for the game.
     *
     * @param state Final state. If omitted, no experience should be generated.
     * @param action Action before final state.
     * @param reward Final reward.
     */
    public finalize(
        state?: Float32Array[],
        action?: number,
        reward?: number,
    ): void {
        if (!state) {
            // Game was forced to end abruptly.
            return;
        }

        if (action === undefined) {
            throw new Error("No last action provided");
        }
        if (reward === undefined) {
            throw new Error("No last reward provided");
        }

        if (!this.latestState) {
            throw new Error("No last state");
        }

        const exps: Experience[] = [
            {
                state: this.latestState,
                action,
                reward,
                nextState: state,
                // Note: Pre-filled with zeros.
                choices: new Uint8Array(intToChoice.length),
                done: true,
            },
        ];

        // Get up-to-n-step returns for remaining buffered experiences.
        let returns = reward;
        while (this.states.length > 0) {
            const lastState = this.states.pop()!;
            const lastAction = this.actions.pop()!;
            const lastReward = this.rewards.pop()!;
            returns = lastReward + this.config.rewardDecay * returns;

            exps.push({
                state: lastState,
                action: lastAction,
                reward: returns,
                nextState: state,
                choices: new Uint8Array(intToChoice.length),
                done: true,
            });
        }

        // Preserve experience order.
        while (exps.length > 0) {
            this.callback(exps.pop()!);
        }
    }
}
