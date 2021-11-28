/** @file Parsers related to ability activations. */
import {SideID} from "@pkmn/types";
import {BattleAgent} from "../../../../agent";
import {BattleParserContext, inference, unordered} from "../../../../parser";
import * as dex from "../../dex";
import {Pokemon} from "../../state/Pokemon";
import * as reason from "../reason";

// TODO: getAbilities() should be called within the InnerParser, in case
// conditions change later when awaiting via unordered.all(), e.g. during move
// effect parsing in action/move.ts:postHit().
// Same as above for item.ts.

//#region on-x Inference Parser functions.

/**
 * Creates an {@link inference.Parser} that expects an on-`switchOut` ability to
 * activate if possible.
 *
 * @param ctx Context in order to figure out which abilities to watch.
 * @param side Pokemon reference who could have such an ability.
 * @returns An inference Parser for handling ability possibilities.
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

const onStartUnordered = onXUnorderedParser(
    "onStartUnordered",
    async (ctx, accept, ability, side) =>
        await ability.onStart(ctx, accept, side),
);

/**
 * Creates an {@link inference.Parser} that expects an on-`start` ability to
 * activate if possible.
 *
 * This excludes on-`update` abilities which have overlapping activation
 * conditions, so generally one should use {@link onStartOrUpdate} instead to
 * cover both possibilities as well as some special corner cases with Trace.
 *
 * @param ctx Context in order to figure out which abilities to watch.
 * @param side Pokemon reference who could have such an ability.
 * @returns An inference Parser for handling ability possibilities.
 */
export const onStart = onX(
    "onStart",
    (ctx, side) => {
        const mon = ctx.state.getTeam(side).active;
        // TODO(doubles): Track actual opponents.
        const otherSide = side === "p1" ? "p2" : "p1";
        const opp = ctx.state.getTeam(otherSide).active;
        return getAbilities(mon, ability => ability.canStart(mon, opp));
    },
    onXInferenceParser("onStartInference", onStartUnordered),
);

/**
 * Creates an {@link inference.Parser} that expects an on-`block` ability to
 * activate if possible.
 *
 * @param ctx Context in order to figure out which abilities to watch.
 * @param side Pokemon reference who could have such an ability.
 * @param hitBy Move+user ref that the holder is being hit by.
 * @returns An inference Parser that returns info about any blocked effects.
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

// TODO(#313): Refactor hitBy to include other unboost effect sources, e.g.
// intimidate.
/**
 * Creates an {@link inference.Parser} that expects an on-`tryUnboost` ability
 * to activate if possible.
 *
 * @param ctx Context in order to figure out which abilities to watch.
 * @param side Pokemon reference who could have such an ability.
 * @param source Pokemon that is the source of the boost effect.
 * @param boosts Boosts that will be applied.
 * @returns An inference Parser that returns the boosts that were blocked.
 */
export const onTryUnboost = onX(
    "onTryUnboost",
    (ctx, side, source: Pokemon, boosts: Partial<dex.BoostTable>) => {
        const mon = ctx.state.getTeam(side).active;
        return getAbilities(mon, ability =>
            ability.canBlockUnboost(source, boosts),
        );
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

/** Damage qualifier type for {@link onMoveDamage}. */
export type MoveDamageQualifier = "damage" | "contact" | "contactKo";

/**
 * Creates an {@link inference.Parser} parser that expects an on-`moveDamage`
 * ability or its variants to activate if possible.
 *
 * @param ctx Context in order to figure out which abilities to watch.
 * @param side Pokemon reference who could have such an ability.
 * @param qualifier The qualifier of which effects the ability may activate.
 * @param hitBy Move+user ref the holder was hit by.
 * @returns An inference Parser for handling ability possibilities.
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
 * Creates an {@link inference.Parser} parser that expects an on-`moveDrain`
 * ability to activate if possible (e.g. Liquid Ooze).
 *
 * @param ctx Context in order to figure out which abilities to watch.
 * @param side Pokemon reference who could have such an ability.
 * @param hitByUserRef Pokemon reference to the user of the draining move.
 * @returns An inference Parser that returns whether drain damage was deducted
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
        "onMoveDrainInference",
        onXUnorderedParser(
            "onMoveDrainUnordered",
            async (ctx, accept, ability, side, hitByUserRef) =>
                await ability.onMoveDrain(ctx, accept, side, hitByUserRef),
        ),
    ),
);

/**
 * Creates an {@link inference.Parsaer} parser that expects an on-`weather`
 * ability to activate if possible (e.g. Ice Body).
 *
 * @param ctx Context in order to figure out which abilities to watch.
 * @param side Pokemon reference who could have such an ability.
 * @param weatherType Current weather. Required to be active in order to be able
 * to call this function.
 * @param weatherReasons Reasons for weather effects to happen at all.
 * @returns An inference Parser for handling ability possibilities.
 */
export const onWeather = onX(
    "onWeather",
    (
        ctx,
        side,
        weatherType: dex.WeatherType,
        weatherReasons: ReadonlySet<inference.Reason>,
    ) => {
        const mon = ctx.state.getTeam(side).active;
        return getAbilities(mon, ability => {
            const abilityReasons = ability.canWeather(mon, weatherType);
            if (!abilityReasons) return abilityReasons;
            weatherReasons.forEach(r => abilityReasons.add(r));
            return abilityReasons;
        });
    },
    onXInferenceParser(
        "onWeatherInference",
        onXUnorderedParser(
            "onWeatherUnordered",
            async (ctx, accept, ability, side, weatherType) =>
                await ability.onWeather(ctx, accept, side, weatherType),
        ),
    ),
);

type UpdateResult = Awaited<ReturnType<dex.Ability["onUpdate"]>> | undefined;

/**
 * Creates an {@link inference.Parser} parser that expects an on-`update`
 * ability to activate if possible.
 *
 * @param ctx Context in order to figure out which abilities to watch.
 * @param side Pokemon reference who could have such an ability.
 * @returns An inference Parser for handling ability possibilities.
 */
export function onUpdate(
    ctx: BattleParserContext<"gen4">,
    side: SideID,
): unordered.Parser<"gen4", BattleAgent<"gen4">, UpdateResult> {
    const mon = ctx.state.getTeam(side).active;
    // TODO(doubles): Track actual copy targets.
    const opp = ctx.state.getTeam(side === "p1" ? "p2" : "p1").active;
    const abilities = getAbilities(mon, ability => ability.canUpdate(mon, opp));

    const {copiers, copyable, copyableStart, copyableUpdate} =
        collectCopierInferences(mon, opp, abilities.keys());

    return inference.parser(
        `${side} ability on-update ` +
            `[${[...abilities.keys()].map(a => a.data.name).join(", ")}]`,
        new Set(abilities.values()),
        async (_ctx, accept) =>
            await onUpdateInference(
                _ctx,
                accept,
                side,
                abilities,
                copiers,
                copyable,
                copyableStart,
                copyableUpdate,
            ),
    );
}

/**
 * Inference Parser for {@link onUpdate}.
 *
 * @param side Ability holder reference.
 * @param abilities Inferences for abilities that could activate.
 * @param copiers Subset of `abilities` that are copier abilities (e.g. Trace).
 * @param copyable Inferences for opponent's abilities that could be copied by a
 * copier ability. Empty if `copiers` is empty.
 * @param copyableStart Subset of `copyable` containing inferences for
 * on-`start` abilities, with their activation conditions applied to the copier
 * ability's holder.
 * @param copyableUpdate Same as `copyableStart` but for on-`update`.
 */
async function onUpdateInference(
    ctx: BattleParserContext<"gen4">,
    accept: inference.AcceptCallback,
    side: SideID,
    abilities: ReadonlyMap<dex.Ability, inference.Reason>,
    copiers: ReadonlySet<dex.Ability>,
    copyable: ReadonlyMap<dex.Ability, inference.Reason>,
    copyableStart: ReadonlyMap<dex.Ability, inference.Reason>,
    copyableUpdate: ReadonlyMap<dex.Ability, inference.Reason>,
): Promise<UpdateResult> {
    // No copiers, parse on-update abilities normally.
    if (copiers.size <= 0) {
        return await onUpdateInferenceNoCopy(ctx, accept, side, abilities);
    }
    // Otherwise, we need a lot of special logic shown below to handle copier
    // abilities (i.e. trace).

    const parsers: unordered.Parser<
        "gen4",
        BattleAgent<"gen4">,
        [ability: dex.Ability, res: UpdateResult]
    >[] = [];

    const mon = ctx.state.getTeam(side).active;
    // TODO(doubles): Track actual copy targets.
    const otherSide = side === "p1" ? "p2" : "p1";

    for (const ability of abilities.keys()) {
        // Copier abilities are handled specially.
        if (copiers.has(ability)) continue;

        // First use the normal on-update parser.
        parsers.push(
            unordered.parser(
                onXInferenceName("update", side, ability.data.name),
                async (_ctx, _accept) =>
                    await onUpdateUnordered(_ctx, _accept, ability, side),
            ),
        );
    }

    // Used to set the override copied ability for the holder after inferring
    // its copier ability.
    const postCopy: {ability?: dex.Ability} = {};

    // Handle the case where the holder has a copier ability.
    for (const copied of copyable.keys()) {
        if (copyableStart.has(copied)) {
            // Copied on-start ability could activate immediately.
            parsers.push(
                onUpdateCopyStartInference(
                    "update",
                    side,
                    otherSide,
                    copiers,
                    copied,
                    copyable,
                    copyableStart,
                    postCopy,
                ),
            );
        }
        if (copyableUpdate.has(copied)) {
            // Copied on-update ability could activate immediately.
            parsers.push(
                onUpdateCopyUpdateInference(
                    "update",
                    side,
                    otherSide,
                    copiers,
                    copied,
                    copyable,
                    copyableUpdate,
                    postCopy,
                ),
            );
        }
        // If neither of the above could activate, then we just need to parse
        // the copy indicator event as a last resort.
        // Note: It's important that this is the last parser in the list, since
        // the above Parsers may parse more events than just what this one
        // requires.
        parsers.push(
            onUpdateCopyUnordered(
                "update",
                side,
                otherSide,
                copiers,
                copied,
                copyable,
                postCopy,
            ),
        );
    }

    // Parse ability possibilities and select the one that activates.
    const res = await unordered.oneOf(ctx, parsers);
    // No abilities activated.
    if (res.length <= 0) return;
    // Infer the base ability that was activated.
    const ability = abilities.get(res[0]![0]);
    // istanbul ignore if: Should never happen.
    if (!ability) {
        throw new Error(
            `Unexpected on-update ability '${res[0]![0].data.name}'; ` +
                "expected " +
                `[${[...abilities.keys()].map(a => a.data.name).join(", ")}]`,
        );
    }
    accept(ability);
    // Set the copied ability as the override ability.
    if (postCopy.ability) {
        mon.setAbility(postCopy.ability.data.name);
    }
    return res[0]![1];
}

const onUpdateUnordered = onXUnorderedParser(
    "onUpdateUnordered",
    async (ctx, accept, ability, side) =>
        await ability.onUpdate(ctx, accept, side),
);

const onUpdateInferenceNoCopy = onXInferenceParser(
    "onUpdateInferenceNoCopy",
    onUpdateUnordered,
);

type StartResult = Awaited<ReturnType<dex.Ability["onStart"]>> | undefined;
type StartOrUpdateResult = StartResult | UpdateResult;

/**
 * Creates an {@link inference.Parser} parser that expects an on-`start` or
 * on-`update` ability to activate if possible.
 *
 * @param ctx Context in order to figure out which abilities to watch.
 * @param side Pokemon reference who could have such an ability.
 * @returns An inference Parser for handling ability possibilities.
 */
export function onStartOrUpdate(
    ctx: BattleParserContext<"gen4">,
    side: SideID,
): unordered.Parser<"gen4", BattleAgent<"gen4">, StartOrUpdateResult> {
    const mon = ctx.state.getTeam(side).active;
    // TODO(doubles): Track actual copy targets.
    const opp = ctx.state.getTeam(side === "p1" ? "p2" : "p1").active;
    const startAbilities = getAbilities(mon, ability =>
        ability.canStart(mon, opp),
    );
    const updateAbilities = getAbilities(mon, ability =>
        ability.canUpdate(mon, opp),
    );

    const {copiers, copyable, copyableStart, copyableUpdate} =
        collectCopierInferences(mon, opp, updateAbilities.keys());

    return inference.parser(
        `${side} ability on-startOrUpdate ` +
            `(start: [${[...startAbilities.keys()]
                .map(a => a.data.name)
                .join(", ")}], ` +
            `update: [${[...updateAbilities.keys()]
                .map(a => a.data.name)
                .join(", ")}])`,
        new Set([...startAbilities.values(), ...updateAbilities.values()]),
        async (_ctx, accept) =>
            await onStartOrUpdateInference(
                _ctx,
                accept,
                side,
                startAbilities,
                updateAbilities,
                copiers,
                copyable,
                copyableStart,
                copyableUpdate,
            ),
    );
}

/**
 * Inference Parser for {@link onUpdate}.
 *
 * @param side Ability holder reference.
 * @param startAbilities Inferences for on-`start` abilities that could
 * activate.
 * @param updateAbilities Inferences for on-`update` abilities that could
 * activate.
 * @param copiers Subset of `updateAbilities` that are copier abilities (e.g.
 * Trace).
 * @param copyable Inferences for opponent's abilities that could be copied by a
 * copier ability. Empty if `copiers` is empty.
 * @param copyableStart Subset of `copyable` containing inferences for
 * on-`start` abilities, with their activation conditions applied to the copier
 * ability's holder.
 * @param copyableUpdate Same as `copyableStart` but for on-`update`.
 */
async function onStartOrUpdateInference(
    ctx: BattleParserContext<"gen4">,
    accept: inference.AcceptCallback,
    side: SideID,
    startAbilities: ReadonlyMap<dex.Ability, inference.Reason>,
    updateAbilities: ReadonlyMap<dex.Ability, inference.Reason>,
    copiers: ReadonlySet<dex.Ability>,
    copyable: ReadonlyMap<dex.Ability, inference.Reason>,
    copyableStart: ReadonlyMap<dex.Ability, inference.Reason>,
    copyableUpdate: ReadonlyMap<dex.Ability, inference.Reason>,
): Promise<StartOrUpdateResult> {
    // No copiers, parse on-start/update abilities normally.
    if (copiers.size <= 0) {
        return await onStartOrUpdateInferenceNoCopy(
            ctx,
            accept,
            side,
            startAbilities,
            updateAbilities,
        );
    }
    // Otherwise, we need a lot of special logic shown below to handle copier
    // abilities (i.e. trace).

    const parsers: unordered.Parser<
        "gen4",
        BattleAgent<"gen4">,
        [ability: dex.Ability, res: StartOrUpdateResult]
    >[] = [];

    const mon = ctx.state.getTeam(side).active;
    // TODO(doubles): Track actual copy targets.
    const otherSide = side === "p1" ? "p2" : "p1";

    // Used to set the override copied ability for the holder after inferring
    // its copier ability.
    const postCopy: {ability?: dex.Ability} = {};

    for (const ability of startAbilities.keys()) {
        // Copier abilities are handled specially.
        // istanbul ignore if: Probably would never happen but just in case.
        if (copiers.has(ability)) continue;

        if (!copyableStart.has(ability)) {
            // Use normal on-start parser.
            parsers.push(
                unordered.parser(
                    onXInferenceName("startOrUpdate", side, ability.data.name) +
                        " on-start",
                    async (_ctx, _accept) =>
                        await onStartUnordered(_ctx, _accept, ability, side),
                ),
            );
            continue;
        }

        // Copyable on-start ability is shared by the opponent.
        // Use a special combined parser which defers the copier ability
        // inference until it can parse the copy indicator event.
        parsers.push(
            onStartOrUpdateCopyStartUnorderedShared(
                side,
                otherSide,
                copiers,
                ability,
                copyableStart,
                postCopy,
            ),
        );
    }

    for (const ability of updateAbilities.keys()) {
        // Copier abilities are handled specially.
        if (copiers.has(ability)) continue;

        // First use the normal on-update parser which isn't preceded by a
        // possible copy indicator event.
        parsers.push(
            unordered.parser(
                onXInferenceName("startOrUpdate", side, ability.data.name) +
                    " on-update",
                async (_ctx, _accept) =>
                    await onUpdateUnordered(_ctx, _accept, ability, side),
            ),
        );
    }

    // Handle the case where the holder has a copier ability.
    for (const copied of copyable.keys()) {
        // Non-shared on-start copied ability activations.
        // Note: The shared case is handled by a special combined parser above.
        if (copyableStart.has(copied) && !startAbilities.has(copied)) {
            parsers.push(
                onUpdateCopyStartInference(
                    "startOrUpdate",
                    side,
                    otherSide,
                    copiers,
                    copied,
                    copyable,
                    copyableStart,
                    postCopy,
                ),
            );
        }
        if (copyableUpdate.has(copied)) {
            // Copied on-update ability could activate immediately.
            parsers.push(
                onUpdateCopyUpdateInference(
                    "startOrUpdate",
                    side,
                    otherSide,
                    copiers,
                    copied,
                    copyable,
                    copyableUpdate,
                    postCopy,
                ),
            );
        }
        // If neither of the above could activate, then we just need to parse
        // the copy indicator event as a last resort.
        // Note: It's important that this is the last parser in the list, since
        // the above Parsers may parse more events than just what this one
        // requires.
        parsers.push(
            onUpdateCopyUnordered(
                "startOrUpdate",
                side,
                otherSide,
                copiers,
                copied,
                copyable,
                postCopy,
            ),
        );
    }

    // Parse ability possibilities and select the one that activates.
    const res = await unordered.oneOf(ctx, parsers);
    // No abilities activated.
    if (res.length <= 0) return;
    // Infer the base ability that was activated.
    const ability =
        startAbilities.get(res[0]![0]) ?? updateAbilities.get(res[0]![0]);
    // istanbul ignore if: Should never happen.
    if (!ability) {
        throw new Error(
            "Unexpected on-startOrUpdate ability " +
                `'${res[0]![0].data.name}'; expected start ` +
                `[${[...startAbilities.keys()]
                    .map(a => a.data.name)
                    .join(", ")}]` +
                "or update " +
                `[${[...updateAbilities.keys()]
                    .map(a => a.data.name)
                    .join(", ")}]`,
        );
    }
    accept(ability);
    // Set the copied ability as the override ability.
    if (postCopy.ability) mon.setAbility(postCopy.ability.data.name);
    return res[0]![1];
}

async function onStartOrUpdateInferenceNoCopy(
    ctx: BattleParserContext<"gen4">,
    accept: inference.AcceptCallback,
    side: SideID,
    startAbilities: ReadonlyMap<dex.Ability, inference.Reason>,
    updateAbilities: ReadonlyMap<dex.Ability, inference.Reason>,
): Promise<StartOrUpdateResult> {
    const parsers: unordered.Parser<
        "gen4",
        BattleAgent<"gen4">,
        [ability: dex.Ability, res: StartOrUpdateResult]
    >[] = [];

    for (const ability of startAbilities.keys()) {
        parsers.push(
            unordered.parser(
                onXInferenceName("startOrUpdate", side, ability.data.name) +
                    " on-start",
                async (_ctx, _accept) =>
                    await onStartUnordered(_ctx, _accept, ability, side),
            ),
        );
    }

    for (const ability of updateAbilities.keys()) {
        parsers.push(
            unordered.parser(
                onXInferenceName("startOrUpdate", side, ability.data.name) +
                    " on-update",
                async (_ctx, _accept) =>
                    await onUpdateUnordered(_ctx, _accept, ability, side),
            ),
        );
    }

    // Parse ability possibilities and select the one that activates.
    const res = await unordered.oneOf(ctx, parsers);
    // No abilities activated.
    if (res.length <= 0) return;
    // Infer the base ability that was activated.
    const ability =
        startAbilities.get(res[0]![0]) ?? updateAbilities.get(res[0]![0]);
    // istanbul ignore if: Should never happen.
    if (!ability) {
        throw new Error(
            "Unexpected on-startOrUpdate ability " +
                `'${res[0]![0].data.name}'; expected start ` +
                `[${[...startAbilities.keys()]
                    .map(a => a.data.name)
                    .join(", ")}]` +
                "or update " +
                `[${[...updateAbilities.keys()]
                    .map(a => a.data.name)
                    .join(", ")}]`,
        );
    }
    accept(ability);
    return res[0]![1];
}

/**
 * Creates an {@link inference.Parser} that expects an on-`residual` ability to
 * activate if possible (e.g. Speed Boost).
 *
 * @param ctx Context in order to figure out which abilities to watch.
 * @param side Pokemon reference who could have such an ability.
 * @returns An inference Parser for handling ability possibilities.
 */
export const onResidual = onX(
    "onResidual",
    (ctx, side) => {
        const mon = ctx.state.getTeam(side).active;
        const foes = (Object.keys(ctx.state.teams) as SideID[])
            .filter(s => s !== side)
            .map(s => ctx.state.getTeam(s).active);
        return getAbilities(mon, ability => ability.canResidual(mon, foes));
    },
    onXInferenceParser(
        "onResidualInference",
        onXUnorderedParser(
            "onResidualUnordered",
            async (ctx, accept, ability, side) =>
                await ability.onResidual(ctx, accept, side),
        ),
    ),
);

//#endregion

//#region on-x Inference Parser helpers.

function onX<TArgs extends unknown[] = [], TResult = unknown>(
    name: string,
    f: (
        ctx: BattleParserContext<"gen4">,
        side: SideID,
        ...args: TArgs
    ) => Map<dex.Ability, inference.Reason>,
    inferenceParser: inference.InnerParser<
        "gen4",
        BattleAgent<"gen4">,
        [
            side: SideID,
            abilities: Map<dex.Ability, inference.Reason>,
            ...args: TArgs
        ],
        TResult
    >,
): (
    ctx: BattleParserContext<"gen4">,
    side: SideID,
    ...args: TArgs
) => unordered.Parser<"gen4", BattleAgent<"gen4">, TResult> {
    const onString = name.match(/^on(?<str>.+)$/)?.groups?.["str"];
    // istanbul ignore if: Should never happen.
    if (!onString) throw new Error(`Invalid parser name '${name}'`);

    // Note: Use computed property to force function name in stack trace.
    return {
        [name](
            ctx: BattleParserContext<"gen4">,
            side: SideID,
            ...args: TArgs
        ): unordered.Parser<"gen4", BattleAgent<"gen4">, TResult> {
            const abilities = f(ctx, side, ...args);
            return inference.parser(
                `${side} ability on-${onString} ` +
                    `[${[...abilities.keys()]
                        .map(a => a.data.name)
                        .join(", ")}]`,
                new Set(abilities.values()),
                async (_ctx, accept) =>
                    await inferenceParser(
                        _ctx,
                        accept,
                        side,
                        abilities,
                        ...args,
                    ),
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
        [ability: dex.Ability, side: SideID, ...args: TArgs],
        [ability: dex.Ability, res: TResult]
    >,
): inference.InnerParser<
    "gen4",
    BattleAgent<"gen4">,
    [
        side: SideID,
        abilities: ReadonlyMap<dex.Ability, inference.Reason>,
        ...args: TArgs
    ],
    TResult | undefined
> {
    const onString = name
        .match(/^on(?<str>[a-zA-Z]+)Inference/)
        ?.groups?.["str"].replace(/^[A-Z]/, s => s.toLowerCase());
    // istanbul ignore if: Should never happen.
    if (!onString) throw new Error(`Invalid inference parser name '${name}'`);

    // Note: Use computed property to force function name in stack trace.
    return {
        async [name](
            ctx: BattleParserContext<"gen4">,
            accept: inference.AcceptCallback,
            side: SideID,
            abilities: ReadonlyMap<dex.Ability, inference.Reason>,
            ...args: TArgs
        ): Promise<TResult | undefined> {
            const parsers: unordered.Parser<
                "gen4",
                BattleAgent<"gen4">,
                [ability: dex.Ability, res: TResult]
            >[] = [];

            for (const ability of abilities.keys()) {
                parsers.push(
                    unordered.parser(
                        onXInferenceName(onString, side, ability.data.name),
                        async (_ctx, _accept) =>
                            await unorderedParser(
                                _ctx,
                                _accept,
                                ability,
                                side,
                                ...args,
                            ),
                    ),
                );
            }

            // Parse ability possibilities and select the one that activates.
            const res = await unordered.oneOf(ctx, parsers);
            // No abilities activated.
            if (res.length <= 0) return;
            // Infer the base ability that was activated.
            const ability = abilities.get(res[0]![0]);
            // istanbul ignore if: Should never happen.
            if (!ability) {
                throw new Error(
                    `Unexpected on-${onString} ability ` +
                        `'${res[0]![0].data.name}'; expected ` +
                        `[${[...abilities.keys()]
                            .map(a => a.data.name)
                            .join(", ")}]`,
                );
            }
            accept(ability);
            return res[0]![1];
        },
    }[name];
}

// eslint-disable-next-line @typescript-eslint/naming-convention
function onXUnorderedParser<TArgs extends unknown[] = [], TResult = unknown>(
    name: string,
    parser: unordered.InnerParser<
        "gen4",
        BattleAgent<"gen4">,
        [ability: dex.Ability, side: SideID, ...args: TArgs],
        TResult
    >,
): unordered.InnerParser<
    "gen4",
    BattleAgent<"gen4">,
    [ability: dex.Ability, side: SideID, ...args: TArgs],
    [ability: dex.Ability, res: TResult]
> {
    // Note: Use computed property to force function name in stack trace.
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
 * of {@link inference.Reason reasons} that would prove that the ability could
 * activate, or `null` if it can't.
 * @returns A Map of {@link dex.Ability} to a {@link inference.Reason} modeling
 * its restrictions given by the predicate.
 */
function getAbilities(
    mon: Pokemon,
    prove: (ability: dex.Ability) => Set<inference.Reason> | null,
): Map<dex.Ability, inference.Reason> {
    const res = new Map<dex.Ability, inference.Reason>();
    if (mon.volatile.suppressAbility) return res;

    for (const name of mon.traits.ability.possibleValues) {
        const ability = dex.getAbility(mon.traits.ability.map[name]);
        const reasons = prove(ability);
        if (!reasons) continue;
        reasons.add(reason.ability.has(mon, new Set([name])));
        res.set(ability, inference.and(reasons));
    }
    return res;
}

// eslint-disable-next-line @typescript-eslint/naming-convention
const onXInferenceName = (
    onString: string,
    side: SideID,
    ability: string,
): string => `${side} ability on-${onString} inference ${ability}`;

//#region CopyFoeAbility helpers.

// eslint-disable-next-line @typescript-eslint/naming-convention
const onXInferenceCopyName = (
    onString: string,
    side: SideID,
    otherSide: SideID,
    copiers: ReadonlySet<dex.Ability>,
    copied: dex.Ability,
    shared?: boolean,
) =>
    onXInferenceName(
        onString,
        side,
        `[${[...copiers].map(a => a.data.name).join(", ")}]`,
    ) +
    `${shared ? " speculative shared " : " "}copy of opponent ${otherSide} ` +
    `${copied.data.name}`;

/** Result from {@link collectCopierInferences}. */
interface CopierInferences {
    /**
     * Possible copier abilities that the holder may have. Can also be empty if
     * the ability is suppressed.
     */
    copiers: Set<dex.Ability>;
    /**
     * Inferences for the possible copyable abilities that the opponent may
     * have. Empty if {@link copiers} is empty.
     */
    copyable: Map<dex.Ability, inference.Reason>;
    /**
     * Subset containing on-`start` activation conditions for {@link copyable}.
     */
    copyableStart: Map<dex.Ability, inference.Reason>;
    /**
     * Subset containing on-`update` activation conditions for {@link copyable}.
     */
    copyableUpdate: Map<dex.Ability, inference.Reason>;
}

/**
 * Collects inferences for possible copier abilities (e.g. Trace).
 *
 * @param mon Possible ability holder.
 * @param opp Copy target.
 * @param abilities Current possible abilities that the holder may have. Used to
 * search for copier abilities.
 * @returns Inferences for the copier/copyable abilities.
 * @see {@link CopierInferences} for detailed return type info.
 */
function collectCopierInferences(
    mon: Pokemon,
    opp: Pokemon,
    abilities: Iterable<dex.Ability>,
): CopierInferences {
    const res: CopierInferences = {
        copiers: new Set(),
        copyable: new Map(),
        copyableStart: new Map(),
        copyableUpdate: new Map(),
    };
    if (mon.volatile.suppressAbility) return res;

    for (const a of abilities) {
        if (a.data.on?.update?.copyFoeAbility) res.copiers.add(a);
    }
    if (res.copiers.size <= 0) return res;

    // Collect inferences for possible copyable abilities (via trace ability).
    for (const name of opp.traits.ability.possibleValues) {
        const ability = dex.getAbility(opp.traits.ability.map[name]);
        // Non-copyable.
        if (ability.data.flags?.noCopy) continue;

        // Main inference that the opponent has the copied ability.
        res.copyable.set(
            ability,
            inference.and(new Set([reason.ability.has(opp, new Set([name]))])),
        );

        // Apply activation conditions for copied on-start/update abilities onto
        // the copier ability holder.
        const startReasons = ability.canStart(mon, opp);
        if (startReasons) {
            // Note: Also include the copier/copied abilities in the inference.
            startReasons.add(
                reason.ability.has(
                    mon,
                    new Set([...res.copiers].map(a => a.data.name)),
                ),
            );
            startReasons.add(reason.ability.has(opp, new Set([name])));
            res.copyableStart.set(ability, inference.and(startReasons));
        }
        // Same as above, but for on-update.
        const updateReasons = ability.canUpdate(mon, opp);
        if (updateReasons) {
            updateReasons.add(
                reason.ability.has(
                    mon,
                    new Set([...res.copiers].map(a => a.data.name)),
                ),
            );
            updateReasons.add(reason.ability.has(opp, new Set([name])));
            res.copyableUpdate.set(ability, inference.and(updateReasons));
        }
    }
    return res;
}

/** Parses an on-`update` copier ability copying an on-`start` ability. */
function onUpdateCopyStartInference(
    onString: string,
    side: SideID,
    otherSide: SideID,
    copiers: ReadonlySet<dex.Ability>,
    copied: dex.Ability,
    copyable: ReadonlyMap<dex.Ability, inference.Reason>,
    copyableStart: ReadonlyMap<dex.Ability, inference.Reason>,
    postCopy: {ability?: dex.Ability},
): unordered.Parser<
    "gen4",
    BattleAgent<"gen4">,
    [ability: dex.Ability, res: UpdateResult]
> {
    return inference.parser(
        onXInferenceCopyName(onString, side, otherSide, copiers, copied) +
            " on-start",
        new Set([copyableStart.get(copied)!]),
        async (ctx, accept) =>
            await onUpdateCopyStartInferenceImpl(
                ctx,
                accept,
                side,
                otherSide,
                copiers,
                copied,
                copyable,
                copyableStart,
                postCopy,
            ),
    );
}

async function onUpdateCopyStartInferenceImpl(
    ctx: BattleParserContext<"gen4">,
    accept: inference.AcceptCallback,
    side: SideID,
    otherSide: SideID,
    copiers: ReadonlySet<dex.Ability>,
    copied: dex.Ability,
    copyable: ReadonlyMap<dex.Ability, inference.Reason>,
    copyableStart: ReadonlyMap<dex.Ability, inference.Reason>,
    postCopy: {ability?: dex.Ability},
): Promise<[ability: dex.Ability, res: UpdateResult]> {
    // Note: Copied on-start abilities activate before the copy indicator event.
    let accepted = false;
    await onStartUnordered(
        ctx,
        () => {
            accepted = true;
            // Set copied as override ability at the end.
            postCopy.ability = copied;
            // Infer copied ability for opponent immediately.
            copyable.get(copied)!.assert();
            accept(copyableStart.get(copied)!);
        },
        copied,
        side,
    );
    // Didn't activate.
    // Note: Fake result to satisfy typings, since this value would never make
    // it out of the final oneOf() call if the parser never accept()'d the
    // copier.
    if (!accepted) return [copied, undefined];
    // Afterwards we can parse the copy indicator event.
    let copier: dex.Ability | undefined;
    for (const _copier of copiers) {
        const res = await _copier.copyFoeAbility(
            ctx,
            side,
            undefined /*accept*/,
            copied,
            otherSide,
        );
        if (!res) continue;
        copier = _copier;
        break;
    }
    if (!copier) {
        throw new Error(
            "CopyFoeAbility ability " +
                `[${[...copiers].map(a => a.data.name).join(", ")}] ` +
                `activated for '${copied.data.name}' but no copy indicator ` +
                "event found",
        );
    }
    // Parse the copier ability (really a no-op to satisfy typings) to make the
    // inference for the holder at the final accept() call.
    return await onUpdateUnordered(ctx, () => {} /*accept*/, copier, side);
}

/** Parses an on-`update` copier ability copying an on-`update` ability. */
function onUpdateCopyUpdateInference(
    onString: string,
    side: SideID,
    otherSide: SideID,
    copiers: ReadonlySet<dex.Ability>,
    copied: dex.Ability,
    copyable: ReadonlyMap<dex.Ability, inference.Reason>,
    copyableUpdate: ReadonlyMap<dex.Ability, inference.Reason>,
    postCopy: {ability?: dex.Ability},
): unordered.Parser<
    "gen4",
    BattleAgent<"gen4">,
    [ability: dex.Ability, res: UpdateResult]
> {
    return inference.parser(
        onXInferenceCopyName(onString, side, otherSide, copiers, copied) +
            " on-update",
        new Set([copyableUpdate.get(copied)!]),
        async (ctx, accept) =>
            await onUpdateCopyUpdateInferenceImpl(
                ctx,
                accept,
                side,
                otherSide,
                copiers,
                copied,
                copyable,
                copyableUpdate,
                postCopy,
            ),
    );
}

async function onUpdateCopyUpdateInferenceImpl(
    ctx: BattleParserContext<"gen4">,
    accept: inference.AcceptCallback,
    side: SideID,
    otherSide: SideID,
    copiers: ReadonlySet<dex.Ability>,
    copied: dex.Ability,
    copyable: ReadonlyMap<dex.Ability, inference.Reason>,
    copyableUpdate: ReadonlyMap<dex.Ability, inference.Reason>,
    postCopy: {ability?: dex.Ability},
): Promise<[ability: dex.Ability, res: UpdateResult]> {
    // Note: Copied on-update abilities activate after the copy indicator event.
    let copier: dex.Ability | undefined;
    for (const _copier of copiers) {
        if (
            await _copier.copyFoeAbility(
                ctx,
                side,
                () => {
                    // Set copied as override ability at the end.
                    postCopy.ability = copied;
                    // Infer copied ability for opponent immediately.
                    copyable.get(copied)!.assert();
                    accept(copyableUpdate.get(copied)!);
                },
                copied,
                otherSide,
            )
        ) {
            copier = _copier;
            break;
        }
    }
    // Didn't activate.
    // Note: Fake result to satisfy typings, since this value would never make
    // it out of the final oneOf() call if the parser never accept()'d the
    // copier.
    if (!copier) return [copied, undefined];

    // Parse the copied ability.
    let accepted = false;
    await onUpdateUnordered(ctx, () => (accepted = true), copied, side);
    if (!accepted) {
        throw new Error(
            `CopyFoeAbility ability '${copier.data.name}' copied ` +
                `'${copied.data.name}' but copied ability did not activate`,
        );
    }

    // Parse the copier ability (really a no-op to satisfy typings) to make the
    // inference for the holder at the final accept() call.
    return await onUpdateUnordered(ctx, () => {} /*accept*/, copier, side);
}

/** Parses an on-`update` copier ability copying a non-activating ability. */
function onUpdateCopyUnordered(
    onString: string,
    side: SideID,
    otherSide: SideID,
    copiers: ReadonlySet<dex.Ability>,
    copied: dex.Ability,
    copyable: ReadonlyMap<dex.Ability, inference.Reason>,
    postCopy: {ability?: dex.Ability},
): unordered.Parser<
    "gen4",
    BattleAgent<"gen4">,
    [ability: dex.Ability, res: UpdateResult]
> {
    return unordered.parser(
        onXInferenceCopyName(onString, side, otherSide, copiers, copied),
        async (ctx, accept) =>
            await onUpdateCopyUnorderedImpl(
                ctx,
                accept,
                side,
                otherSide,
                copiers,
                copied,
                copyable,
                postCopy,
            ),
    );
}

async function onUpdateCopyUnorderedImpl(
    ctx: BattleParserContext<"gen4">,
    accept: unordered.AcceptCallback,
    side: SideID,
    otherSide: SideID,
    copiers: ReadonlySet<dex.Ability>,
    copied: dex.Ability,
    copyable: ReadonlyMap<dex.Ability, inference.Reason>,
    postCopy: {ability?: dex.Ability},
): Promise<[ability: dex.Ability, res: UpdateResult]> {
    let copier: dex.Ability | undefined;
    for (const _copier of copiers) {
        if (
            await _copier.copyFoeAbility(
                ctx,
                side,
                () => {
                    // Set copied as override ability at the end.
                    postCopy.ability = copied;
                    // Infer copied ability for opponent immediately.
                    copyable.get(copied)!.assert();
                    accept();
                },
                copied,
                otherSide,
            )
        ) {
            copier = _copier;
            break;
        }
    }
    // Didn't activate.
    // Note: Fake result to satisfy typings, since this value would never make
    // it out of the final oneOf() call if the parser never accept()'d the
    // copier.
    if (!copier) return [copied, undefined];

    // Parse the copier ability (really a no-op to satisfy typings) to make the
    // inference for the holder at the final accept() call.
    return await onUpdateUnordered(ctx, () => {} /*accept*/, copier, side);
}

/**
 * Parses an on-`start`/`update` ability which may be a copier ability that
 * copies an on-`start` ability that is shared by the opponent.
 */
function onStartOrUpdateCopyStartUnorderedShared(
    side: SideID,
    otherSide: SideID,
    copiers: ReadonlySet<dex.Ability>,
    ability: dex.Ability,
    copyableStart: ReadonlyMap<dex.Ability, inference.Reason>,
    postCopy: {ability?: dex.Ability},
): unordered.Parser<
    "gen4",
    BattleAgent<"gen4">,
    [ability: dex.Ability, res: StartOrUpdateResult]
> {
    return unordered.parser(
        onXInferenceCopyName(
            "startOrUpdate",
            side,
            otherSide,
            copiers,
            ability,
            true /*shared*/,
        ) + " on-start",
        async (ctx, accept) =>
            await onStartOrUpdateCopyStartUnorderedSharedImpl(
                ctx,
                accept,
                side,
                otherSide,
                copiers,
                ability,
                copyableStart,
                postCopy,
            ),
        // Ability couldn't activate from the copier ability nor from the
        // ability activating normally for the holder.
        // The latter assertion is handled by the outer inference Parser.
        () => copyableStart.get(ability)!.reject(),
    );
}

async function onStartOrUpdateCopyStartUnorderedSharedImpl(
    ctx: BattleParserContext<"gen4">,
    accept: unordered.AcceptCallback,
    side: SideID,
    otherSide: SideID,
    copiers: ReadonlySet<dex.Ability>,
    ability: dex.Ability,
    copyableStart: ReadonlyMap<dex.Ability, inference.Reason>,
    postCopy: {ability?: dex.Ability},
): Promise<[ability: dex.Ability, res: StartOrUpdateResult]> {
    // Note: Copied on-start abilities activate before the copy indicator event.
    let accepted = false;
    const startRes = await onStartUnordered(
        ctx,
        () => {
            accepted = true;
            accept();
        },
        ability,
        side,
    );
    // Didn't activate.
    // Note: Fake result to satisfy typings, since this value would never make
    // it out of the final oneOf() call if the parser never accept()'d the
    // copier.
    if (!accepted) return [ability, undefined];
    // Activated, check if it was actually copied from the opponent or if it
    // just activated from the holder normally.
    for (const copier of copiers) {
        if (
            await copier.copyFoeAbility(
                ctx,
                side,
                undefined /*accept*/,
                ability,
                otherSide,
            )
        ) {
            // Copier activated.
            // Set copied as override ability at the end.
            postCopy.ability = ability;
            // Infer copied ability for opponent immediately.
            copyableStart.get(ability)!.assert();
            // Return copier result to infer it at the end.
            return await onUpdateUnordered(
                ctx,
                () => {} /*accept*/,
                copier,
                side,
            );
        }
    }
    // Copier didn't activate, return the original result.
    // Infer that either the holder doesn't have a copier ability or the
    // opponent doesn't have this copyable ability.
    copyableStart.get(ability)!.reject();
    // Returning startRes here will use the former assertion mentioned above.
    return startRes;
}

//#endregion

//#endregion
