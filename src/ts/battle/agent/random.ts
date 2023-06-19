import {Rng, shuffle} from "../../utils/random";
import {ReadonlyBattleState} from "../state";
import {Action} from "./Action";

/**
 * BattleAgent that chooses actions randomly.
 *
 * @param moveOnly Whether to prefere move choices.
 * @param random Controlled random.
 */
export async function randomAgent(
    state: ReadonlyBattleState,
    choices: Action[],
    moveOnly?: boolean,
    random?: Rng,
): Promise<void> {
    shuffle(choices, random);
    if (moveOnly) {
        gatherMoves(choices);
    }
    return await Promise.resolve();
}

/** Rearranges all the move choices to the beginning of the array. */
export function gatherMoves(choices: Action[]): void {
    for (let i = 0, m = 0; i < choices.length; ++i) {
        if (choices[i].startsWith("move")) {
            const c = choices.splice(i, 1);
            choices.splice(m++, 0, ...c);
        }
    }
}
