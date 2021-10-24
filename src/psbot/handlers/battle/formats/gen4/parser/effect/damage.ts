/** @file Parsers and helper functions related to damaging events. */
import { Protocol } from "@pkmn/protocol";
import { SideID } from "@pkmn/types";
import { Event } from "../../../../../../parser";
import { BattleParserContext, tryVerify } from "../../../../parser";
import { ReadonlyPokemon } from "../../state/Pokemon";
import { dispatch } from "../base";

/**
 * Expects a percent-damage effect.
 *
 * @param side Target pokemon reference.
 * @param percent Percent damage to deal to the target. Positive heals, negative
 * damages.
 * @param pred Optional additional custom check on the event before it can be
 * parsed. If it returns `false` then the event won't be parsed.
 * @param noSilent Whether to disable silent check.
 * @returns `true` if the effect was parsed, `"silent"` if the effect is a
 * no-op, or `undefined` if the effect wasn't parsed.
 */
export async function percentDamage(ctx: BattleParserContext<"gen4">,
    side: SideID, percent: number,
    pred?: (event: Event<"|-damage|" | "|-heal|">) => boolean,
    noSilent?: boolean): Promise<true | "silent" | undefined>
{
    const mon = ctx.state.getTeam(side).active;
    // Effect would do nothing.
    if (!noSilent && isPercentDamageSilent(percent, mon.hp.current, mon.hp.max))
    {
        return "silent";
    }

    // Parse event.
    const event = await tryVerify(ctx, "|-damage|", "|-heal|");
    if (!event) return;
    if (!verifyPercentDamage(event, mon, side, percent)) return;
    // TODO: Also pass info that was parsed from the event?
    if (pred && !pred(event)) return;

    await dispatch(ctx);
    return true;
}

/**
 * Checks whether a percent-damage effect would be silent.
 *
 * @param percent Percent damage.
 * @param hp Current hp.
 * @param hpMax Max hp.
 */
export function isPercentDamageSilent(percent: number, hp: number,
    hpMax: number): boolean
{
    // Can't heal when full or damage when fainted.
    return (percent > 0 && hp >= hpMax) || (percent < 0 && hp <= 0);
}

/**
 * Verifies a percent-damage effect event.
 *
 * @param event Event to verify.
 * @param mon Pokemon receiving the damage.
 * @param side Pokemon reference that should receive the damage.
 * @param percent Percent damage to deal to the target. Positive heals, negative
 * damages.
 * @returns Whether the event matches the `percent` damage effect.
 */
function verifyPercentDamage(event: Event<"|-damage|" | "|-heal|">,
    mon: ReadonlyPokemon, side: SideID, percent: number): boolean
{
    const [, identStr, healthStr] = event.args;
    const ident = Protocol.parsePokemonIdent(identStr);
    if (ident.player !== side) return false;
    const health = Protocol.parseHealth(healthStr);
    if (!health) return false;
    if (!checkPercentDamage(mon, percent, health.hp)) return false;
    return true;
}

/**
 * Verifies a percent-damage effect.
 *
 * @param mon Target pokemon to receive the damage.
 * @param percent Percent damage to deal to the target. Positive heals, negative
 * damages.
 * @param newHp New hp number to check.
 * @returns `true` if `newHp` is valid for the given effect, `"silent"` if the
 * effect is a no-op, or `false` if the `newHp` number doesn't match the effect.
 */
function checkPercentDamage(mon: ReadonlyPokemon, percent: number,
    newHp: number): boolean
{
    // Verify hp difference with respect to the sign of the percentage.
    // Could do actual percentage check with hp stat range, but not worth the
    // effort due to all the corner cases that could come up and how few
    // effects actually need to differentiate based on the percentage.
    return (percent < 0 && newHp <= mon.hp.current) ||
        (percent > 0 && newHp >= mon.hp.current) ||
        // istanbul ignore next: Should never happen but ok if it does.
        (percent === 0 && newHp === mon.hp.current);
}
