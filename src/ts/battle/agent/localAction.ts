import {ReadonlyBattleState} from "../state";
import {Action} from "./Action";

/**
 * Stringifies an Action in context with the battle state.
 *
 * @param state Battle state representation.
 * @param action Action to display.
 * @returns Action string augmented with the corresponding move name or switch
 * target according to the battle state, or the same `action` that was passed if
 * the `state` is not initialized.
 */
export function localizeAction(
    state: ReadonlyBattleState,
    action: Action,
): string {
    const ourTeam = state.ourSide && state.getTeam(state.ourSide);
    if (!ourTeam) {
        return action;
    }
    let info: string;
    if (action.startsWith("move")) {
        const num = parseInt(action.charAt("move ".length), 10);
        const {moveset} = ourTeam.active;
        if (num > moveset.size) {
            info = "empty";
        } else if (num > moveset.moves.size) {
            info = "unknown";
        } else {
            const [, move] = [...moveset.moves][num - 1];
            info = move.name;
        }
    } else if (action.startsWith("switch")) {
        const num = parseInt(action.charAt("switch ".length), 10);
        const mon = ourTeam.pokemon[num - 1];
        if (mon === undefined) {
            info = "empty";
        } else if (mon === null) {
            info = "unknown";
        } else {
            info = mon.species;
        }
    } else {
        throw new Error(`Unknown action '${action}'`);
    }
    return `${action} (${info})`;
}
