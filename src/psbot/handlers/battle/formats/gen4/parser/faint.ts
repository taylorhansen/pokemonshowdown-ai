import {Protocol} from "@pkmn/protocol";
import {SideID} from "@pkmn/types";
import {BattleParserContext, tryVerify, verify} from "../../../parser";
import {eventLoop} from "../../../parser/helpers";
import * as actionSwitch from "./action/switch";
import {handlers as base} from "./base";
import {request} from "./request";

/** Expects a faint event. */
export async function event(
    ctx: BattleParserContext<"gen4">,
    side: SideID,
): Promise<void> {
    const e = await verify(ctx, "|faint|");
    const [, identStr] = e.args;
    const ident = Protocol.parsePokemonIdent(identStr);
    if (ident.player !== side) return;
    await base["|faint|"](ctx);
}

/**
 * Parses multiple faint events.
 *
 * @param sides Target pokemon references. Removed from the set after parsing a
 * corresponding faint event.
 */
export async function events(
    ctx: BattleParserContext<"gen4">,
    sides: Set<SideID>,
): Promise<void> {
    if (sides.size <= 0) return;
    await eventLoop(ctx, async function faintEvents(_ctx): Promise<void> {
        const e = await tryVerify(_ctx, "|faint|");
        if (!e) return;
        const [, identStr] = e.args;
        const ident = Protocol.parsePokemonIdent(identStr);
        if (!sides.delete(ident.player)) return;
        await base["|faint|"](_ctx);
    });
    if (sides.size > 0) {
        throw new Error(
            `Pokemon [${[...sides].join(", ")}] haven't fainted yet`,
        );
    }
}

/** Detects game-over state. */
export function isGameOver(ctx: BattleParserContext<"gen4">): boolean {
    return (Object.keys(ctx.state.teams) as SideID[]).some(side =>
        ctx.state.getTeam(side).pokemon.every(p => !p || p.fainted),
    );
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
