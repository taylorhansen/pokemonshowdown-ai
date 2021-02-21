import * as dex from "../../dex/dex";
import * as dexutil from "../../dex/dex-util";
import * as effects from "../../dex/effects";
import { StatusType } from "../../dex/effects";
import { getAttackerTypes, getTypeEffectiveness } from "../../dex/typechart";
import { Pokemon } from "../../state/Pokemon";
import { Side } from "../../state/Side";
import * as events from "../BattleEvent";
import { ParserState, SubParser, SubParserResult } from "../BattleParser";
import { hasStatus } from "../helpers";
import { handlers as base } from "./base";
import { createEventInference, EventInference, expectEvents, ExpectEventsResult,
    SubInference, SubReason } from "./EventInference";
import { assertMoveType, moveIsType } from "./helpers";
import { cantHaveAbilities, getItems } from "./itemHelpers";
import * as parsers from "./parsers";

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
        function preMoveFilter(data, mon)
        {
            if (!data.consumeOn?.preMove) return null;
            return checkHPThreshold(mon, data.consumeOn.preMove.threshold,
                data.isBerry);
        });

    return expectConsumeItems(pstate, "preMove", pendingItems,
        /*hitByMove*/ undefined, /*userRef*/ undefined, lastEvent);
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
        function moveChargeFilter(data, mon)
        {
            if (!data.consumeOn?.moveCharge) return null;
            if (data.consumeOn.moveCharge === "shorten")
            {
                return cantHaveKlutz(mon);
            }
            return null;
        });

    return expectConsumeItems(pstate, "moveCharge", pendingItems,
        /*hitByMove*/ undefined, /*userRef*/ undefined, lastEvent);
}

/**
 * Expects a consumeOn-`preHit` item to activate.
 * @param eligible Eligible holders.
 * @param hitByMove Move the holder is being hit by.
 * @param userRef User of the move.
 */
export function consumeOnPreHit(pstate: ParserState,
    eligible: Partial<Readonly<Record<Side, true>>>,
    hitByMove: dexutil.MoveData, userRef: Side, lastEvent?: events.Any):
    SubParser<ExpectConsumeItemsResult>
{
    const user = pstate.state.teams[userRef].active;
    const pendingItems = getItems(pstate, eligible,
        function preHitFilter(data, mon)
        {
            if (!data.consumeOn?.preHit) return null;

            const result = cantHaveKlutz(mon);
            if (!result) return null;

            if (data.consumeOn.preHit.resistSuper)
            {
                // can't activate if holder isn't weak to the type this item
                //  protects against (unless normal)
                if (data.consumeOn.preHit.resistSuper !== "normal" &&
                    getTypeEffectiveness(mon.types,
                            data.consumeOn.preHit.resistSuper) !== "super")
                {
                    return null;
                }
                // can't activate for status/fixed-damage moves
                if (hitByMove.category === "status" || hitByMove.damage)
                {
                    return null;
                }
                // will only work then if the move type is the protected type
                // TODO: don't add if already proven/disproven
                result.add(moveIsType(hitByMove, user,
                        new Set([data.consumeOn.preHit.resistSuper])));
            }

            return result;
        });

    return expectConsumeItems(pstate, "preHit", pendingItems, hitByMove,
        userRef, lastEvent);
}

/**
 * Expects a consumeOn-`super` item to activate.
 * @param eligible Eligible holders.
 * @param hitByMove Move the holder is being hit by.
 * @param userRef User of the move.
 */
export function consumeOnSuper(pstate: ParserState,
    eligible: Partial<Readonly<Record<Side, true>>>,
    hitByMove: dexutil.MoveData, userRef: Side, lastEvent?: events.Any):
    SubParser<ExpectConsumeItemsResult>
{
    const user = pstate.state.teams[userRef].active;
    const binary = hitByMove.category === "status" || !!hitByMove.damage;
    const pendingItems = getItems(pstate, eligible,
        function superFilter(data, mon)
        {
            if (!data.consumeOn?.super) return null;

            const klutz = cantHaveKlutz(mon);
            if (!klutz || binary) return klutz;
            // move must be super-effective
            klutz.add(moveIsType(hitByMove, user,
                    getAttackerTypes(mon.types, "super")))
            return klutz;
        });

    return expectConsumeItems(pstate, "super", pendingItems, hitByMove, userRef,
        lastEvent);
}

/**
 * Expects a consumeOn-`postHit` item to activate.
 * @param eligible Eligible holders.
 * @param hitByMove Move the holder is being hit by.
 * @param userRef User of the move.
 */
export function consumeOnPostHit(pstate: ParserState,
    eligible: Partial<Readonly<Record<Side, true>>>,
    hitByMove: dexutil.MoveData, userRef: Side, lastEvent?: events.Any):
    SubParser<ExpectConsumeItemsResult>
{
    const pendingItems = getItems(pstate, eligible,
        function postHitFilter(data, mon)
        {
            if (!data.consumeOn?.postHit) return null;

            if (data.consumeOn.postHit.condition === hitByMove.category)
            {
                // for hit.damage items, will activate even if opponent's hp = 0
                // can likely assume the same for hit.heal, but such a case
                //  would be harder to test
                return cantHaveKlutz(mon);
            }
            return null;
        });

    return expectConsumeItems(pstate, "postHit", pendingItems, hitByMove,
        userRef, lastEvent);
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
        function updateFilter(data, mon)
        {
            switch (data.consumeOn?.update?.condition)
            {
                case "hp":
                    return checkHPThreshold(mon,
                        data.consumeOn.update.threshold, data.isBerry);
                case "status":
                {
                    const {cure} = data.consumeOn.update;
                    let canCure = false;
                    for (const status in cure)
                    {
                        if (!cure.hasOwnProperty(status)) continue;
                        if (canCure ||=
                            hasStatus(mon, status as effects.StatusType))
                        {
                            break;
                        }
                    }
                    if (!canCure) return null;
                    return cantHaveKlutz(mon);
                }
                case "depleted":
                    for (const move of mon.moveset.moves.values())
                    {
                        // TODO: pp may be uncertain in corner cases, handle
                        //  these then add a SubReason to support this later
                        if (move.pp > 0) continue;
                        return cantHaveKlutz(mon);
                    }
                    // fallthrough
                default: return null;
            }
        });

    return expectConsumeItems(pstate, "update", pendingItems,
        /*hitByMove*/ undefined, /*userRef*/ undefined, lastEvent);
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
        function residualFilter(data, mon)
        {
            if (!data.consumeOn?.residual) return null;
            return checkHPThreshold(mon, data.consumeOn.residual.threshold,
                data.isBerry);
        });
    return expectConsumeItems(pstate, "residual", pendingItems,
        /*hitByMove*/ undefined, /*userRef*/ undefined, lastEvent);
}

/**
 * Checks whether the described HP threshold item can activate for the holder.
 * @param mon Item holder.
 * @param threshold Item activation HP threshold.
 * @param isBerry Whether the item is a berry.
 * @returns A boolean stating whether the item can activate, or a `Set<string>`
 * indicating possible abilities that would block the item.
 */
function checkHPThreshold(mon: Pokemon, threshold: number, isBerry?: boolean):
    Set<SubReason> | null
{
    // TODO: is percentHP reliable? how does PS/cart handle rounding?
    const percentHP = 100 * mon.hp.current / mon.hp.max;

    // can't infer abilities
    if (mon.volatile.suppressAbility)
    {
        if (percentHP <= threshold) return new Set();
        return null;
    }

    const {ability} = mon.traits; // shorthand

    const blockingAbilities = checkKlutz(mon);
    if (blockingAbilities.size >= ability.size) return null;

    // hp is between 25-50% so the 25% berry can't activate on it's own, but it
    //  will if the holder has gluttony ability
    if (isBerry && threshold === 25 && percentHP > 25 && percentHP <= 50 &&
        [...ability.possibleValues].some(n => ability.map[n].flags?.earlyBerry))
    {
        // TODO: PossibilityClass methods that abstract away #possibleValues set
        //  manipulations
        // all other non-gluttony abilities therefore block the activation of
        //  this item
        const abilities = [...ability.possibleValues].filter(
            n => !ability.map[n].flags?.earlyBerry);
        for (const n of abilities) blockingAbilities.add(n);
    }
    // gluttony isn't applicable, just do regular hp check
    else if (percentHP > threshold) return null;

    if (blockingAbilities.size <= 0) return new Set();
    if (blockingAbilities.size >= ability.size) return null;
    return new Set([cantHaveAbilities(mon, blockingAbilities)]);
}

/** Klutz check wrapped in a bounds check. */
function cantHaveKlutz(mon: Pokemon): Set<SubReason> | null
{
    const klutz = checkKlutz(mon);
    if (klutz.size <= 0) return new Set();
    if (klutz.size >= mon.traits.ability.size) return null;
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
    hitByMove?: dexutil.MoveData, userRef?: Side, lastEvent?: events.Any):
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
                return yield* removeItem(pstate, event, on, hitByMove, userRef);
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
    /** Item data. */
    readonly item: dexutil.ItemData;
    /** Circumstances in which the item is activating. */
    readonly on: dexutil.ItemConsumeOn | null;
    /** Move that the holder was hit by, if applicable. */
    readonly hitByMove?: dexutil.MoveData;
    /** User of the `#hitByMove`. */
    readonly user?: Pokemon;
    /** Reference to the user of the `#hitByMove`. */
    readonly userRef?: Side;
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
 * @param hitByMove Move the item holder was hit by.
 * @param userRef Reference to the user of the `hitByMove`.
 */
export async function* removeItem(pstate: ParserState,
    event: events.RemoveItem, on: dexutil.ItemConsumeOn | null = null,
    hitByMove?: dexutil.MoveData, userRef?: Side):
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
    // handle consumed=boolean case
    if (!data) return {};

    const ctx: RemoveItemContext =
    {
        pstate, holder, holderRef, item: data, on, ...hitByMove && {hitByMove},
        ...userRef && {user: pstate.state.teams[userRef].active, userRef}
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
            if (!ctx.item.consumeOn?.preMove) reject("preMove", ctx.item.name);
            return yield* moveFirst(ctx, ctx.item.consumeOn.preMove.threshold);
        case "moveCharge":
            if (ctx.item.consumeOn?.moveCharge !== "shorten")
            {
                reject("moveCharge", ctx.item.name);
            }
            return yield* moveChargeShorten(ctx);
        case "preHit":
            if (!ctx.item.consumeOn?.preHit) reject("preHit", ctx.item.name);
            return yield* resistSuper(ctx,
                ctx.item.consumeOn.preHit.resistSuper);
        case "super":
            if (!ctx.item.consumeOn?.super) reject("super", ctx.item.name);
            // TODO: assert type effectiveness?
            return yield* heal(ctx, ctx.item.consumeOn.super.heal);
        case "postHit":
            if (!ctx.item.consumeOn?.postHit) reject("postHit", ctx.item.name);
            return yield* recoilBerry(ctx,
                ctx.item.consumeOn.postHit.condition,
                ctx.item.consumeOn.postHit.damage);
        case "update":
            if (!ctx.item.consumeOn?.update) reject("update", ctx.item.name);
            return yield* updateItem(ctx, ctx.item.consumeOn.update);
        case "residual":
            if (!ctx.item.consumeOn?.residual ||
                ctx.item.consumeOn.residual.status !== "micleberry")
            {
                reject("residual", ctx.item.name);
            }
            assertHPThreshold(ctx.holder,
                ctx.item.consumeOn.residual.threshold);
            ctx.holder.volatile.micleberry = true;
            // fallthrough
        default: return {};
    }
}

/** Handles `custapberry` effect. */
async function* moveFirst(ctx: RemoveItemContext, threshold: number):
    SubParser<ItemConsumeResult>
{
    assertHPThreshold(ctx.holder, threshold);
    return {moveFirst: true};
}

/** Handles `powerherb` effect. */
async function* moveChargeShorten(ctx: RemoveItemContext):
    SubParser<ItemConsumeResult>
{
    return {shorten: true};
}

/** Handles resist berry effect. */
async function* resistSuper(ctx: RemoveItemContext, type: dexutil.Type):
    SubParser<ItemConsumeResult>
{
    // istanbul ignore next: should never happen
    if (!ctx.hitByMove || !ctx.user)
    {
        throw new Error("Incomplete hitByMove/userRef args");
    }

    // assert that the holder is weak to this type
    const {types} = ctx.holder;
    const eff = getTypeEffectiveness(types, type);
    if (eff !== "super")
    {
        // TODO: should log error instead of throwing?
        throw new Error("Expected type effectiveness to be 'super' " +
            `but got '${eff}' for '${type}' vs ` +
            `[${types.join(", ")}]`);
    }

    // infer move type based on resist berry type
    assertMoveType(ctx.hitByMove, type, ctx.user);
    return {resistSuper: type};
}

/** Handles recoil berry effect (`jabocaberry`/`rowapberry`). */
async function* recoilBerry(ctx: RemoveItemContext,
    category: Exclude<dexutil.MoveCategory, "status">, percent: number):
    SubParser<ItemConsumeResult>
{
    // istanbul ignore next: should never happen
    if (!ctx.hitByMove || !ctx.userRef)
    {
        throw new Error("Incomplete hitByMove/userRef args");
    }
    if (ctx.hitByMove.category !== category)
    {
        throw new Error(`Mismatched move category: expected '${category}' ` +
            `but got '${ctx.hitByMove.category}'`);
    }

    const damageResult = yield* parsers.percentDamage(ctx.pstate, ctx.userRef,
        -percent);
    let lastEvent = damageResult.event;
    if (!damageResult.success)
    {
        throw new Error("ConsumeOn-hit damage effect failed");
    }
    if (damageResult.success === true)
    {
        // after taking damage, check if any other items need to activate
        lastEvent = (yield* parsers.update(ctx.pstate, lastEvent)).event;
    }
    return {...lastEvent && {event: lastEvent}};
}

/** Handles consumeOn-`update` effects. */
async function* updateItem(ctx: RemoveItemContext,
    data: NonNullable<NonNullable<dexutil.ItemData["consumeOn"]>["update"]>):
    SubParser<ItemConsumeResult>
{
    switch (data.condition)
    {
        case "hp":
            assertHPThreshold(ctx.holder, data.threshold);
            switch (data.effect.type)
            {
                case "healPercent": case "healFixed":
                {
                    const healResult = yield* heal(ctx, data.effect.heal);
                    let lastEvent = healResult.event;
                    if (data.effect.dislike)
                    {
                        // TODO: assert nature
                        const statusResult = yield* parsers.status(ctx.pstate,
                            ctx.holderRef, ["confusion"], lastEvent);
                        lastEvent = statusResult.event;
                    }
                    return {...lastEvent && {event: lastEvent}};
                }
                case "boost":
                {
                    const boostResult = yield* parsers.boostOne(ctx.pstate,
                        ctx.holderRef, data.effect.boostOne);
                    if (!boostResult.success)
                    {
                        throw new Error("ConsumeOn-update boost effect failed");
                    }
                    return {...boostResult.event && {event: boostResult.event}};
                }
                case "focusEnergy":
                {
                    const statusResult = yield* parsers.status(ctx.pstate,
                        ctx.holderRef, ["focusEnergy"]);
                    if (!statusResult.success)
                    {
                        throw new Error("ConsumeOn-update focusEnergy effect " +
                            "failed");
                    }
                    return {
                        ...statusResult.event && {event: statusResult.event}
                    };
                }
                default:
                    // istanbul ignore next: should never happen
                    throw new Error("ConsumeOn-update effect failed: " +
                        `Unknown effect type '${data.effect!.type}'`);
            }
        case "status":
        {
            // cure all the relevant statuses
            const statusResult = yield* parsers.cure(ctx.pstate, ctx.holderRef,
                Object.keys(data.cure) as StatusType[]);
            if (statusResult.ret !== true && statusResult.ret !== "silent")
            {
                throw new Error("ConsumeOn-update cure effect failed");
            }
            return {...statusResult.event && {event: statusResult.event}};
        }
        case "depleted":
        {
            // restore pp
            const event = yield;
            if (event.type !== "modifyPP" || event.monRef !== ctx.holderRef ||
                event.amount !== data.restore)
            {
                throw new Error("ConsumeOn-update restore effect failed");
            }
            const result = yield* base.modifyPP(ctx.pstate, event);
            return {...result.event && {event: result.event}};
        }
        default:
            // istanbul ignore next: should never happen
            throw new Error("ConsumeOn-update effect failed: Unknown " +
                `condition '${data!.condition}'`);
    }
}

// removeItem effect helpers

/** Handles heal effect from items. */
async function* heal(ctx: RemoveItemContext, percent: number):
    SubParser<ItemConsumeResult>
{
    const healResult = yield* parsers.percentDamage(ctx.pstate, ctx.holderRef,
        percent);
    if (!healResult.success)
    {
        throw new Error(`ConsumeOn-${ctx.on} heal effect failed`);
    }
    return {...healResult.event && {event: healResult.event}};
}

/**
 * Forms an exception to reject an item due to a mismatched ItemConsumeOn key.
 */
function reject(consumeOn: dexutil.ItemConsumeOn, itemName: string): never
{
    throw new Error(`ConsumeOn-${consumeOn} effect shouldn't activate for ` +
        `item '${itemName}'`);
}

/** Makes HP/ability assertions based on item activation HP threshold. */
function assertHPThreshold(holder: Pokemon, threshold: number): void
{
    const percentHP = 100 * holder.hp.current / holder.hp.max;
    if (threshold === 25 && percentHP > 25 && percentHP <= 50)
    {
        if (holder.volatile.suppressAbility)
        {
            throw new Error("Holder must have early-berry (gluttony) ability " +
                "but ability is suppressed");
        }
        holder.traits.ability.narrow((_, a) => !!a.flags?.earlyBerry);
    }
    else if (percentHP > threshold)
    {
        throw new Error(`Holder expected to have HP (${percentHP}%) to be ` +
            `below the item's activation threshold of ${threshold}%`);
    }
}
