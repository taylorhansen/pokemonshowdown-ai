import {Logger} from "../../../../logging/Logger";
import {BattleAgent} from "../agent/BattleAgent";
import {Choice, choiceIds, intToChoice} from "../agent/Choice";
import {FormatType, ReadonlyState} from "../formats/formats";
import {weightedShuffle} from "./helpers";

/**
 * Policy type for a {@link policyAgent}.
 *
 * * `deterministic` - Choose the action with the highest probability.
 * * `stochastic` - Choose the action semi-randomly based on a discrete
 *   probability distribution for each action.
 */
export type PolicyType = "deterministic" | "stochastic";

/**
 * Function type for sorters.
 *
 * @param probs Probabilities of each choice, in order of {@link choiceIds}.
 * @param choices Available choices to choose from. The function should sort
 * this array in-place.
 */
type Sorter = (probs: Float32Array, choices: Choice[]) => void;

/** Choice sorters for each {@link PolicyType}. */
const sorters: {readonly [T in PolicyType]: Sorter} = {
    deterministic(probs, choices) {
        choices.sort((a, b) => probs[choiceIds[b]] - probs[choiceIds[a]]);
    },
    stochastic(probs, choices) {
        const allChoices = [...intToChoice];
        weightedShuffle([...probs], allChoices);
        // Sort actual choices array in-place based on the positions within the
        // shuffled allChoices array.
        const choiceSet = new Set(choices);
        let j = 0;
        for (const choice of allChoices) {
            if (choiceSet.has(choice)) choices[j++] = choice;
        }
    },
};

/**
 * Creates a {@link BattleAgent} function that runs a deterministic or
 * stochastic policy.
 *
 * @template T Format type.
 * @param getProbs Function for getting the probabilities of each choice.
 * @param type Action selection method after getting decision data.
 * @returns A suitable BattleAgent for running the policy.
 */
export function policyAgent<T extends FormatType = FormatType>(
    getProbs: (state: ReadonlyState<T>) => Float32Array | Promise<Float32Array>,
    type: PolicyType,
): BattleAgent<T, void> {
    const sorter = sorters[type];
    return async function (
        state: ReadonlyState<T>,
        choices: Choice[],
        logger?: Logger,
    ): Promise<void> {
        const probs = await getProbs(state);
        logger?.debug(
            "Ranked choices: {" +
                intToChoice
                    .map((c, i) => `${c}: ${(probs[i] * 100).toFixed(3)}%`)
                    .join(", ") +
                "}",
        );
        sorter(probs, choices);
    };
}
