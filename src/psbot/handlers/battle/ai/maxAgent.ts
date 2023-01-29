import {Logger} from "../../../../util/logging/Logger";
import {BattleAgent} from "../agent/BattleAgent";
import {Choice, choiceIds, intToChoice} from "../agent/Choice";
import {ReadonlyBattleState} from "../state";

/**
 * Creates a {@link BattleAgent} function that selects the best choice based on
 * the given evaluator.
 *
 * @param evaluator Function for evaluating the ranking of each choice.
 * @param debugRankings If true, the returned BattleAgent will also return a
 * debug string displaying the evaluation of each choice.
 */
export function maxAgent<TArgs extends unknown[] = []>(
    evaluator: (
        state: ReadonlyBattleState,
        ...args: TArgs
    ) => Float32Array | Promise<Float32Array>,
    debugRankings?: boolean,
): BattleAgent<string | undefined, TArgs> {
    return async function (
        state: ReadonlyBattleState,
        choices: Choice[],
        logger?: Logger,
        ...args: TArgs
    ): Promise<string | undefined> {
        const output = await evaluator(state, ...args);
        logger?.debug(
            "Ranked choices: {" +
                intToChoice
                    .map((c, i) => `${c}: ${output[i].toFixed(3)}`)
                    .join(", ") +
                "}",
        );
        choices.sort((a, b) => output[choiceIds[b]] - output[choiceIds[a]]);

        if (debugRankings) {
            const ourTeam = state.ourSide && state.getTeam(state.ourSide);
            const moves = ourTeam && [...ourTeam.active.moveset.moves];
            return intToChoice
                .map((c, i) => {
                    let info: string | undefined;
                    if (ourTeam && moves) {
                        if (c.startsWith("move")) {
                            const [, move] =
                                moves[
                                    parseInt(c.charAt("move ".length), 10) - 1
                                ];
                            info = move.name;
                        } else if (c.startsWith("switch")) {
                            const mon =
                                ourTeam.pokemon[
                                    parseInt(c.charAt("switch ".length), 10) - 1
                                ];
                            if (mon === undefined) {
                                info = "empty";
                            } else if (mon === null) {
                                info = "unknown";
                            } else {
                                info = mon.species;
                            }
                        }
                    }
                    return (
                        `${c}${info ? ` (${info})` : ""}: ` +
                        `${output[i].toFixed(3)}`
                    );
                })
                .join(", ");
        }
    };
}
