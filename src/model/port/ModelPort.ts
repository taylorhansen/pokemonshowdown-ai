import {MessagePort} from "worker_threads";
import {randomAgent} from "../../game/agent/random";
import {ExperienceBattleAgent} from "../../game/experience";
import {AgentExploreConfig} from "../../game/pool/worker";
import {verifyInputData, verifyOutputData} from "../../model/verify";
import {
    allocEncodedState,
    encodeState,
} from "../../psbot/handlers/battle/ai/encoder";
import {maxAgent} from "../../psbot/handlers/battle/ai/maxAgent";
import {WrappedError} from "../../util/errors/WrappedError";
import {AsyncPort, ProtocolResultRaw} from "../../util/port/AsyncPort";
import {rng} from "../../util/random";
import {ModelPortProtocol, PredictResult} from "./ModelPortProtocol";

/**
 * Abstracts the interface between a game worker and a model owned by the main
 * ModelWorker.
 *
 * Intended to be used by only one BattleAgent within a game worker that
 * received a port to connect to a model.
 */
export class ModelPort {
    /** Port wrapper. */
    private readonly asyncPort: AsyncPort<
        MessagePort,
        ModelPortProtocol,
        keyof ModelPortProtocol
    >;

    /**
     * Creates a ModelPort.
     *
     * @param port Message port.
     */
    public constructor(port: MessagePort) {
        this.asyncPort = new AsyncPort(port);
        port.on(
            "message",
            (
                res: ProtocolResultRaw<
                    ModelPortProtocol,
                    keyof ModelPortProtocol,
                    keyof ModelPortProtocol
                >,
            ) => this.asyncPort.receiveMessage(res),
        );
        port.on("error", (err: Error) =>
            this.asyncPort.receiveError(
                new WrappedError(
                    err,
                    msg =>
                        "ModelPort encountered an unhandled exception: " + msg,
                ),
            ),
        );
    }

    /** Closes the connection. */
    public close(): void {
        this.asyncPort.port.close();
    }

    /**
     * Creates a BattleAgent from this port.
     *
     * @param explore Exploration policy config.
     * @param debugRankings If true, the returned BattleAgent will also return a
     * debug string displaying the output of each choice.
     */
    public getAgent(
        explore?: AgentExploreConfig,
        debugRankings?: boolean,
    ): ExperienceBattleAgent<string | undefined> {
        const random = explore?.seed ? rng(explore.seed) : Math.random;

        const greedyAgent = maxAgent(
            async (state, lastAction?: number, reward?: number) => {
                const stateData = allocEncodedState();
                encodeState(stateData, state);
                verifyInputData(stateData);

                const result = await this.predict(
                    stateData,
                    lastAction,
                    reward,
                );
                verifyOutputData(result.output);

                return result.output;
            },
            debugRankings,
        );

        return async function modelPortAgent(
            state,
            choices,
            logger,
            lastAction,
            reward,
        ) {
            const info = await greedyAgent(
                state,
                choices,
                logger,
                lastAction,
                reward,
            );

            if (explore && random() < explore.factor) {
                logger?.debug("Exploring");
                await randomAgent(state, choices, random);
            }
            return info;
        };
    }

    /**
     * Finalizes game experience generation.
     * @param state Final state.
     * @param lastAction Last action taken before arriving at state.
     * @param reward Final reward.
     */
    public async finalize(
        state?: Float32Array[],
        lastAction?: number,
        reward?: number,
    ): Promise<void> {
        return await new Promise((res, rej) =>
            this.asyncPort.postMessage<"finalize">(
                {
                    type: "finalize",
                    rid: this.asyncPort.nextRid(),
                    ...(state && {state}),
                    ...(lastAction !== undefined && {lastAction}),
                    ...(reward !== undefined && {reward}),
                },
                state?.map(a => a.buffer) ?? [],
                result => (result.type === "error" ? rej(result.err) : res()),
            ),
        );
    }

    /** Requests a prediction from the neural network. */
    private async predict(
        state: Float32Array[],
        lastAction?: number,
        reward?: number,
    ): Promise<PredictResult> {
        return await new Promise((res, rej) =>
            this.asyncPort.postMessage<"predict">(
                {
                    type: "predict",
                    rid: this.asyncPort.nextRid(),
                    state,
                    ...(lastAction !== undefined && {lastAction}),
                    ...(reward !== undefined && {reward}),
                },
                state.map(a => a.buffer),
                result =>
                    result.type === "error" ? rej(result.err) : res(result),
            ),
        );
    }
}
