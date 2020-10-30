import * as dex from "../../dex/dex";
import * as dexutil from "../../dex/dex-util";
import * as effects from "../../dex/effects";
import { ReadonlyPokemon } from "../../state/Pokemon";
import { otherSide } from "../../state/Side";
import * as events from "../BattleEvent";
import { ParserState, SubParser, SubParserResult } from "../BattleParser";
import { eventLoop } from "../helpers";
import { handlers as base } from "./base";
import { PendingBoostEffect } from "./pending/PendingBoostEffect";
import { PendingEffects } from "./pending/PendingEffects";
import { PendingPercentEffect } from "./pending/PendingPercentEffect";
import { PendingValueEffect } from "./pending/PendingValueEffect";

/** Result from handling an ActivateAbility event. */
export interface AbilityResult extends SubParserResult
{
    /**
     * Whether the ability is the source of an immunity of the move on
     * `preDamage`.
     */
    immune?: true;
    /** Whether an invertDrain ability is activating on `damage`. */
    invertDrain?: true;
    /** Unboost effects being blocked for the ability holder. */
    blockUnboost?: {readonly [T in dexutil.BoostName]?: true}
}

/**
 * Handles events within the context of an ability activation. Returns the last
 * event that it didn't handle.
 * @param on Context in which the ability is activating.
 * @param hitByMoveName Name of the move that the pokemon was just hit by, if
 * applicable.
 */
export async function* activateAbility(pstate: ParserState,
    initialEvent: events.ActivateAbility,
    on: effects.ability.On | "preDamage" | null = null, hitByMoveName?: string):
    SubParser<AbilityResult>
{
    if (!dex.abilities.hasOwnProperty(initialEvent.ability))
    {
        throw new Error(`Unknown ability '${initialEvent.ability}'`);
    }
    const initialMon = pstate.state.teams[initialEvent.monRef].active;
    const data = dex.abilities[initialEvent.ability];

    let hitByMove: dexutil.MoveData | undefined;
    if (hitByMoveName && dex.moves.hasOwnProperty(hitByMoveName))
    {
        hitByMove = dex.moves[hitByMoveName];
    }

    const baseResult: AbilityResult = {};

    // add pending effects
    const pendingEffects = new PendingEffects();
    for (const ctg of Object.keys(data.effects ?? {}) as
        effects.ability.On[])
    {
        // let specific categories also count as less specific ones
        let invalid = false;
        switch (on)
        {
            case "contactKO":
                if (ctg === "contactKO") break;
                // fallthrough
            case "contact":
                if (ctg === "contact") break;
                // fallthrough
            case "damaged":
                if (ctg === "damaged") break;
                // fallthrough
            default:
                invalid = true;
        }
        if (invalid) continue;

        for (const effect of data.effects![ctg]!)
        {
            const baseName = `${data.name} ${effect.tgt}`;

            if (effect.tgt === "self")
            {
                // if the ability is activating due to a ko, we shouldn't
                //  expect any self-effects from activating
                // TODO: when is this not the case?
                if (ctg === "contactKO")
                {
                    // istanbul ignore next: should never happen
                    throw new Error(`Effect '${baseName}' can't activate`);
                }
                if (on === "contactKO") continue;
            }

            switch (effect.type)
            {
                case "chance":
                {
                    const name = baseName + " status";
                    for (const innerEffect of effect.effects)
                    {
                        pendingEffects.add(name,
                            new PendingValueEffect(innerEffect.value),
                            "alt");
                    }
                    break;
                }
                case "percentDamage":
                    pendingEffects.add(baseName + " percentDamage",
                        new PendingPercentEffect(effect.value), "assert");
                    break;
                case "status": case "typeChange":
                    pendingEffects.add(baseName + " " + effect.type,
                        new PendingValueEffect(effect.value), "assert");
                    break;
                default:
                    // istanbul ignore next: should never happen
                    throw new Error("Unknown Ability effect type " +
                        `'${effect!.type}'`);
            }
        }
    }

    if (data.invertDrain)
    {
        // TODO: only set this once the below pending effect has been consumed
        baseResult.invertDrain = true;
        pendingEffects.add(`${data.name} hit percentDamage`,
            // TODO: custom drain damage calculation
            new PendingPercentEffect(-1), "assert");
    }

    // TODO: figure out how to make inferences when this doesn't activate
    // TODO: add on="start" to the string union for switch-ins/ability changes
    if (data.warnStrongestMove)
    {
        pendingEffects.add(`${data.name} warnStrongestMove`,
            new PendingValueEffect(true), "assert");
    }

    if (data.blockUnboost)
    {
        // boosts being blocked are inferred by ability data
        pendingEffects.add(`${data.name} blockUnboost`,
            new PendingValueEffect(true), "assert");
    }

    if (data.absorb && on === "preDamage")
    {
        // should be activating because we were hit by a move that this ability
        //  absorbs (TODO: type changing moves judgment/hiddenpower)
        if (hitByMoveName !== "judgment" && hitByMoveName !== "hiddenpower" &&
            hitByMove?.type !== data.absorb.type)
        {
            return {...baseResult, event: initialEvent};
        }

        // TODO: only set this once the below pending effects have been consumed
        baseResult.immune = true;

        const baseName = `${data.name} self `;
        for (const effect of data.absorb.effects)
        {
            const effectName = baseName + effect.type;
            switch (effect.type)
            {
                case "boost":
                    for (const k of ["add", "set"] as const)
                    {
                        const table = effect[k];
                        if (!table) continue;
                        for (const b of dexutil.boostKeys)
                        {
                            if (!table.hasOwnProperty(b)) continue;
                            const boostEffectName = effectName + ` ${k} ${b}`;
                            pendingEffects.add(boostEffectName,
                                new PendingBoostEffect(table[b]!,
                                    /*set*/ k === "set"), "assert");
                            // skip if the boost is already maxed out
                            pendingEffects.consume(boostEffectName, 0,
                                ...(k === "set" ? [] :
                                    [initialMon.volatile.boosts[b]]));
                        }
                    }
                    break;
                case "percentDamage":
                    if (initialMon.hp.current === initialMon.hp.max) break;
                    pendingEffects.add(effectName,
                        new PendingPercentEffect(effect.value), "assert");
                    break;
                case "status":
                    if (hasStatus(initialMon, effect.value)) break;
                    pendingEffects.add(effectName,
                        new PendingValueEffect(effect.value), "assert");
                    break;
                default:
                    // istanbul ignore next: should never happen
                    throw new Error("Unknown Ability absorb effect type " +
                        `'${effect!.type}'`);
            }
        }
    }

    // after the ability has been validated, we can infer it for the pokemon
    initialMon.traits.setAbility(data.name);

    // should've been blocked by an opposing blockExplosive ability
    if (data.explosive)
    {
        const opponent = pstate.state.teams[otherSide(initialEvent.monRef)]
            .active;
        if (!opponent.volatile.suppressAbility)
        {
            const pc = opponent.traits.ability;
            const possibilities = [...pc.possibleValues]
                .filter(a => pc.map[a].blockExplosive);
            pc.remove(...possibilities);
        }
    }

    // handle ability effects
    const result = yield* eventLoop(async function* loop(event): SubParser
    {
        switch (event.type)
        {
            case "activateFieldEffect":
                // see if the weather can be caused by the current ability
                if (event.start && dexutil.isWeatherType(event.effect) &&
                    weatherAbilities[event.effect] === data.name)
                {
                    // fill in infinite duration (gen3-4) and source
                    return yield* base.activateFieldEffect(pstate, event,
                        initialMon, /*weatherInfinite*/ true);
                }
                break;
            case "activateStatusEffect":
            {
                if (!event.start) return {};

                const tgt: effects.ability.Target =
                    event.monRef === initialEvent.monRef ? "self" : "hit";
                const name = `${data.name} ${tgt} status`;

                if (pendingEffects.consume(name, event.effect))
                {
                    return yield* base.activateStatusEffect(pstate, event)
                }
                break;
            }
            case "boost":
            {
                const tgt: effects.ability.Target =
                    event.monRef === initialEvent.monRef ? "self" : "hit";
                const name = `${data.name} ${tgt} boost ` +
                    `${event.set ? "set" : "add"} ${event.stat}`;

                const mon = pstate.state.teams[event.monRef].active;
                if (pendingEffects.consume(name, event.amount,
                    ...(event.set ? [] : [mon.volatile.boosts[event.stat]])))
                {
                    return yield* base.boost(pstate, event);
                }
                break;
            }
            case "changeType":
            {
                const tgt: effects.ability.Target =
                    event.monRef === initialEvent.monRef ? "self" : "hit";
                const name = `${data.name} ${tgt} typeChange`;

                if (event.newTypes[1] === "???" &&
                    hitByMove?.type === event.newTypes[0] &&
                    pendingEffects.consume(name, "colorchange"))
                {
                    return yield* base.changeType(pstate, event);
                }
                break;
            }
            case "fail":
                if (!pendingEffects.consume(`${data.name} blockUnboost`)) break;
                baseResult.blockUnboost = data.blockUnboost;
                return yield* base.fail(pstate, event);
            case "immune":
                // TODO: check whether this is possible
                baseResult.immune = true;
                return yield* base.immune(pstate, event);
            case "revealMove":
            {
                if (!pendingEffects.consume(`${data.name} warnStrongestMove`))
                {
                    break;
                }
                const subResult = yield* base.revealMove(pstate, event);

                // rule out moves stronger than this one
                const {moveset} = pstate.state.teams[event.monRef].active;
                const bp = getForewarnPower(event.move);
                moveset.inferDoesntHave(
                    [...moveset.constraint]
                        .filter(m => getForewarnPower(m) > bp));

                return subResult;
            }
            case "takeDamage":
            {
                const tgt: effects.ability.Target =
                    event.monRef === initialEvent.monRef ? "self" : "hit";
                const name = `${data.name} ${tgt} percentDamage`;

                const damagedMon = pstate.state.teams[event.monRef].active;
                const initial = damagedMon.hp.current;
                const next = event.hp;
                const max = damagedMon.hp.max;

                if (pendingEffects.consume(name, initial, next, max))
                {
                    return yield* base.takeDamage(pstate, event)
                }
                break;
            }
            // TODO: can an ability cause this?
            // case "halt": return yield* base.halt(pstate, event);
        }
        return {event}; // stop loop
    });
    // make sure all effects have been handled before returning
    pendingEffects.assert();
    return {...baseResult, ...result};
}

// TODO: move to dex ability effects
/** Maps weather type to the ability that can cause it. */
const weatherAbilities: {readonly [T in dexutil.WeatherType]: string} =
{
    Hail: "snowwarning", RainDance: "drizzle", Sandstorm: "sandstream",
    SunnyDay: "drought"
};

function hasStatus(mon: ReadonlyPokemon, status: effects.StatusType): boolean
{
    switch (status)
    {
        case "aquaRing": case "attract": case "curse": case "flashFire":
        case "focusEnergy": case "imprison": case "ingrain":
        case "leechSeed": case "mudSport": case "nightmare":
        case "powerTrick": case "substitute": case "suppressAbility":
        case "torment": case "waterSport":
        case "destinyBond": case "grudge": case "rage": // singlemove
        case "magicCoat": case "roost": case "snatch": // singleturn
            return mon.volatile[status];
        case "bide": case "confusion": case "charge": case "magnetRise":
        case "embargo": case "healBlock": case "slowStart": case "taunt":
        case "uproar": case "yawn":
            return mon.volatile[status].isActive;
        case "encore":
            return mon.volatile[status].ts.isActive;
        case "endure": case "protect": // stall
            return mon.volatile.stalling;
        case "foresight": case "miracleEye":
            return mon.volatile.identified === status;
        default:
            if (dexutil.isMajorStatus(status))
            {
                return mon.majorStatus.current === status;
            }
            // istanbul ignore next: should never happen
            throw new Error(`Invalid status effect '${status}'`);
    }
}

/**
 * Looks up the base power of a move based on how the Forewarn ability evaluates
 * it.
 */
function getForewarnPower(move: string): number
{
    const data = dex.moves[move];
    const bp = data?.basePower;
    // ohko moves
    if (bp === "ohko") return 160;
    // counter moves
    if (["counter", "metalburst", "mirrorcoat"].includes(move)) return 120;
    // fixed damage/variable power moves (hiddenpower, lowkick, etc)
    if (!bp && data && data.category !== "status") return 80;
    // regular base power, eruption/waterspout and status moves
    return bp ?? 0;
}
