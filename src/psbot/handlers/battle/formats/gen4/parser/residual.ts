import {Protocol} from "@pkmn/protocol";
import {SideID} from "@pkmn/types";
import {toIdName} from "../../../../../helpers";
import {Event} from "../../../../../parser";
import {
    BattleParserContext,
    eventLoop,
    inference,
    tryVerify,
    unordered,
} from "../../../parser";
import * as dex from "../dex";
import {dispatch, handlers as base, ignoredEvent, ignoredEvents} from "./base";
import * as effectAbility from "./effect/ability";
import * as effectDamage from "./effect/damage";
import * as effectItem from "./effect/item";
import * as effectStatus from "./effect/status";
import * as faint from "./faint";
import * as reason from "./reason";

/** Handles residual effects at the end of the turn. */
export async function residual(
    ctx: BattleParserContext<"gen4">,
): Promise<void> {
    // Note: PS is very particular about the order of all the statuses being
    // checked, so for now we use unordered.all() with some checks for
    // fainting/game-over between each parser in order to be able to handle
    // event ordering for any gen.
    const shared: ResidualSharedData = {
        fainted: new Set<SideID>(
            (Object.keys(ctx.state.teams) as SideID[]).filter(
                side => ctx.state.getTeam(side).active.fainted,
            ),
        ),
        fainting: new Set<SideID>(),
        gameOver: false,
    };
    // TODO: Leverage PS effect order data?
    await unordered.all(
        ctx,
        [
            ...onSideResidual(ctx),
            ...onFieldResidual(ctx, shared),
            ...onResidual(ctx, shared),
        ],
        async (_ctx, accept) => await residualFilter(_ctx, accept, shared),
    );
    // Parse the rest of the faint events.
    await faint.events(ctx, shared.fainting);

    // Update items last, after |upkeep| event.
    // TODO: Parse |upkeep| event?
    await unordered.all(
        ctx,
        (Object.keys(ctx.state.teams) as SideID[]).flatMap(side =>
            ctx.state.getTeam(side).active.fainted
                ? []
                : [
                      effectAbility.onUpdate(ctx, side),
                      effectItem.onUpdate(ctx, side),
                  ],
        ),
        ignoredEvents,
    );
}

/**
 * Data about fainting/game-over checks shared between residual effect parsers.
 */
interface ResidualSharedData {
    /** Already-fainted pokemon references. */
    readonly fainted: Set<SideID>;
    /** Pending `|faint|` events. */
    readonly fainting: Set<SideID>;
    /** Whether game-over state is detected. */
    gameOver: boolean;
}

/** Checks for faints and game-over state between residual effect parsers. */
async function residualFilter(
    ctx: BattleParserContext<"gen4">,
    accept: unordered.AcceptCallback,
    shared: ResidualSharedData,
): Promise<void> {
    if (shared.gameOver) return;
    for (const side of Object.keys(ctx.state.teams) as SideID[]) {
        if (shared.fainted.has(side) || shared.fainting.has(side)) continue;
        const mon = ctx.state.getTeam(side).active;
        if (mon.fainted) shared.fainting.add(side);
    }
    await eventLoop(
        ctx,
        async function residualFilterLoop(_ctx): Promise<void> {
            const event = await tryVerify(_ctx, "|faint|");
            if (!event) return await ignoredEvent(_ctx);
            const [, identStr] = event.args;
            const ident = Protocol.parsePokemonIdent(identStr);
            if (shared.fainting.delete(ident.player)) {
                await base["|faint|"](_ctx);
                shared.fainted.add(ident.player);
                if (faint.isGameOver(_ctx)) shared.gameOver = true;
            }
            return await ignoredEvent(_ctx);
        },
    );
}

//#region Side residual.

function onSideResidual(
    ctx: BattleParserContext<"gen4">,
): unordered.Parser<"gen4">[] {
    const sides = Object.keys(ctx.state.teams) as SideID[];
    return sides.flatMap(side => [
        // Residual order/sub-order taken from smogon/pokemon-showdown/data.
        sideEnd(side, "reflect"), // 1
        sideEnd(side, "lightscreen"), // 2
        sideEnd(side, "mist"), // 3
        sideEnd(side, "safeguard"), // 4
        sideEnd(side, "tailwind"), // 5
        sideEnd(side, "luckychant"), // 6
    ]);
}

//#region Side end.

function sideEnd(side: SideID, name: string): unordered.Parser<"gen4"> {
    return unordered.parser(
        `${side} side ${name} end`,
        async (ctx, accept) => await sideEndImpl(ctx, accept, side, name),
    );
}

async function sideEndImpl(
    ctx: BattleParserContext<"gen4">,
    accept: unordered.AcceptCallback,
    side: SideID,
    name: string,
): Promise<void> {
    const event = await tryVerify(ctx, "|-sideend|");
    if (!event) return;
    const [, sideStr, effectStr] = event.args;
    const sideObj = Protocol.parsePokemonIdent(
        sideStr as unknown as Protocol.PokemonIdent,
    );
    if (sideObj.player !== side) return;
    const effect = Protocol.parseEffect(effectStr, toIdName);
    if (effect.name !== name) return;
    accept();
    await base["|-sideend|"](ctx);
}

//#endregion

//#endregion

//#region Field residual.

function onFieldResidual(
    ctx: BattleParserContext<"gen4">,
    shared: ResidualSharedData,
): unordered.Parser<"gen4">[] {
    return [
        // Residual order/sub-order taken from smogon/pokemon-showdown/data.
        ...weather(ctx, shared), // 8
        fieldEnd("gravity"), // 9
        fieldEnd("trickroom"), // 13
    ];
}

//#region Weather.

function weather(
    ctx: BattleParserContext<"gen4">,
    shared: ResidualSharedData,
): unordered.Parser<"gen4">[] {
    const weatherType = ctx.state.status.weather.type;
    if (weatherType === "none") return [];
    return [
        unordered.parser(
            `field weather ${ctx.state.status.weather.type} upkeep`,
            async (_ctx, accept) =>
                await weatherImpl(_ctx, accept, weatherType, shared),
            effectDidntHappen,
        ),
    ];
}

async function weatherImpl(
    ctx: BattleParserContext<"gen4">,
    accept: unordered.AcceptCallback,
    weatherType: dex.WeatherType,
    shared: ResidualSharedData,
): Promise<void> {
    if (!(await weatherUpkeepEvent(ctx, accept, weatherType))) return;
    await weatherEffects(ctx, weatherType, shared);
}

async function weatherUpkeepEvent(
    ctx: BattleParserContext<"gen4">,
    accept: unordered.AcceptCallback,
    weatherType: dex.WeatherType,
): Promise<boolean> {
    let upkept = false;
    const event = await tryVerify(ctx, "|-weather|");
    if (!event) return false;
    if (event.args[1] !== "none") {
        if (event.args[1] !== weatherType) return false;
        if (!event.kwArgs.upkeep) return false;
        upkept = true;
    }
    accept();
    await base["|-weather|"](ctx);
    return upkept;
}

async function weatherEffects(
    ctx: BattleParserContext<"gen4">,
    weatherType: dex.WeatherType,
    shared: ResidualSharedData,
): Promise<void> {
    // Guard against weather-suppressant effects (e.g. cloudnine ability).
    const sides = Object.keys(ctx.state.teams) as readonly SideID[];
    const weatherReasons = reason.weather.canActivate(
        sides.map(side => ctx.state.getTeam(side).active),
    );
    if (!weatherReasons) return;

    const fainting = new Set<SideID>();
    await unordered.all(
        ctx,
        sides
            .flatMap(side => [
                ...weatherDamage(
                    ctx,
                    side,
                    weatherType,
                    weatherReasons,
                    fainting,
                ),
                effectAbility.onWeather(ctx, side, weatherType, weatherReasons),
            ])
            .map(parser =>
                // Override parsers to cancel inferences on game-over.
                parser.transform(
                    "cancelable",
                    x => x,
                    () => !shared.gameOver && parser.reject(),
                ),
            ),
        ignoredEvents,
    );
}

/**
 * Creates an Parser parser that checks for weather damage.
 *
 * @param side Pokemon reference to check for weather damage.
 * @param weatherType Current weather.
 * @param weatherReasons Reasons for weather effects to activate at all.
 * @param fainting Set to add to if the pokemon faints.
 */
function weatherDamage(
    ctx: BattleParserContext<"gen4">,
    side: SideID,
    weatherType: dex.WeatherType,
    weatherReasons: ReadonlySet<inference.logic.Reason>,
    fainting: Set<SideID>,
): [unordered.Parser<"gen4">] | [] {
    const mon = ctx.state.getTeam(side).active;
    if (mon.fainted) return [];
    // Either true (immune) or null (not applicable).
    if (dex.canBlockWeather(mon.types, weatherType) !== false) return [];

    const reasons = new Set(weatherReasons);
    // Guard against weather-immune abilities (e.g. magicguard, icebody).
    if (!mon.volatile.suppressAbility) {
        reason.ability.canIgnoreItem;
        const {ability} = mon.traits;
        const abilities = new Set<string>();
        for (const name of ability.possibleValues) {
            const data = ability.map[name];
            if (data.flags?.noIndirectDamage === true) {
                abilities.add(name);
            } else if (data.weatherImmunity === weatherType) {
                abilities.add(name);
            }
        }
        reasons.add(reason.ability.doesntHave(mon, abilities));
    }
    const damageReason = inference.logic.and(reasons);
    return [
        inference.parser(
            `field weather ${weatherType} damage ${side}`,
            new Set([damageReason]),
            async (_ctx, accept) =>
                await weatherDamageImpl(
                    _ctx,
                    accept,
                    side,
                    weatherType,
                    damageReason,
                    fainting,
                ),
        ),
    ];
}

async function weatherDamageImpl(
    ctx: BattleParserContext<"gen4">,
    accept: inference.AcceptCallback,
    side: SideID,
    weatherType: dex.WeatherType,
    damageReason: inference.logic.Reason,
    fainting: Set<SideID>,
): Promise<void> {
    const event = await tryVerify(ctx, "|-damage|");
    if (!event) return;
    const [, identStr, healthStr] = event.args;
    const ident = Protocol.parsePokemonIdent(identStr);
    if (ident.player !== side) return;
    const health = Protocol.parseHealth(healthStr);
    if (event.kwArgs.from?.trim() !== weatherType) return;
    accept(damageReason);
    await base["|-damage|"](ctx);

    if (health?.fainted) fainting.add(side);
}

//#endregion

//#region Field end.

function fieldEnd(name: string): unordered.Parser<"gen4"> {
    return unordered.parser(
        `field ${name} end`,
        async (ctx, accept) => await fieldEndImpl(ctx, accept, name),
    );
}

async function fieldEndImpl(
    ctx: BattleParserContext<"gen4">,
    accept: unordered.AcceptCallback,
    name: string,
): Promise<void> {
    const event = await tryVerify(ctx, "|-fieldend|");
    if (!event) return;
    const [, fieldName] = event.args;
    const fieldEffect = Protocol.parseEffect(fieldName, toIdName);
    if (fieldEffect.name !== name) return;
    accept();
    await base["|-fieldend|"](ctx);
}

//#endregion

//#endregion

//#region Residual ability/item/move status.

function onResidual(
    ctx: BattleParserContext<"gen4">,
    shared: ResidualSharedData,
): unordered.Parser<"gen4">[] {
    const sides = Object.keys(ctx.state.teams) as SideID[];
    const alive = sides.filter(side => !ctx.state.getTeam(side).active.fainted);
    return alive.flatMap(side => [
        ...[
            effectAbility.onResidual(ctx, side),
            // FIXME: Item activation conditions may change due to below effects
            // (e.g. weather damage then leftovers).
            effectItem.onResidual(ctx, side),
        ].map(parser =>
            parser.transform(
                "cancelable",
                x => x,
                () =>
                    !shared.fainted.has(side) &&
                    !shared.fainting.has(side) &&
                    !shared.gameOver &&
                    // TODO: Cancel registered inference callbacks instead of
                    // just doing nothing on faint/game-over?
                    parser.reject(),
            ),
        ),
        // Residual order/sub-order taken from smogon/pokemon-showdown/data.
        // Note: Handling wish heal event will implicitly end the status.
        statusDamage(side, "wish", 1 /*i.e., heal*/), // 7
        statusDamage(side, "ingrain", 6.25), // 10.1
        statusDamage(side, "aquaring", 6.25), // 10.2
        leechseed(side), // 10.5
        statusDamage(side, "brn", -12.5), // 10.6
        // Note: Handling psn may instead implicitly stand for tox.
        // TODO: Calculate tox damage.
        statusDamage(side, "psn", -12.5), // 10.6
        statusDamage(side, "nightmare", -25), // 10.7
        statusDamage(side, "curse", -25), // 10.8
        partiallytrapped(side), // 10.9
        uproar(side), // 10.11
        statusEnd(side, "disable"), // 10.13
        statusEnd(side, "encore"), // 10.14
        statusEnd(side, "taunt"), // 10.15
        statusEnd(side, "magnetrise"), // 10.16
        statusEnd(side, "healblock"), // 10.17
        statusEnd(side, "embargo"), // 10.18
        yawn(side), // 10.19
        futuremove(side), // 11
        perishsong(side, shared), // 12
        statusEnd(side, "slowstart"), // 28.2?
        fatigue(side), // (last)
    ]);
}

//#region Status damage.

/** Checks for a status causing a damage/heal effect. */
function statusDamage(
    side: SideID,
    name: dex.StatusType | "wish",
    percentDamage: number,
): unordered.Parser<"gen4"> {
    return unordered.parser(
        `${side} residual ${name} ${percentDamage < 0 ? "damage" : "heal"}`,
        async (ctx, accept) =>
            await statusDamageImpl(ctx, accept, side, name, percentDamage),
    );
}

async function statusDamageImpl(
    ctx: BattleParserContext<"gen4">,
    accept: unordered.AcceptCallback,
    side: SideID,
    name: dex.StatusType | "wish",
    percentDamage: number,
): Promise<void> {
    await effectDamage.percentDamage(ctx, side, percentDamage, event => {
        if (!event.kwArgs.from) return false;
        const from = Protocol.parseEffect(event.kwArgs.from, toIdName);
        if (from.name !== name) return false;
        accept();
        if (name === "wish") {
            if (!ctx.state.getTeam(side).status.wish.isActive) {
                ctx.logger.error(`Parsed ${name} effect but no ${name} status`);
            }
        } else {
            const mon = ctx.state.getTeam(side).active;
            if (
                !effectStatus.hasStatus(mon, name) &&
                // Note: Residual tox event is displayed the same as psn.
                (name !== "psn" || !effectStatus.hasStatus(mon, "tox"))
            ) {
                ctx.logger.error(`Parsed ${name} effect but no ${name} status`);
            }
        }
        return true;
    });
}

//#endregion

//#region Leechseed.

function leechseed(side: SideID): unordered.Parser<"gen4"> {
    return unordered.parser(
        `${side} residual leechseed drain`,
        async (ctx, accept) => await leechseedImpl(ctx, accept, side),
    );
}

async function leechseedImpl(
    ctx: BattleParserContext<"gen4">,
    accept: unordered.AcceptCallback,
    side: SideID,
): Promise<void> {
    let source: SideID | undefined;
    await effectDamage.percentDamage(ctx, side, -1, event => {
        if (!event.kwArgs.from) return false;
        const from = Protocol.parseEffect(event.kwArgs.from, toIdName);
        if (from.name !== "leechseed") return false;
        if (!event.kwArgs.of) return false;
        const of = Protocol.parsePokemonIdent(event.kwArgs.of);
        if (of.player === side) return false;
        source = of.player;
        accept();
        return true;
    });
    if (!source) return;
    await effectDamage.percentDamage(ctx, source, 1, () => {
        accept();
        return true;
    });
}

//#endregion

//#region Partiallytrapped.

function partiallytrapped(side: SideID): unordered.Parser<"gen4"> {
    return unordered.parser(
        `${side} residual partiallytrapped damage`,
        async (ctx, accept) => await partiallytrappedImpl(ctx, accept, side),
    );
}

async function partiallytrappedImpl(
    ctx: BattleParserContext<"gen4">,
    accept: unordered.AcceptCallback,
    side: SideID,
): Promise<void> {
    const event = await tryVerify(ctx, "|-end|", "|-damage|");
    if (!event) return;
    const [t, identStr] = event.args;
    if (t === "-end") {
        // Note: This may still happen even if duration hasn't been reached
        // since the source may have been fainted/switched out.
        const ident = Protocol.parsePokemonIdent(identStr);
        if (ident.player !== side) return;
        if (!event.kwArgs.partiallytrapped) return;
        accept();
        await base["|-end|"](ctx);
        return;
    }
    await effectDamage.percentDamage(ctx, side, -1, e => {
        if (e.args[0] !== "-damage") return false;
        if (!(e as Event<"|-damage|">).kwArgs.partiallytrapped) return false;
        accept();
        return true;
    });
}

//#endregion

//#region Uproar.

function uproar(side: SideID): unordered.Parser<"gen4"> {
    return unordered.parser(
        `${side} residual uproar upkeep`,
        async (ctx, accept) => await uproarImpl(ctx, accept, side),
    );
}

async function uproarImpl(
    ctx: BattleParserContext<"gen4">,
    accept: unordered.AcceptCallback,
    side: SideID,
): Promise<void> {
    const event = await tryVerify(ctx, "|-start|", "|-end|");
    if (!event) return;
    const [t, identStr, effectStr] = event.args;
    const ident = Protocol.parsePokemonIdent(identStr);
    if (ident.player !== side) return;
    const effect = Protocol.parseEffect(effectStr, toIdName);
    if (effect.name !== "uproar") return;
    if (t === "-start" && !(event as Event<"|-start|">).kwArgs.upkeep) return;
    accept();
    await dispatch(ctx);
}

//#endregion

//#region Status end.

/** Checks for a status reaching its duration and ending. */
function statusEnd(
    side: SideID,
    name: dex.StatusType | "disable",
): unordered.Parser<"gen4"> {
    return unordered.parser(
        `${side} residual ${name} end`,
        async (ctx, accept) => await statusEndImpl(ctx, accept, side, name),
    );
}

async function statusEndImpl(
    ctx: BattleParserContext<"gen4">,
    accept: unordered.AcceptCallback,
    side: SideID,
    name: dex.StatusType | "disable",
): Promise<void> {
    const event = await tryVerify(ctx, "|-end|");
    if (!event) return;
    const [, identStr, effectStr] = event.args;
    const ident = Protocol.parsePokemonIdent(identStr);
    if (ident.player !== side) return;
    const effect = Protocol.parseEffect(effectStr, toIdName);
    if (effect.name !== name) return;
    accept();
    if (name === "disable") {
        if (!ctx.state.getTeam(side).active.volatile.disabled.ts.isActive) {
            ctx.logger.error("Parsed disable effect but no disable status");
        }
    } else if (effectStatus.hasStatus(ctx.state.getTeam(side).active, name)) {
        ctx.logger.error(`Parsed ${name} effect but no ${name} status`);
    }
    await base["|-end|"](ctx);
}

//#endregion

//#region Yawn.

function yawn(side: SideID): unordered.Parser<"gen4"> {
    return unordered.parser(
        `${side} residual yawn end`,
        async (ctx, accept) => await yawnImpl(ctx, accept, side),
    );
}

async function yawnImpl(
    ctx: BattleParserContext<"gen4">,
    accept: unordered.AcceptCallback,
    side: SideID,
): Promise<void> {
    let accepted = false;
    await statusEndImpl(
        ctx,
        () => {
            accepted = true;
            accept();
        },
        side,
        "yawn",
    );
    if (!accepted) return;

    const mon = ctx.state.getTeam(side).active;
    if (mon.fainted) return;
    if (effectStatus.cantStatus(mon, "slp")) return;

    // Guard against slp immunity (e.g. insomnia).
    const reasons = new Set<inference.logic.Reason>();
    if (!mon.volatile.suppressAbility) {
        const abilities = new Set<string>();
        for (const n of mon.traits.ability.possibleValues) {
            const a = dex.getAbility(mon.traits.ability.map[n]);
            // TODO: Factor out into reason.ability module.
            // TODO: Guard against cloudnine, requires a more sophisticated
            // logic system for nested SubInference conditions.
            if (a.canBlockStatus("slp", ctx.state.status.weather.type)) {
                abilities.add(n);
            }
        }
        reasons.add(reason.ability.doesntHave(mon, abilities));
    }
    const slpReason = inference.logic.and(reasons);

    await unordered.parse(
        ctx,
        inference.parser(
            `${side} residual yawn slp`,
            new Set([slpReason]),
            async (_ctx, _accept) =>
                await yawnSlpImpl(_ctx, _accept, side, slpReason),
        ),
    );
}

async function yawnSlpImpl(
    ctx: BattleParserContext<"gen4">,
    accept: inference.AcceptCallback,
    side: SideID,
    slpReason: inference.logic.Reason,
): Promise<void> {
    await effectStatus.status(ctx, side, ["slp"], () => {
        accept(slpReason);
        return true;
    });
}

//#endregion

//#region Futuremove.

function futuremove(side: SideID): unordered.Parser<"gen4"> {
    return unordered.parser(
        `${side} residual futuremove`,
        async (ctx, accept) => await futuremoveImpl(ctx, accept, side),
    );
}

async function futuremoveImpl(
    ctx: BattleParserContext<"gen4">,
    accept: unordered.AcceptCallback,
    side: SideID,
): Promise<void> {
    const {futureMoves} = ctx.state.getTeam(side).status;

    const event = await tryVerify(ctx, "|-end|");
    if (!event) return;
    const [, identStr, effectStr] = event.args;
    const ident = Protocol.parsePokemonIdent(identStr);
    if (ident.player === side) return;
    const effect = Protocol.parseEffect(effectStr, toIdName);
    if (!dex.isFutureMove(effect.name)) return;
    accept();
    if (!futureMoves[effect.name].isActive) {
        ctx.logger.error(
            `Parsed futuremove effect ${effect.name} but no matching ` +
                "futuremove status",
        );
    }
    await base["|-end|"](ctx);

    // Minimal version of move action effects.
    // TODO: Verify completeness?
    await effectDamage.percentDamage(
        ctx,
        ident.player,
        -1 /*i.e., damage*/,
        e =>
            e.args[0] === "-damage" &&
            !e.kwArgs.from &&
            !e.kwArgs.of &&
            !(e as Event<"|-damage|">).kwArgs.partiallytrapped,
    );
    await unordered.all(ctx, [
        effectAbility.onUpdate(ctx, ident.player),
        effectItem.onUpdate(ctx, ident.player),
    ]);
}

//#endregion

//#region Perishsong.

function perishsong(
    side: SideID,
    shared: ResidualSharedData,
): unordered.Parser<"gen4"> {
    return unordered.parser(
        `${side} residual perishsong`,
        async (ctx, accept) => await perishsongImpl(ctx, accept, side, shared),
    );
}

async function perishsongImpl(
    ctx: BattleParserContext<"gen4">,
    accept: unordered.AcceptCallback,
    side: SideID,
    shared: ResidualSharedData,
): Promise<void> {
    const event = await tryVerify(ctx, "|-start|");
    if (!event) return;
    const [, identStr, effectStr] = event.args;
    const ident = Protocol.parsePokemonIdent(identStr);
    if (ident.player !== side) return;
    const effect = Protocol.parseEffect(effectStr, toIdName);
    if (!effect.name.startsWith("perish")) return;
    const num = parseInt(effect.name.slice("perish".length), 10);
    accept();
    const mon = ctx.state.getTeam(side).active;
    if (num !== mon.volatile.perish + 1) {
        ctx.logger.error(
            `Updated perishsong status to ${num} but expected ` +
                `${mon.volatile.perish + 1} since it used to be ` +
                `${mon.volatile.perish}`,
        );
    }
    await base["|-start|"](ctx);

    if (num === 0) {
        await faint.event(ctx, side);
        shared.fainted.add(side);
    }
}

//#endregion

//#region Lockedmove (fatigue).

function fatigue(side: SideID): unordered.Parser<"gen4"> {
    return unordered.parser(
        `${side} residual lockedmove fatigue`,
        async (ctx, accept) => await fatigueImpl(ctx, accept, side),
    );
}

async function fatigueImpl(
    ctx: BattleParserContext<"gen4">,
    accept: unordered.AcceptCallback,
    side: SideID,
): Promise<void> {
    const event = await tryVerify(ctx, "|-start|");
    if (!event) return;
    const [, identStr, effectStr] = event.args;
    const ident = Protocol.parsePokemonIdent(identStr);
    if (ident.player !== side) return;
    const effect = Protocol.parseEffect(effectStr, toIdName);
    if (effect.name !== "confusion") return;
    if (!event.kwArgs.fatigue) return;
    accept();
    if (!ctx.state.getTeam(side).active.volatile.lockedMove.isActive) {
        ctx.logger.error(
            "Parsed lockedmove fatigue effect but no lockedmove status",
        );
    }
    await base["|-start|"](ctx);
}

//#endregion

//#endregion

function effectDidntHappen(name: string) {
    throw new Error(`Effect didn't happen: ${name}`);
}
