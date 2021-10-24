/** @file Parsers and helper functions related to status effects. */
import {Protocol} from "@pkmn/protocol";
import {SideID} from "@pkmn/types";
import {toIdName} from "../../../../../../helpers";
import {Event} from "../../../../../../parser";
import {BattleParserContext, tryVerify} from "../../../../parser";
import * as dex from "../../dex";
import {ReadonlyPokemon} from "../../state/Pokemon";
import {dispatch} from "../base";

/**
 * Event types that could contain information about statuses.
 *
 * @see {@link status}
 */
export type StatusEventType =
    | "|-start|"
    | "|-status|"
    | "|-singlemove|"
    | "|-singleturn|"
    | "|-message|"
    | "|-activate|";

/**
 * Expects a status effect.
 *
 * @param side Target pokemon reference.
 * @param statusTypes Possible statuses to afflict.
 * @param pred Optional additional custom check on the event before it can be
 * parsed. If it returns `false` then the event won't be parsed.
 * @returns The status type that was consumed, or `true` if the effect couldn't
 * be applied and was a no-op, or `undefined` if no valid event was found.
 */
export async function status(
    ctx: BattleParserContext<"gen4">,
    side: SideID,
    statusTypes: readonly dex.StatusType[],
    pred?: (event: Event<StatusEventType>) => boolean,
): Promise<true | dex.StatusType | undefined> {
    const mon = ctx.state.getTeam(side).active;
    // Effect would do nothing.
    if (isStatusSilent(mon, statusTypes)) return true;

    const event = await tryVerify(
        ctx,
        "|-start|",
        "|-status|",
        "|-singlemove|",
        "|-singleturn|",
        "|-message|",
        "|-activate|",
    );
    if (!event) return;
    const res = verifyStatus(event, side, statusTypes);
    if (!res) return;
    // TODO: Also pass info that was parsed from the event?
    if (pred && !pred(event)) return;
    await dispatch(ctx);
    return res;
}

/**
 * Checks whether a status effect would be silent.
 *
 * @param mon Target pokemon.
 * @param statusTypes Possible statuses to afflict.
 */
function isStatusSilent(
    mon: ReadonlyPokemon,
    statusTypes: readonly dex.StatusType[],
): boolean {
    return statusTypes.every(s => cantStatus(mon, s));
}

/**
 * Verifies a status event.
 *
 * @param event Event to verify.
 * @param side Pokemon reference that should receive the status.
 * @param statusTypes Possible statuses to afflict.
 * @returns Whether the event matches one of the `statusTypes`.
 */
function verifyStatus(
    event: Event<StatusEventType>,
    side: SideID,
    statusTypes: readonly dex.StatusType[],
): dex.StatusType | undefined {
    if (event.args[0] === "-message") {
        if (event.args[1] === "Sleep Clause Mod activated.") {
            if (statusTypes.includes("slp")) return "slp";
        }
        return;
    }

    const [t, identStr, effectStr] = event.args;
    const effect = Protocol.parseEffect(effectStr, toIdName);
    if (!statusTypes.includes(effect.name as dex.StatusType)) return;
    // Only splash effect allows for |-activate| with no ident.
    if (t === "-activate") {
        if (effect.name !== "splash") return;
        return "splash";
    }
    if (effect.name === "splash") return;
    if (!identStr) return;
    const ident = Protocol.parsePokemonIdent(identStr);
    if (ident.player !== side) return;
    return effect.name as dex.StatusType;
}

// TODO: Factor out status handlers for each status type?
/** Checks whether the pokemon can't be afflicted by the given status. */
export function cantStatus(
    mon: ReadonlyPokemon,
    statusType: dex.StatusType,
): boolean {
    switch (statusType) {
        case "aquaring": // Regular status.
        case "attract":
        case "curse":
        case "flashfire":
        case "focus":
        case "focusenergy":
        case "imprison":
        case "ingrain":
        case "leechseed":
        case "mudsport":
        case "nightmare":
        case "powertrick":
        case "substitute":
        case "suppressAbility":
        case "torment":
        case "watersport":
        case "destinybond": // Single-move.
        case "grudge":
        case "rage":
        case "magiccoat": // Single-turn.
        case "roost":
        case "snatch":
            return mon.volatile[statusType];
        case "bide":
        case "confusion":
        case "charge":
        case "magnetrise":
        case "embargo":
        case "healblock":
        case "slowstart":
        case "taunt":
        case "uproar":
        case "yawn":
            return mon.volatile[statusType].isActive;
        case "encore":
            return mon.volatile[statusType].ts.isActive;
        // Stall.
        case "endure":
        case "protect":
            return mon.volatile.stalling;
        case "foresight":
        case "miracleeye":
            return mon.volatile.identified === statusType;
        case "splash":
            return false;
        default:
            // istanbul ignore else: Should never happen.
            if (dex.isMajorStatus(statusType)) return !!mon.majorStatus.current;
            // istanbul ignore next: Should never happen.
            throw new Error(`Invalid status effect '${statusType}'`);
    }
}

/**
 * Event types that could contain information about ending/curing statuses.
 *
 * @see {@link cure}
 */
export type CureEventType = "|-end|" | "|-curestatus|";

/**
 * Expects a status cure effect.
 *
 * @param side Target pokemon reference.
 * @param statusTypes Statuses to cure.
 * @param pred Optional additional custom check on the event before it can be
 * parsed. If it returns `false` then the event won't be parsed.
 * @returns `"silent"` if no events needed to be consumed, otherwise a Set of
 * the remaining StatusTypes that weren't parsed or elided due to not actually
 * having the status.
 */
export async function cure(
    ctx: BattleParserContext<"gen4">,
    side: SideID,
    statusTypes: readonly dex.StatusType[],
    pred?: (event: Event<CureEventType>) => boolean,
): Promise<"silent" | Set<dex.StatusType>> {
    const mon = ctx.state.getTeam(side).active;
    const res = new Set<dex.StatusType>();
    for (const statusType of statusTypes) {
        if (!hasStatus(mon, statusType)) continue;
        res.add(statusType);
        // Curing slp also cures nightmare if applicable.
        if (statusType === "slp" && hasStatus(mon, "nightmare")) {
            res.add("nightmare");
        }
    }
    if (res.size <= 0) return "silent";

    while (res.size > 0) {
        const event = await tryVerify(ctx, "|-end|", "|-curestatus|");
        if (!event) break;
        const [, identStr, effectStr] = event.args;
        const ident = Protocol.parsePokemonIdent(identStr);
        if (ident.player !== side) break;
        const effect = Protocol.parseEffect(effectStr, toIdName);
        if (!res.has(effect.name as dex.StatusType)) break;
        // TODO: Also pass info that was parsed from the event?
        if (pred && !pred(event)) break;
        res.delete(effect.name as dex.StatusType);
        await dispatch(ctx);
    }
    return res;
}

/** Checks whether the pokemon has the given status. */
export function hasStatus(
    mon: ReadonlyPokemon,
    statusType: dex.StatusType,
): boolean {
    switch (statusType) {
        case "aquaring":
        case "attract":
        case "curse":
        case "flashfire":
        case "focusenergy":
        case "imprison":
        case "ingrain":
        case "leechseed":
        case "mudsport":
        case "nightmare":
        case "powertrick":
        case "substitute":
        case "suppressAbility":
        case "torment":
        case "watersport":
        case "destinybond": // Single-move.
        case "grudge":
        case "rage":
        case "magiccoat": // Single-turn.
        case "roost":
        case "snatch":
            return mon.volatile[statusType];
        case "bide":
        case "confusion":
        case "charge":
        case "magnetrise":
        case "embargo":
        case "healblock":
        case "slowstart":
        case "taunt":
        case "uproar":
        case "yawn":
            return mon.volatile[statusType].isActive;
        case "encore":
            return mon.volatile[statusType].ts.isActive;
        // Stall.
        case "endure":
        case "protect":
            return mon.volatile.stalling;
        case "foresight":
        case "miracleeye":
            return mon.volatile.identified === statusType;
        default:
            // istanbul ignore else: Should never happen.
            if (dex.isMajorStatus(statusType)) {
                return mon.majorStatus.current === statusType;
            }
            // istanbul ignore next: Should never happen.
            throw new Error(`Invalid status effect '${statusType}'`);
    }
}
