import * as dex from "../../dex/dex";
import * as dexutil from "../../dex/dex-util";
import * as effects from "../../dex/effects";
import { Pokemon } from "../../state/Pokemon";
import { Side } from "../../state/Side";
import * as events from "../BattleEvent";
import { ParserState, SubParser, SubParserResult } from "../BattleParser";
import { eventLoop } from "../helpers";
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
    // TODO: assertions for lifeorb + sheerforce/magicguard, not just klutz
    const pendingItems = getItems(pstate, eligible,
        d => !!d.on?.movePostDamage);

    return yield* expectItems(pstate, "movePostDamage", pendingItems,
        lastEvent);
}

/** Filters out item possibilities that don't match the given predicate. */
function getItems(pstate: ParserState,
    monRefs: Partial<Readonly<Record<Side, any>>>,
    f: (data: dexutil.ItemData) => boolean):
    Partial<Record<Side, string[]>>
{
    const result: Partial<Record<Side, string[]>> = {};
    for (const monRef in monRefs)
    {
        if (!monRefs.hasOwnProperty(monRef)) continue;
        // can't activate item if suppressed by embargo status
        const mon = pstate.state.teams[monRef as Side].active;
        if (mon.volatile.embargo.isActive) continue;

        const filtered = [...mon.item.possibleValues]
            .filter(n => f(mon.item.map[n]));
        if (filtered.length > 0) result[monRef as Side] = filtered;
    }
    return result;
}

/**
 * Expects an item activation.
 * @param on Context in which the item would activate.
 * @param pendingItems Eligible item possibilities.
 */
async function* expectItems(pstate: ParserState,
    on: dexutil.ItemOn | null,
    pendingItems: Partial<Record<Side, readonly string[]>>,
    lastEvent?: events.Any): SubParser<ExpectItemsResult>
{
    // if the next event is an activateItem with one of those appropriate items,
    //  then handle it
    // repeat until the next item event isn't one of these
    const results: ItemResult[] = [];
    const result = yield* eventLoop(
        async function* expectItemsLoop(event): SubParser
        {
            if (event.type !== "activateItem") return {event};

            // get the possible items that could activate within this ctx
            if (!pendingItems.hasOwnProperty(event.monRef)) return {event};
            const items = pendingItems[event.monRef];

            // find the ItemData out of those possible items
            const itemName = items?.find(
                n => n === (event as events.ActivateItem).item);
            if (!itemName) return {event};

            // consume the pending item for this pokemon
            delete pendingItems[event.monRef];

            // handle the item
            const itemResult = yield* activateItem(pstate, event, on);
            results.push(itemResult);
            return itemResult;
        },
        lastEvent);

    // for the pokemon's items that didn't activate, remove those as
    //  possibilities
    for (const monRef in pendingItems)
    {
        if (!pendingItems.hasOwnProperty(monRef)) continue;
        const possibilities = pendingItems[monRef as Side];
        if (!possibilities || possibilities.length <= 0) continue;

        // can't infer yet since an ability can ignore item effects
        const mon = pstate.state.teams[monRef as Side].active;
        const {ability} = mon.traits;
        const filteredAbility = [...ability.possibleValues]
            .filter(n => ability.map[n].flags?.ignoreItem);
        // if every possible item should've activated, then we have an
        //  item-ignoring ability
        if (filteredAbility.length > 0 && !mon.volatile.suppressAbility)
        {
            if (possibilities.length === mon.item.possibleValues.size)
            {
                ability.narrow(...filteredAbility);
            }
            // can't make any meaningful inferences if neither ability nor item
            //  are definite
            // TODO: register mutual onNarrow callbacks?
        }
        else
        {
            // no item-ignoring ability, so must not have the pending item
            pstate.state.teams[monRef as Side].active.item
                .remove(...possibilities);
        }
    }

    return {...result, results};
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

// on-movePostDamagee handlers

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
