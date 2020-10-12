import * as dex from "../../dex/dex";
import * as dexutil from "../../dex/dex-util";
import * as effects from "../../dex/effects";
import { Pokemon } from "../../state/Pokemon";
import * as events from "../BattleEvent";
import { ParserState, SubParser } from "../BattleParser";
import { eventLoop } from "../helpers";
import { handlers as base } from "./base";
import { PendingEffects } from "./pending/PendingEffects";
import { PendingPercentEffect } from "./pending/PendingPercentEffect";

/**
 * Handles events within the context of an item activation. Returns the
 * last event that it didn't handle.
 * @param ctg Context in which the item is activating.
 */
export async function* activateItem(pstate: ParserState,
    initialEvent: events.ActivateItem,
    ctg: effects.item.Category | null = null): SubParser
{
    if (initialEvent.item === "none" ||
        !dex.items.hasOwnProperty(initialEvent.item))
    {
        throw new Error(`Unknown item '${initialEvent.item}'`);
    }
    const holder = pstate.state.teams[initialEvent.monRef].active;
    const holderRef = initialEvent.monRef;
    const data = dex.items[initialEvent.item];

    const pendingEffects = new PendingEffects();
    for (const effect of data.effects ?? [])
    {
        // wrong context to activate this item in
        // TODO: any reason to not reject?
        if (effect.ctg !== ctg) return initialEvent;
        // evaluate type restrictions
        if (effect.restrictType &&
            !holder.types.includes(effect.restrictType))
        {
            continue;
        }
        if (effect.noRestrictType &&
            holder.types.includes(effect.noRestrictType))
        {
            continue;
        }

        const effectString = `${data.name} ${effect.type} ${effect.ctg}` +
            (effect.restrictType ? ` only-${effect.restrictType}` : "") +
            (effect.noRestrictType ? ` no-${effect.noRestrictType}` : "");

        switch (effect.type)
        {
            case "percentDamage":
                pendingEffects.add(effectString,
                    new PendingPercentEffect(effect.value),
                        "assert");
                break;
            default:
                // should never happen
                throw new Error("Unknown Item effect type " +
                    `'${effect!.type}'`);
        }
    }

    // after the item has been validated, we can infer it for the pokemon
    holder.setItem(data.name);

    // handle item effects
    const result = yield* eventLoop(async function* loop(event): SubParser
    {
        // TODO: support other types of item activation
        if (event.type !== "takeDamage") return event;

        let mon: Pokemon;
        switch (ctg)
        {
            case "selfDamageMove": case "turn":
                if (holderRef !== event.monRef) return event;
                mon = holder;
                break;
            default: return event;
        }
        const initial = mon.hp.current;
        const next = event.hp;
        const max = mon.hp.max;

        // TODO: find a better way to index pending effects
        // check base effect name
        const baseEffectString = `${data.name} percentDamage ${ctg}`;
        if (pendingEffects.consume(baseEffectString, initial, next, max))
        {
            return yield* base.takeDamage(pstate, event);
        }

        // check restrictType
        for (const type of mon.types)
        {
            const effectString = baseEffectString + ` only-${type}`;
            if (pendingEffects.consume(effectString, initial, next, max))
            {
                return yield* base.takeDamage(pstate, event);
            }
        }

        // check noRestrictType
        for (const type of dexutil.typeKeys.filter(t => !mon.types.includes(t)))
        {
            const effectString = baseEffectString + ` no-${type}`;
            if (pendingEffects.consume(effectString, initial, next, max))
            {
                return yield* base.takeDamage(pstate, event);
            }
        }
    });
    // make sure all effects have been handled before returning
    pendingEffects.assert();
    return result;
}
