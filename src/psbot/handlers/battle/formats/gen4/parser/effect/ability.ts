/** @file Parsers related to ability activations. */
import {SideID} from "@pkmn/types";
import {BattleAgent} from "../../../../agent";
import {BattleParserContext, inference, unordered} from "../../../../parser";
import * as dex from "../../dex";
import {Pokemon} from "../../state/Pokemon";
import * as reason from "../reason";

// TODO: getAbilities() should be called within the UnorderedParser, in case
// conditions change later when awaiting via unordered.all(), e.g. during move
// effect parsing in action/move.ts:postHit().
// Same as above for item.ts.

//#region on-x EventInference functions.

/**
 * Creates an EventInference parser that expects an on-`switchOut` ability to
 * activate if possible.
 *
 * @param ctx Context in order to figure out which abilities to watch.
 * @param side Pokemon reference who could have such an ability.
 * @returns An EventInference for handling ability possibilities.
 */
export const onSwitchOut = onX(
    "onSwitchOut",
    (ctx, side) => {
        const mon = ctx.state.getTeam(side).active;
        return getAbilities(mon, ability => ability.canSwitchOut(mon));
    },
    onXInferenceParser(
        "onSwitchOutInference",
        onXUnorderedParser(
            "onSwitchOutUnordered",
            async (ctx, accept, ability, side) =>
                await ability.onSwitchOut(ctx, accept, side),
        ),
    ),
);

/**
 * Creates an EventInference parser that expects an on-`start` ability to
 * activate if possible.
 *
 * @param ctx Context in order to figure out which abilities to watch.
 * @param side Pokemon reference who could have such an ability.
 * @returns An EventInference for handling ability possibilities.
 */
export const onStart = onX(
    "onStart",
    (ctx, side) => {
        const mon = ctx.state.getTeam(side).active;
        return getAbilities(mon, ability => ability.canStart(mon));
    },
    // Note: This function internally handles the special trace ability logic.
    onXInferenceParser(
        "onStartInference",
        onXUnorderedParser(
            "onStartUnordered",
            async (ctx, accept, ability, side) =>
                await ability.onStart(ctx, accept, side),
        ),
    ),
);

/**
 * Creates an EventInference parser that expects an on-`block` ability to
 * activate if possible.
 *
 * @param ctx Context in order to figure out which abilities to watch.
 * @param side Pokemon reference who could have such an ability.
 * @param hitBy Move+user ref that the holder is being hit by.
 * @returns An EventInference that returns info about any blocked effects.
 */
export const onBlock = onX(
    "onBlock",
    (ctx, side, hitBy: dex.MoveAndUserRef) => {
        const mon = ctx.state.getTeam(side).active;
        const hitBy2: dex.MoveAndUser = {
            move: hitBy.move,
            user: ctx.state.getTeam(hitBy.userRef).active,
        };
        return getAbilities(mon, ability =>
            ability.canBlock(ctx.state.status.weather.type, hitBy2),
        );
    },
    onXInferenceParser(
        "onBlockInference",
        onXUnorderedParser(
            "onBlockUnordered",
            async (ctx, accept, ability, side, hitBy) =>
                await ability.onBlock(ctx, accept, side, hitBy),
        ),
    ),
);

// TODO: Refactor hitBy to include other unboost effect sources, e.g.
// intimidate.
/**
 * Creates an EventInference parser that expects an on-`tryUnboost` ability to
 * activate if possible.
 *
 * @param ctx Context in order to figure out which abilities to watch.
 * @param side Pokemon reference who could have such an ability.
 * @param hitBy Move+user ref that the holder is being hit by.
 * @returns An EventInference that returns the boosts that were blocked.
 */
export const onTryUnboost = onX(
    "onTryUnboost",
    (ctx, side, hitBy: dex.MoveAndUserRef) => {
        const mon = ctx.state.getTeam(side).active;
        const hitBy2: dex.MoveAndUser = {
            move: hitBy.move,
            user: ctx.state.getTeam(hitBy.userRef).active,
        };
        return getAbilities(mon, ability => ability.canBlockUnboost(hitBy2));
    },
    onXInferenceParser(
        "onTryUnboostInference",
        onXUnorderedParser(
            "onTryUnboostUnordered",
            async (ctx, accept, ability, side) =>
                await ability.onTryUnboost(ctx, accept, side),
        ),
    ),
);

/**
 * Creates an EventInference parser that expects an on-`status` ability to
 * activate if possible.
 *
 * @param ctx Context in order to figure out which abilities to watch.
 * @param side Pokemon reference who could have such an ability.
 * @param statusType Status that was afflicted.
 * @returns An EventInference for handling ability possibilities.
 */
export const onStatus = onX(
    "onStatus",
    (ctx, side, statusType: dex.StatusType) => {
        const mon = ctx.state.getTeam(side).active;
        return getAbilities(mon, ability => ability.canStatus(mon, statusType));
    },
    onXInferenceParser(
        "onStatusInference",
        onXUnorderedParser(
            "onStatusUnordered",
            async (ctx, accept, ability, side) =>
                await ability.onStatus(ctx, accept, side),
        ),
    ),
);

/** Damage qualifier type for {@link onMoveDamage}. */
export type MoveDamageQualifier = "damage" | "contact" | "contactKo";

/**
 * Creates an EventInference parser that expects an on-`moveDamage` ability or
 * its variants to activate if possible.
 *
 * @param ctx Context in order to figure out which abilities to watch.
 * @param side Pokemon reference who could have such an ability.
 * @param qualifier The qualifier of which effects the ability may activate.
 * @param hitBy Move+user ref the holder was hit by.
 * @returns An EventInference for handling ability possibilities.
 */
export const onMoveDamage = onX(
    "onMoveDamage",
    (ctx, side, qualifier: MoveDamageQualifier, hitBy: dex.MoveAndUserRef) => {
        const mon = ctx.state.getTeam(side).active;
        const on = qualifierToOn[qualifier];
        const hitBy2: dex.MoveAndUser = {
            move: hitBy.move,
            user: ctx.state.getTeam(hitBy.userRef).active,
        };
        return getAbilities(mon, ability =>
            ability.canMoveDamage(mon, on, hitBy2),
        );
    },
    onXInferenceParser(
        "onMoveDamageInference",
        onXUnorderedParser(
            "onMoveDamageUnordered",
            async (ctx, accept, ability, side, qualifier, hitBy) =>
                await ability.onMoveDamage(
                    ctx,
                    accept,
                    side,
                    qualifierToOn[qualifier],
                    hitBy,
                ),
        ),
    ),
);

const qualifierToOn: {readonly [T in MoveDamageQualifier]: dex.AbilityOn} = {
    damage: "moveDamage",
    contact: "moveContact",
    contactKo: "moveContactKo",
};

// TODO: Refactor hitBy to support non-move drain effects, e.g. leechseed.
/**
 * Creates an EventInference parser that expects an on-`moveDrain` ability to
 * activate if possible (e.g. Liquid Ooze).
 *
 * @param ctx Context in order to figure out which abilities to watch.
 * @param side Pokemon reference who could have such an ability.
 * @param hitByUserRef Pokemon reference to the user of the draining move.
 * @returns An EventInference that returns whether drain damage was deducted
 * instead of healed.
 */
export const onMoveDrain = onX(
    "onMoveDrain",
    (ctx, side, hitByUserRef: SideID) => {
        // Unused arg only here to enforce typing of Ability#onMoveDrain call.
        void hitByUserRef;
        const mon = ctx.state.getTeam(side).active;
        return getAbilities(mon, ability => ability.canMoveDrain());
    },
    onXInferenceParser(
        "onStatusInference",
        onXUnorderedParser(
            "onStatusUnordered",
            async (ctx, accept, ability, side, hitByUserRef) =>
                await ability.onMoveDrain(ctx, accept, side, hitByUserRef),
        ),
    ),
);

//#endregion

//#region on-x EventInference helpers.

function onX<TArgs extends unknown[] = [], TResult = unknown>(
    name: string,
    f: (
        ctx: BattleParserContext<"gen4">,
        side: SideID,
        ...args: TArgs
    ) => Map<dex.Ability, inference.SubInference>,
    inferenceParser: inference.InferenceParser<
        "gen4",
        BattleAgent<"gen4">,
        [
            side: SideID,
            abilities: Map<dex.Ability, inference.SubInference>,
            ...args: TArgs
        ],
        TResult
    >,
) {
    const onString = name.substr(2, 1).toLowerCase() + name.substr(3);

    // Force named function so that stack traces make sense.
    return {
        [name](ctx: BattleParserContext<"gen4">, side: SideID, ...args: TArgs) {
            const abilities = f(ctx, side, ...args);
            return new inference.EventInference(
                `${side} ability on-${onString}`,
                new Set(abilities.values()),
                inferenceParser,
                side,
                abilities,
                ...args,
            );
        },
    }[name];
}

// eslint-disable-next-line @typescript-eslint/naming-convention
function onXInferenceParser<TArgs extends unknown[] = [], TResult = unknown>(
    name: string,
    unorderedParser: unordered.UnorderedParser<
        "gen4",
        BattleAgent<"gen4">,
        [ability: dex.Ability, side: SideID, ...args: TArgs],
        [ability: dex.Ability, res: TResult]
    >,
): inference.InferenceParser<
    "gen4",
    BattleAgent<"gen4">,
    [
        side: SideID,
        abilities: Map<dex.Ability, inference.SubInference>,
        ...args: TArgs
    ],
    TResult | undefined
> {
    // Used in trace check special logic.
    const isOnStart = name === "onStartInference";

    const i = name.indexOf("Inference");
    if (i <= 3) throw new Error(`Invalid inference parser name '${name}'`);
    const onString = name.substr(2, 1).toLowerCase() + name.substr(3, i - 3);

    // Use computed property to force function name in stack trace.
    return {
        async [name](
            ctx: BattleParserContext<"gen4">,
            accept: inference.AcceptCallback,
            side: SideID,
            abilities: Map<dex.Ability, inference.SubInference>,
            ...args: TArgs
        ): Promise<TResult | undefined> {
            const parsers: unordered.UnorderedDeadline<
                "gen4",
                BattleAgent<"gen4">,
                [ability: dex.Ability, res: TResult]
            >[] = [];
            let trace: dex.Ability | undefined;
            for (const ability of abilities.keys()) {
                if (
                    isOnStart &&
                    // istanbul ignore next: Tedious to reproduce each ?.
                    // branch.
                    ability.data.on?.start?.copyFoeAbility
                ) {
                    // Note(gen4): Traced ability is shown before trace effect.
                    // Parse the possibly-traced ability first before seeing if
                    // it was traced.
                    // This also handles ambiguous cases where a traced ability
                    // may be one of the holder's possible abilities that could
                    // activate on-start.
                    trace = ability;
                    continue;
                }
                parsers.push(
                    unordered.UnorderedDeadline.create(
                        `ability on-${onString} inference`,
                        unorderedParser,
                        undefined /*reject*/,
                        ability,
                        side,
                        ...args,
                    ),
                );
            }

            let oppAbilities:
                | Map<dex.Ability, inference.SubInference>
                | undefined;
            if (trace) {
                // Speculatively parse opponent's possible on-start abilities as
                // if the current trace ability holder now has it.
                const otherSide = side === "p1" ? "p2" : "p1";
                const opp = ctx.state.getTeam(otherSide).active;
                oppAbilities = getAbilities(opp, a => a.canStart(opp));
                for (const oppAbility of oppAbilities.keys()) {
                    if (abilities.has(oppAbility)) continue;
                    parsers.push(
                        unordered.UnorderedDeadline.create(
                            `ability on-${onString} inference speculative ` +
                                "trace opponent",
                            unorderedParser,
                            undefined /*reject*/,
                            oppAbility,
                            side,
                            ...args,
                        ),
                    );
                }
            }

            const [oneOfRes] = await unordered.oneOf(ctx, parsers);

            if (trace) {
                // Now we can check if the ability originally came from trace by
                // checking for a trace indicator event afterwards.
                const traced = await trace.copyFoeAbility(ctx, side);
                if (traced) {
                    const holder = ctx.state.getTeam(side).active;
                    // Infer trace ability.
                    accept(abilities.get(trace)!);
                    // Set overridden (traced) ability.
                    holder.setAbility(traced.ability);
                    // Infer traced ability for target.
                    ctx.state
                        .getTeam(traced.side)
                        .active.setAbility(traced.ability);
                    return;
                }
                if (
                    oneOfRes &&
                    !abilities.has(oneOfRes[0]) &&
                    oppAbilities!.has(oneOfRes[0])
                ) {
                    throw new Error(
                        "Traced opponent's ability " +
                            `'${oneOfRes[0].data.name}' but no trace ` +
                            "indicator event found",
                    );
                }
            }

            // No abilities activated.
            if (!oneOfRes) return;

            const [acceptedAbility, result] = oneOfRes;
            accept(abilities.get(acceptedAbility)!);
            return result;
        },
    }[name];
}

// eslint-disable-next-line @typescript-eslint/naming-convention
function onXUnorderedParser<TArgs extends unknown[] = [], TResult = unknown>(
    name: string,
    parser: unordered.UnorderedParser<
        "gen4",
        BattleAgent<"gen4">,
        [ability: dex.Ability, side: SideID, ...args: TArgs],
        TResult
    >,
): unordered.UnorderedParser<
    "gen4",
    BattleAgent<"gen4">,
    [ability: dex.Ability, side: SideID, ...args: TArgs],
    [ability: dex.Ability, res: TResult]
> {
    // Use computed property to force function name in stack trace.
    return {
        // eslint-disable-next-line prefer-arrow/prefer-arrow-functions
        async [name](
            ctx: BattleParserContext<"gen4">,
            accept: unordered.AcceptCallback,
            ability: dex.Ability,
            side: SideID,
            ...args: TArgs
        ): Promise<[ability: dex.Ability, res: TResult]> {
            return [ability, await parser(ctx, accept, ability, side, ...args)];
        },
    }[name];
}

/**
 * Searches for possible ability pathways based on the given predicate.
 *
 * @param mon Pokemon to search.
 * @param prove Callback for filtering eligible abilities. Should return a set
 * of {@link inference.SubReason reasons} that would prove that the ability
 * could activate, or null if it can't.
 * @returns A Map of {@link dex.Ability} to a {@link inference.SubInference}
 * modeling its restrictions given by the predicate.
 */
function getAbilities(
    mon: Pokemon,
    prove: (ability: dex.Ability) => Set<inference.SubReason> | null,
): Map<dex.Ability, inference.SubInference> {
    const res = new Map<dex.Ability, inference.SubInference>();
    if (mon.volatile.suppressAbility) return res;

    for (const name of mon.traits.ability.possibleValues) {
        const ability = dex.getAbility(mon.traits.ability.map[name]);
        const reasons = prove(ability);
        if (!reasons) continue;
        reasons.add(reason.ability.has(mon, new Set([name])));
        res.set(ability, new inference.SubInference(reasons));
    }
    return res;
}

//#endregion
