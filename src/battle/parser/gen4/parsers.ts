/** @file SubParsers used to expect specific kinds of events. */
import * as dexutil from "../../dex/dex-util";
import * as effects from "../../dex/effects";
import { Pokemon, ReadonlyPokemon } from "../../state/Pokemon";
import { Side } from "../../state/Side";
import * as events from "../BattleEvent";
import { ParserState, SubParser, SubParserResult } from "../BattleParser";
import { eventLoop, matchBoost, matchPercentDamage } from "../helpers";
import { handlers as base } from "./base";

/** SubParserResult that includes a success indicator. */
export interface SuccessResult extends SubParserResult
{
    /** Whether the effect was successfully consumed. */
    success?: true;
}

/**
 * SuccessResult that includes a silent success indicator, meaning the effect
 * that was attempted to be consumed couldn't warrant an explicit game event.
 */
export interface SilentSuccessResult extends SubParserResult
{
    /**
     * Whether the effect was successfully consumed, or `"silent"` if it
     * consumed no events.
     */
    success?: true | "silent";
}

/** Result from `boost()`. */
export interface BoostResult extends SubParserResult
{
    /** Boosts that weren't consumed. */
    remaining: Partial<Record<dexutil.BoostName, number>>;
    /** Whether all consumed boosts were silently consumed. */
    allSilent?: true;
}

/**
 * Expects a boost effect.
 * @param targetRef Pokemon reference that's supposed to receive the boosts.
 * @param effect Effect object describing the boosts.
 * @param silent Whether to silently consume saturated boosts (e.g. +1 when
 * already at +6).
 * @param lastEvent Last unconsumed event if any.
 */
export async function* boost(pstate: ParserState, targetRef: Side,
    effect: effects.Boost, silent?: boolean, lastEvent?: events.Any):
    SubParser<BoostResult>
{
    const target = pstate.state.teams[targetRef].active;
    const set = !effect.add;
    const table = effect.add ? {...effect.add} : {...effect.set};
    let allSilent = true;

    // remove boosts that can't be fulfilled due to saturation
    //  (e.g. boosting when already at at +6)
    // TODO: should this be done for set as well?
    if (silent && !set)
    {
        for (const b in table)
        {
            if (!table.hasOwnProperty(b)) continue;
            if (matchBoost(set, table[b as dexutil.BoostName]!, 0,
                target.volatile.boosts[b as dexutil.BoostName]))
            {
                delete table[b as dexutil.BoostName];
            }
        }
    }

    const result = yield* eventLoop(
        async function* expectBoostLoop(event): SubParser
        {
            if (event.type !== "boost") return {event};
            if (event.monRef !== targetRef) return {event};
            if (!event.set === set) return {event};
            if (!table.hasOwnProperty(event.stat)) return {event};
            if (!matchBoost(set, table[event.stat]!, event.amount,
                ...set ? [] : [target.volatile.boosts[event.stat]]))
            {
                return {event};
            }

            delete table[event.stat];
            allSilent = false;
            return yield* base.boost(pstate, event);
        },
        lastEvent);

    return {...result, remaining: table, ...allSilent && {allSilent: true}};
}

/**
 * Expects a countable status effect to be started or updated.
 * @param source Source Pokemon reference.
 * @param effectType Effect type being expected.
 */
export async function* countStatus(pstate: ParserState, source: Side,
    effectType: effects.CountableStatusType, lastEvent?: events.Any):
    SubParser<SuccessResult>
{
    switch (effectType)
    {
        case "perish":
        {
            // consume perish song events for each target
            // TODO: a better solution would be to use the
            //  `|-fieldactivate|` event (#138) then let the
            //  countStatusEffect events (sent on PS only) pass through
            let success: boolean | undefined;
            const mentioned = new Set<Side>();
            const result = yield* eventLoop(
                async function* countStatusLoop(event): SubParser
                {
                    if (event.type !== "countStatusEffect") return {event};
                    if (event.effect !== effectType) return {event};
                    // if the pokemon was mentioned again, then we're getting
                    //  into end-of-turn events
                    if (mentioned.has(event.monRef)) return {event};
                    mentioned.add(event.monRef);
                    success ||= true;
                    return yield* base.countStatusEffect(pstate, event);
                }, lastEvent);
            return {...result, ...success && {success}};
        }
        case "stockpile":
        {
            const event = lastEvent ?? (yield);
            if (event.type !== "countStatusEffect") return {event};
            if (event.monRef !== source) return {event};
            if (event.effect !== effectType) return {event};
            return {
                ...yield* base.countStatusEffect(pstate, event), success: true
            };
        }
    }
}

/**
 * Expects a damage event.
 * @param monRef Pokemon to be damaged.
 * @param from Effect being referenced.
 * @param sign Sign of expected damage number.
 */
export async function* damage(pstate: ParserState, monRef: Side,
    from: events.TakeDamage["from"] | null, sign: number,
    lastEvent?: events.Any): SubParser<SilentSuccessResult>
{
    // saturated hp can't be damaged/healed further
    const mon = pstate.state.teams[monRef].active;
    if (mon.hp.current <= 0 && sign < 0 ||
        mon.hp.current >= mon.hp.max && sign > 0)
    {
        return {...lastEvent && {event: lastEvent}, success: "silent"};
    }

    const event = lastEvent ?? (yield);
    if (event.type !== "takeDamage") return {event};
    if (event.monRef !== monRef) return {event};
    if ((event.from ?? null) !== (from ?? null)) return {event};
    // make sure damage matches sign
    const diff = event.hp - mon.hp.current;
    if (Math.sign(diff) !== sign) return {event};
    return {...yield* base.takeDamage(pstate, event), success: true};
}

/** Result from `faint()`. */
export interface FaintResult extends SubParserResult
{
    /** Whether the effect was successfully consumed. */
    success?: true;
}

/** Expects a faint event for the given pokemon reference. */
export async function* faint(pstate: ParserState, monRef: Side,
    lastEvent?: events.Any): SubParser<FaintResult>
{
    const event = lastEvent ?? (yield);
    if (event.type !== "faint") return {event};
    if (event.monRef !== monRef) return {event};
    return {...yield* base.faint(pstate, event), success: true};
}

/**
 * Expects a field effect to be started.
 * @param source Pokemon that originated the effect.
 * @param effectType Effect type being expected.
 */
export async function* fieldEffect(pstate: ParserState, source: Pokemon | null,
    effectType: effects.FieldType, lastEvent?: events.Any):
    SubParser<SuccessResult>
{
    // TODO: silently pass without event if effect already present
    const event = lastEvent ?? (yield);
    if (event.type !== "activateFieldEffect") return {event};
    if (!event.start) return {event};
    if (event.effect !== effectType) return {event};
    return {
        ...yield* base.activateFieldEffect(pstate, event, source), success: true
    };
}

/**
 * Expects a percentDamage effect.
 * @param targetRef Target pokemon reference.
 * @param percent Percent damage to deal to the target. Positive heals, negative
 * damages.
 * @param lastEvent Last unconsumed event if any.
 */
export async function* percentDamage(pstate: ParserState, targetRef: Side,
    percent: number, lastEvent?: events.Any):
    SubParser<SilentSuccessResult>
{
    const target = pstate.state.teams[targetRef].active;
    // effect would do nothing
    if (matchPercentDamage(percent, target.hp.current, target.hp.max))
    {
        return {...lastEvent && {event: lastEvent}, success: "silent"};
    }

    const event = lastEvent ?? (yield);
    if (event.type !== "takeDamage") return {event};
    if (event.monRef !== targetRef) return {event};
    if (event.from) return {event};

    const e = event as events.TakeDamage;
    async function* good(): SubParser<SilentSuccessResult>
    {
        return {...yield* base.takeDamage(pstate, e), success: true};
    }

    if (percent < 0 && event.hp <= target.hp.current) return yield* good();
    if (percent > 0 && event.hp >= target.hp.current) return yield* good();
    // istanbul ignore next: should never happen, but shouldn't throw
    if (percent === 0 && event.hp === target.hp.current) return yield* good();
    return {event};
}

/** Result from `status()`. */
export interface StatusResult extends SubParserResult
{
    /** Status type that was consumed, or `true` if silently consumed. */
    success?: true | effects.StatusType;
}

/**
 * Expects a status effect.
 * @param targetRef Target pokemon reference.
 * @param statusTypes Possible statuses to afflict.
 * @param lastEvent Last unconsumed event if any.
 */
export async function* status(pstate: ParserState, targetRef: Side,
    statusTypes: readonly effects.StatusType[], lastEvent?: events.Any):
    SubParser<StatusResult>
{
    const target = pstate.state.teams[targetRef].active;
    // effect would do nothing
    if (statusTypes.every(s => hasStatus(target, s)))
    {
        return {...lastEvent && {event: lastEvent}, success: true};
    }

    const event = lastEvent ?? (yield);
    switch (event.type)
    {
        case "activateStatusEffect":
            if (!event.start) break;
            if (event.monRef !== targetRef) break;
            if (!statusTypes.includes(event.effect)) break;
            return {
                ...yield* base.activateStatusEffect(pstate, event),
                success: event.effect
            };
        case "clause":
            // ps-specific clause mod is blocking an effect
            if (!statusTypes.includes(event.clause)) break;
            return {
                ...yield* base.clause(pstate, event),
                success: event.clause
            };
    }
    return {event};
}

/** Checks whether the pokemon can't be afflicted by the given status. */
function hasStatus(mon: ReadonlyPokemon, statusType: effects.StatusType):
    boolean
{
    switch (statusType)
    {
        case "aquaRing": case "attract": case "curse": case "flashFire":
        case "focusEnergy": case "imprison": case "ingrain":
        case "leechSeed": case "mudSport": case "nightmare":
        case "powerTrick": case "substitute": case "suppressAbility":
        case "torment": case "waterSport":
        case "destinyBond": case "grudge": case "rage": // singlemove
        case "magicCoat": case "roost": case "snatch": // singleturn
            return mon.volatile[statusType];
        case "bide": case "confusion": case "charge": case "magnetRise":
        case "embargo": case "healBlock": case "slowStart": case "taunt":
        case "uproar": case "yawn":
            return mon.volatile[statusType].isActive;
        case "encore":
            return mon.volatile[statusType].ts.isActive;
        case "endure": case "protect": // stall
            return mon.volatile.stalling;
        case "foresight": case "miracleEye":
            return mon.volatile.identified === statusType;
        default:
            if (dexutil.isMajorStatus(statusType))
            {
                return !!mon.majorStatus.current;
            }
            // istanbul ignore next: should never happen
            throw new Error(`Invalid status effect '${statusType}'`);
    }
}

/**
 * Expects a swap-boost effect.
 * @param source Source Pokemon reference.
 * @param target Target Pokemon reference.
 * @param boosts Boosts to swap.
 */
export async function* swapBoosts(pstate: ParserState, source: Side,
    target: Side, boosts: Partial<dexutil.BoostTable<boolean>>,
    lastEvent?: events.Any): SubParser<SuccessResult>
{
    // can't swap with self
    if (source === target) return {...lastEvent && {event: lastEvent}};

    // expect swapBoosts event
    const event = lastEvent ?? (yield);
    if (event.type !== "swapBoosts") return {event};
    if (((event.monRef1 !== source || event.monRef2 !== target) &&
        (event.monRef1 !== target || event.monRef2 !== source)))
    {
        return {event};
    }

    // make sure boosts match up
    const table = {...boosts};
    for (const b of event.stats)
    {
        // reject if too many stats
        if (!table.hasOwnProperty(b)) return {event};
        delete table[b];
    }
    // reject if not enough stats
    if (Object.keys(table).length > 0) return {event};

    return {...yield* base.swapBoosts(pstate, event), success: true};
}

/**
 * Expects a team effect to be started.
 * @param source Pokemon that originated the effect.
 * @param teamRef Target team reference.
 * @param effectType Effect type being expected.
 */
export async function* teamEffect(pstate: ParserState, source: Pokemon | null,
    teamRef: Side, effectType: effects.TeamType, lastEvent?: events.Any):
    SubParser<SuccessResult>
{
    // TODO: silently pass without event if effect already present
    const event = lastEvent ?? (yield);
    if (event.type !== "activateTeamEffect") return {event};
    if (!event.start) return {event};
    if (event.teamRef !== teamRef) return {event};
    if (event.effect !== effectType) return {event};
    return {
        ...yield* base.activateTeamEffect(pstate, event, source), success: true
    };
}
