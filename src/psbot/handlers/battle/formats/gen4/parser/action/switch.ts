/** @file Handles parsing for events related to switch-ins. */
import { Protocol } from "@pkmn/protocol";
import { SideID } from "@pkmn/types";
import { toIdName } from "../../../../../../helpers";
import { Event } from "../../../../../../parser";
import { BattleParserContext, consume, tryVerify, unordered, verify } from
    "../../../../parser";
import * as dex from "../../dex";
import { Pokemon } from "../../state/Pokemon";
import { SwitchOptions } from "../../state/Team";
import { handlers as base } from "../base";
import * as effectAbility from "../effect/ability";
import * as effectDamage from "../effect/damage";
import * as effectItem from "../effect/item";
import * as effectStatus from "../effect/status";
import * as faint from "../faint";
import { ActionResult } from "./action";
import * as actionMove from "./move";

/** Result of {@link switchAction} and {@link selfSwitch}. */
export interface SwitchActionResult extends ActionResult
{
    /** Pokemon that was switched in, or undefined if not accepted. */
    mon?: Pokemon;
}

/**
 * Parses a switch-in action by player choice. Includes effects that could
 * happen before the main `|switch|` event.
 * @param side Player that should be making the switch action.
 * @param accept Callback to accept this pathway.
 */
export async function switchAction(ctx: BattleParserContext<"gen4">,
    side: SideID, accept?: unordered.AcceptCallback):
    Promise<SwitchActionResult>
{
    return await switchActionImpl(ctx, side, accept);
}

/**
 * Parses a switch-in action by self-switch. Includes effects that could happen
 * before the main `|switch|` event.
 * @param side Player that should be making the switch action.
 */
export async function selfSwitch(ctx: BattleParserContext<"gen4">,
    side: SideID): Promise<SwitchActionResult>
{
    return await switchActionImpl(ctx, side);
}

/**
 * Parses multiple switch-ins, handling their effects after both sides have sent
 * out a switch-in.
 * @param sides Sides to switch-in. Default p1 and p2.
 * @returns The Pokemon that were switched in, in the order that they appear.
 */
export async function multipleSwitchIns(ctx: BattleParserContext<"gen4">,
    sides: readonly SideID[] = ["p1", "p2"]):
    Promise<[side: SideID, mon: Pokemon][]>
{
    // parse |switch| events
    const results = await multipleSwitchEvents(ctx, sides);
    // parse switch effects
    sides = results.map(([side, mon]) => side);
    await multipleSwitchEffects(ctx, sides);
    // replace fainted pokemon until stable
    // note: mutually recursive
    await faint.replacements(ctx, sides);
    return results;
}

/** Parses multiple `|switch|` events. */
async function multipleSwitchEvents(ctx: BattleParserContext<"gen4">,
    sides: readonly SideID[]): Promise<[side: SideID, mon: Pokemon][]>
{
    return (await unordered.all(ctx, sides.map(unorderedSwitchEvent)))
        // extract switched-in pokemon, removing null/rejected results
        .filter(res => res) as [side: SideID, mon: Pokemon][];
}

const unorderedSwitchEvent = (side: SideID) =>
    unordered.UnorderedDeadline.create(`${side} switch`,
        (ctx: BattleParserContext<"gen4">, accept: unordered.AcceptCallback) =>
            switchEvent(ctx, side, accept),
        () => { throw new Error(`Expected |switch| event for ${side}`); });

/** Parses switch effects for multiple switch-ins. */
async function multipleSwitchEffects(ctx: BattleParserContext<"gen4">,
    sides: readonly SideID[])
{
    return await unordered.all(ctx, sides.map(unorderedSwitchEffects));
}

const unorderedSwitchEffects = (side: SideID) =>
    unordered.UnorderedDeadline.create<"gen4">(`${side} switch effects`,
        async function unorderedSwitchEffectsImpl(ctx, accept)
        {
            // note: faint/win happens independently for each call
            return await switchEffects(ctx, side, accept);
        },
        effectDidntHappen);

/**
 * Parses a switch-in action, either by player choice or by self-switch.
 * Includes effects that could happen before the main `|switch|` event.
 * @param side Player that should be making the switch action.
 * @param accept Callback to accept this pathway.
 */
async function switchActionImpl(ctx: BattleParserContext<"gen4">, side: SideID,
    accept?: unordered.AcceptCallback): Promise<SwitchActionResult>
{
    const res: SwitchActionResult = {};
    // accept cb gets consumed if one of the optional pre-switch effects accept
    // once it gets called the first time, subsequent uses of this value should
    //  be ignored since we'd now be committing to this pathway
    const a = accept;
    accept &&= function switchActionAccept()
    {
        accept = undefined;
        a!();
    };

    const interceptRes = await preSwitch(ctx, side, accept);
    if (interceptRes) Object.assign(res.actioned ??= {}, interceptRes.actioned);

    // expect the actual switch-in
    const switchRes = await
        (accept ? switchIn(ctx, side, accept) : switchIn(ctx, side));
    if (switchRes)
    {
        res.mon = switchRes[1];
        (res.actioned ??= {})[side] = true;
    }
    return res;
}

/**
 * Parses any pre-switch effects.
 * @param side Pokemon reference who is switching out.
 * @param accept Callback to accept this pathway.
 * @returns The result of a switch-interception move action, if found.
 */
async function preSwitch(ctx: BattleParserContext<"gen4">, side: SideID,
    accept?: unordered.AcceptCallback): Promise<actionMove.MoveActionResult>
{
    const a = accept;
    accept &&= function preSwitchAccept()
    {
        accept = undefined;
        a!();
    };

    // check for a possible switch-intercepting move, e.g. pursuit
    const intercepting: SideID | undefined = side === "p1" ? "p2" : "p1";
    const committed = !accept;
    const moveRes = await actionMove.interceptSwitch(ctx, intercepting, side,
        // passed accept param should always be truthy to indicate that this
        //  entire effect is always optional
        () => { accept?.(); });
    // opponent used up their action interrupting our switch
    if (!committed && !accept)
    {
        // NOTE: switch continues even if target faints
        // TODO: what if user faints, or more pre-switch effects are pending?
    }

    await unordered.parse(ctx, effectAbility.onSwitchOut(ctx, side), accept);

    return moveRes;
}

/**
 * Parses a single `|switch|`/`|drag|` event and its implications.
 * @param side Player that should be making the switch action.
 * @param accept Callback to accept this pathway.
 * @returns The Pokemon that was switched in, or null if not accepted.
 */
export async function switchIn(ctx: BattleParserContext<"gen4">,
    side: SideID, accept: unordered.AcceptCallback):
    Promise<[side: SideID, mon: Pokemon] | null>;
/**
 * Parses a single `|switch|`/`|drag|` event and its implications.
 * @param side Player that should be making the switch action. Omit to skip this
 * verification step.
 * @returns The Pokemon that was switched in.
 */
export async function switchIn(ctx: BattleParserContext<"gen4">,
    side?: SideID): Promise<[side: SideID, mon: Pokemon]>;
export async function switchIn(ctx: BattleParserContext<"gen4">,
    side?: SideID, accept?: unordered.AcceptCallback):
    Promise<[side: SideID, mon: Pokemon] | null>
{
    const res = await switchEvent(ctx, side, accept);
    if (res) await switchEffects(ctx, res[0]);
    return res;
}

/**
 * Parses initial `|switch|`/`|drag|` event and returns the switched-in Pokemon
 * obj.
 * @param sideId Player that should be making the switch action.
 * @param accept Optional accept cb. If not provided, this function will throw
 * on an invalid initial switch event.
 * @returns The Pokemon that was switched in, or null if invalid event and
 * `accept` was specified.
 */
async function switchEvent(ctx: BattleParserContext<"gen4">, side?: SideID,
    accept?: unordered.AcceptCallback):
    Promise<[side: SideID, mon: Pokemon] | null>
{
    let event: Event<"|switch|" | "|drag|">;
    if (accept)
    {
        const ev = await tryVerify(ctx, "|switch|", "|drag|")
        if (!ev) return null;
        event = ev;
    }
    else event = await verify(ctx, "|switch|", "|drag|");
    const [, identStr, detailsStr, healthStr] = event.args;

    const ident = Protocol.parsePokemonIdent(identStr);
    if (side && ident.player !== side)
    {
        if (accept) return null;
        throw new Error(`Expected switch-in for '${side}' but got ` +
            `'${ident.player}'`);
    }
    side = ident.player;
    const data = Protocol.parseDetails(ident.name, identStr, detailsStr);
    const health = Protocol.parseHealth(healthStr);

    ctx =
    {
        ...ctx,
        logger: ctx.logger.addPrefix("Switch(" +
            `${ident.player}${ident.position}): `)
    };

    const options: SwitchOptions =
    {
        species: toIdName(data.name), level: data.level,
        gender: data.gender ?? "N", hp: health?.hp ?? 0,
        hpMax: health?.maxhp ?? 0
    };
    const team = ctx.state.getTeam(ident.player);
    const mon = team.switchIn(options);
    if (!mon)
    {
        throw new Error(`Could not switch in '${identStr}': ` +
            `Team '${ident.player}' was too full (size=${team.size})`);
    }
    accept?.();
    await consume(ctx);
    return [side, mon];
}

//#region switch effects

/**
 * Parses any effects that should happen after a switch-in.
 * @param side Pokemon reference that was switched in.
 * @param accept Optional accept cb.
 */
async function switchEffects(ctx: BattleParserContext<"gen4">,
    side: SideID, accept?: unordered.AcceptCallback): Promise<void>
{
    // TODO: on-switch abilities, e.g. trace/intimidate

    // order: hazards (any order), healingwish/lunardance,
    //  ability on-start
        // note: item on-update on each hazard

    const a = accept;
    accept &&= function switchEffectsAccept()
    {
        accept = undefined;
        a!();
    }

    const team = ctx.state.getTeam(side);

    const entryEffects: unordered.UnorderedDeadline<"gen4">[] = []
    // entry hazards
    if (team.status.spikes > 0) entryEffects.push(spikes(team.side));
    if (team.status.stealthrock > 0) entryEffects.push(stealthrock(team.side));
    if (team.status.toxicspikes > 0) entryEffects.push(toxicspikes(team.side));
    // healingwish effects
    // note: wish is on-residual, healingwish/lunardance are on-switch
    if (team.status.healingwish)
    {
        entryEffects.push(healingwish(team.side, "healingwish"));
    }
    if (team.status.lunardance)
    {
        entryEffects.push(healingwish(team.side, "lunardance"));
    }
    await unordered.all(ctx, entryEffects, /*filter*/ undefined, accept);

    // afterwards check for an on-start ability
    if (!team.active.fainted)
    {
        await unordered.parse(ctx, effectAbility.onStart(ctx, team.side),
            accept);
    }

    accept?.();
}

//#region entry hazards

const spikes = (side: SideID) =>
    unordered.UnorderedDeadline.create(`${side} spikes`,
        spikesImpl, /*reject*/ undefined, side);

async function spikesImpl(ctx: BattleParserContext<"gen4">,
    accept: unordered.AcceptCallback, side: SideID): Promise<void>
{
    // TODO: grounded/magicguard assertions
    const team = ctx.state.getTeam(side);
    if (team.status.spikes <= 0) return;
    // can't heal if already fainted
    const mon = team.active;
    if (mon.fainted)
    {
        accept();
        return;
    }

    const layers = team.status.spikes;
    const denominator = [8, 6, 4]; // 1/8, 1/6, 1/4
    const percentage = layers <= 0 ? 0 : 100 / denominator[layers - 1];
    const damageRes = await effectDamage.percentDamage(ctx, side, -percentage,
        event =>
        {
            const from = Protocol.parseEffect(event.kwArgs.from, toIdName);
            if (from.name !== "spikes") return false;
            accept();
            return true;
        });
    if (damageRes === true)
    {
        // update items/faint since a damaging effect happened
        await unordered.all(ctx, [effectItem.onUpdate(ctx, side)]);
        // check for faint
        await faint.event(ctx, side);
    }
}

const stealthrock = (side: SideID) =>
    unordered.UnorderedDeadline.create(`${side} stealthrock`,
        stealthrockImpl, /*reject*/ undefined, side);

async function stealthrockImpl(ctx: BattleParserContext<"gen4">,
    accept: unordered.AcceptCallback, side: SideID): Promise<void>
{
    // TODO: magicguard assertions
    const team = ctx.state.getTeam(side);
    if (team.status.stealthrock <= 0) return;
    // can't heal if already fainted
    const mon = team.active;
    if (mon.fainted)
    {
        accept();
        return;
    }
    const multiplier = dex.getTypeMultiplier(mon.types, "rock");
    const percentage = 100 * multiplier / 8;
    const damageRes = await effectDamage.percentDamage(ctx, side, -percentage,
        event =>
        {
            const from = Protocol.parseEffect(event.kwArgs.from, toIdName);
            if (from.name !== "stealthrock") return false;
            accept();
            return true;
        });
    if (damageRes === true)
    {
        // update items/faint since a damaging effect happened
        await unordered.parse(ctx, effectItem.onUpdate(ctx, side));
        // check for faint
        await faint.event(ctx, side);
    }
}

const toxicspikes = (side: SideID) =>
    unordered.UnorderedDeadline.create(`${side} toxicspikes`,
        toxicspikesImpl, /*reject*/ undefined, side);

async function toxicspikesImpl(ctx: BattleParserContext<"gen4">,
    accept: unordered.AcceptCallback, side: SideID): Promise<void>
{
    // TODO: grounded/magicguard/ability immunity assertions
    const team = ctx.state.getTeam(side);
    if (team.status.toxicspikes <= 0) return;

    const mon = team.active;
    // can't heal if already fainted
    if (mon.fainted)
    {
        accept();
        return;
    }
    if (!mon.types.includes("poison"))
    {
        // always blocked by substitute/steel type
        if (mon.volatile.substitute || mon.types.includes("steel"))
        {
            accept();
            return;
        }

        const status = team.status.toxicspikes >= 2 ? "tox" : "psn";
        const statusRes = await effectStatus.status(ctx, side, [status],
            event =>
            {
                if ((event.kwArgs as any).from) return false;
                accept();
                return true;
            });
        if (statusRes === status)
        {
            // update items since a status effect happened
            await unordered.parse(ctx, effectItem.onUpdate(ctx, side));
        }
    }
    else
    {
        // grounded poison types automatically remove toxicspikes
        const event = await tryVerify(ctx, "|-sideend|");
        if (!event) return;
        const [, sideStr, effectStr] = event.args;
        const ident = Protocol.parsePokemonIdent(
            sideStr as any as Protocol.PokemonIdent);
        if (ident.player !== side) return;
        const effect = Protocol.parseEffect(effectStr, toIdName);
        if (effect.name !== "toxicspikes") return;
        accept();
        await base["|-sideend|"](ctx);
    }
}

//#endregion

//#region healingwish effects

const healingwish = (side: SideID, type: "healingwish" | "lunardance") =>
    unordered.UnorderedDeadline.create(`${side} ${type}`,
        healingwishImpl, effectDidntHappen, side, type);

async function healingwishImpl(ctx: BattleParserContext<"gen4">,
    accept: unordered.AcceptCallback, side: SideID,
    type: "healingwish" | "lunardance"): Promise<void>
{
    // can't heal if already fainted
    const mon = ctx.state.getTeam(side).active;
    if (mon.fainted)
    {
        accept();
        return;
    }

    await effectDamage.percentDamage(ctx, side, 100,
        event =>
        {
            const from = Protocol.parseEffect(event.kwArgs.from, toIdName);
            if (from.name !== type) return false;
            accept();
            return true;
        },
        // gen4: event is emitted even if recipient has full hp
        /*noSilent*/ true);
}

//#endregion

//#region other helpers

function effectDidntHappen(name: string): never
{
    throw new Error("Expected effect that didn't happen: " + name);
}

//#endregion

//#endregion
