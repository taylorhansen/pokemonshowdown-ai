import {SideID} from "@pkmn/types";
import {expect} from "chai";
import {BattleState} from "../state";
import {Pokemon} from "../state/Pokemon";
import {SwitchOptions} from "../state/Team";
import {smeargle} from "../state/switchOptions.test";

/** Helper class for manipulating the {@link BattleState}. */
export class StateHelpers {
    /**
     * Constructs state helper functions.
     *
     * @param state Function that gets the battle state. This is called each
     * time a method wants to access it in order to provide a level of
     * indirection in case it gets reassigned later in a separate test.
     */
    public constructor(private readonly state: () => BattleState) {}

    /**
     * Initializes a team of pokemon, some of which may be unknown. The last
     * defined one in the array will be switched in if any.
     */
    public initTeam(
        teamRef: SideID,
        options: readonly (SwitchOptions | undefined)[],
    ): Pokemon[] {
        const team = this.state().getTeam(teamRef);
        team.size = options.length;
        const result: Pokemon[] = [];
        let i = 0;
        for (const op of options) {
            if (!op) {
                continue;
            }
            const mon = team.switchIn(op);
            expect(mon, `Switch-in slot ${i} couldn't be filled`).to.not.be
                .null;
            result.push(mon!);
            ++i;
        }
        return result;
    }

    /** Initializes a team of one pokemon. */
    public initActive(monRef: SideID, options = smeargle, size = 1): Pokemon {
        const opt = new Array<SwitchOptions | undefined>(size);
        opt[0] = options;
        return this.initTeam(monRef, opt)[0];
    }
}
