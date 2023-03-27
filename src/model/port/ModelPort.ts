import {isArrayBuffer} from "util/types";
import {MessagePort} from "worker_threads";
import {createGreedyAgent} from "../../game/agent/greedy";
import {ExperienceBattleAgent} from "../../game/experience";
import {AgentExploreConfig} from "../../game/pool/worker";
import {AgentExperienceCallback} from "../../game/pool/worker/GameModel";
import {verifyInputData, verifyOutputData} from "../../model/verify";
import {
    allocEncodedState,
    encodeState,
} from "../../psbot/handlers/battle/ai/encoder";
import {dedup} from "../../util/dedup";
import {WrappedError} from "../../util/errors/WrappedError";
import {AsyncPort, ProtocolResultRaw} from "../../util/port/AsyncPort";
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
     * Creates a BattleAgent from this port with optional experience support.
     *
     * @param explore Exploration policy config.
     * @param expCallback Callback for handling generated experience data.
     * @param debugRankings If true, the returned BattleAgent will also return a
     * debug string displaying the value of each choice.
     */
    public getAgent(
        explore?: AgentExploreConfig,
        expCallback?: AgentExperienceCallback,
        debugRankings?: boolean,
    ): ExperienceBattleAgent<string | undefined> {
        return createGreedyAgent(
            async (state, choices, lastAction?: number, reward?: number) => {
                const stateData = allocEncodedState(
                    // Since experience is sent through a different protocol, we
                    // use a shared buffer to prevent copying on the second
                    // transfer of state data.
                    expCallback && "shared",
                );
                encodeState(stateData, state);
                verifyInputData(stateData);

                await expCallback?.(stateData, choices, lastAction, reward);

                const result = await this.predict(stateData);
                verifyOutputData(result.output);

                return result.output;
            },
            explore,
            debugRankings,
        );
    }

    /** Requests a prediction from the neural network. */
    private async predict(state: Float32Array[]): Promise<PredictResult> {
        return await new Promise((res, rej) =>
            this.asyncPort.postMessage<"predict">(
                {
                    type: "predict",
                    rid: this.asyncPort.nextRid(),
                    state,
                },
                dedup(
                    state.flatMap(a =>
                        isArrayBuffer(a.buffer) ? [a.buffer] : [],
                    ),
                ),
                result =>
                    result.type === "error" ? rej(result.err) : res(result),
            ),
        );
    }
}
