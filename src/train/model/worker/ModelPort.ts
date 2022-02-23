import {MessagePort} from "worker_threads";
import {alloc} from "../../../buf";
import {intToChoice} from "../../../psbot/handlers/battle/agent";
import {battleStateEncoder} from "../../../psbot/handlers/battle/ai/encoder/encoders";
import {
    policyAgent,
    PolicyType,
} from "../../../psbot/handlers/battle/ai/policyAgent";
import {WrappedError} from "../../../util/errors/WrappedError";
import {
    ExperienceAgent,
    ExperienceAgentData,
} from "../../play/experience/Experience";
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
     * Creates a BattleAgent from this port.
     *
     * @param policy Action selection method.
     * @see {@link policyAgent}
     */
    public getAgent(policy: PolicyType): ExperienceAgent {
        let data: ExperienceAgentData | null = null;

        const innerAgent = policyAgent(async state => {
            const arr = alloc(battleStateEncoder.size, true /*shared*/);
            battleStateEncoder.encode(arr, state);
            let i = ModelPort.verifyInput(arr);
            if (i >= 0) {
                throw new Error(
                    `Model input contains an invalid value '${arr[i]}' at ` +
                        `index ${i}\nState:\n${state.toString()}`,
                );
            }

            const result = await this.predict(arr, true /*shared*/);
            i = ModelPort.verifyOutput(result.probs);
            if (i >= 0) {
                throw new Error(
                    "Model output contains an invalid value " +
                        `'${intToChoice[i]}' at index ${i}`,
                );
            }

            data = {...result, state: arr};
            return result.probs;
        }, policy);

        return async function portAgent(state, choices, logger) {
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
     *
     * @param arr Array input.
     * @returns The index of an invalid value, or `-1` if none found.
     */
    private static verifyInput(arr: Float32Array): number {
        for (let i = 0; i < arr.length; ++i) {
            if (isNaN(arr[i])) {
                return i;
            }
            if (Math.abs(arr[i]) > 1) {
                return i;
            }
        }
        return -1;
    }

    /**
     * Makes sure that the output doesn't contain invalid values, i.e. `NaN`s or
     * highly concentrated softmax outputs which tend to mess with
     * `policyAgent`'s weighted shuffle algorithm.
     *
     * @param arr Array input.
     * @returns The index of an invalid value, or `-1` if none found.
     */
    private static verifyOutput(arr: Float32Array): number {
        for (let i = 0; i < arr.length; ++i) {
            if (isNaN(arr[i])) {
                return i;
            }
            if (arr[i] < 1e-4) {
                return i;
            }
        }
        return -1;
    }

    /**
     * Requests a prediction from the neural network.
     *
     * @param state State data.
     * @param shared Whether the array uses a SharedArrayBuffer.
     */
    public async predict(
        state: Float32Array,
        shared = false,
    ): Promise<PredictResult> {
        const msg: PredictMessage = {
            type: "predict",
            rid: this.asyncPort.nextRid(),
            state,
        };
        // SharedArrayBuffers can't be in the transfer list since they're
        // already accessible from both threads.
        const transferList = shared ? [] : [state.buffer];

        return await new Promise((res, rej) =>
            this.asyncPort.postMessage(msg, transferList, result =>
                result.type === "error" ? rej(result.err) : res(result),
            ),
        );
    }
}
