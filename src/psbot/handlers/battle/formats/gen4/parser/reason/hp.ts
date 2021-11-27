/** @file SubReason helpers related to abilities. */
import {inference} from "../../../../parser";
import {Pokemon} from "../../state/Pokemon";
import * as chance from "./chance";

/**
 * Checks if a Pokemon has been reduced to 1 hp.
 *
 * @returns A Set of Reasons if it's possible to be at 1hp, or `null` if it's
 * not possible.
 */
export function isAt1(mon: Pokemon): Set<inference.Reason> | null {
    const hpDisplay = mon.hp.current;

    // 0 hp.
    if (hpDisplay <= 0) return null;
    // Known hp.
    if (mon.team?.state?.ourSide && mon.team.side === mon.team.state.ourSide) {
        return hpDisplay === 1 ? new Set() : null;
    }

    // Unknown %hp.
    // Look through each possible maxhp stat number to see if it's definite or
    // possible that we're at 1 hp.
    // TODO: What about pixel-based displays rather than percent?
    // Note: Pixel-accurate equation is pixels = floor(hp/maxhp * 48), with an
    // additional check to force pixels=1 if hp>1 but the pixels round down to
    // 0.
    let result: Set<inference.Reason> | null = null;
    let guaranteed = true;
    const {max: maxhpHi, min: maxhpLo} = mon.traits.stats.hp;
    for (let i = maxhpLo; i <= maxhpHi; ++i) {
        // Note: according to PS, percentage = ceil(hp/maxhp * 100), with an
        // additional check to force percentage=99 if hp < maxhp but the
        // percentage rounds up to 100.
        // This is the display value we should get at 1hp.
        const minPercent = Math.ceil(100 / i);

        // Verify that this hp stat is possible given the display value.
        // TODO: Use this to narrow/assert hp stat.
        if (hpDisplay < minPercent) continue;

        // If at least 200 max hp, multiple hp values could be represented by
        // hpDisplay=1% so 1hp isn't guaranteed.
        // Under 200 max hp, though, minPercent is guaranteed to map to 1hp only
        // due to the ceiling op.
        if (i >= 200) guaranteed = false;

        // Verify that the hp display is as expected for 1hp.
        if (hpDisplay === minPercent) result ??= new Set();
        // If we really are at 1hp, then this hp stat is impossible.
        else guaranteed = false;
    }

    // TODO: Replace chance with hp stat assertions.
    if (result && !guaranteed) result.add(chance.create());
    return result;
}
