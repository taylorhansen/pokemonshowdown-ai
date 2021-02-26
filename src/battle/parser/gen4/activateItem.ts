import * as dex from "../../dex/dex";
import * as dexutil from "../../dex/dex-util";
import { Pokemon } from "../../state/Pokemon";
import { Side } from "../../state/Side";
import * as events from "../BattleEvent";
import { ParserState, SubParser, SubParserResult } from "../BattleParser";
import { matchPercentDamage } from "../helpers";
import { createEventInference, EventInference, expectEvents, ExpectEventsResult,
    SubInference } from "./EventInference";
import { cantHaveAbilities, getItems } from "./itemHelpers";
import * as parsers from "./parsers";

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
        function movePostDamageFilter(data, mon)
        {
            if (!data.on?.movePostDamage) return null;

            const abilities = new Set(mon.traits.ability.possibleValues);
            // if the effect is silent or nonexistent, leave it
            const percent = data.on.movePostDamage.percentDamage;
            if (percent &&
                !matchPercentDamage(percent, mon.hp.current, mon.hp.max))
            {
                // filter ability possibilities that can block the remaining
                //  effects
                // if one effect can't be suppressed, then the item should
                //  activate
                if (mon.volatile.suppressAbility) return new Set();
                for (const abilityName of abilities)
                {
                    const ability = mon.traits.ability.map[abilityName];
                    if (ability.flags?.ignoreItem) continue;
                    if (percent < 0 &&
                        ability.flags?.noIndirectDamage === true)
                    {
                        continue;
                    }
                    abilities.delete(abilityName);
                }
                if (abilities.size <= 0) return new Set();
            }
            if (abilities.size <= 0) return new Set();
            if (abilities.size >= mon.traits.ability.size) return null;
            return new Set([cantHaveAbilities(mon, abilities)]);
        });

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
            return yield* movePostDamage(ctx,
                ctx.item.on.movePostDamage.percentDamage, lastEvent);
        case "turn":
            if (!ctx.item.on?.turn)
            {
                throw new Error("On-turn effect shouldn't activate for item " +
                    `'${ctx.item.name}'`);
            }
            if (ctx.item.on.turn.poisonDamage &&
                ctx.holder.types.includes("poison"))
            {
                return yield* turn(ctx, ctx.item.on.turn.poisonDamage,
                    lastEvent);
            }
            if (ctx.item.on.turn.noPoisonDamage &&
                !ctx.holder.types.includes("poison"))
            {
                return yield* turn(ctx, ctx.item.on.turn.noPoisonDamage,
                    lastEvent);
            }
            if (ctx.item.on.turn.status)
            {
                return yield* turn(ctx, ctx.item.on.turn.status, lastEvent);
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
 * @param percentDamage Expected percent-damage effect.
 */
async function* movePostDamage(ctx: ItemContext, percentDamage?: number,
    lastEvent?: events.Any): SubParser<ItemResult>
{
    if (percentDamage)
    {
        const damageResult = yield* parsers.percentDamage(ctx.pstate,
            ctx.holderRef, percentDamage, lastEvent);
        // TODO: permHalt check?
        lastEvent = damageResult.event;
        if (damageResult.success === true)
        {
            indirectDamage(ctx);
            lastEvent = (yield* parsers.update(ctx.pstate, lastEvent)).event;
        }
    }
    return {...lastEvent && {event: lastEvent}};
}

// on-turn handlers

/**
 * Handles events due to a turn item (e.g. Leftovers).
 * @param itemEffect Expected effect, either percent-damage or self-inflicted
 * status.
 */
async function* turn(ctx: ItemContext, itemEffect: number | dexutil.StatusType,
    lastEvent?: events.Any): SubParser<ItemResult>
{
    if (typeof itemEffect === "number")
    {
        const damageResult = yield* parsers.percentDamage(ctx.pstate,
            ctx.holderRef, itemEffect, lastEvent);
        if (damageResult.success === true) indirectDamage(ctx);
        // TODO: permHalt check?
        lastEvent = damageResult.event;
    }
    else
    {
        const statusResult = yield* parsers.status(ctx.pstate,
            ctx.holderRef, [itemEffect], lastEvent);
        lastEvent = statusResult.event;
    }
    lastEvent = (yield* parsers.update(ctx.pstate, lastEvent)).event;
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
    if (ability.size <= filteredAbilities.length)
    {
        throw new Error(`Pokemon '${ctx.holderRef}' received indirect damage ` +
            `from item '${ctx.item.name}' even though its ability ` +
            `[${[...ability.possibleValues].join(", ")}] suppresses that ` +
            "damage");
    }
    ability.remove(filteredAbilities);
}
