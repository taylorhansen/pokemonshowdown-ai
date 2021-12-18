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
    const shared: ResidualSharedData = {
        fainted: new Set<SideID>(
            (Object.keys(ctx.state.teams) as SideID[]).filter(
                side => ctx.state.getTeam(side).active.fainted,
            ),
        ),
        fainting: new Set<SideID>(),
        gameOver: false,
    };
    for (const orderGroup of dex.conditionResidualOrderGroups) {
        // Note: Order group is sorted by speed first (0 if affecting
        // field/side) then sub-order, shuffled randomly if all equal.
        // Usually we try to derive extra information from the absence of events
        // by evaluating activation conditions in a certain order, but due to
        // the semi-random speed-ordering of the residual step, this can
        // actually become very ambiguous.
        // So, instead we just try to make inferences based on what's there
        // rather than trying to dig deeper.
        let alive: boolean;
        do {
            alive = false;
            for (const subOrderGroup of orderGroup) {
                for (const effect of subOrderGroup) {
                    // Try to parse effect.
                    const subStage = residualEffects(ctx, effect, shared);
                    let innerAlive: boolean;
                    do {
                        innerAlive = false;
                        const parsers = subStage();
                        await unordered.some(
                            ctx,
                            parsers,
                            undefined /*filter*/,
                            () => {
                                innerAlive = true;
                                alive = true;
                            },
                        );
                    } while (innerAlive);
                }
            }
        } while (alive);
    }

    // Parse the rest of the faint events.
    await residualFilter(ctx, shared);

    // Update abilities/items last, after |upkeep| event.
    // TODO: Parse |upkeep| event?
    if (shared.gameOver) return;
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
    // Faint checks after on-update.
    await residualFilter(ctx, shared);
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

//#region Residual effects.

function residualEffects(
    ctx: BattleParserContext<"gen4">,
    effect: dex.ConditionResidualData,
    shared: ResidualSharedData,
): () => unordered.Parser<"gen4">[] {
    if (effect.type === "field") {
        return () => fieldResidual(ctx, effect.name, shared);
    }

    const sides = Object.keys(ctx.state.teams) as readonly SideID[];
    if (effect.type === "side" || effect.type === "slot") {
        const fn = effect.type === "side" ? sideResidual : slotResidual;
        return () => sides.flatMap(side => fn(side, effect.name, shared));
    }

    const alive = () =>
        sides.filter(side => !ctx.state.getTeam(side).active.fainted);
    switch (effect.type) {
        case "pokemon":
            return () =>
                alive().flatMap(side =>
                    pokemonResidual(side, effect.name, shared),
                );
        case "ability": {
            return () =>
                alive().flatMap(side =>
                    abilityResidual(ctx, side, effect.name, shared),
                );
        }
        case "item": {
            return () =>
                alive().flatMap(side =>
                    itemResidual(ctx, side, effect.name, shared),
                );
        }
        default:
            throw new Error(`Unhandled residual effect type: ${effect.type}`);
    }
}

//#region Field residual.

function fieldResidual(
    ctx: BattleParserContext<"gen4">,
    name: string,
    shared: ResidualSharedData,
): unordered.Parser<"gen4">[] {
    switch (name) {
        // TODO: Add to condition dex data.
        case "hail":
            return weather(ctx, "Hail", shared);
        case "raindance":
            return weather(ctx, "RainDance", shared);
        case "sandstorm":
            return weather(ctx, "Sandstorm", shared);
        case "sunnyday":
            return weather(ctx, "SunnyDay", shared);
        case "gravity":
            return [fieldEnd("gravity")];
        case "trickroom":
            return [fieldEnd("trickroom")];
        default:
            throw new Error(`Unhandled field residual: ${name}`);
    }
}

//#region Weather.

function weather(
    ctx: BattleParserContext<"gen4">,
    type: dex.WeatherType,
    shared: ResidualSharedData,
): unordered.Parser<"gen4">[] {
    if (ctx.state.status.weather.type !== type) return [];
    return [
        unordered.parser(
            `field weather ${ctx.state.status.weather.type} upkeep`,
            async (_ctx, accept) =>
                await weatherImpl(_ctx, accept, type, shared),
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
    await residualFilter(ctx, shared);
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
    weatherReasons: ReadonlySet<inference.Reason>,
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
    const damageReason = inference.and(reasons);
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
    damageReason: inference.Reason,
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

//#region Side residual.

function sideResidual(side: SideID, name: string): unordered.Parser<"gen4">[] {
    switch (name) {
        // TODO: Add to condition dex data.
        case "reflect":
        case "lightscreen":
        case "mist":
        case "safeguard":
        case "tailwind":
        case "luckychant":
            return [sideEnd(side, name)];
        default:
            throw new Error(`Unhandled side residual: ${name}`);
    }
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

//#region Slot residual.

function slotResidual(
    side: SideID,
    name: string,
    shared: ResidualSharedData,
): unordered.Parser<"gen4">[] {
    switch (name) {
        // TODO: Add to condition dex data.
        case "wish":
            return [statusDamage(side, "wish", 1 /*i.e., heal*/, shared)];
        case "futuremove":
            return [futuremove(side, shared)];
        default:
            throw new Error(`Unhandled slot residual: ${name}`);
    }
}

//#region Futuremove.

function futuremove(
    side: SideID,
    shared: ResidualSharedData,
): unordered.Parser<"gen4"> {
    return unordered.parser(
        `${side} residual futuremove`,
        async (ctx, accept) => await futuremoveImpl(ctx, accept, side, shared),
    );
}

async function futuremoveImpl(
    ctx: BattleParserContext<"gen4">,
    accept: unordered.AcceptCallback,
    side: SideID,
    shared: ResidualSharedData,
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

    await residualFilter(ctx, shared);
}

//#endregion

//#endregion

//#region Pokemon residual.

function pokemonResidual(
    side: SideID,
    name: string,
    shared: ResidualSharedData,
): unordered.Parser<"gen4">[] {
    switch (name) {
        // TODO: Add to condition dex data.
        case "ingrain":
        case "aquaring":
            return [statusDamage(side, name, 6.25, shared)];
        case "leechseed":
            return [leechseed(side, shared)];
        case "brn":
            return [statusDamage(side, "brn", -12.5, shared)];
        case "psn":
        case "tox":
            // Note: Handling psn may instead implicitly stand for tox.
            // TODO: Calculate tox damage.
            return [statusDamage(side, "psn", -12.5, shared)];
        case "nightmare":
        case "curse":
            return [statusDamage(side, name, -25, shared)];
        case "partiallytrapped":
            return [partiallytrapped(side, shared)];
        case "uproar":
            return [uproar(side)];
        case "disable":
        case "encore":
        case "taunt":
        case "magnetrise":
        case "healblock":
        case "embargo":
        case "slowstart":
            return [statusEnd(side, name)];
        case "yawn":
            return [yawn(side)];
        case "perishsong":
            return [perishsong(side, shared)];
        case "roost":
            // Silent.
            // TODO: Remove?
            return [];
        case "lockedmove":
            return [fatigue(side)];
        default:
            throw new Error(`Unhandled pokemon residual: ${name}`);
    }
}

//#region Status damage.

/** Checks for a status causing a damage/heal effect. */
function statusDamage(
    side: SideID,
    name: dex.StatusType | "wish",
    percentDamage: number,
    shared: ResidualSharedData,
): unordered.Parser<"gen4"> {
    return unordered.parser(
        `${side} residual ${name} ${percentDamage < 0 ? "damage" : "heal"}`,
        async (ctx, accept) =>
            await statusDamageImpl(
                ctx,
                accept,
                side,
                name,
                percentDamage,
                shared,
            ),
    );
}

async function statusDamageImpl(
    ctx: BattleParserContext<"gen4">,
    accept: unordered.AcceptCallback,
    side: SideID,
    name: dex.StatusType | "wish",
    percentDamage: number,
    shared: ResidualSharedData,
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

    await residualFilter(ctx, shared);
}

//#endregion

//#region Leechseed.

function leechseed(
    side: SideID,
    shared: ResidualSharedData,
): unordered.Parser<"gen4"> {
    return unordered.parser(
        `${side} residual leechseed drain`,
        async (ctx, accept) => await leechseedImpl(ctx, accept, side, shared),
    );
}

async function leechseedImpl(
    ctx: BattleParserContext<"gen4">,
    accept: unordered.AcceptCallback,
    side: SideID,
    shared: ResidualSharedData,
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

    // Drain effect could be handled either normally or by ability on-drain.
    const parsers: unordered.Parser<"gen4">[] = [
        effectAbility.onDrain(ctx, side, source),
    ];
    const sourceMon = ctx.state.getTeam(source).active;
    const name = `${side} leechseed drain heal ${source}`;
    if (sourceMon.hp.current < sourceMon.hp.max) {
        parsers.push(
            unordered.parser(
                name,
                async (_ctx, _accept) =>
                    void (await effectDamage.percentDamage(
                        _ctx,
                        source!,
                        1 /*i.e., heal*/,
                        () => {
                            _accept();
                            return true;
                        },
                    )),
            ),
        );
    }
    const oneOfRes = await unordered.oneOf(ctx, parsers);
    if (parsers.length >= 2 && oneOfRes.length <= 0) {
        return effectDidntHappen(name);
    }

    await residualFilter(ctx, shared);
}

//#endregion

//#region Partiallytrapped.

function partiallytrapped(
    side: SideID,
    shared: ResidualSharedData,
): unordered.Parser<"gen4"> {
    return unordered.parser(
        `${side} residual partiallytrapped damage`,
        async (ctx, accept) =>
            await partiallytrappedImpl(ctx, accept, side, shared),
    );
}

async function partiallytrappedImpl(
    ctx: BattleParserContext<"gen4">,
    accept: unordered.AcceptCallback,
    side: SideID,
    shared: ResidualSharedData,
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
    const damageResult = await effectDamage.percentDamage(ctx, side, -1, e => {
        if (e.args[0] !== "-damage") return false;
        if (!(e as Event<"|-damage|">).kwArgs.partiallytrapped) return false;
        accept();
        return true;
    });
    if (!damageResult) return;

    await residualFilter(ctx, shared);
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

    // Guard against slp immunity (e.g. insomnia or leafguard).
    // FIXME: If multiple blocking abilities with different conditions are
    // eligible, then they won't be narrowed due to the lazy logic in
    // inference.and().
    // For now, though, there isn't a real game scenario that can cause this bug
    // to occur.
    const orReasons = new Set<inference.Reason>();
    if (!mon.volatile.suppressAbility) {
        const foes = (Object.keys(ctx.state.teams) as SideID[]).flatMap(s =>
            s === side ? [] : ctx.state.getTeam(s).active,
        );
        const cantBlockReasons = [...mon.traits.ability.possibleValues].map(
            n => {
                const ability = dex.getAbility(mon.traits.ability.map[n]);
                const res = ability.cantBlockStatus(
                    ["slp"],
                    ctx.state.status.weather.type,
                    foes,
                );
                return [ability, res] as const;
            },
        );
        const vanillaBlocking = new Set<string>();
        for (const [ability, reasons] of cantBlockReasons) {
            if (!reasons) {
                // Can definitely block status.
                vanillaBlocking.add(ability.data.name);
                continue;
            }
            if (reasons.size <= 0) {
                // Can definitely not block status.
                continue;
            }
            // Could allow the status if one of the ability's activation
            // conditions are violated (i.e., asserted in this case).
            reasons.add(
                reason.ability.doesntHave(mon, new Set([ability.data.name])),
            );
            orReasons.add(inference.or(reasons));
        }
        if (vanillaBlocking.size > 0) {
            orReasons.add(reason.ability.doesntHave(mon, vanillaBlocking));
        }
    }
    const slpReason = inference.and(orReasons);

    // In order for slpReason to hold, none of the blockAbility reasons can hold
    // (i.e., the ability can't block the status).
    // slpReason = and(not(reasons)) or not(or(reasons))
    // reasons = set of reasons, one of which allows the blocking ability to
    // activate.

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
    slpReason: inference.Reason,
): Promise<void> {
    await effectStatus.status(ctx, side, ["slp"], () => {
        accept(slpReason);
        return true;
    });
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
    await base["|-start|"](ctx);

    if (num === 0) {
        ctx.state.getTeam(side).active.faint();
        shared.fainting.add(side);
        await residualFilter(ctx, shared);
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

//#region Ability residual.

function abilityResidual(
    ctx: BattleParserContext<"gen4">,
    side: SideID,
    name: string,
    shared: ResidualSharedData,
): unordered.Parser<"gen4">[] {
    const mon = ctx.state.getTeam(side).active;
    if (mon.volatile.suppressAbility) return [];

    const hasAbility = reason.ability.has(mon, new Set([name]));
    if (hasAbility.canHold() === false) return [];

    const ability = dex.getAbility(name);
    if (!ability) return [];

    const foes = (Object.keys(ctx.state.teams) as SideID[]).flatMap(s =>
        s === side ? [] : ctx.state.getTeam(s).active,
    );
    const reasons = ability.canResidual(mon, foes);
    if (!reasons) return [];
    reasons.add(hasAbility);

    const conclusion = inference.and(reasons);
    return [
        unordered.parser(
            `${side} ability on-residual [${name}]`,
            async (_ctx, accept) =>
                await abilityResidualImpl(
                    _ctx,
                    () => {
                        conclusion.assert();
                        accept();
                    },
                    side,
                    ability,
                    shared,
                ),
            () =>
                !shared.fainted.has(side) &&
                !shared.fainting.has(side) &&
                !shared.gameOver &&
                // TODO: Cancel registered inference callbacks instead of just
                // doing nothing on faint/game-over?
                conclusion.reject(),
        ),
    ];
}

async function abilityResidualImpl(
    ctx: BattleParserContext<"gen4">,
    accept: unordered.AcceptCallback,
    side: SideID,
    ability: dex.Ability,
    shared: ResidualSharedData,
): Promise<void> {
    let accepted = false;
    await ability.onResidual(
        ctx,
        () => {
            accepted = true;
            accept();
        },
        side,
    );
    if (!accepted) return;
    await residualFilter(ctx, shared);
}

//#endregion

//#region Item residual.

function itemResidual(
    ctx: BattleParserContext<"gen4">,
    side: SideID,
    name: string,
    shared: ResidualSharedData,
): unordered.Parser<"gen4">[] {
    const mon = ctx.state.getTeam(side).active;
    if (mon.volatile.embargo.isActive) return [];

    const hasItem = reason.item.has(mon, new Set([name]));
    if (hasItem.canHold() === false) return [];

    const item = dex.getItem(name);
    if (!item) return [];

    const foes = (Object.keys(ctx.state.teams) as SideID[]).flatMap(s =>
        s === side ? [] : ctx.state.getTeam(s).active,
    );
    const reasons = item.canResidual(mon, foes);
    if (!reasons) return [];
    reasons.add(hasItem);

    const conclusion = inference.and(reasons);
    return [
        unordered.parser(
            `${side} item on-residual [${name}]`,
            async (_ctx, accept) =>
                await itemResidualImpl(
                    _ctx,
                    () => {
                        conclusion.assert();
                        accept();
                    },
                    side,
                    item,
                    shared,
                ),
            () =>
                !shared.fainted.has(side) &&
                !shared.fainting.has(side) &&
                !shared.gameOver &&
                // TODO: Cancel registered inference callbacks instead of just
                // doing nothing on faint/game-over?
                conclusion.reject(),
        ),
    ];
}

async function itemResidualImpl(
    ctx: BattleParserContext<"gen4">,
    accept: unordered.AcceptCallback,
    side: SideID,
    item: dex.Item,
    shared: ResidualSharedData,
): Promise<void> {
    let accepted = false;
    await item.onResidual(
        ctx,
        () => {
            accepted = true;
            accept();
        },
        side,
    );
    if (!accepted) return;
    await residualFilter(ctx, shared);
}

//#endregion

//#endregion

function effectDidntHappen(name: string) {
    throw new Error(`Effect didn't happen: ${name}`);
}
