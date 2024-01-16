import {SideID} from "@pkmn/types";
import {expect} from "chai";
import {BattleState} from "../state";
import {Pokemon} from "../state/Pokemon";
import {SwitchOptions} from "../state/Team";
import {smeargle} from "../state/switchOptions.test";

/**
 * Initializes a team of pokemon, some of which may be unknown. The last
 * defined one in the array will be switched in if any.
 */
export function initTeam(
    state: BattleState,
    teamRef: SideID,
    options: readonly (SwitchOptions | undefined)[],
): Pokemon[] {
    const team = state.getTeam(teamRef);
    team.size = options.length;
    const result: Pokemon[] = [];
    let i = 0;
    for (const op of options) {
        if (!op) {
            continue;
        }
        const mon = team.switchIn(op);
        expect(mon, `Switch-in slot ${i} couldn't be filled`).to.not.be.null;
        result.push(mon!);
        ++i;
    }
    return result;
}

/** Initializes a team of one pokemon. */
export function initActive(
    state: BattleState,
    monRef: SideID,
    options = smeargle,
    size = 1,
): Pokemon {
    const opt = new Array<SwitchOptions | undefined>(size);
    opt[0] = options;
    return initTeam(state, monRef, opt)[0];
}
