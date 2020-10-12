import * as dex from "../../dex/dex";
import * as dexutil from "../../dex/dex-util";
import * as effects from "../../dex/effects";
import * as events from "../BattleEvent";
import { ParserState, SubParser } from "../BattleParser";
import { eventLoop } from "../helpers";
import { handlers as base } from "./base";
import { PendingEffects } from "./pending/PendingEffects";
import { PendingPercentEffect } from "./pending/PendingPercentEffect";
import { PendingValueEffect } from "./pending/PendingValueEffect";

/**
 * Handles events within the context of an ability activation. Returns the last
 * event that it didn't handle.
 * @param on Context in which the ability is activating.
 * @param hitByMoveName Name of the move that the pokemon was just hit by, if
 * applicable.
 */
export async function* activateAbility(pstate: ParserState,
    initialEvent: events.ActivateAbility, on: effects.ability.On | null = null,
    hitByMoveName?: string): SubParser
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
            const baseName = `${data.name} on-${ctg} ${effect.tgt}`;

            if (effect.tgt === "self")
            {
                // if the ability is activating due to a ko, we shouldn't
                //  expect any self-effects from activating
                // TODO: when is this not the case?
                if (ctg === "contactKO")
                {
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
                    // should never happen
                    throw new Error("Unknown Ability effect type " +
                        `'${effect!.type}'`);
            }
        }
    }

    if (data.invertDrain)
    {
        pendingEffects.add(`${data.name} on-damaged hit percentDamage`,
            // TODO: custom drain damage calculation
            new PendingPercentEffect(-1), "assert");
    }

    // after the ability has been validated, we can infer it for the pokemon
    initialMon.traits.setAbility(data.name);

    // handle ability effects
    const result = yield* eventLoop(async function* loop(event): SubParser
    {
        switch (event.type)
        {
            case "activateFieldEffect":
                // see if the weather can be caused by the current ability
                if (dexutil.isWeatherType(event.effect) &&
                    weatherAbilities[event.effect] === data.name)
                {
                    // fill in infinite duration (gen3-4) and source
                    return yield* base.activateFieldEffect(pstate, event,
                        initialMon, /*weatherInfinite*/ true);
                }
                break;
            case "activateStatusEffect":
            {
                if (!on || !event.start) return;

                const tgt: effects.ability.Target =
                    event.monRef === initialEvent.monRef ? "self" : "hit";

                if (throughQualifiedCategories(data.name, on, tgt, "status",
                    name => pendingEffects.consume(name, event.effect)))
                {
                    return yield* base.activateStatusEffect(pstate, event)
                }
                break;
            }
            case "changeType":
            {
                const tgt: effects.ability.Target =
                    event.monRef === initialEvent.monRef ? "self" : "hit";
                const name = `${data.name} on-${on} ${tgt} typeChange`;

                // TODO: what if on=contact/contactKO or the initialMon was
                //  ko'd?
                if (event.newTypes[1] === "???" &&
                    hitByMove?.type === event.newTypes[0] &&
                    pendingEffects.consume(name, "colorchange"))
                {
                    return yield* base.changeType(pstate, event);
                }
                break;
            }
            case "takeDamage":
            {
                const tgt: effects.ability.Target =
                    event.monRef === initialEvent.monRef ? "self" : "hit";

                const damagedMon = pstate.state.teams[event.monRef].active;
                const initial = damagedMon.hp.current;
                const next = event.hp;
                const max = damagedMon.hp.max;

                if (throughQualifiedCategories(data.name, on, tgt,
                    "percentDamage",
                    name => pendingEffects.consume(name, initial, next, max)))
                {
                    return yield* base.takeDamage(pstate, event);
                }
                break;
            }
            // TODO: can an ability cause this?
            // case "halt": return yield* base.halt(pstate, event);
        }
        return event; // stop loop
    });
    // make sure all effects have been handled before returning
    pendingEffects.assert();
    return result;
}

// TODO: move to dex ability effects
/** Maps weather type to the ability that can cause it. */
const weatherAbilities: {readonly [T in dexutil.WeatherType]: string} =
{
    Hail: "snowwarning", RainDance: "drizzle", Sandstorm: "sandstream",
    SunnyDay: "drought"
};

/**
 * Iterates through qualified `effects.ability.On` types up to the `on`
 * parameter to generate PendingEffects keys.
 * @param name Ability name.
 * @param on Category name.
 * @param tgt Effect target.
 * @param f Function to execute on the generated effect name.
 * @param ctgs Category names to iterate over. Stops when an element equals the
 * `on` parameter after calling `f`.
 * @returns Whether one of the calls to `f` returned true, false otherwise.
 */
function throughQualifiedCategories(name: string, on: effects.ability.On | null,
    tgt: effects.ability.Target, type: effects.ability.AbilityEffect["type"],
    f: (effectName: string) => boolean,
    ctgs: readonly effects.ability.On[] =
        ["damaged", "contact", "contactKO"]): boolean
{
    for (const ctg of ctgs)
    {
        const effectName = `${name} on-${ctg} ${tgt} ${type}`;
        if (f(effectName)) return true;
        if (ctg === on) break;
    }
    return false;
}
