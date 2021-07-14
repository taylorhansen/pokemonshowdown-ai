/** @file Parsers related to item activations. */
import { SideID } from "@pkmn/types";
import { BattleAgent } from "../../../../agent";
import { BattleParserContext, inference, unordered } from "../../../../parser";
import * as dex from "../../dex";
import { Pokemon } from "../../state/Pokemon";
import { hasItem } from "../reason";

/** Checks if items should activate. */
export async function updateItems(ctx: BattleParserContext<"gen4">)
{
    // TODO: also check abilities? in what order?
    return await unordered.all(ctx,
        (Object.keys(ctx.state.teams) as SideID[])
            .map(side => consumeOnUpdate(ctx, side)));
}

/**
 * Creates an EventInference parser that expects an on-`movePostDamage` item to
 * activate if possible.
 * @param side Pokemon reference who could have such an item.
 * @returns An EventInference for handling item possibilities.
 */
export const onMovePostDamage = onX("onMovePostDamage",
    (ctx, side) =>
    {
        const mon = ctx.state.getTeam(side).active;
        return getItems(mon, item => item.canMovePostDamage(mon));
    },
    onXInferenceParser("onMovePostDamageInference",
        onXUnorderedParser("onMovePostDamageUnordered",
            async (ctx, accept, item, side) =>
                await item.onMovePostDamage(ctx, accept, side))));

/**
 * Creates an EventInference parser that expects an on-`turn` item to activate
 * if possible.
 * @param side Pokemon reference who could have such an item.
 * @returns An EventInference for handling item possibilities.
 */
export const onTurn = onX("onTurn",
    (ctx, side) =>
    {
        const mon = ctx.state.getTeam(side).active;
        return getItems(mon, item => item.canTurn(mon));
    },
    onXInferenceParser("onTurnInference",
        onXUnorderedParser("onTurnUnordered",
            async (ctx, accept, item, side) =>
                await item.onTurn(ctx, accept, side))));

/**
 * Creates an EventInference parser that expects a consumeOn-`preMove` item to
 * activate if possible.
 * @param side Pokemon reference who could have such an item.
 * @returns An EventInference that returns `"moveFirst"` if the holder is moving
 * first in its priority bracket due to the item, or otherwise `undefined`.
 */
export const consumeOnPreMove = onX("consumeOnPreMove",
    (ctx, side) =>
    {
        const mon = ctx.state.getTeam(side).active;
        return getItems(mon, item => item.canConsumePreMove(mon));
    },
    onXInferenceParser("consumeOnPreMoveInference",
        onXUnorderedParser("consumeOnPreMoveUnordered",
            async (ctx, accept, item, side) =>
                await item.consumeOnPreMove(ctx, accept, side))));

/**
 * Creates an EventInference parser that expects a consumeOn-`moveCharge` item
 * to activate if possible.
 * @param side Pokemon reference who could have such an item.
 * @returns An EventInference that returns `"shorten"` if the holder's two-turn
 * move is being shortend to one due to the item, or otherwise `undefined`.
 */
export const consumeOnMoveCharge = onX("consumeOnMoveCharge",
    (ctx, side) =>
    {
        const mon = ctx.state.getTeam(side).active;
        return getItems(mon, item => item.canConsumeMoveCharge(mon));
    },
    onXInferenceParser("consumeOnMoveChargeInference",
        onXUnorderedParser("consumeOnMoveChargeUnordered",
            async (ctx, accept, item, side) =>
                await item.consumeOnMoveCharge(ctx, accept, side))));

/**
 * Creates an EventInference parser that expects a consumeOn-`preHit` item to
 * activate if possible.
 * @param side Pokemon reference who could have such an item.
 * @param hitBy Move+user the holder is being hit by.
 * @returns An EventInference that returns info about the item that activated,
 * if any.
 */
export const consumeOnPreHit = onX("consumeOnPreHit",
    (ctx, side, hitBy: dex.MoveAndUser) =>
    {
        const mon = ctx.state.getTeam(side).active;
        return getItems(mon, item => item.canConsumePreHit(mon, hitBy));
    },
    onXInferenceParser("consumeOnPreHitInference",
        onXUnorderedParser("consumeOnPreHitUnordered",
            async (ctx, accept, item, side, hitBy) =>
                await item.consumeOnPreHit(ctx, accept, side, hitBy))));

/**
 * Creates an EventInference parser that expects a consumeOn-`tryOHKO` item to
 * activate if possible.
 * @param side Pokemon reference who could have such an item.
 * @returns An EventInference for handling item possibilities.
 */
export const consumeOnTryOHKO = onX("consumeOnTryOHKO",
    (ctx, side) =>
    {
        const mon = ctx.state.getTeam(side).active;
        return getItems(mon, item => item.canConsumeTryOHKO(mon));
    },
    onXInferenceParser("consumeOnTryOHKOInference",
        onXUnorderedParser("consumeOnTryOHKOUnordered",
            async (ctx, accept, item, side) =>
                await item.consumeOnTryOHKO(ctx, accept, side))));

/**
 * Creates an EventInference parser that expects a consumeOn-`super` item to
 * activate if possible.
 * @param side Pokemon reference who could have such an item.
 * @param hitBy Move+user the holder was hit by.
 * @returns An EventInference for handling item possibilities.
 */
export const consumeOnSuper = onX("consumeOnSuper",
    (ctx, side, hitBy: dex.MoveAndUser) =>
    {
        const mon = ctx.state.getTeam(side).active;
        return getItems(mon, item => item.canConsumeSuper(mon, hitBy));
    },
    onXInferenceParser("consumeOnSuperInference",
        onXUnorderedParser("consumeOnSuperUnordered",
            async (ctx, accept, item, side) =>
                await item.consumeOnSuper(ctx, accept, side))));

/**
 * Creates an EventInference parser that expects a consumeOn-`postHit` item to
 * activate if possible.
 * @param side Pokemon reference who could have such an item.
 * @param hitBy Move+user ref the holder was hit by.
 * @returns An EventInference for handling item possibilities.
 */
export const consumeOnPostHit = onX("consumeOnSuper",
    (ctx, side, hitBy: dex.MoveAndUserRef) =>
    {
        const mon = ctx.state.getTeam(side).active;
        const hitBy2: dex.MoveAndUser =
            {move: hitBy.move, user: ctx.state.getTeam(hitBy.userRef).active};
        return getItems(mon, item => item.canConsumePostHit(mon, hitBy2));
    },
    onXInferenceParser("consumeOnPostHitInference",
        onXUnorderedParser("consumeOnPostHitUnordered",
            async (ctx, accept, item, side, hitBy) =>
                await item.consumeOnPostHit(ctx, accept, side, hitBy))));

/**
 * Creates an EventInference parser that expects a consumeOn-`update` item to
 * activate if possible.
 * @param side Pokemon reference who could have such an item.
 * @returns An EventInference for handling item possibilities.
 */
export const consumeOnUpdate = onX("consumeOnUpdate",
    (ctx, side) =>
    {
        const mon = ctx.state.getTeam(side).active;
        return getItems(mon, item => item.canConsumeUpdate(mon));
    },
    onXInferenceParser("consumeOnUpdateInference",
        onXUnorderedParser("consumeOnUpdateUnordered",
            async (ctx, accept, item, side) =>
                await item.consumeOnUpdate(ctx, accept, side))));

/**
 * Creates an EventInference parser that expects a consumeOn-`residual` item to
 * activate if possible.
 * @param side Pokemon reference who could have such an item.
 * @returns An EventInference for handling item possibilities.
 */
export const consumeOnResidual = onX("consumeOnResidual",
    (ctx, side) =>
    {
        const mon = ctx.state.getTeam(side).active;
        return getItems(mon, item => item.canConsumeResidual(mon));
    },
    onXInferenceParser("consumeOnResidualInference",
        onXUnorderedParser("consumeOnResidualUnordered",
            async (ctx, accept, item, side) =>
                await item.consumeOnResidual(ctx, accept, side))));

function onX<TArgs extends unknown[] = [], TResult = unknown>(name: string,
    f: (ctx: BattleParserContext<"gen4">, side: SideID, ...args: TArgs) =>
        Map<dex.Item, inference.SubInference>,
    inferenceParser:
        inference.InferenceParser<"gen4", BattleAgent<"gen4">,
            [
                side: SideID, items: Map<dex.Item, inference.SubInference>,
                ...args: TArgs
            ],
            TResult>)
{
    // force named function so that stack traces make sense
    return {[name](ctx: BattleParserContext<"gen4">, side: SideID,
        ...args: TArgs)
    {
        const items = f(ctx, side, ...args);
        return new inference.EventInference(new Set(items.values()),
            inferenceParser, side, items, ...args);
    }}[name];
}

function onXInferenceParser<TArgs extends unknown[] = [], TResult = unknown>(
    name: string,
    unorderedParser:
        unordered.UnorderedParser<"gen4", BattleAgent<"gen4">,
            [item: dex.Item, side: SideID, ...args: TArgs],
            [item: dex.Item, res: TResult]>)
{
    // force named function so that stack traces make sense
    return {async [name](ctx: BattleParserContext<"gen4">,
        accept: inference.AcceptCallback, side: SideID,
        items: Map<dex.Item, inference.SubInference>, ...args: TArgs)
    {
        const parsers:
            unordered.UnorderedDeadline<"gen4", BattleAgent<"gen4">,
                [item: dex.Item, res: TResult]>[] = [];
        for (const item of items.keys())
        {
            parsers.push(unordered.createUnorderedDeadline(
                unorderedParser, /*reject*/ undefined, item, side, ...args));
        }

        const oneOfRes = await unordered.oneOf(ctx, parsers);
        if (!oneOfRes[0]) return;
        const [acceptedItem, result] = oneOfRes[1];
        accept(items.get(acceptedItem)!);
        return result;
    }}[name];
}

function onXUnorderedParser<TArgs extends unknown[] = [], TResult = unknown>(
    name: string,
    parser: unordered.UnorderedParser<"gen4", BattleAgent<"gen4">,
        [item: dex.Item, side: SideID, ...args: TArgs], TResult>):
    unordered.UnorderedParser<"gen4", BattleAgent<"gen4">,
        [item: dex.Item, side: SideID, ...args: TArgs],
        [item: dex.Item, res: TResult]>
{
    return {async [name](ctx: BattleParserContext<"gen4">,
        accept: unordered.AcceptCallback, item: dex.Item, side: SideID,
        ...args: TArgs):
        Promise<[item: dex.Item, res: TResult]>
    {
        return [item, await parser(ctx, accept, item, side, ...args)];
    }}[name];
}

/**
 * Searches for possible item pathways based on the given predicate.
 * @param mon Pokemon to search.
 * @param prove Callback for filtering eligible items. Should return a set of
 * {@link inference.SubReason reasons} that would prove that the item could
 * activate, or null if it can't.
 * @returns A Map of {@link dex.Item} to a {@link inference.SubInference}
 * modeling its restrictions given by the predicate.
 */
function getItems(mon: Pokemon,
    prove: (item: dex.Item) => Set<inference.SubReason> | null):
    Map<dex.Item, inference.SubInference>
{
    const res = new Map<dex.Item, inference.SubInference>();
    for (const name of mon.item.possibleValues)
    {
        const item = dex.getItem(mon.item.map[name]);
        const reasons = prove(item);
        if (!reasons) continue;
        reasons.add(hasItem(mon, new Set([name])));
        res.set(item, new inference.SubInference(reasons));
    }
    return res;
}
