import { BattleAgent } from "../battle/agent/BattleAgent";
import { Choice, choiceIds } from "../battle/agent/Choice";
import { ReadonlyBattleState } from "../battle/state/BattleState";
import { Logger } from "../Logger";
import { weightedShuffle } from "./helpers";

/**
 * Policy type for `policyAgent()`.
 * @see policyAgent
 */
export type PolicyType = "deterministic" | "stochastic";

/**
 * Function type for sorters.
 * @param logits Weights of each choice, in order of `choiceIds`.
 * @param choices Available choices to choose from. The function should sort
 * this array in-place.
 * @param logger Optional logger object.
 * @see choiceIds
 */
type Sorter =
    (logits: Float32Array, choices: Choice[], logger?: Logger) => void;
/** Choice sorters for each PolicyType. */
const sorters: {readonly [T in PolicyType]: Sorter} =
{
    deterministic(logits, choices, logger)
    {
        logger?.debug("Ranked choices: {" +
            choices.map(c => c + ": " + logits[choiceIds[c]].toPrecision(5))
                .join(", ") + "}");
        choices.sort((a, b) =>
            logits[choiceIds[b]] - logits[choiceIds[a]]);
    },
    stochastic(logits, choices, logger)
    {
        const filteredLogits = choices.map(c => logits[choiceIds[c]]);

        // apply softmax function to get a probability distribution
        const expLogits = filteredLogits.map(Math.exp);
        const sumExpLogits = expLogits.reduce((a, b) => a + b, 0);
        const weights = expLogits.map(n => n / sumExpLogits);

        logger?.debug("Ranked choices: {" +
            choices.map((c, i) => `${c}: ${(weights[i] * 100).toFixed(0)}%`)
                .join(", ") + "}");

        weightedShuffle(weights, choices);
    }
};

/**
 * Creates a BattleAgent that runs a deterministic or stochastic policy.
 * @param getLogits Function for getting the weights of each choice.
 * @param type Action selection method after getting decision data.
 * `deterministic` - Choose the action deterministically with the highest
 * probability.
 * `stochastic` - Choose the action semi-randomly based on a discrete
 * probability distribution derived from the decision data.
 * @returns A suitable BattleAgent for running the policy.
 */
export function policyAgent(
    getLogits: (state: ReadonlyBattleState) =>
            Float32Array | Promise<Float32Array>,
    type: PolicyType): BattleAgent
{
    const sorter = sorters[type];
    return async function(state: ReadonlyBattleState, choices: Choice[],
        logger?: Logger): Promise<void>
    {
        const logits = await getLogits(state);
        sorter(logits, choices, logger);
    };
}
