import * as dex from "../../dex/dex";
import * as dexutil from "../../dex/dex-util";
import { Side } from "../../state/Side";
import * as events from "../BattleEvent";
import { ParserState, SubParser, SubParserResult } from "../BattleParser";
import { createItemEventInference, EventInference, expectEvents, getItems,
    ItemInference } from "./helpers";

/** Result from `expectConsume()` and variants like `consumeOnMoveCharge()`. */
export interface ExpectConsumeResult extends SubParserResult
{
    /** Results from each item consumption. */
    results: ItemConsumeResult[];
}

/**
 * Expects a consumeOn-`moveCharge` item to activate.
 * @param eligible Eligible holders.
 */
export async function* consumeOnMoveCharge(pstate: ParserState,
    eligible: Partial<Readonly<Record<Side, true>>>, lastEvent?: events.Any):
    SubParser<ExpectConsumeResult>
{
    const pendingItems = getItems(pstate, eligible,
        function moveChargeFilter(data)
        {
            if (!data.consumeOn?.moveCharge) return false;
            return data.consumeOn.moveCharge === "shorten";
        });

    return yield* expectConsumeItems(pstate, "moveCharge", pendingItems,
        lastEvent);
}

/**
 * Expects an item consumption.
 * @param on Context in which the item would activate.
 * @param pendingItems Eligible item possibilities.
 */
function expectConsumeItems(pstate: ParserState, on: dexutil.ItemConsumeOn,
    pendingItems: Partial<Record<Side, ReadonlyMap<string, ItemInference>>>,
    lastEvent?: events.Any): SubParser<ExpectConsumeResult>
{
    const inferences: EventInference[] = [];
    for (const monRef in pendingItems)
    {
        if (!pendingItems.hasOwnProperty(monRef)) continue;
        const items = pendingItems[monRef as Side]!;
        inferences.push(createItemEventInference(pstate, monRef as Side, items,
            async function* consumeItemInfTaker(event, takeAccept)
            {
                if (event.type !== "removeItem") return {event};
                if (event.monRef !== monRef) return {event};
                if (typeof event.consumed !== "string") return {event};

                // match pending item possibilities with current item event
                const itemInf = items.get(event.consumed);
                if (!itemInf) return {event};

                // indicate accepted event
                takeAccept(itemInf);
                return yield* removeItem(pstate, event, on);
            }));
    }

    return expectEvents(inferences, lastEvent);
}

/** Result from handling a RemoveItem event. */
export interface ItemConsumeResult extends SubParserResult
{
    /** Whether to shorten charging (two-turn) move. */
    shorten?: true;
}

/**
 * Handles events within the context of an item consumption. Returns the
 * last event that it didn't handle.
 * @param on Context in which the item is activating.
 */
export async function* removeItem(pstate: ParserState,
    event: events.RemoveItem, on: dexutil.ItemConsumeOn | null = null):
    SubParser<ItemConsumeResult>
{
    let data: dexutil.ItemData | undefined;
    if (typeof event.consumed === "string")
    {
        if (event.consumed === "none" ||
            !dex.items.hasOwnProperty(event.consumed))
        {
            throw new Error(`Unknown item '${event.consumed}'`);
        }
        data = dex.items[event.consumed];
    }

    const holderRef = event.monRef;
    const holder = pstate.state.teams[holderRef].active;
    holder.removeItem(event.consumed);
    if (!data) return {};

    let shorten: boolean | undefined;
    switch (on)
    {
        case "moveCharge":
            if (!data.consumeOn?.moveCharge)
            {
                throw new Error("ConsumeOn-moveCharge effect shouldn't " +
                    `activate for item '${data.name}'`);
            }
            shorten = data.consumeOn.moveCharge === "shorten";
            break;
    }
    return {...shorten && {shorten: true}};
}
