import {isSharedArrayBuffer} from "util/types";
import {MessagePort} from "worker_threads";
import {modelInputNames} from "../../../model/shapes";
import {intToChoice} from "../../../psbot/handlers/battle/agent";
import {
    allocEncodedState,
    encodeState,
} from "../../../psbot/handlers/battle/ai/encoder";
import {maxAgent} from "../../../psbot/handlers/battle/ai/maxAgent";
import {WrappedError} from "../../../util/errors/WrappedError";
import {rng} from "../../../util/random";
import {randomExpAgent} from "../../game/agent/random";
import {
    ExperienceAgent,
    ExperienceAgentData,
} from "../../game/experience/Experience";
import {AgentExploreConfig} from "../../game/pool/worker";
import {AsyncPort, ProtocolResultRaw} from "../../port/AsyncPort";
import {
    ModelPortProtocol,
    PredictMessage,
    PredictResult,
} from "./ModelPortProtocol";

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
     * Creates a BattleAgent from this port that
     * {@link ExperienceAgent returns} data used for building Experience objs.
     *
     * @param explore Exploration policy config.
     */
    public getAgent(explore?: AgentExploreConfig): ExperienceAgent {
        const random = explore?.seed ? rng(explore.seed) : Math.random;

        let data: ExperienceAgentData | null = null;

        const innerAgent = maxAgent(async state => {
            const stateData = allocEncodedState("shared");
            encodeState(stateData, state);
            ModelPort.verifyInput(stateData);

            const result = await this.predict(stateData);
            ModelPort.verifyOutput(result.output);

            data = {state: stateData};
            return result.output;
        });

        return async function portAgent(state, choices, logger) {
            if (explore && random() < explore.factor) {
                logger?.debug("Exploring");
                return await randomExpAgent(state, choices, random);
            }

            logger?.debug("Exploiting");
            await innerAgent(state, choices, logger);
            if (!data) {
                throw new Error(
                    "ModelPort agent didn't collect experience data",
                );
            }
            const result = data;
            data = null;
            return result;
        };
    }

    /**
     * Makes sure that the input doesn't contain invalid values, i.e. `NaN`s or
     * values outside the range `[-1, 1]`.
     */
    public static verifyInput(data: Float32Array[]): void {
        for (let i = 0; i < data.length; ++i) {
            const arr = data[i];
            for (let j = 0; j < arr.length; ++j) {
                const value = arr[j];
                if (isNaN(value)) {
                    throw new Error(
                        `Model input ${i} (${modelInputNames[i]}) contains ` +
                            `NaN at index ${j}`,
                    );
                }
                if (value < -1 || value > 1) {
                    throw new Error(
                        `Model input ${i} (${modelInputNames[i]}) contains ` +
                            `an out-of-range value ${value} at index ${j}`,
                    );
                }
            }
        }
    }

    /** Makes sure that the output doesn't contain invalid values. */
    public static verifyOutput(output: Float32Array): void {
        for (let i = 0; i < output.length; ++i) {
            if (isNaN(output[i])) {
                throw new Error(
                    `Model output contains NaN for action ${i} ` +
                        `(${intToChoice[i]})`,
                );
            }
        }
    }

    /**
     * Requests a prediction from the neural network.
     *
     * @param state State data. Must be backed by SharedArrayBuffers if the
     * caller intends to access the array after the call.
     */
    private async predict(state: Float32Array[]): Promise<PredictResult> {
        const msg: PredictMessage = {
            type: "predict",
            rid: this.asyncPort.nextRid(),
            state,
        };
        // Note: SharedArrayBuffers can't be in the transfer list since they're
        // already accessible from both threads.
        const transferList = state.flatMap(arr =>
            isSharedArrayBuffer(arr.buffer) ? [] : [arr.buffer],
        );

        return await new Promise((res, rej) =>
            this.asyncPort.postMessage(msg, transferList, result =>
                result.type === "error" ? rej(result.err) : res(result),
            ),
        );
    }
}
