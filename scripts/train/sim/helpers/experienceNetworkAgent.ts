import * as tf from "@tensorflow/tfjs-node";
import { NetworkData, networkAgent } from "../../../../src/ai/networkAgent";
import { BattleAgent } from "../../../../src/battle/agent/BattleAgent";
import { PolicyType } from "../../../../src/ai/policyAgent";

/** BattleAgent that returns NetworkData from input and predictions. */
export type ExperienceAgent = BattleAgent<NetworkData>;

/**
 * Creates a BattleAgent using a neural network, but also returns its input and
 * output tensors without disposing them after.
 * @param model The neural network.
 * @param policy Action selection method. See `policyAgent()` for details.
 * @throws Error if the given model does not have the right input and output
 * shapes.
 */
export function experienceNetworkAgent(model: tf.LayersModel,
    policy: PolicyType): ExperienceAgent
{
    let networkData: NetworkData | null = null;

    const innerAgent = networkAgent(model, policy, function(data)
        {
            networkData = data;
        });

    return async function(state, choices)
    {
        await innerAgent(state, choices);
        if (!networkData) throw new Error("networkAgent() didn't call logger");
        const data = networkData;
        networkData = null;
        return data;
    };
}
