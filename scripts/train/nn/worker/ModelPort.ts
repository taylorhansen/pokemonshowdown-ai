import { deserialize } from "v8";
import { MessagePort } from "worker_threads";
import { policyAgent, PolicyType } from "../../../../src/ai/policyAgent";
import { BattleAgent } from "../../../../src/battle/agent/BattleAgent";
import { ExperienceAgentData } from "../../sim/helpers/Experience";
import { AsyncPort, PortRequestBase, PortResultBase } from
    "./helpers/AsyncPort";
import { encodeBattleState } from "../../../../src/ai/encodeBattleState";

/** Base interface for the predict request protocol. */
type PredictRequestBase = PortRequestBase<"predict">;

/** Prediction request message format. */
export interface PredictMessage extends PredictRequestBase
{
    /** State data. */
    state: Float32Array;
}

/** Data returned by the network processor port. */
export interface PredictWorkerResult extends PortResultBase<"predict">,
    ExperienceAgentData
{
    /**
     * Guaranteed one reply per message.
     * @override
     */
    done: true;
}

/**
 * Abstracts the interface between a game worker and the master NetworkProcessor
 * worker. Intended to be used by only one BattleAgent within a game worker that
 * received a port to connect to a neural network.
 */
export class ModelPort extends
    AsyncPort<
        {predict: {message: PredictMessage, result: PredictWorkerResult}},
        MessagePort>
{
    /** @override */
    public close(): void { this.port.close(); }

    /**
     * Creates a BattleAgent from this port.
     * @param policy Action selection method. See `policyAgent()` for details.
     * @see policyAgent
     */
    public getAgent(policy: PolicyType): BattleAgent<ExperienceAgentData>
    {
        let data: ExperienceAgentData | null = null;

        const innerAgent = policyAgent(
            async state =>
                (data = await this.predict(encodeBattleState(state))).logits,
            policy);

        return async (state, choices) =>
        {
            await innerAgent(state, choices);
            if (!data)
            {
                throw new Error("ModelPort agent didn't collect experience " +
                    "data");
            }
            const result = data;
            data = null;
            return result;
        };
    }

    /**
     * Requests a prediction from the neural network.
     * @param state State data.
     */
    public predict(state: Float32Array): Promise<ExperienceAgentData>
    {
        const msg: PredictMessage =
            {type: "predict", rid: this.generateRID(), state};

        return new Promise((res, rej) =>
            this.postMessage(msg, [msg.state.buffer],
                result => result.type === "error" ?
                    rej(deserialize(result.errBuf)) : res(result)));
    }
}
