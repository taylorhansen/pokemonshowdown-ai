import * as dex from "../../dex/dex";
import * as dexutil from "../../dex/dex-util";
import { Pokemon } from "../../state/Pokemon";
import { Side } from "../../state/Side";
import * as events from "../BattleEvent";
import { ParserState, SubParser, SubParserResult } from "../BattleParser";
import { createEventInference, EventInference, expectEvents, ExpectEventsResult,
    SubInference } from "./EventInference";
import { getItems } from "./itemHelpers";

/** Result from `expectItems()` and variants like `onMovePostDamage()`. */
export type ExpectItemsResult = ExpectEventsResult<ItemResult>;

/**
 * Expects an on-`movePostDamage` item to activate.
 * @param eligible Eligible holders.
 */
export function onMovePostDamage(pstate: ParserState,
    eligible: Partial<Readonly<Record<Side, true>>>, lastEvent?: events.Any):
    SubParser<ExpectItemsResult>
{
    const pendingItems = getItems(pstate, eligible,
        (item, mon) => item.canMovePostDamage(mon));

    return expectItems(pstate, "movePostDamage", pendingItems, lastEvent);
}

/**
 * Expects an item activation.
 * @param on Context in which the item would activate.
 * @param pendingItems Eligible item possibilities.
 */
function expectItems(pstate: ParserState, on: dexutil.ItemOn,
    pendingItems: {readonly [S in Side]?: ReadonlyMap<string, SubInference>},
    lastEvent?: events.Any): SubParser<ExpectItemsResult>
{
    const inferences: EventInference<ItemResult>[] = [];
    for (const monRef in pendingItems)
    {
        if (!pendingItems.hasOwnProperty(monRef)) continue;
        const items = pendingItems[monRef as Side]!;
        inferences.push(createEventInference(new Set(items.values()),
            async function* expectItemsTaker(event, accept)
            {
                if (event.type !== "activateItem") return {event};
                if (event.monRef !== monRef) return {event};

                // match pending item possibilities with current item event
                const inf = items.get(event.item);
                if (!inf) return {event};

                // indicate accepted event
                accept(inf);
                return yield* activateItem(pstate, event, on);
            }));
    }

    return expectEvents(inferences, lastEvent);
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
    /** Item data wrapper. */
    readonly item: dex.Item;
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
    let item: dex.Item | null;
    if (initialEvent.item === "none" ||
        !(item = dex.getItem(initialEvent.item)))
    {
        throw new Error(`Unknown item '${initialEvent.item}'`);
    }
    const holder = pstate.state.teams[initialEvent.monRef].active;
    const holderRef = initialEvent.monRef;

    // after the item has been validated, we can infer it for the pokemon
    holder.setItem(item.data.name);

    // dispatch item effects
    const ctx: ItemContext = {pstate, holder, holderRef, item, on};
    return dispatchEffects(ctx);
}

/**
 * Dispatches the effects of an item. Assumes that the initial `activateItem`
 * event has already been handled.
 * @param ctx Item SubParser context.
 */
async function* dispatchEffects(ctx: ItemContext): SubParser<ItemResult>
{
    switch (ctx.on)
    {
        case "movePostDamage":
            return yield* ctx.item.onMovePostDamage(ctx.pstate, ctx.holderRef);
        case "turn":
            return yield* ctx.item.onTurn(ctx.pstate, ctx.holderRef);
        default:
            return {};
    }
}
