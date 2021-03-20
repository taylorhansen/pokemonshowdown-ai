import * as dex from "../../dex/dex";
import * as dexutil from "../../dex/dex-util";
import { Pokemon } from "../../state/Pokemon";
import { Side } from "../../state/Side";
import * as events from "../BattleEvent";
import { ParserState, SubParser, SubParserResult } from "../BattleParser";
import { createEventInference, EventInference, expectEvents, ExpectEventsResult,
    SubInference } from "./EventInference";
import { getItems } from "./itemHelpers";

// TODO: should EventInference code be moved to a separate module?
/**
 * Result from `expectConsumeItems()` and variants like `consumeOnMoveCharge()`.
 */
export type ExpectConsumeItemsResult = ExpectEventsResult<ItemConsumeResult>;

// TODO: most of these can't be called by current turn-tracking infrastructure
/**
 * Expects a consumeOn-`preMove` item to activate.
 * @param eligible Eligible holders.
 */
export function consumeOnPreMove(pstate: ParserState,
    eligible: Partial<Readonly<Record<Side, true>>>, lastEvent?: events.Any):
    SubParser<ExpectConsumeItemsResult>
{
    const pendingItems = getItems(pstate, eligible,
        (item, mon) => item.canConsumePreMove(mon));

    return expectConsumeItems(pstate, "preMove", pendingItems,
        /*hitBy*/ undefined, lastEvent);
}

/**
 * Expects a consumeOn-`moveCharge` item to activate.
 * @param eligible Eligible holders.
 */
export function consumeOnMoveCharge(pstate: ParserState,
    eligible: Partial<Readonly<Record<Side, true>>>, lastEvent?: events.Any):
    SubParser<ExpectConsumeItemsResult>
{
    const pendingItems = getItems(pstate, eligible,
        (item, mon) => item.canConsumeMoveCharge(mon));

    return expectConsumeItems(pstate, "moveCharge", pendingItems,
        /*hitBy*/ undefined, lastEvent);
}

/**
 * Expects a consumeOn-`preHit` item to activate.
 * @param eligible Eligible holders.
 * @param hitByMove Move the holder is being hit by.
 * @param hitByUserRef Pokemon reference to the user of the `hitByMove`.
 */
export function consumeOnPreHit(pstate: ParserState,
    eligible: Partial<Readonly<Record<Side, true>>>,
    hitBy: dexutil.MoveAndUserRef, lastEvent?: events.Any):
    SubParser<ExpectConsumeItemsResult>
{
    const hitBy2: dexutil.MoveAndUser =
        {move: hitBy.move, user: pstate.state.teams[hitBy.userRef].active};
    const pendingItems = getItems(pstate, eligible,
        (item, mon) => item.canConsumePreHit(mon, hitBy2));

    return expectConsumeItems(pstate, "preHit", pendingItems, hitBy, lastEvent);
}

/**
 * Expects a consumeOn-`super` item to activate.
 * @param eligible Eligible holders.
 * @param hitByMove Move the holder is being hit by.
 * @param userRef User of the move.
 */
export function consumeOnSuper(pstate: ParserState,
    eligible: Partial<Readonly<Record<Side, true>>>,
    hitBy: dexutil.MoveAndUserRef, lastEvent?: events.Any):
    SubParser<ExpectConsumeItemsResult>
{
    const hitBy2: dexutil.MoveAndUser =
        {move: hitBy.move, user: pstate.state.teams[hitBy.userRef].active};
    const pendingItems = getItems(pstate, eligible,
        (item, mon) => item.canConsumeSuper(mon, hitBy2));

    return expectConsumeItems(pstate, "super", pendingItems, hitBy, lastEvent);
}

/**
 * Expects a consumeOn-`postHit` item to activate.
 * @param eligible Eligible holders.
 * @param hitByMove Move the holder is being hit by.
 * @param userRef User of the move.
 */
export function consumeOnPostHit(pstate: ParserState,
    eligible: Partial<Readonly<Record<Side, true>>>,
    hitBy: dexutil.MoveAndUserRef, lastEvent?: events.Any):
    SubParser<ExpectConsumeItemsResult>
{
    const hitBy2: dexutil.MoveAndUser =
        {move: hitBy.move, user: pstate.state.teams[hitBy.userRef].active};
    const pendingItems = getItems(pstate, eligible,
        (item, mon) => item.canConsumePostHit(mon, hitBy2));

    return expectConsumeItems(pstate, "postHit", pendingItems, hitBy,
        lastEvent);
}

/**
 * Expects a consumeOn-`update` item to activate.
 * @param eligible Eligible holders.
 */
export function consumeOnUpdate(pstate: ParserState,
    eligible: Partial<Readonly<Record<Side, true>>>, lastEvent?: events.Any):
    SubParser<ExpectConsumeItemsResult>
{
    const pendingItems = getItems(pstate, eligible,
        (item, mon) => item.canConsumeUpdate(mon));

    return expectConsumeItems(pstate, "update", pendingItems,
        /*hitBy*/ undefined, lastEvent);
}

/**
 * Expects a consumeOn-`residual` item to activate.
 * @param eligible Eligible holders.
 */
export function consumeOnResidual(pstate: ParserState,
    eligible: Partial<Readonly<Record<Side, true>>>, lastEvent?: events.Any):
    SubParser<ExpectConsumeItemsResult>
{
    const pendingItems = getItems(pstate, eligible,
        (item, mon) => item.canConsumeResidual(mon));

    return expectConsumeItems(pstate, "residual", pendingItems,
        /*hitBy*/ undefined, lastEvent);
}


/**
 * Expects an item consumption.
 * @param on Context in which the item would activate.
 * @param pendingItems Eligible item possibilities.
 * @param hitBy Move+userRef that the holder was hit by.
 */
function expectConsumeItems(pstate: ParserState, on: dexutil.ItemConsumeOn,
    pendingItems: Partial<Record<Side, ReadonlyMap<string, SubInference>>>,
    hitBy?: dexutil.MoveAndUserRef, lastEvent?: events.Any):
    SubParser<ExpectConsumeItemsResult>
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
                return yield* removeItem(pstate, event, on, hitBy);
            }));
    }

    return expectEvents(inferences, lastEvent);
}

/** Context for handling item consumption effects. */
interface RemoveItemContext
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
    readonly on: dexutil.ItemConsumeOn | null;
    /** Move+user that the holder was hit by, if applicable. */
    readonly hitBy?: dexutil.MoveAndUser & dexutil.MoveAndUserRef;
}

// TODO: separate interface fields by ItemConsumeOn type key
/** Result from handling a RemoveItem event. */
export interface ItemConsumeResult extends SubParserResult
{
    /** Whether the holder will be moving first within its priority bracket. */
    moveFirst?: true;
    /** Whether to shorten charging (two-turn) move. */
    shorten?: true;
    /** Resist berry type. */
    resistSuper?: dexutil.Type;
}

/**
 * Handles events within the context of an item consumption. Returns the
 * last event that it didn't handle.
 * @param on Context in which the item is activating.
 * @param hitBy Move+user that the item holder was hit by.
 */
export async function* removeItem(pstate: ParserState,
    event: events.RemoveItem, on: dexutil.ItemConsumeOn | null = null,
    hitBy?: dexutil.MoveAndUserRef): SubParser<ItemConsumeResult>
{
    let item: dex.Item | null | undefined;
    if (typeof event.consumed === "string")
    {
        if (event.consumed === "none" || !(item = dex.getItem(event.consumed)))
        {
            throw new Error(`Unknown item '${event.consumed}'`);
        }
    }

    const holderRef = event.monRef;
    const holder = pstate.state.teams[holderRef].active;
    holder.removeItem(event.consumed);
    // handle consumed=boolean case
    if (!item) return {};

    const ctx: RemoveItemContext =
    {
        pstate, holder, holderRef, item, on,
        ...hitBy &&
            {hitBy: {...hitBy, user: pstate.state.teams[hitBy.userRef].active}}
    };

    return yield* dispatchEffects(ctx);
}

/**
 * Dispatches the effects of an item being consumed. Assumes that the initial
 * `removeItem` event has already been handled.
 * @param ctx RemoveItem SubParser context.
 */
async function* dispatchEffects(ctx: RemoveItemContext):
    SubParser<ItemConsumeResult>
{
    switch (ctx.on)
    {
        case "preMove":
            return yield* ctx.item.consumeOnPreMove(ctx.pstate, ctx.holderRef);
        case "moveCharge":
            return yield* ctx.item.consumeOnMoveCharge();
        case "preHit":
            // istanbul ignore next: should never happen
            if (!ctx.hitBy) throw new Error("Incomplete hitBy args");
            return yield* ctx.item.consumeOnPreHit(ctx.pstate, ctx.holderRef,
                ctx.hitBy);
        case "super":
            return yield* ctx.item.consumeOnSuper(ctx.pstate, ctx.holderRef);
        case "postHit":
            // istanbul ignore next: should never happen
            if (!ctx.hitBy) throw new Error("Incomplete hitBy args");
            return yield* ctx.item.consumeOnPostHit(ctx.pstate, ctx.holderRef,
                ctx.hitBy);
        case "update":
            return yield* ctx.item.consumeOnUpdate(ctx.pstate, ctx.holderRef);
        case "residual":
            return yield* ctx.item.consumeOnResidual(ctx.pstate, ctx.holderRef);
        default:
            return {};
    }
}
