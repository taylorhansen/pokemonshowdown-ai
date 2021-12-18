/** @file Parsers related to item activations. */
import {SideID} from "@pkmn/types";
import {BattleAgent} from "../../../../agent";
import {BattleParserContext, inference, unordered} from "../../../../parser";
import * as dex from "../../dex";
import {Pokemon} from "../../state/Pokemon";
import * as reason from "../reason";

/** Checks if items should activate. */
export async function updateItems(ctx: BattleParserContext<"gen4">) {
    // TODO: Also check abilities? In what order?
    return await unordered.all(
        ctx,
        (Object.keys(ctx.state.teams) as SideID[]).map(side =>
            onUpdate(ctx, side),
        ),
    );
}

//#region on-x Inference Parser functions.

// TODO: Allow functions to return nothing if no item is possible.

/**
 * Creates an {@link inference.Parser} that expects an on-`preMove` item to
 * activate if possible.
 *
 * @param side Pokemon reference who could have such an item.
 * @returns An inference Parser that returns `"moveFirst"` if the holder is
 * moving first in its priority bracket due to the item, or otherwise
 * `undefined`.
 */
export const onPreMove = onX(
    "onPreMove",
    (ctx, side) => {
        const mon = ctx.state.getTeam(side).active;
        return getItems(mon, item => item.canPreMove(mon));
    },
    onXInferenceParser(
        "onPreMoveInference",
        onXUnorderedParser(
            "onPreMoveUnordered",
            async (ctx, accept, item, side) =>
                await item.onPreMove(ctx, accept, side),
        ),
    ),
);

/**
 * Creates an {@link inference.Parser} that expects an on-`moveCharge` item to
 * activate if possible.
 *
 * @param side Pokemon reference who could have such an item.
 * @returns An inference Parser that returns `"shorten"` if the holder's
 * two-turn move is being shortend to one due to the item, or otherwise
 * `undefined`.
 */
export const onMoveCharge = onX(
    "onMoveCharge",
    (ctx, side) => {
        const mon = ctx.state.getTeam(side).active;
        return getItems(mon, item => item.canMoveCharge(mon));
    },
    onXInferenceParser(
        "onMoveChargeInference",
        onXUnorderedParser(
            "onMoveChargeUnordered",
            async (ctx, accept, item, side) =>
                await item.onMoveCharge(ctx, accept, side),
        ),
    ),
);

/**
 * Creates an {@link inference.Parser} that expects an on-`preHit` item to
 * activate if possible.
 *
 * @param side Pokemon reference who could have such an item.
 * @param hitBy Move+user the holder is being hit by.
 * @returns An inference Parser that returns info about the item that activated,
 * if any.
 */
export const onPreHit = onX(
    "onPreHit",
    (ctx, side, hitBy: dex.MoveAndUser) => {
        const mon = ctx.state.getTeam(side).active;
        return getItems(mon, item => item.canPreHit(mon, hitBy));
    },
    onXInferenceParser(
        "onPreHitInference",
        onXUnorderedParser(
            "onPreHitUnordered",
            async (ctx, accept, item, side, hitBy) =>
                await item.onPreHit(ctx, accept, side, hitBy),
        ),
    ),
);

/**
 * Creates an {@link inference.Parser} that expects an on-`tryOhko` item to
 * activate if possible.
 *
 * @param side Pokemon reference who could have such an item.
 * @returns An inference Parser for handling item possibilities.
 */
export const onTryOhko = onX(
    "onTryOhko",
    (ctx, side) => {
        const mon = ctx.state.getTeam(side).active;
        return getItems(mon, item => item.canTryOhko(mon));
    },
    onXInferenceParser(
        "onTryOhkoInference",
        onXUnorderedParser(
            "onTryOhkoUnordered",
            async (ctx, accept, item, side) =>
                await item.onTryOhko(ctx, accept, side),
        ),
    ),
);

/**
 * Creates an {@link inference.Parser} that expects an on-`super` item to
 * activate if possible.
 *
 * @param side Pokemon reference who could have such an item.
 * @param hitBy Move+user the holder was hit by.
 * @returns An inference Parser for handling item possibilities.
 */
export const onSuper = onX(
    "onSuper",
    (ctx, side, hitBy: dex.MoveAndUser) => {
        const mon = ctx.state.getTeam(side).active;
        return getItems(mon, item => item.canSuper(mon, hitBy));
    },
    onXInferenceParser(
        "onSuperInference",
        onXUnorderedParser(
            "onSuperUnordered",
            async (ctx, accept, item, side) =>
                await item.onSuper(ctx, accept, side),
        ),
    ),
);

/**
 * Creates an {@link inference.Parser} that expects an on-`postHit` item to
 * activate if possible.
 *
 * @param side Pokemon reference who could have such an item.
 * @param hitBy Move+user ref the holder was hit by.
 * @returns An inference Parser for handling item possibilities.
 */
export const onPostHit = onX(
    "onPostHit",
    (ctx, side, hitBy: dex.MoveAndUserRef) => {
        const mon = ctx.state.getTeam(side).active;
        const hitBy2: dex.MoveAndUser = {
            move: hitBy.move,
            user: ctx.state.getTeam(hitBy.userRef).active,
        };
        return getItems(mon, item => item.canPostHit(mon, hitBy2));
    },
    onXInferenceParser(
        "onPostHitInference",
        onXUnorderedParser(
            "onPostHitUnordered",
            async (ctx, accept, item, side, hitBy) =>
                await item.onPostHit(ctx, accept, side, hitBy),
        ),
    ),
);

/**
 * Creates an {@link inference.Parser} that expects an on-`movePostDamage` item
 * to activate if possible.
 *
 * @param side Pokemon reference who could have such an item.
 * @returns An inference Parser for handling item possibilities.
 */
export const onMovePostDamage = onX(
    "onMovePostDamage",
    (ctx, side) => {
        const mon = ctx.state.getTeam(side).active;
        return getItems(mon, item => item.canMovePostDamage(mon));
    },
    onXInferenceParser(
        "onMovePostDamageInference",
        onXUnorderedParser(
            "onMovePostDamageUnordered",
            async (ctx, accept, item, side) =>
                await item.onMovePostDamage(ctx, accept, side),
        ),
    ),
);

/**
 * Creates an {@link inference.Parser} that expects an on-`update` item to
 * activate if possible.
 *
 * @param side Pokemon reference who could have such an item.
 * @returns An inference Parser for handling item possibilities.
 */
export const onUpdate = onX(
    "onUpdate",
    (ctx, side) => {
        const mon = ctx.state.getTeam(side).active;
        return getItems(mon, item => item.canUpdate(mon));
    },
    onXInferenceParser(
        "onUpdateInference",
        onXUnorderedParser(
            "onUpdateUnordered",
            async (ctx, accept, item, side) =>
                await item.onUpdate(ctx, accept, side),
        ),
    ),
);

// Note: Item on-residual is handled specially in residual.ts.

//#endregion

//#region on-x Inference Parser function helpers.

function onX<TArgs extends unknown[] = [], TResult = unknown>(
    name: string,
    f: (
        ctx: BattleParserContext<"gen4">,
        side: SideID,
        ...args: TArgs
    ) => Map<dex.Item, inference.Reason>,
    inferenceParser: inference.InnerParser<
        "gen4",
        BattleAgent<"gen4">,
        [side: SideID, items: Map<dex.Item, inference.Reason>, ...args: TArgs],
        TResult
    >,
): (
    ctx: BattleParserContext<"gen4">,
    side: SideID,
    ...args: TArgs
) => unordered.Parser<"gen4", BattleAgent<"gen4">, TResult> {
    const onString = name.substr(2, 1).toLowerCase() + name.substr(3);

    // Use computed property to force function name in stack trace.
    return {
        [name](
            ctx: BattleParserContext<"gen4">,
            side: SideID,
            ...args: TArgs
        ): unordered.Parser<"gen4", BattleAgent<"gen4">, TResult> {
            const items = f(ctx, side, ...args);
            return inference.parser(
                `${side} item on-${onString}`,
                new Set(items.values()),
                async (_ctx, accept) =>
                    await inferenceParser(_ctx, accept, side, items, ...args),
            );
        },
    }[name];
}

// eslint-disable-next-line @typescript-eslint/naming-convention
function onXInferenceParser<TArgs extends unknown[] = [], TResult = unknown>(
    name: string,
    unorderedParser: unordered.InnerParser<
        "gen4",
        BattleAgent<"gen4">,
        [item: dex.Item, side: SideID, ...args: TArgs],
        [item: dex.Item, res: TResult]
    >,
) {
    const i = name.indexOf("Inference");
    if (i <= 3) throw new Error(`Invalid inference parser name '${name}'`);
    const onString = name.substr(2, 1).toLowerCase() + name.substr(3, i - 3);

    // Force named function so that stack traces make sense.
    return {
        async [name](
            ctx: BattleParserContext<"gen4">,
            accept: inference.AcceptCallback,
            side: SideID,
            items: Map<dex.Item, inference.Reason>,
            ...args: TArgs
        ): Promise<TResult | undefined> {
            const parsers: unordered.Parser<
                "gen4",
                BattleAgent<"gen4">,
                [item: dex.Item, res: TResult]
            >[] = [];
            for (const item of items.keys()) {
                parsers.push(
                    unordered.parser(
                        `item on-${onString} inference`,
                        async (_ctx, _accept) =>
                            await unorderedParser(
                                _ctx,
                                _accept,
                                item,
                                side,
                                ...args,
                            ),
                    ),
                );
            }

            const [oneOfRes] = await unordered.oneOf(ctx, parsers);
            if (!oneOfRes) return;
            const [acceptedItem, result] = oneOfRes;
            accept(items.get(acceptedItem)!);
            return result;
        },
    }[name];
}

// eslint-disable-next-line @typescript-eslint/naming-convention
function onXUnorderedParser<TArgs extends unknown[] = [], TResult = unknown>(
    name: string,
    parser: unordered.InnerParser<
        "gen4",
        BattleAgent<"gen4">,
        [item: dex.Item, side: SideID, ...args: TArgs],
        TResult
    >,
): unordered.InnerParser<
    "gen4",
    BattleAgent<"gen4">,
    [item: dex.Item, side: SideID, ...args: TArgs],
    [item: dex.Item, res: TResult]
> {
    // Use computed property to force function name in stack trace.
    return {
        // eslint-disable-next-line prefer-arrow/prefer-arrow-functions
        async [name](
            ctx: BattleParserContext<"gen4">,
            accept: unordered.AcceptCallback,
            item: dex.Item,
            side: SideID,
            ...args: TArgs
        ): Promise<[item: dex.Item, res: TResult]> {
            return [item, await parser(ctx, accept, item, side, ...args)];
        },
    }[name];
}

/**
 * Searches for possible item pathways based on the given predicate.
 *
 * @param mon Pokemon to search.
 * @param prove Callback for filtering eligible items. Should return a set of
 * {@link inference.Reason reasons} that would prove that the item could
 * activate, or `null` if it can't.
 * @returns A Map of {@link dex.Item}s to {@link inference.Reason}s modeling its
 * restrictions given by the predicate.
 */
function getItems(
    mon: Pokemon,
    prove: (item: dex.Item) => Set<inference.Reason> | null,
): Map<dex.Item, inference.Reason> {
    const res = new Map<dex.Item, inference.Reason>();
    if (mon.volatile.embargo.isActive) return res;
    for (const name of mon.item.possibleValues) {
        const item = dex.getItem(mon.item.map[name]);
        const reasons = prove(item);
        if (!reasons) continue;
        reasons.add(reason.item.has(mon, new Set([name])));
        res.set(item, inference.and(reasons));
    }
    return res;
}

//#endregion
