/** @file Handles parsing for events related to switch-ins. */
import {Protocol} from "@pkmn/protocol";
import {SideID} from "@pkmn/types";
import {toIdName} from "../../../../../../helpers";
import {Event} from "../../../../../../parser";
import {BattleAgent} from "../../../../agent";
import {
    BattleParserContext,
    consume,
    inference,
    tryVerify,
    unordered,
    verify,
} from "../../../../parser";
import * as dex from "../../dex";
import {Pokemon} from "../../state/Pokemon";
import {SwitchOptions} from "../../state/Team";
import {handlers as base} from "../base";
import * as effectAbility from "../effect/ability";
import * as effectDamage from "../effect/damage";
import * as effectItem from "../effect/item";
import * as effectStatus from "../effect/status";
import * as faint from "../faint";
import {ActionResult} from "./action";
import * as actionMove from "./move";

/** Result of {@link switchAction} and {@link selfSwitch}. */
export interface SwitchActionResult extends ActionResult {
    /** Pokemon that was switched in, or `undefined` if not accepted. */
    mon?: Pokemon;
}

/**
 * Parses a switch-in action by player choice.
 *
 * Includes effects that could happen before the main `|switch|` event.
 *
 * @param side Player that should be making the switch action.
 * @param accept Callback to accept this pathway.
 */
export async function switchAction(
    ctx: BattleParserContext<"gen4">,
    side: SideID,
    accept?: unordered.AcceptCallback,
): Promise<SwitchActionResult> {
    return await switchActionImpl(ctx, side, accept);
}

/**
 * Parses a switch-in action by self-switch.
 *
 * Includes effects that could happen before the main `|switch|` event.
 *
 * @param side Player that should be making the switch action.
 */
export async function selfSwitch(
    ctx: BattleParserContext<"gen4">,
    side: SideID,
): Promise<SwitchActionResult> {
    return await switchActionImpl(ctx, side);
}

/**
 * Parses a switch-in action by forced drag effect.
 *
 * @param side Player that should be making the switch action.
 */
export async function drag(
    ctx: BattleParserContext<"gen4">,
    side: SideID,
    accept?: unordered.AcceptCallback,
): Promise<SwitchActionResult> {
    return await switchActionImpl(ctx, side, accept, true /*isDrag*/);
}

/**
 * Parses multiple switch-ins, handling their effects after both sides have sent
 * out a switch-in.
 *
 * @param sides Sides to switch-in. Default p1 and p2.
 * @returns The Pokemon that were switched in, in the order that they appear.
 */
export async function multipleSwitchIns(
    ctx: BattleParserContext<"gen4">,
    sides: readonly SideID[] = ["p1", "p2"],
): Promise<[side: SideID, mon: Pokemon][]> {
    // Parse |switch| events.
    const results = await multipleSwitchEvents(ctx, sides);
    // Parse switch effects.
    sides = results.map(([side]) => side);
    await multipleSwitchEffects(ctx, sides);
    // Replace fainted pokemon until stable.
    // Note: Mutually recursive.
    await faint.replacements(ctx, sides);
    return results;
}

/** Parses multiple `|switch|` events. */
async function multipleSwitchEvents(
    ctx: BattleParserContext<"gen4">,
    sides: readonly SideID[],
): Promise<[side: SideID, mon: Pokemon][]> {
    return (
        (await unordered.all(ctx, sides.map(unorderedSwitchEvent)))
            // Extract switched-in pokemon, removing null/rejected results.
            .filter(res => res) as [side: SideID, mon: Pokemon][]
    );
}

const unorderedSwitchEvent = (
    side: SideID,
): unordered.Parser<
    "gen4",
    BattleAgent<"gen4">,
    [side: SideID, mon: Pokemon] | null
> =>
    unordered.parser(
        `${side} switch`,
        async (ctx, accept) => await switchEvent(ctx, side, accept),
        () => {
            throw new Error(`Expected |switch| event for ${side}`);
        },
    );

/**
 * Parses a switch-in action, either by player choice or by self-switch.
 *
 * Includes effects that could happen before the main `|switch|` event.
 *
 * @param side Player that should be making the switch action.
 * @param accept Callback to accept this pathway.
 * @param isDrag Whether this is a forced switch via phazing move.
 */
async function switchActionImpl(
    ctx: BattleParserContext<"gen4">,
    side: SideID,
    accept?: unordered.AcceptCallback,
    isDrag?: boolean,
): Promise<SwitchActionResult> {
    const res: SwitchActionResult = {};
    // Accept cb gets consumed if one of the optional pre-switch effects accept.
    // Once it gets called the first time, subsequent uses of this value should
    // be ignored since we'd now be committing to this pathway.
    const a = accept;
    accept &&= function switchActionAccept() {
        accept = undefined;
        a!();
    };

    const interceptRes = await preSwitch(ctx, side, accept, isDrag);
    if (interceptRes) {
        Object.assign((res.actioned ??= {}), interceptRes.actioned);
    }

    // Expect the actual switch-in.
    const switchRes = await switchIn(ctx, side, accept, isDrag);
    if (switchRes) {
        [, res.mon] = switchRes;
        (res.actioned ??= {})[side] = true;
    }
    return res;
}

/**
 * Parses any pre-switch effects.
 *
 * @param side Pokemon reference who is switching out.
 * @param accept Callback to accept this pathway.
 * @param isDrag Whether this is a forced switch via phazing move.
 * @returns The result of a switch-interception move action, if found.
 */
async function preSwitch(
    ctx: BattleParserContext<"gen4">,
    side: SideID,
    accept?: unordered.AcceptCallback,
    isDrag?: boolean,
): Promise<actionMove.MoveActionResult> {
    const a = accept;
    accept &&= function preSwitchAccept() {
        accept = undefined;
        a!();
    };

    // Check for a possible switch-intercepting move, e.g. pursuit.
    const intercepting: SideID | undefined = side === "p1" ? "p2" : "p1";
    const committed = !accept;
    let moveRes: actionMove.MoveActionResult | undefined;
    if (!isDrag) {
        moveRes = await actionMove.interceptSwitch(
            ctx,
            intercepting,
            side,
            // Passed accept param should always be truthy to indicate that this
            // entire effect is always optional.
            () => {
                accept?.();
            },
        );
        // Opponent used up their action interrupting our switch.
        if (!committed && !accept) {
            // Note: Switch continues even if target faints.
            // TODO: What if user faints, or more pre-switch effects are
            // pending?
        }
    } else {
        moveRes = {};
    }

    await unordered.parse(ctx, effectAbility.onSwitchOut(ctx, side), accept);
    // TODO: Ability on-end (slowstart).

    return moveRes;
}

/**
 * Parses a single `|switch|`/`|drag|` event and its implications.
 *
 * @param side Player that should be making the switch action. Omit to skip this
 * verification step.
 * @param accept Callback to accept this pathway.
 * @param isDrag Whether this is a forced switch via phazing move.
 * @returns The Pokemon that was switched in, or `null` if not accepted.
 */
export async function switchIn(
    ctx: BattleParserContext<"gen4">,
    side?: SideID,
    accept?: unordered.AcceptCallback,
    isDrag?: boolean,
): Promise<[side: SideID, mon: Pokemon] | null> {
    const res = await switchEvent(ctx, side, accept, isDrag);
    if (res) await switchEffects(ctx, res[0]);
    return res;
}

/**
 * Parses initial `|switch|`/`|drag|` event and returns the switched-in Pokemon
 * obj.
 *
 * @param sideId Player that should be making the switch action.
 * @param accept Optional accept cb. If not provided, this function will throw
 * on an invalid initial switch event.
 * @param isDrag Whether this is a forced switch via phazing move.
 * @returns The Pokemon that was switched in, or null if invalid event and
 * `accept` was specified.
 */
async function switchEvent(
    ctx: BattleParserContext<"gen4">,
    side?: SideID,
    accept?: unordered.AcceptCallback,
    isDrag?: boolean,
): Promise<[side: SideID, mon: Pokemon] | null> {
    let event: Event<"|switch|" | "|drag|">;
    if (accept) {
        const ev = await tryVerify(ctx, isDrag ? "|drag|" : "|switch|");
        if (!ev) return null;
        event = ev;
    } else event = await verify(ctx, isDrag ? "|drag|" : "|switch|");
    const [, identStr, detailsStr, healthStr] = event.args;

    const ident = Protocol.parsePokemonIdent(identStr);
    if (side && ident.player !== side) {
        if (accept) return null;
        throw new Error(
            `Expected switch-in for '${side}' but got '${ident.player}'`,
        );
    }
    side = ident.player;
    const data = Protocol.parseDetails(ident.name, identStr, detailsStr);
    const health = Protocol.parseHealth(healthStr);

    ctx = {
        ...ctx,
        logger: ctx.logger.addPrefix(
            `Switch(${ident.player}${ident.position}): `,
        ),
    };

    const options: SwitchOptions = {
        species: toIdName(data.speciesForme),
        level: data.level,
        gender: data.gender ?? "N",
        hp: health?.hp ?? 0,
        hpMax: health?.maxhp ?? 0,
    };
    const team = ctx.state.getTeam(ident.player);
    const mon = team.switchIn(options);
    if (!mon) {
        throw new Error(
            `Could not switch in '${identStr}': ` +
                `Team '${ident.player}' was too full (size=${team.size})`,
        );
    }
    accept?.();
    await consume(ctx);
    return [side, mon];
}

//#region Switch effects.

/**
 * Parses any effects that should happen after a switch-in.
 *
 * @param side Pokemon reference that was switched in.
 */
async function switchEffects(
    ctx: BattleParserContext<"gen4">,
    side: SideID,
): Promise<void> {
    await multipleSwitchEffects(ctx, [side]);
}

interface AbilityStartData {
    readonly canStartDirectly: inference.Reason;
    readonly ability: dex.Ability;
}

/** Parses switch effects for multiple switch-ins. */
async function multipleSwitchEffects(
    ctx: BattleParserContext<"gen4">,
    sides: readonly SideID[],
): Promise<void> {
    // Each pokemon may activate a switch-in effect, but only after other faster
    // pokemon do all of theirs first, in this order:
    // - Entry hazards.
    // - Healingwish/lunardance.
    // - Ability on-start.
    // - Item on-start (TODO).
    // - Faint check (can end game prematurely).
    // - On-update all.

    // We keep track of an inter-stage inference here in order to handle some
    // corner cases with Trace copying an ability that either the holder or the
    // opponent could have.
    const canStart = new Map<SideID, AbilityStartData>();
    await unordered.staged(ctx, [
        // Check entry hazards.
        new Map(
            sides.map(side => [
                side,
                {
                    parsers: () =>
                        (
                            ["spikes", "stealthrock", "toxicspikes"] as const
                        ).flatMap(hazard => entryHazard(ctx, side, hazard)),
                },
            ]),
        ),
        // Check healingwish effects.
        new Map(
            sides.map(side => [
                side,
                {
                    parsers: () =>
                        (["healingwish", "lunardance"] as const).flatMap(type =>
                            healingwish(ctx, side, type),
                        ),
                },
            ]),
        ),
        // On-start side's ability.
        new Map(
            sides.map(side => [
                side,
                {parsers: () => abilityOnStart(ctx, side, canStart)},
            ]),
        ),
        // TODO: Add a stage for item on-start, which should call+delete the
        // corresponding canStartDirectly.assert() if it parses.
        // Faint check.
        new Map(
            sides.map(side => [
                side,
                {
                    parsers: () => faintCheck(ctx, side, canStart),
                    after: () => faint.isGameOver(ctx),
                },
            ]),
        ),
        // On-update all (except trace if not from startedSide).
        new Map(
            sides.map(startedSide => [
                startedSide,
                {
                    parsers: () => onUpdateAll(ctx, startedSide, canStart),
                    after: () => {
                        // No sign of trace ability since the canStart inference
                        // is still outstanding, meaning the previous on-start
                        // ability really wasn't copied.
                        canStart.get(startedSide)?.canStartDirectly.assert();
                        canStart.delete(startedSide);
                        return false;
                    },
                },
            ]),
        ),
    ]);
}

//#region Entry hazards.

function entryHazard(
    ctx: BattleParserContext<"gen4">,
    side: SideID,
    hazard: "spikes" | "stealthrock" | "toxicspikes",
): unordered.Parser<"gen4">[] {
    const team = ctx.state.getTeam(side);
    if (team.status[hazard] <= 0) return [];
    const mon = team.active;
    if (mon.fainted) return [];
    return [
        unordered.parser(
            `${side} ${hazard}`,
            async (_ctx, accept) =>
                await entryHazardImpl(_ctx, accept, side, hazard),
        ),
    ];
}

const spikesDenominator = [8, 6, 4]; // 1/8, 1/6, 1/4.

async function entryHazardImpl(
    ctx: BattleParserContext<"gen4">,
    accept: unordered.AcceptCallback,
    side: SideID,
    hazard: "spikes" | "stealthrock" | "toxicspikes",
): Promise<void> {
    const team = ctx.state.getTeam(side);
    const mon = team.active;
    if (mon.fainted) {
        accept();
        return;
    }

    // TODO: Assertions on magicguard.
    switch (hazard) {
        case "spikes": {
            // TODO: Assertions on groundedness.
            const layers = team.status[hazard];
            const percentage =
                layers <= 0 ? 0 : 100 / spikesDenominator[layers - 1];
            await damagingHazard(ctx, accept, side, hazard, percentage);
            break;
        }
        case "stealthrock": {
            // TODO: Other type modifiers?
            const percentage =
                (100 * dex.getTypeMultiplier(mon.types, "rock")) / 8;
            await damagingHazard(ctx, accept, side, hazard, percentage);
            break;
        }
        case "toxicspikes":
            // TODO: Assertions on groundedness and ability immunity.
            await toxicspikes(ctx, accept, side);
            break;
    }
}

async function damagingHazard(
    ctx: BattleParserContext<"gen4">,
    accept: unordered.AcceptCallback,
    side: SideID,
    hazard: "spikes" | "stealthrock",
    percentage: number,
): Promise<void> {
    await effectDamage.percentDamage(ctx, side, -percentage, event => {
        const from = Protocol.parseEffect(event.kwArgs.from, toIdName);
        if (from.name !== hazard) return false;
        accept();
        return true;
    });
}

async function toxicspikes(
    ctx: BattleParserContext<"gen4">,
    accept: unordered.AcceptCallback,
    side: SideID,
): Promise<void> {
    const team = ctx.state.getTeam(side);
    if (team.status.toxicspikes <= 0) return;
    const mon = team.active;

    if (!mon.types.includes("poison")) {
        // Always blocked by substitute/steel type.
        if (mon.volatile.substitute || mon.types.includes("steel")) {
            accept();
            return;
        }

        const status = team.status.toxicspikes >= 2 ? "tox" : "psn";
        const statusRes = await effectStatus.status(
            ctx,
            side,
            [status],
            event => {
                if ((event as Event<"|-status|">).kwArgs.from) return false;
                accept();
                return true;
            },
        );
        if (statusRes === status) {
            // Check for on-update items immediately.
            await unordered.parse(ctx, effectItem.onUpdate(ctx, side));
        }
    } else {
        // Grounded poison types remove toxicspikes.
        const event = await tryVerify(ctx, "|-sideend|");
        if (!event) return;
        const [, sideStr, effectStr] = event.args;
        const ident = Protocol.parsePokemonIdent(
            sideStr as string as Protocol.PokemonIdent,
        );
        if (ident.player !== side) return;
        const effect = Protocol.parseEffect(effectStr, toIdName);
        if (effect.name !== "toxicspikes") return;
        accept();
        await base["|-sideend|"](ctx);
    }
}

//#endregion

//#region Healingwish effects.

function healingwish(
    ctx: BattleParserContext<"gen4">,
    side: SideID,
    type: "healingwish" | "lunardance",
): unordered.Parser<"gen4">[] {
    const team = ctx.state.getTeam(side);
    if (!team.status[type]) return [];
    const mon = team.active;
    if (mon.fainted) return [];
    return [
        unordered.parser(
            `${side} ${type}`,
            async (_ctx, accept) =>
                await healingwishImpl(_ctx, accept, side, type),
            effectDidntHappen,
        ),
    ];
}

async function healingwishImpl(
    ctx: BattleParserContext<"gen4">,
    accept: unordered.AcceptCallback,
    side: SideID,
    type: "healingwish" | "lunardance",
): Promise<void> {
    await effectDamage.percentDamage(
        ctx,
        side,
        100,
        event => {
            const from = Protocol.parseEffect(event.kwArgs.from, toIdName);
            if (from.name !== type) return false;
            accept();
            return true;
        },
        // Note(gen4): Event is emitted even if recipient has full hp.
        true /*noSilent*/,
    );
}

//#endregion

//#region Ability on-start.

function abilityOnStart(
    ctx: BattleParserContext<"gen4">,
    side: SideID,
    canStart: Map<SideID, AbilityStartData>,
): unordered.Parser<"gen4">[] {
    if (ctx.state.getTeam(side).active.fainted) return [];
    return [
        effectAbility
            .onStartCopyable(ctx, side)
            .transform(
                "store copyable result",
                ({canStartDirectly, ability}) =>
                    canStartDirectly &&
                    ability &&
                    canStart.set(side, {canStartDirectly, ability}),
            ),
    ];
}

//#endregion

//#region Faint check.

function faintCheck(
    ctx: BattleParserContext<"gen4">,
    side: SideID,
    canStart: Map<SideID, AbilityStartData>,
): unordered.Parser<"gen4">[] {
    if (!ctx.state.getTeam(side).active.fainted) return [];
    return [
        unordered.parser(
            `${side} faint`,
            async (_ctx, accept) =>
                await faintImpl(_ctx, accept, side, canStart),
            effectDidntHappen,
        ),
    ];
}

async function faintImpl(
    ctx: BattleParserContext<"gen4">,
    accept: unordered.AcceptCallback,
    side: SideID,
    canStart: Map<SideID, AbilityStartData>,
): Promise<void> {
    if (!ctx.state.getTeam(side).active.fainted) return;
    await faint.event(ctx, side, () => {
        // Didn't make it to on-update step before fainting, so on-update copier
        // ability couldn't have activated.
        canStart.get(side)?.canStartDirectly.assert();
        canStart.delete(side);
        accept();
    });
}

//#endregion

//#region On-update all.

function onUpdateAll(
    ctx: BattleParserContext<"gen4">,
    startedSide: SideID,
    canStart: Map<SideID, AbilityStartData>,
): unordered.Parser<"gen4">[] {
    const parsers: unordered.Parser<"gen4">[] = [];
    let entry = canStart.get(startedSide);

    if (entry && entry.canStartDirectly.canHold() !== true) {
        // This pokemon activated an on-start ability, so here we need a parser
        // to check whether this was actually caused during the on-update step.
        parsers.push(
            effectAbility
                .onUpdateCopiedStarted(
                    ctx,
                    startedSide,
                    entry.ability,
                    entry.canStartDirectly,
                )
                .transform(
                    "clear non-copied assertion",
                    () => {} /*f*/,
                    undefined /*reject*/,
                    () => {
                        entry = undefined;
                        canStart.delete(startedSide);
                    } /*accept*/,
                ),
        );
    } else {
        // Parse full ability on-update, except for shared copy which we already
        // handled above.
        parsers.push(
            effectAbility
                .onUpdate(
                    ctx,
                    startedSide,
                    false /*excludeCopiers*/,
                    true /*excludeSharedOnStart*/,
                )
                .transform(
                    "assert non-copied",
                    () => {},
                    undefined,
                    () => {
                        entry?.canStartDirectly.assert();
                        canStart.delete(startedSide);
                    },
                ),
        );
    }
    parsers.push(
        // Parse on-update ability normally for other sides.
        // Note that copier abilities (e.g. trace) can only activate after
        // handling its holder's on-start effects first.
        ...(Object.keys(ctx.state.teams) as SideID[]).flatMap(side =>
            startedSide === side
                ? []
                : effectAbility
                      .onUpdate(ctx, side, true /*excludeCopiers*/)
                      .transform(
                          "assert non-copied",
                          () => {},
                          undefined,
                          () => {
                              entry?.canStartDirectly.assert();
                              canStart.delete(startedSide);
                          },
                      ),
        ),
        // Parse on-update item.
        ...(Object.keys(ctx.state.teams) as SideID[]).flatMap(s =>
            effectItem.onUpdate(ctx, s).transform(
                "assert non-copied",
                () => {},
                undefined,
                () => {
                    entry?.canStartDirectly.assert();
                    canStart.delete(startedSide);
                },
            ),
        ),
    );
    return parsers;
}

//#endregion

//#region Other helpers.

function effectDidntHappen(name: string): never {
    throw new Error("Expected effect that didn't happen: " + name);
}

//#endregion

//#endregion
