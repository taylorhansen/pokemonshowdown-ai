import * as dex from "../../dex/dex";
import * as dexutil from "../../dex/dex-util";
import { Pokemon } from "../../state/Pokemon";
import { Side } from "../../state/Side";
import * as events from "../BattleEvent";
import { ParserState, SubParser, SubParserResult } from "../BattleParser";
import { createEventInference, EventInference, expectEvents, ExpectEventsResult,
    SubInference, SubReason } from "./EventInference";
import { cantHaveAbilities, getItems } from "./itemHelpers";

/**
 * Result from `expectConsumeItems()` and variants like `consumeOnMoveCharge()`.
 */
export type ExpectConsumeItemsResult = ExpectEventsResult<ItemConsumeResult>;

/**
 * Expects a consumeOn-`moveCharge` item to activate.
 * @param eligible Eligible holders.
 */
export function consumeOnMoveCharge(pstate: ParserState,
    eligible: Partial<Readonly<Record<Side, true>>>, lastEvent?: events.Any):
    SubParser<ExpectConsumeItemsResult>
{
    const pendingItems = getItems(pstate, eligible,
        function moveChargeFilter(data, mon)
        {
            if (!data.consumeOn?.moveCharge) return null;
            if (data.consumeOn.moveCharge === "shorten")
            {
                return cantHaveKlutz(mon);
            }
            return null;
        });
    return expectConsumeItems(pstate, "moveCharge", pendingItems, lastEvent);
}

/** Klutz check wrapped in a bounds check. */
function cantHaveKlutz(mon: Pokemon): Set<SubReason> | null
{
    const klutz = checkKlutz(mon);
    if (klutz.size <= 0) return new Set();
    if (klutz.size >= mon.traits.ability.possibleValues.size)
    {
        return null;
    }
    return new Set([cantHaveAbilities(mon, klutz)]);
}

/**
 * Checks for item-ignoring abilities.
 * @returns A Set of possible item-ignoring abilities (empty if none are
 * possible).
 */
function checkKlutz(mon: Pokemon): Set<string>
{
    if (mon.volatile.suppressAbility) return new Set();

    const {ability} = mon.traits;
    const abilities = new Set<string>();
    for (const n of ability.possibleValues)
    {
        if (ability.map[n].flags?.ignoreItem) abilities.add(n);
    }
    return abilities;
}

/**
 * Expects an item consumption.
 * @param on Context in which the item would activate.
 * @param pendingItems Eligible item possibilities.
 */
function expectConsumeItems(pstate: ParserState, on: dexutil.ItemConsumeOn,
    pendingItems: Partial<Record<Side, ReadonlyMap<string, SubInference>>>,
    lastEvent?: events.Any): SubParser<ExpectConsumeItemsResult>
{
    const inferences: EventInference[] = [];
    for (const monRef in pendingItems)
    {
        if (!pendingItems.hasOwnProperty(monRef)) continue;
        const items = pendingItems[monRef as Side]!;
        inferences.push(createEventInference(new Set(items.values()),
            async function* expectConsumeItemsTaker(event, accept)
            {
                if (event.type !== "removeItem") return {event};
                if (event.monRef !== monRef) return {event};
                if (typeof event.consumed !== "string") return {event};

                // match pending item possibilities with current item event
                const inf = items.get(event.consumed);
                if (!inf) return {event};

                // indicate accepted event
                accept(inf);
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
