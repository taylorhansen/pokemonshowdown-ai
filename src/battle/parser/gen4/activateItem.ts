import * as dex from "../../dex/dex";
import * as dexutil from "../../dex/dex-util";
import * as effects from "../../dex/effects";
import { Pokemon } from "../../state/Pokemon";
import { Side } from "../../state/Side";
import * as events from "../BattleEvent";
import { ParserState, SubParser, SubParserResult } from "../BattleParser";
import { matchPercentDamage } from "../helpers";
import { createItemEventInference, EventInference, expectEvents, getItems,
    ItemInference } from "./helpers";
import * as parsers from "./parsers";

/** Result from `expectItems()` and variants like `onMovePostDamage()`. */
export interface ExpectItemsResult extends SubParserResult
{
    /** Results from each item activation. */
    results: ItemResult[];
}

/**
 * Expects an on-`movePostDamage` item to activate.
 * @param eligible Eligible holders.
 */
export async function* onMovePostDamage(pstate: ParserState,
    eligible: Partial<Readonly<Record<Side, true>>>, lastEvent?: events.Any):
    SubParser<ExpectItemsResult>
{
    const pendingItems = getItems(pstate, eligible,
        function movePostDamageFilter(data, mon)
        {
            if (!data.on?.movePostDamage) return false;

            const abilities = new Set(mon.traits.ability.possibleValues);
            for (const effect of data.on.movePostDamage)
            {
                // if the effect is silent, leave it
                if (matchPercentDamage(effect.value, mon.hp.current,
                    mon.hp.max))
                {
                    continue;
                }
                // filter ability possibilities that can block the remaining
                //  effects
                // if one effect can't be suppressed, then the item should
                //  activate
                if (mon.volatile.suppressAbility) return true;
                for (const abilityName of abilities)
                {
                    const ability = mon.traits.ability.map[abilityName];
                    if (ability.flags?.ignoreItem) continue;
                    if (effect.value < 0 &&
                        ability.flags?.noIndirectDamage === true)
                    {
                        continue;
                    }
                    abilities.delete(abilityName);
                }
                if (abilities.size <= 0) return true;
            }
            return abilities.size > 0 ? abilities : true;
        });

    return yield* expectItems(pstate, "movePostDamage", pendingItems,
        lastEvent);
}

/**
 * Expects an item activation.
 * @param on Context in which the item would activate.
 * @param pendingItems Eligible item possibilities.
 */
function expectItems(pstate: ParserState, on: dexutil.ItemOn,
    pendingItems: Partial<Record<Side, ReadonlyMap<string, ItemInference>>>,
    lastEvent?: events.Any): SubParser<ExpectItemsResult>
{
    const inferences: EventInference[] = [];
    for (const monRef in pendingItems)
    {
        if (!pendingItems.hasOwnProperty(monRef)) continue;
        const items = pendingItems[monRef as Side]!;
        inferences.push(createItemEventInference(pstate, monRef as Side, items,
            async function* itemInfTaker(event, takeAccept)
            {
                if (event.type !== "activateItem") return {event};
                if (event.monRef !== monRef) return {event};

                // match pending item possibilities with current item event
                const itemInf = items.get(event.item);
                if (!itemInf) return {event};

                // indicate accepted event
                takeAccept(itemInf);
                return yield* activateItem(pstate, event, on);
            }));
    }

    return expectEvents(pstate, inferences, lastEvent);
}

/** Context for handling item activation. */
interface ItemContext
{
    /** Parser state. */
    readonly pstate: ParserState;
    /** Item holder. */
    readonly holder: Pokemon;
    /** Item holder Pokemon reference. */
    readonly holderRef: Side;
    /** Item data. */
    readonly item: dexutil.ItemData;
    /** Circumstances in which the item is activating. */
    readonly on: dexutil.ItemOn | null;
}

/** Result from handling an ActivateItem event. */
export type ItemResult = SubParserResult;

/**
 * Handles events within the context of an item activation. Returns the
 * last event that it didn't handle.
 * @param on Context in which the item is activating.
 */
export function activateItem(pstate: ParserState,
    initialEvent: events.ActivateItem, on: dexutil.ItemOn | null = null):
    SubParser<ItemResult>
{
    if (initialEvent.item === "none" ||
        !dex.items.hasOwnProperty(initialEvent.item))
    {
        throw new Error(`Unknown item '${initialEvent.item}'`);
    }
    const holder = pstate.state.teams[initialEvent.monRef].active;
    const holderRef = initialEvent.monRef;
    const data = dex.items[initialEvent.item];

    // after the item has been validated, we can infer it for the pokemon
    holder.setItem(data.name);

    const ctx: ItemContext = {pstate, holder, holderRef, item: data, on};
    return dispatchEffects(ctx);
}

/**
 * Dispatches the effects of an item. Assumes that the initial
 * activateItem event has already been handled.
 * @param ctx Item SubParser context.
 * @param lastEvent Last unconsumed event if any.
 */
async function* dispatchEffects(ctx: ItemContext, lastEvent?: events.Any):
    SubParser<ItemResult>
{
    switch (ctx.on)
    {
        case "movePostDamage":
            if (!ctx.item.on?.movePostDamage)
            {
                throw new Error("On-movePostDamage effect shouldn't activate " +
                    `for item '${ctx.item.name}'`);
            }
            return yield* movePostDamage(ctx, ctx.item.on.movePostDamage,
                lastEvent)
        case "turn":
            if (!ctx.item.on?.turn)
            {
                throw new Error("On-turn effect shouldn't activate for item " +
                    `'${ctx.item.name}'`);
            }
            if (ctx.item.on.turn.poison && ctx.item.on.turn.poison.length > 0 &&
                ctx.holder.types.includes("poison"))
            {
                return yield* turn(ctx, ctx.item.on.turn.poison, lastEvent);
            }
            if (ctx.item.on.turn.noPoison &&
                ctx.item.on.turn.noPoison.length > 0 &&
                !ctx.holder.types.includes("poison"))
            {
                return yield* turn(ctx, ctx.item.on.turn.noPoison, lastEvent);
            }
            if (ctx.item.on.turn.effects && ctx.item.on.turn.effects.length > 0)
            {
                return yield* turn(ctx, ctx.item.on.turn.effects, lastEvent);
            }
            // if nothing is set, then the item shouldn't have activated
            throw new Error("On-turn effect shouldn't activate for item " +
                `'${ctx.item.name}'`);
    }
    return {...lastEvent && {event: lastEvent}};
}

// on-movePostDamage handlers

/**
 * Handles events due to a movePostDamage item (e.g. Life Orb).
 * @param itemEffects Expected effects.
 */
async function* movePostDamage(ctx: ItemContext,
    itemEffects: readonly effects.item.MovePostDamage[],
    lastEvent?: events.Any): SubParser<ItemResult>
{
    for (const effect of itemEffects)
    {
        const damageResult = yield* parsers.percentDamage(ctx.pstate,
            ctx.holderRef, effect.value, lastEvent);
        if (damageResult.success === true) indirectDamage(ctx);
        // TODO: permHalt check?
        lastEvent = damageResult.event;
    }
    return {...lastEvent && {event: lastEvent}};
}

// on-turn handlers

/**
 * Handles events due to a turn item (e.g. Leftovers).
 * @param itemEffects Expected effects.
 */
async function* turn(ctx: ItemContext,
    itemEffects: readonly effects.item.Turn[],
    lastEvent?: events.Any): SubParser<ItemResult>
{
    for (const effect of itemEffects)
    {
        switch (effect.type)
        {
            case "percentDamage":
            {
                const damageResult = yield* parsers.percentDamage(ctx.pstate,
                    ctx.holderRef, effect.value, lastEvent);
                if (damageResult.success === true) indirectDamage(ctx);
                // TODO: permHalt check?
                lastEvent = damageResult.event;
                break;
            }
            case "status":
            {
                const statusResult = yield* parsers.status(ctx.pstate,
                    ctx.holderRef, [effect.value], lastEvent);
                lastEvent = statusResult.event;
                break;
            }
        }
    }
    return {...lastEvent && {event: lastEvent}};
}

/**
 * Indicates that the item holder received indirect damage from the item, in
 * order to make ability inferences.
 */
function indirectDamage(ctx: ItemContext): void
{
    if (ctx.holder.volatile.suppressAbility) return;

    // can't have an ability that blocks indirect damage
    const ability = ctx.holder.traits.ability;
    const filteredAbilities =
        [...ability.possibleValues]
            .filter(n => ability.map[n].flags?.noIndirectDamage === true);
    if (ability.possibleValues.size <= filteredAbilities.length)
    {
        throw new Error(`Pokemon '${ctx.holderRef}' received indirect damage ` +
            `from item '${ctx.item.name}' even though its ability ` +
            `[${[...ability.possibleValues].join(", ")}] suppresses that ` +
            "damage");
    }
    ability.remove(...filteredAbilities);
}
