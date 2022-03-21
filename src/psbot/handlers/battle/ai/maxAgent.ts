import {Logger} from "../../../../util/logging/Logger";
import {BattleAgent} from "../agent/BattleAgent";
import {Choice, choiceIds, intToChoice} from "../agent/Choice";
import {ReadonlyBattleState} from "../state";

/**
 * Creates a {@link BattleAgent} function that selects the best choice based on
 * the given evaluator.
 *
 * @param getOutputValues Function for getting the output values of each choice.
 */
export function maxAgent(
    getOutputValues: (
        state: ReadonlyBattleState,
    ) => Float32Array | Promise<Float32Array>,
): BattleAgent<void> {
    return async function (
        state: ReadonlyBattleState,
        choices: Choice[],
        logger?: Logger,
    ): Promise<void> {
        const output = await getOutputValues(state);
        logger?.debug(
            "Ranked choices: {" +
                intToChoice
                    .map((c, i) => `${c}: ${output[i].toFixed(3)}`)
                    .join(", ") +
                "}",
        );
        choices.sort((a, b) => output[choiceIds[b]] - output[choiceIds[a]]);
    };
}
