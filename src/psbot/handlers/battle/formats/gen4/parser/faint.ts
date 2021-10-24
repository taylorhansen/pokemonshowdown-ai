import {Protocol} from "@pkmn/protocol";
import {SideID} from "@pkmn/types";
import {BattleParserContext, verify} from "../../../parser";
import * as actionSwitch from "./action/switch";
import {handlers as base} from "./base";
import {request} from "./request";

/** Expects a faint event if pokemon's hp is `0`. */
export async function event(
    ctx: BattleParserContext<"gen4">,
    side: SideID,
): Promise<void> {
    const mon = ctx.state.getTeam(side).active;
    if (mon.hp.current > 0) return;

    const e = await verify(ctx, "|faint|");
    const [, identStr] = e.args;
    const ident = Protocol.parsePokemonIdent(identStr);
    if (ident.player !== side) return;
    await base["|faint|"](ctx);
}

/**
 * Checks for fainted pokemon that need to be replaced.
 *
 * @param sides Sides to check. Default `"p1"` and `"p2"`.
 */
export async function replacements(
    ctx: BattleParserContext<"gen4">,
    sides: readonly SideID[] = ["p1", "p2"],
): Promise<void> {
    sides = sides.filter(side => ctx.state.getTeam(side).active.fainted);
    if (sides.length <= 0) return;

    // Detect game-over state.
    const losingSides = sides.filter(
        side =>
            !ctx.state.getTeam(side).pokemon.some(
                // Still unrevealed/un-fainted pokemon left.
                mon => mon === null || (mon && !mon.fainted),
            ),
    );
    if (losingSides.length > 0) {
        // Only the top-level parser is allowed to consume the ending event.
        await verify(ctx, "|win|");
        return;
    }

    // Wait for opponents to choose switch-ins.
    if (!sides.includes(ctx.state.ourSide!)) await request(ctx, "wait");
    // Client also has to choose a switch-in.
    else await request(ctx, "switch");

    await actionSwitch.multipleSwitchIns(ctx, sides);
}
