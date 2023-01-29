// eslint-disable-next-line max-classes-per-file
import {serialize} from "v8";
import {MessageChannel, MessagePort} from "worker_threads";
import * as tf from "@tensorflow/tfjs";
import {ListenerSignature, TypedEmitter} from "tiny-typed-emitter";
import {TensorExperience} from "../game/experience/tensor";
import {encodedStateToTensors, verifyModel} from "../model/model";
import {
    PredictMessage,
    PredictWorkerResult,
    PredictResult,
    ModelPortMessage,
    ModelPortResult,
    FinalizeMessage,
    FinalizeResult,
} from "../model/port";
import {modelInputShapes} from "../model/shapes";
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
 * threads.
 */
export class RolloutModel {
    /** Currently held game worker ports. */
    private readonly ports = new Map<MessagePort, ExperienceContext>();
    /** Event manager for predict requests. */
    private readonly events = new TypedEmitter<Events>();

    /** Current pending predict request batch. */
    private predictBatch = new PredictBatch(
        modelInputShapes,
        false /*autoDisposeInput*/,
    );

    /**
     * Stores experiences that haven't yet been emitted into the replay buffer.
     */
    private experienceBuffer: TensorExperience[] = [];

    /**
     * Creates a RolloutModel object.
     *
     * @param name Name of the model.
     * @param model Model to wrap. Does not assume ownership since it's assumed
     * that a ModelRegistry already owns it.
     */
    public constructor(
        public readonly name: string,
        public readonly model: tf.LayersModel,
    ) {
        verifyModel(model);
    }

    /** Safely closes ports. */
    public unload(): void {
        for (const [port] of this.ports) {
            port.close();
        }
    }

    /**
     * Indicates that a game worker is subscribing to a model.
     *
     * @returns A port for queueing predictions that the game worker will use.
     */
    public subscribe(): MessagePort {
        const ec = new ExperienceContext(exp =>
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
        const state = encodedStateToTensors(msg.state);
        ec.add(state, msg.lastAction, msg.reward);

        const result = await new Promise<PredictResult>(res => {
            this.predictBatch.add(state, res);
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
        const state = msg.state && encodedStateToTensors(msg.state);
        const lastAction =
            msg.lastAction !== undefined
                ? tf.scalar(msg.lastAction, "int32")
                : undefined;
        const reward =
            msg.reward !== undefined
                ? tf.scalar(msg.reward, "float32")
                : undefined;
        ec.finalize(state, lastAction, reward);
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
    public async step(): Promise<TensorExperience[]> {
        while (this.predictBatch.length <= 0) {
            await new Promise<void>(res =>
                this.events.once(predictRequest, res),
            );
        }
        // Give time for rollout game threads to make predict requests.
        // Without this, all batch predicts will just have size=1.
        await tf.nextFrame();

        const batch = this.predictBatch;
        this.predictBatch = new PredictBatch(
            modelInputShapes,
            false /*autoDisposeInput*/,
        );

        await batch.resolve(
            tf.tidy(() =>
                (this.model.predictOnBatch(batch.toTensors()) as tf.Tensor)
                    .as2D(batch.length, intToChoice.length)
                    .unstack<tf.Tensor1D>(),
            ),
        );

        const exps = this.experienceBuffer;
        this.experienceBuffer = [];
        return exps;
    }
}

/** Tracks Experience generation for one side of a game. */
class ExperienceContext {
    private lastState?: tf.Tensor[];
    private lastAction?: tf.Scalar;
    private lastReward?: tf.Scalar;

    /**
     * Creates an ExperienceContext.
     *
     * @param callback Callback to emit experiences.
     */
    public constructor(
        private readonly callback: (exp: TensorExperience) => void,
    ) {}

    /**
     * Adds data for generating experience.
     *
     * @param state Resultant state.
     * @param action Action used to get to state.
     * @param reward Net reward from state transition.
     */
    public add(state: tf.Tensor[], action?: number, reward?: number): void {
        if (!this.lastState) {
            this.lastState = state;
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
        const {lastState} = this;
        this.lastState = state;
        this.lastAction?.dispose();
        this.lastAction = tf.scalar(action, "int32");
        this.lastReward?.dispose();
        this.lastReward = tf.scalar(reward, "float32");
        this.callback({
            state: lastState,
            action: this.lastAction.clone(),
            reward: this.lastReward.clone(),
            nextState: state.map(t => t.clone()),
            done: tf.scalar(false),
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
        state?: tf.Tensor[],
        action?: tf.Scalar,
        reward?: tf.Scalar,
    ): void {
        if (!state) {
            // Game was forced to end abruptly.
            tf.dispose(this.lastState);
            this.lastAction?.dispose();
            this.lastReward?.dispose();
            action?.dispose();
            reward?.dispose();
            return;
        }
        if (!this.lastState) {
            throw new Error("No last state");
        }
        if (!action) {
            action = this.lastAction;
            if (!action) {
                throw new Error("No last action provided");
            }
        } else {
            this.lastAction?.dispose();
            this.lastAction = undefined;
        }
        if (!reward) {
            reward = this.lastReward;
            if (!reward) {
                throw new Error("No last reward provided");
            }
        } else {
            this.lastReward?.dispose();
            this.lastReward = undefined;
        }
        this.callback({
            state: this.lastState,
            action,
            reward,
            nextState: state,
            done: tf.scalar(true),
        });
        this.lastState = undefined;
    }
}
