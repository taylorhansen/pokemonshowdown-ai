import * as dexutil from "../../dex/dex-util";
import { ReadonlyPokemon } from "../../state/Pokemon";
import { Side } from "../../state/Side";
import * as events from "../BattleEvent";
import { ParserState, SubParser, SubParserResult } from "../BattleParser";
import { eventLoop } from "../helpers";

/** Describes an item possibility restriction. */
export interface ItemInference
{
    /** Holder's possible abilities that can block the item activation. */
    readonly blockingAbilities?: ReadonlySet<string>;
}

/**
 * Filters out item possibilities that don't match the given predicate.
 * @param monRefs Eligible item holders.
 * @param f Callback for filtering eligible items. Can also include a Set
 * describing the holder's possible abilities that block the item from
 * activating.
 * @returns An object mapping the given `monRefs` keys to Maps of item
 * possibility name to an ItemInference obj describing restrictions on each
 * item.
 */
export function getItems(pstate: ParserState,
    monRefs: Partial<Readonly<Record<Side, any>>>,
    f: (data: dexutil.ItemData, mon: ReadonlyPokemon) => boolean | Set<string>):
    Partial<Record<Side, Map<string, ItemInference>>>
{
    const result: Partial<Record<Side, Map<string, ItemInference>>> = {};
    for (const monRef in monRefs)
    {
        if (!monRefs.hasOwnProperty(monRef)) continue;
        // can't activate item if suppressed by embargo status
        const mon = pstate.state.teams[monRef as Side].active;
        if (mon.volatile.embargo.isActive) continue;

        const inferences = new Map<string, ItemInference>();
        for (const name of mon.item.possibleValues)
        {
            const cbResult = f(mon.item.map[name], mon);
            if (!cbResult) continue;
            inferences.set(name,
                {...cbResult instanceof Set && {blockingAbilities: cbResult}});
        }

        if (inferences.size > 0) result[monRef as Side] = inferences;
    }
    return result;
}

/** Describes an expected event and what to do if it does not show up. */
export interface EventInference<
    TResult extends SubParserResult = SubParserResult>
{
    /** Parser for the event. */
    take(event: events.Any): SubParser<TResult>;
    /**
     * Called when the `#take()` parser didn't take the initial event and no
     * other EventInferences took it.
     */
    absent(): void;
}

/** Result from `expectEvents()`. */
export interface ExpectEventsResult<TResult = SubParserResult> extends
    SubParserResult
{
    results: TResult[];
}

export async function* expectEvents<
    TResult extends SubParserResult = SubParserResult>(
    inferences: EventInference<TResult>[], lastEvent?: events.Any):
    SubParser<ExpectEventsResult<TResult>>
{
    const results: TResult[] = [];
    const result = yield* eventLoop(
        async function* expectEventsLoop(event): SubParser
        {
            for (let i = 0; i < inferences.length; ++i)
            {
                // see if the EventInference takes the event
                const inf = inferences[i];
                const infResult = yield* inf.take(event);
                // if it didn't, try a different one
                if (infResult.event === event) continue;
                // if it did, we can move on to the next event
                inferences.splice(i, 1);
                results.push(infResult);
                return infResult;
            }
            return {event};
        },
        lastEvent);

    // for the EventInferences that didn't take any events, execute absent cb
    for (const inf of inferences) inf.absent();

    return {...result, results};
}

/**
 * Creates an EventInference from ItemInferences.
 * @param pstate Parser state.
 * @param monRef Reference to item holder.
 * @param items Possible item names mapped to their applicable restrictions.
 * @param taker Function to validate and handle an event. Should call the
 * callback `takeAccept` before handling the event in order to resolve
 * ItemInference restrictions.
 */
export function createItemEventInference<
    TResult extends SubParserResult = SubParserResult>(
    pstate: ParserState, monRef: Side,
    items: ReadonlyMap<string, ItemInference>,
    taker: (event: events.Any, takeAccept: (inf: ItemInference) => void) =>
        SubParser<TResult>):
    EventInference<TResult>
{
    return {
        take: event => taker(event,
            function takeAccept(inf: ItemInference)
            {
                // abilities that blocked the item can be removed as
                //  possibilities
                const mon = pstate.state.teams[monRef].active;
                // suppressAbility check should've already been done earlier
                if (inf.blockingAbilities)
                {
                    mon.traits.ability.remove(...inf.blockingAbilities)
                }
            }),
        absent(): void
        {
            // for the pokemon's items that didn't activate, remove those as
            //  possibilities
            if (items.size <= 0) return;

            // first see if an ability is interfering with the item
            const mon = pstate.state.teams[monRef as Side].active;
            // intersect each ItemInference ability set
            let intersect: Set<string> | undefined;
            for (const [, inf] of items)
            {
                if (!inf.blockingAbilities) continue;
                if (!intersect) intersect = new Set(inf.blockingAbilities);
                else
                {
                    for (const name of intersect)
                    {
                        if (!inf.blockingAbilities.has(name))
                        {
                            intersect.delete(name);
                        }
                    }
                }
            }
            // if no ability/status is getting in the way of the possible
            //  item(s), then the pokemon must not have had the item(s)
            // suppressAbility check should've already been done earlier
            if (!intersect || intersect.size <= 0)
            {
                mon.item.remove(...items.keys());
            }
            else
            {
                // if every possible item should've activated, then one of these
                //  blocking abilities has to be there
                // typically this only happens when the item is confirmed
                //  (i.e., length=1)
                if (items.size === mon.item.possibleValues.size)
                {
                    mon.traits.ability.narrow(...intersect);
                }
                // can't make any meaningful inferences if neither ability nor
                //  item are definite
                // TODO: register onNarrow callbacks for item/ability?
            }
        }
    };
}
