/** @file Handles parsing for events related to moves. */
import { Protocol } from "@pkmn/protocol";
import { SideID } from "@pkmn/types";
import { toIdName } from "../../../../../../helpers";
import { Event } from "../../../../../../parser";
import { BattleParserContext, consume, eventLoop, peek, tryVerify, unordered,
    verify } from "../../../../parser";
import * as dex from "../../dex";
import { Move } from "../../state/Move";
import { Pokemon, ReadonlyPokemon } from "../../state/Pokemon";
import { dispatch, handlers as base } from "../base";
import * as effectAbility from "../effect/ability";
import * as effectBoost from "../effect/boost";
import * as effectDamage from "../effect/damage";
import * as effectItem from "../effect/item";
import * as effectStatus from "../effect/status";
import * as effectWeather from "../effect/weather";
import { ActionResult } from "./action";
import * as actionSwitch from "./switch";

//#region main action parser

/** Result of {@link moveAction} and {@link interceptSwitch}. */
export type MoveActionResult = ActionResult;

/**
 * Parses a possible move action by player choice. Includes effects that could
 * happen before the main `|move|` event.
 * @param side Player id.
 */
export async function moveAction(ctx: BattleParserContext<"gen4">,
    side: SideID, accept?: unordered.AcceptCallback):
    Promise<MoveActionResult>
{
    return await moveActionImpl(ctx, side, accept);
}

/**
 * Parses a possible move action that would interrupt a switch-in, e.g. pursuit.
 * @param intercepting Pokemon reference who is doing the interruption.
 * @param intercepted Pokemon reference who was trying to switch out.
 * @param accept Callback to accept this pathway. If omitted, then we are
 * already committed.
 */
export async function interceptSwitch(ctx: BattleParserContext<"gen4">,
    intercepting: SideID, intercepted: SideID,
    accept?: unordered.AcceptCallback): Promise<MoveActionResult>
{
    return await moveActionImpl(ctx, intercepting, accept, intercepted);
}

/**
 * Parses a move action by player choice. Includes effects that could happen
 * before the main `|move|` event.
 * @param side Player that should be making the move action.
 * @param accept Callback to accept this pathway.
 * @param intercept If this move choice is intercepting a switch, specifies the
 * Pokemon being interrupted.
 */
async function moveActionImpl(ctx: BattleParserContext<"gen4">,
    side: SideID, accept?: unordered.AcceptCallback, intercept?: SideID):
    Promise<MoveActionResult>
{
    const res: MoveActionResult = {};
    // accept cb gets consumed if one of the optional pre-move effects accept
    // once it gets called the first time, subsequent uses of this value should
    //  be ignored since we'd now be committing to this pathway
    const a = accept;
    accept &&= function moveActionAccept()
    {
        accept = undefined;
        a!();
    };

    // expect any pre-move effects, e.g. pursuit or statuses
    const preMoveRes = await preMove(ctx, side, accept, intercept);
    if (!preMoveRes)
    {
        if (accept) return res;
        // should never happen
        throw new Error("Expected pre-move effects but they didn't happen");
    }
    res.actioned = {[side]: true};
    if (preMoveRes !== "inactive")
    {
        // parse the actual move
        const move = preMoveRes === "move" ? undefined : preMoveRes;
        Object.assign(res.actioned, await useMove(ctx, side, move, accept));
    }
    return res;
}

//#endregion

//#region pre-move effects

/**
 * Parses any pre-move effects.
 * @param side Pokemon reference who is using the move.
 * @param accept Callback to accept this pathway.
 * @param intercept If this move choice is intercepting a switch, specifies the
 * Pokemon that would be interrupted.
 * @returns If a move is expected, either `"move"` or the specific
 * {@link dex.Move} that's being used. If the move action was canceled, returns
 * `"slp"` (if due to sleep status) or `"inactive"`. Otherwise undefined.
 */
async function preMove(ctx: BattleParserContext<"gen4">, side: SideID,
    accept?: unordered.AcceptCallback, intercept?: SideID):
    Promise<dex.Move | "move" | "slp" | "inactive" | undefined>
{
    let res: dex.Move | "move" | "inactive" | undefined;

    const a = accept;
    accept &&= function preMoveAccept()
    {
        accept = undefined;
        a!();
    };

    const cantReasons: string[] = [];

    // expect switch interception effect if we're allowed to
    if (intercept)
    {
        // this event must be present if we're in a pre-switch context, which
        //  certain moves can intercept
        res = await interceptSwitchEvent(ctx, intercept, accept);
        if (!res)
        {
            if (accept) return;
            // istanbul ignore next: should never happen?
            throw new Error("Expected event to interrupt switch-in for " +
                intercept);
        }
    }
    else
    {
        // custapberry can only activate if we're not intercepting a switch
        // this can still activate if any of the below inactive effects were
        //  going to activate
        await unordered.parse(ctx, effectItem.onPreMove(ctx, side));
        // recharge is its own type of action so it can never be shown in an
        //  intercept context
        // flinch is in a similar case, since no flinch-inducing effect exists
        //  that can happen before intercept
        cantReasons.push("recharge", "flinch");
    }

    cantReasons.push("frz", "par", "slp");

    const [inactive] = await unordered.oneOf(ctx,
        [cantEvent(side, cantReasons), attract(side), confusion(side)]);
    // specify slp inactive reason in case of sleeptalk/snore
    if (inactive) return inactive === true ? "inactive" : inactive;
    return res ?? "move";
}

const cantEvent = (side: SideID, reasons: readonly string[]) =>
    unordered.UnorderedDeadline.create(
        `${side} pre-move inactive [${reasons.join(", ")}]`,
        cantEventImpl, /*reject*/ undefined, side, reasons);

async function cantEventImpl(ctx: BattleParserContext<"gen4">,
    accept: unordered.AcceptCallback, side: SideID, reasons: readonly string[]):
    Promise<"slp" | true | undefined>
{
    const event = await tryVerify(ctx, "|cant|");
    if (!event) return;
    const [, identStr, reason] = event.args;
    const ident = Protocol.parsePokemonIdent(identStr);
    if (ident.player !== side) return;
    if (!reasons.includes(reason)) return;
    accept();
    await base["|cant|"](ctx);
    // specify slp inactive reason in case of sleeptalk/snore
    return reason === "slp" ? "slp" : true;
}

const attract = (side: SideID) =>
    unordered.UnorderedDeadline.create(`${side} pre-move attract`, attractImpl,
        /*reject*/ undefined, side);

async function attractImpl(ctx: BattleParserContext<"gen4">,
    accept: unordered.AcceptCallback, side: SideID):
    Promise<true | undefined>
{
    // always activates before move
    const event = await tryVerify(ctx, "|-activate|");
    if (!event) return;
    const [, identStr, effectStr] = event.args;
    if (!identStr) return;
    const ident = Protocol.parsePokemonIdent(identStr);
    if (ident.player !== side) return;
    const effect = Protocol.parseEffect(effectStr, toIdName);
    if (effect.type !== "move" || effect.name !== "attract") return;
    await base["|-activate|"](ctx);

    // 50% chance to cause inactivity
    const event2 = await tryVerify(ctx, "|cant|");
    if (!event2) return;
    const [, ident2Str, reason] = event2.args;
    const ident2 = Protocol.parsePokemonIdent(ident2Str);
    if (ident2.player !== side) return;
    if (reason !== "Attract") return;
    accept();
    await base["|cant|"](ctx);
}

const confusion = (side: SideID) =>
    unordered.UnorderedDeadline.create(`${side} pre-move confusion`,
        confusionImpl, /*reject*/ undefined, side);

async function confusionImpl(ctx: BattleParserContext<"gen4">,
    accept: unordered.AcceptCallback, side: SideID):
    Promise<true | undefined>
{
    // can end or continue confusion status
    const event = await tryVerify(ctx, "|-end|", "|-activate|");
    if (!event) return;
    const [type, identStr, effectStr] = event.args;
    if (!identStr) return;
    const ident = Protocol.parsePokemonIdent(identStr);
    if (ident.player !== side) return;
    if (effectStr !== "confusion") return;
    if (type === "-end")
    {
        await base["|-end|"](ctx);
        return;
    }
    await base["|-activate|"](ctx);

    // 50% chance to cause inactivity and self-damage
    const event2 = await tryVerify(ctx, "|-damage|");
    if (!event2) return;
    const [, ident2Str] = event2.args;
    const ident2 = Protocol.parsePokemonIdent(ident2Str);
    if (ident2.player !== side) return;
    if (event2.kwArgs.from !== "confusion") return;
    accept();
    await base["|-damage|"](ctx);
    return true;
}

/**
 * Parses an event that signals a switch interruption, e.g. pursuit.
 * @param intercept Pokemon reference whose switch action is being interrupted.
 * @param accept Callback to accept this pathway.
 * @returns The {@link dex.Move} that's being used, or undefined if the event
 * wasn't found.
 */
async function interceptSwitchEvent(ctx: BattleParserContext<"gen4">,
    intercept: SideID, accept?: unordered.AcceptCallback):
    Promise<dex.Move | undefined>
{
    const event = await tryVerify(ctx, "|-activate|");
    if (!event) return;
    const [, identStr, effectStr] = event.args;
    if (!identStr) return;
    const ident = Protocol.parsePokemonIdent(identStr);
    if (ident.player !== intercept) return;
    const effect = Protocol.parseEffect(effectStr, toIdName);
    if (effect.type !== "move") return;

    const move = dex.getMove(effect.name);
    if (!move?.data.flags?.interceptSwitch) return;

    accept?.();
    const mon = ctx.state.getTeam(ident.player).active;
    mon.moveset.reveal(move.data.name);
    await consume(ctx);
    return move;
}

//#endregion

//#region main move event and effects

/**
 * Parses a single `|move|` event and its implications.
 * @param side Pokemon reference that should be using the move.
 * @param move Optional move to expect. If `"slp"` expects a slp move to be used
 * if at all.
 * @param accept Optional callback to accept this pathway.
 * @param called Optional call effect that the move event should mention.
 * @returns A MoveActionResult detailing any extra action consumptions other
 * than the move user.
 */
export async function useMove(ctx: BattleParserContext<"gen4">, side?: SideID,
    move?: dex.Move | "slp", accept?: unordered.AcceptCallback):
    Promise<MoveActionResult>
{
    let event: Event<"|move|">;
    if (accept)
    {
        const e = await tryVerify(ctx, "|move|");
        if (!e) return {};
        event = e;
    }
    else event = await verify(ctx, "|move|");
    const [, identStr, moveName, targetStr] = event.args;
    const ident = Protocol.parsePokemonIdent(identStr);
    if (side && ident.player !== side)
    {
        if (accept) return {};
        throw new Error(`Expected move for ${side} but got ${ident.player}`);
    }
    const moveId = toIdName(moveName);
    let target: SideID | undefined;
    if (targetStr && targetStr !== "null")
    {
        target = Protocol.parsePokemonIdent(targetStr).player;
    }

    if (move)
    {
        // TODO: add slp-based move indicator to dex data
        const cmp = move === "slp" ? ["sleeptalk", "snore"] : [move.data.name];
        if (!cmp.includes(moveId))
        {
            if (accept) return {};
            throw new Error(`Expected move [${cmp.join(", ")}] but got ` +
                `'${moveId}'`);
        }
    }

    // fill in missing move arg
    if (!move || move === "slp")
    {
        const m = dex.getMove(moveId);
        if (!m)
        {
            if (accept) return {};
            throw new Error(`Unknown move '${moveId}'`);
        }
        move = m;
    }

    accept?.();
    await consume(ctx);
    return await moveEffects(ctx, ident.player, move, target, event.kwArgs);
}

/** Parses effects from a move. */
async function moveEffects(ctx: BattleParserContext<"gen4">, side: SideID,
    move: dex.Move, target?: SideID, kwArgs?: Event<"|move|">["kwArgs"]):
    Promise<MoveActionResult>
{
    let res: MoveActionResult = {};

    const {user, moveSlot, targets, called, releasedTwoTurn, mirror, lastMove} =
        moveSetup(ctx, side, move, target, kwArgs);

    // look for move interruptions
    const tryResult = await tryExecute(ctx,
        {user, side, move, moveSlot, targets, called, releasedTwoTurn, mirror});
    if (tryResult !== "fail")
    {
        // execute move effects
        res = await execute(ctx,
        {
            user, side, move, targets, called, releasedTwoTurn, mirror,
            moveSlot, miss: tryResult === "miss" || tryResult, lastMove
        });
    }

    // reset stall counter if it wasn't updated this turn
    // note that after execute(), the user may not be active due to possible
    //  self-switch effects
    if (!called && user.active && !user.volatile.stalling)
    {
        user.volatile.stall(false);
    }

    return res;
}

//#region setup

/** Result from {@link moveSetup}. */
interface SetupResult
{
    /** Move user. */
    user: Pokemon;
    /** User's move slot state if applicable. */
    moveSlot?: Move;
    /** Pending targets. */
    targets: PendingTargets;
    /** Whether the move was called. */
    called: "bounced" | boolean;
    /** Whether we're in the release turn of a two-turn move. */
    releasedTwoTurn: boolean
    /** Whether the move can update Mirror Move status for targets. */
    mirror: boolean;
    /** Global last-move state for Copycat. */
    lastMove?: string;
}

function moveSetup(ctx: BattleParserContext<"gen4">, side: SideID,
    move: dex.Move, target?: SideID, kwArgs?: Event<"|move|">["kwArgs"]):
    SetupResult
{
    // set last move (copycat)
    const lastMove = ctx.state.status.lastMove;
    ctx.state.status.lastMove = move.data.name;

    const user = ctx.state.getTeam(side).active;

    let called: "bounced" | boolean;
    // TODO: use lockedmove suffix as an indicator for twoturn/locked-move
    //  statuses being continued or ended
    let lockedmove: boolean | undefined;
    if (kwArgs?.from)
    {
        const from = Protocol.parseEffect(kwArgs?.from, toIdName);
        if (from.name === "magiccoat") called = "bounced";
        else if (dex.moveCallers.hasOwnProperty(from.name)) called = true;
        else
        {
            called = false;
            if (from.name === "lockedmove") lockedmove = true;
        }
    }
    else called = false;

    const targets = collectTargets(user, move, side);
    const releasedTwoTurn = releaseTwoTurn(user, move);
    const continueLock = user.volatile.lockedMove.type === move.data.name;
    const continueRollout = user.volatile.rollout.type === move.data.name;
    const mirror = canMirror(user, move, releasedTwoTurn, called, continueLock,
        continueRollout);
    const couldReveal = !lockedmove && !releasedTwoTurn && !continueLock &&
        !continueRollout;
    const moveSlot = revealMoveSlot(ctx, user, move, couldReveal, called);

    // infer initial targets
    const targetOpts: TargetOptions =
        {user, move, side, targets, mirror, moveSlot};
    if (target)
    {
        if (!targets.pending[target])
        {
            throw new Error(`Expected ${target} to be a valid target`);
        }
        addTarget(ctx, {...targetOpts, side: target});
    }
    else
    {
        const otherSide = side === "p1" ? "p2" : "p1";
        if (targets.pending[otherSide])
        {
            addTarget(ctx, {...targetOpts, side: otherSide});
        }
    }
    if (targets.pending[side]) addTarget(ctx, targetOpts);

    return {user, moveSlot, targets, called, releasedTwoTurn, mirror, lastMove}
}

function collectTargets(user: ReadonlyPokemon, move: dex.Move, side: SideID):
    PendingTargets
{
    const result: PendingTargets =
        {pending: {}, total: 0, mentioned: new Map()};
    const otherSide = side === "p1" ? "p2" : "p1";
    const targetStr = move.getTarget(user);
    switch (targetStr)
    {
        // TODO: support non-single battles
        case "adjacentAlly":
            // these moves should always fail in singles
            break;
        case "adjacentAllyOrSelf": case "allies": case "allySide":
        case "allyTeam": case "self":
            result.pending[side] = true;
            result.total = 1;
            break;
        case "all":
            result.pending[side] = true;
            result.pending[otherSide] = true;
            result.total = 2;
            break;
        case "adjacentFoe": case "allAdjacent": case "allAdjacentFoes":
        case "any": case "foeSide": case "normal": case "randomNormal":
        case "scripted":
            result.pending[otherSide] = true;
            result.total = 1;
            break;
        default:
            const unsupportedTarget: never = targetStr;
            throw new Error(`Unsupported move target '${unsupportedTarget}'`);
    }
    return result;
}

function releaseTwoTurn(user: Pokemon, move: dex.Move): boolean
{
    if (user.volatile.twoTurn.type !== move.data.name) return false;
    user.volatile.twoTurn.reset();
    // istanbul ignore if: should never happen
    if (move.data.effects?.delay?.type !== "twoTurn")
    {
        throw new Error(`Two-turn move '${move.data.name}' does not have ` +
            "delay=twoTurn");
    }
    return true;
}

function canMirror(user: ReadonlyPokemon, move: dex.Move,
    releasedTwoTurn: boolean, called: "bounced" | boolean,
    continueLock: boolean, continueRollout: boolean): boolean
{
    // can't mirror what's expected to be a charging turn
    return (move.data.effects?.delay?.type !== "twoTurn" || releasedTwoTurn) &&
        // can't mirror called moves
        !called &&
        // can't mirror called rampage moves
        (!continueLock || !user.volatile.lockedMove.called) &&
        (!continueRollout || !user.volatile.rollout.called) &&
        // default to mirror move flag
        // TODO: should called+released two-turn count? (unique to PS?)
        !move.data.flags?.noMirror;
}

function revealMoveSlot(ctx: BattleParserContext<"gen4">, user: Pokemon,
    move: dex.Move, couldReveal: boolean, called: "bounced" | boolean):
    Move | undefined
{
    // if this isn't a called move, then the user must have this move in its
    //  moveset (i.e., it's an actual move selection by the player)
    if (called) return;
    user.volatile.resetSingleMove();
    if (!couldReveal) return;
    // set last move (encore)
    user.volatile.lastMove = move.data.name;
    // only struggle can be selected without being a part of the user's
    //  moveset
    if (move.data === dex.moves["struggle"]) return;
    // deduct pp
    // record move state in case it needs to be used later
    const moveSlot = user.moveset.reveal(move.data.name);
    --moveSlot.pp;

    // activate choice item lock
    // TODO: handle item possibilities and retroactive inferences
    //   for this status
    if (user.item.definiteValue &&
        user.item.map[user.item.definiteValue].isChoice)
    {
        user.volatile.choiceLock = move.data.name;
    }

    // taunt assertion
    if (move.data.category === "status" && user.volatile.taunt.isActive)
    {
        ctx.logger.error(`Using status move '${move.data.name}' but ` +
            "should've been Taunted");
    }

    // focuspunch assertion
    if (move.data.flags?.focus && !user.volatile.focus &&
        !user.volatile.encore.ts.isActive)
    {
        ctx.logger.error("User has focus=false yet focus move being used ");
    }

    return moveSlot;
}

//#endregion

//#region try-execute parsers (failure/delay/block checks)

/** Arguments for {@link tryExecute}. */
interface TryExecuteArgs
{
    /** Move user. */
    readonly user: Pokemon;
    /** Move user reference. */
    readonly side: SideID;
    /** Move being used. */
    readonly move: dex.Move;
    /** User's move slot state if applicable. */
    readonly moveSlot?: Move;
    /** Pending targets. */
    readonly targets: PendingTargets;
    /** Whether the move was called. */
    readonly called: "bounced" | boolean;
    /** Whether we're in the release turn of a two-turn move. */
    readonly releasedTwoTurn: boolean
    /** Whether the move can update Mirror Move status for targets. */
    readonly mirror: boolean;
}

/**
 * Checks if the move can be executed normally.
 * @returns `"fail"` if the move failed on its own, `"miss"` if it missed, or
 * `undefined` if the move should still execute normally. Can also return an
 * object indicating which of the move's status effects were blocked, if any.
 */
async function tryExecute(ctx: BattleParserContext<"gen4">,
    args: TryExecuteArgs):
    Promise<"fail" | "miss" | {[T in dex.StatusType]?: true} | undefined>
{
    // see if the move failed on its own
    const failed = await checkFail(ctx, args);
    // TODO: separate implicit effects
    if (failed) return "fail";

    // check for delayed move
    const delayResult = await checkDelay(ctx, args);
    // set fail marker here so the caller short-circuits
    if (delayResult) return "fail";

    // accuracy calculations start here, consume micleberry status
    // TODO(later): accuracy calcs and probablistic inductions
    args.user.volatile.micleberry = false;

    // check for other effects/abilities blocking this move
    // TODO(doubles): allow move to execute with fewer targets if only one of
    //  them blocks it
    const blockResult = await checkBlock(ctx, args);
    if (blockResult === true) return "miss";
    if (blockResult) return blockResult;
}

//#region fail check

/** Checks if the move failed on its own. */
async function checkFail(ctx: BattleParserContext<"gen4">,
    args: TryExecuteArgs): Promise<boolean | undefined>
{
    let failed: boolean | undefined;
    const event = await tryVerify(ctx, "|-fail|", "|-notarget|");
    if (!event) return;
    switch (event.args[0])
    {
        case "-fail":
            // move couldn't be used
            // TODO: assertions on why the move could fail?
            failed = true;
            handleFail(ctx, args);
            await base["|-fail|"](ctx);
            break;
        case "-notarget":
        {
            // no opponent to target
            const otherSide = args.side === "p1" ? "p2" : "p1";
            if (!ctx.state.getTeam(otherSide).active.fainted)
            {
                break;
            }
            failed = true;
            handleNoTarget(args);
            await base["|-notarget|"](ctx);
            break;
        }
    }

    // focuspunch assertion
    if (!failed && args.move.data.flags?.focus && args.user.volatile.damaged)
    {
        ctx.logger.error("User has damaged=true yet focus move didn't fail");
    }

    return failed;
}

/** Handles the implications of a move failing. */
function handleFail(ctx: BattleParserContext<"gen4">,
    {user, move, called}: TryExecuteArgs): void
{
    // TODO: add MoveData field to support this move
    if (move.data.name === "naturalgift") naturalGift(user, /*failed*/ true);

    // imprison move failed, make inferences based on fail conditions
    if (move.data.effects?.status?.self?.includes("imprison") &&
        !move.data.effects.status.chance)
    {
        imprison(ctx, /*failed*/ true);
    }

    // non-called moves affect the stall counter
    if (!called) user.volatile.stall(false);

    // clear continuous moves
    user.volatile.lockedMove.reset();
    user.volatile.rollout.reset();

    // when the move fails, micleberry status is silently ended
    user.volatile.micleberry = false;

    // focuspunch assertion
    if (move.data.flags?.focus && !user.volatile.damaged)
    {
        ctx.logger.error("User has damaged=false yet focus move failed");
    }
}

/** Handles the implications of a move lacking a target. */
function handleNoTarget({user, called}: TryExecuteArgs): void
{
    // non-called moves affect the stall counter
    if (!called) user.volatile.stall(false);

    // clear continuous moves
    user.volatile.lockedMove.reset();
    user.volatile.rollout.reset();

    // when the move fails, micleberry status is silently ended
    // TODO: verify
    user.volatile.micleberry = false;

    // TODO: verify other implications?
}

//#endregion

//#region two-turn delay check

/** Checks for a delayed move effect. */
async function checkDelay(ctx: BattleParserContext<"gen4">,
    args: TryExecuteArgs): Promise<boolean | undefined>
{
    if (!args.move.data.effects?.delay) return;
    const delayResult = await expectDelay(ctx, args);
    if (delayResult === "shorten")
    {
        // expect informational event for move animation
        const event = await tryVerify(ctx, "|-anim|");
        if (!event) return;
        const [, ident1Str, moveStr, ident2Str] = event.args;
        const ident1 = Protocol.parsePokemonIdent(ident1Str);
        if (ident1.player !== args.side) return;
        const moveId = toIdName(moveStr);
        if (moveId !== args.move.data.name) return;
        const ident2 = Protocol.parsePokemonIdent(ident2Str);
        if (ident2.player === args.side) return;
        if (!addTarget(ctx, {...args, side: ident2.player})) return;
        await base["|-anim|"](ctx);

        // execute event again to handle shortened release turn
        // this makes it easier to handle effects that were already checked for
        //  in the initial moveEffects() step, e.g. mirrormove tracking on
        //  the release turn
        // this is an inexact recreation of the event, but should be good
        //  enough for our purposes
        const repeatEvent: Event<"|move|"> =
        {
            args:
            [
                "move",
                `${args.side}a: ${args.user.species}` as Protocol.PokemonIdent,
                args.move.data.display as Protocol.MoveName
            ],
            // release event includes lockedmove effect
            kwArgs: {from: "lockedmove" as Protocol.EffectName}
        };
        await useMove(
        {
            ...ctx,
            // override EventIterator to "unget" the current |move| event
            iter:
            {
                ...ctx.iter,
                async next()
                {
                    // restore overridden method
                    this.next = ctx.iter.next;
                    this.peek = ctx.iter.peek;
                    return {value: repeatEvent};
                },
                async peek()
                {
                    return {value: repeatEvent};
                }
            }
        });
        return true;
    }
    return delayResult;
}

/** Expects a move delay effect if applicable. */
async function expectDelay(ctx: BattleParserContext<"gen4">,
    {side, move, releasedTwoTurn}: TryExecuteArgs):
    Promise<"shorten" | boolean | undefined>
{
    switch (move.data.effects?.delay?.type)
    {
        case "twoTurn":
        {
            // can't expect event if releasing two-turn move, should instead get
            //  the damage()/postDamage() events
            if (releasedTwoTurn) break;

            const event = await verify(ctx, "|-prepare|");
            const [, identStr, moveName] = event.args;
            const ident = Protocol.parsePokemonIdent(identStr);
            if (ident.player !== side)
            {
                throw new Error(`TwoTurn effect '${move.data.name}' failed`);
            }
            const moveId = toIdName(moveName);
            if (moveId !== move.data.name)
            {
                throw new Error(`TwoTurn effect '${move.data.name}' failed: ` +
                    `Expected '${move.data.name}' but got '${moveId}'`);
            }
            await base["|-prepare|"](ctx);

            // TODO: move shorten logic to base prepareMove handler?

            // check solar move (suppressed by airlock/cloudnine)
            let suppressWeather: boolean | undefined;
            for (const teamSide in ctx.state.teams)
            {
                if (!ctx.state.teams.hasOwnProperty(teamSide)) continue;
                const mon = ctx.state.getTeam(teamSide as SideID).active;
                // note: airlock/cloudnine abilities reveal on-start
                // TODO: enforce this in dex data on-start effect?
                if (dex.abilities[mon.ability]?.flags?.suppressWeather)
                {
                    suppressWeather = true;
                    break;
                }
            }
            let shorten = !suppressWeather && move.data.effects?.delay.solar &&
                ctx.state.status.weather.type === "SunnyDay";
            // powerherb check
            if (!shorten)
            {
                // expect on-moveCharge item
                const [chargeResult] = await unordered.parse(ctx,
                    effectItem.onMoveCharge(ctx, side));
                shorten = chargeResult === "shorten";
            }

            return shorten ? "shorten" : true;
        }
        case "future":
        {
            // can't expect event if future move already active, should instead
            //  fail the move
            if (ctx.state.getTeam(side).status
                .futureMoves[move.data.name as dex.FutureMove].isActive)
            {
                break;
            }

            const event = await verify(ctx, "|-start|");
            const [, identStr, effectStr] = event.args;
            const ident = Protocol.parsePokemonIdent(identStr);
            if (ident.player !== side)
            {
                throw new Error(`Future effect '${move.data.name}' failed`);
            }
            const effect = Protocol.parseEffect(effectStr, toIdName);
            if (effect.name !== move.data.name)
            {
                throw new Error(`Future effect '${move.data.name}' failed: ` +
                    `Expected '${move.data.name}' but got '${effect.name}'`);
            }
            await base["|-start|"](ctx);
            return true;
        }
    }
}

//#endregion

//#region block check

// TODO(doubles): handle multiple targets
/** Checks for and acts upon any pre-hit blocking effects and abilities. */
async function checkBlock(ctx: BattleParserContext<"gen4">,
    {user, side, move, moveSlot, targets, called, mirror}: TryExecuteArgs):
    Promise<{[T in dex.StatusType]?: true} | boolean | undefined>
{
    // check for a block event due to an effect
    const event = await tryVerify(ctx, "|move|", "|-activate|", "|-miss|",
        "|-immune|");
    const targetOpts: TargetOptions =
        {user, move, side, moveSlot, targets, mirror};
    switch (event?.args[0])
    {
        case "move":
        {
            // magiccoat bounce effect
            const e = event as Event<"|move|">;
            const [, identStr, moveName] = e.args;
            const ident = Protocol.parsePokemonIdent(identStr);
            if (ident.player === side) break;
            const moveId = toIdName(moveName);
            if (moveId !== move.data.name) break;
            if (!e.kwArgs.from) break;
            const from = Protocol.parseEffect(e.kwArgs.from, toIdName);
            if (from.name !== "magiccoat") break;

            const mon = ctx.state.getTeam(ident.player).active;
            // verify flags
            if (!mon.volatile.magiccoat || !move.data.flags?.reflectable ||
                called === "bounced")
            {
                break;
            }

            // verify target
            if (!addTarget(ctx, {...targetOpts, side: ident.player})) break;

            // handle bounced move
            handleBlock(user, called);
            await useMove(ctx, ident.player, move);
            return true;
        }
        // block effect (safeguard, protect, etc)
        case "-activate":
        {
            const e = event as Event<"|-activate|">;
            const [, identStr, effectStr] = e.args;
            if (!identStr) break;
            const ident = Protocol.parsePokemonIdent(identStr);
            if (ident.player === side) break;
            const effect = Protocol.parseEffect(effectStr, toIdName);
            // substitute only blocks damage and is handled later
            if (effect.name === "substitute") break;
            // verify target
            if (!addTarget(ctx, {...targetOpts, side: ident.player})) break;
            // endure only blocks damage and is handled here due to weird PS
            //  ordering
            let res: boolean | undefined;
            if (effect.name !== "endure")
            {
                handleBlock(user, called);
                res = true;
            }
            await base["|-activate|"](ctx);
            return res;
        }
        case "-miss":
        {
            // check miss chance
            // TODO: bayesian inferences on accuracy?
            const e = event as Event<"|-miss|">;
            const [, userIdentStr, targetIdentStr] = e.args;
            const userIdent = Protocol.parsePokemonIdent(userIdentStr);
            if (userIdent.player !== side) break;
            if (targetIdentStr)
            {
                const targetIdent = Protocol.parsePokemonIdent(targetIdentStr);
                if (targetIdent.player === side) break;
                if (!addTarget(ctx, {...targetOpts, side: targetIdent.player}))
                {
                    break;
                }
            }
            handleBlock(user, called);
            await base["|-miss|"](ctx);
            return true;
        }
        case "-immune":
        {
            // check type/ohko immunity
            const e = event as Event<"|-immune|">;
            const [, identStr, effect] = e.args;
            if (effect) break;
            // code for handling ability immunities (via the [from] suffix) is
            //  located below
            if (e.kwArgs.from) break;
            const ident = Protocol.parsePokemonIdent(identStr);
            if (ident.player === side) break;
            if (!addTarget(ctx, {...targetOpts, side: ident.player})) break;
            handleBlock(user, called);
            if (!e.kwArgs.ohko)
            {
                const target = ctx.state.getTeam(ident.player).active;
                handleTypeEffectiveness(user, move, target, "immune");
            }
            await base["|-immune|"](ctx);
            return true;
        }
    }

    // check for a blocking ability
    // TODO(doubles): multiple eligible targets
    // TODO: sometimes this can happen after other move effects later down the
    //  line (e.g. owntempo vs swagger)
    let blocked: {[T in dex.StatusType]?: true} | boolean | undefined;
    const otherSide = side === "p1" ? "p2" : "p1";
    if (addTarget(ctx, {...targetOpts, side: otherSide}))
    {
        const [r] = await unordered.parse(ctx,
            effectAbility.onBlock(ctx, otherSide, {userRef: side, move}));
        if (r)
        {
           // handle block results
            // TODO: if wonderguard, assert type effectiveness
            // if the move couldn't be fully blocked, block parts of the move
            //  that the ability takes issue with
            if (!(blocked = r.immune || r.failed)) blocked = r.blockStatus;
        }
        if (blocked === true) handleBlock(user, called);
    }
    return blocked;
}

/** Handles the implications of a move being blocked by an effect. */
function handleBlock(user: Pokemon, called: "bounced" | boolean): void
{
    // non-called moves affect the stall counter
    if (!called) user.volatile.stall(false);

    // interrupted momentum move
    // TODO(gen>=5): also reset rampage move
    user.volatile.rollout.reset();
}

//#endregion

//#endregion

//#region on-execute parsers (move effects)

interface ExecuteArgs
{
    /** Move user. */
    readonly user: Pokemon;
    /** Move user reference. */
    readonly side: SideID;
    /** Move being used. */
    readonly move: dex.Move;
    /** User's move slot state if applicable. */
    readonly moveSlot?: Move;
    /** Pending targets. */
    readonly targets: PendingTargets;
    /** Whether the move was called. */
    readonly called: "bounced" | boolean;
    /** Whether we're in the release turn of a two-turn move. */
    readonly releasedTwoTurn: boolean
    /** Whether the move can update Mirror Move status for targets. */
    readonly mirror: boolean;
    /**
     * Whether the effect missed on the first accuracy check, or some status
     * immunities were mentioned.
     */
    miss?: true | {readonly [T in dex.StatusType]?: true};
    /** Last used move before this one. */
    lastMove?: string;
}

/** Dispatches move/hit effects. */
async function execute(ctx: BattleParserContext<"gen4">, args: ExecuteArgs):
    Promise<MoveActionResult>
{
    if (args.miss !== true)
    {
        await hitLoop(ctx, args);
        await otherEffects(ctx, args);
        implicitEffects(ctx, args);
    }
    await faints(ctx, args);
    let res: MoveActionResult = {};
    if (args.miss !== true) res = await finalEffects(ctx, args);
    return res;
}

//#region hit-loop

/** Handles the possibly-multiple hits from a move. */
async function hitLoop(ctx: BattleParserContext<"gen4">, args: ExecuteArgs):
    Promise<void>
{
    const maxHits = args.move.data.multihit?.[1] ?? 1;
    let multihitEnded: boolean | undefined; // presence of hitcount event
    for (let i = 0; i < maxHits; ++i)
    {
        // handle pre-hit, hit, and post-hit move effects
        if (args.move.data.category !== "status")
        {
            const preHitResult = await preHit(ctx, args);
            await hit(ctx, args, preHitResult);
        }
        await postHit(ctx, args);

        // check for hitcount event to terminate hit loop
        if (await checkHitCount(ctx, args, i + 1))
        {
            multihitEnded = true;
            break;
        }
    }
    if (args.move.data.multihit && !multihitEnded)
    {
        throw new Error(
            "Expected |-hitcount| event to terminate multi-hit move");
    }
}

/**
 * Checks for a valid `|-hitcount|` event.
 * @param hits Current number of hits.
 * @returns Whether a valid `|-hitcount|` event was parsed.
 */
async function checkHitCount(ctx: BattleParserContext<"gen4">,
    args: ExecuteArgs, hits: number): Promise<boolean | undefined>
{
    const event = await tryVerify(ctx, "|-hitcount|");
    if (!event) return;

    const [, identStr, numStr] = event.args;
    const ident = Protocol.parsePokemonIdent(identStr);
    if (!addTarget(ctx, {...args, side: ident.player}))
    {
        throw new Error("Invalid |-hitcount| event: " +
            `Expected non-${args.side} but got ${ident.player}`);
    }
    const num = Number(numStr);
    if (num !== hits)
    {
        throw new Error("Invalid |-hitcount| event: " +
            `Expected ${hits} but got '${numStr}'`);
    }
    await base["|-hitcount|"](ctx);
    return true;
}

//#region pre-hit

/** Result of {@link preHit}. */
interface PreHitResult
{
    /** Resist berry type. */
    resistSuper?: dex.Type;
}

/** Check for pre-hit modifier events. */
async function preHit(ctx: BattleParserContext<"gen4">, args: ExecuteArgs):
    Promise<PreHitResult>
{
    // check for resist berry effect
    const [itemPreHitResult] = await unordered.parse(ctx,
        effectItem.onPreHit(ctx, args.side === "p1" ? "p2" : "p1", args));
    return itemPreHitResult ?? {};
}

//#endregion

//#region hit

/** Handles move damage modifier events, e.g. crits and type effectiveness. */
async function hit(ctx: BattleParserContext<"gen4">, args: ExecuteArgs,
    prev: PreHitResult): Promise<void>
{
    let effectiveness: dex.Effectiveness = "regular";
    let damaged: boolean | "substitute" | undefined;
    let crit: boolean | undefined;
    await eventLoop(ctx, async function hitEventLoop(_ctx)
    {
        const event = await peek(_ctx);
        switch (event.args[0])
        {
            case "-end": case "-activate":
            {
                // substitute (breaking while) blocking
                const [, identStr, effectStr] = event.args;
                if (!identStr) break;
                const effect = Protocol.parseEffect(effectStr, toIdName);
                if (effect.name !== "substitute") break;
                const ident = Protocol.parsePokemonIdent(identStr);
                if (ident.player === args.side) break;
                if (!addTarget(_ctx,
                    {...args, side: ident.player, damaged: "substitute"}))
                {
                    break;
                }
                damaged = "substitute";
                if (args.move.data.flags?.ignoreSub)
                {
                    // istanbul ignore next: can't reproduce until gen5 with
                    //  damaging sub-ignoring moves since the non-damaging ones
                    //  should just fail outright
                    // TODO: for now custom dex mods in order to test this?
                    throw new Error("Substitute-ignoring move shouldn't have " +
                        "been blocked by Substitute");
                }
                return await dispatch(_ctx);
            }
            case "-crit":
            {
                if (crit) break;
                const [, identStr] = event.args;
                const ident = Protocol.parsePokemonIdent(identStr);
                if (ident.player === args.side) break;
                if (!addTarget(_ctx, {...args, side: ident.player})) break;
                crit = true;
                return await base["|-crit|"](_ctx);
            }
            case "-resisted": case "-supereffective":
            {
                // type effectiveness modifiers
                if (effectiveness !== "regular") break;
                const [, identStr] = event.args;
                const ident = Protocol.parsePokemonIdent(identStr);
                if (ident.player === args.side) break;
                if (!addTarget(_ctx, {...args, side: ident.player})) break;
                effectiveness = event.args[0] === "-resisted" ?
                    "resist" : "super";
                return await base[`|${event.args[0]}|` as const](_ctx);
            }
            case "-damage":
            {
                // main move damage
                if (damaged) break;
                const e = event as Event<"|-damage|">;
                const [, identStr, healthStr] = e.args;
                if (e.kwArgs.from) break;
                const ident = Protocol.parsePokemonIdent(identStr);
                if (ident.player === args.side) break;
                const health = Protocol.parseHealth(healthStr);
                if (!health ||
                    !addTarget(_ctx,
                    {
                        ...args, side: ident.player,
                        damaged: health.fainted || health.hp <= 0 ?  "ko" : true
                    }))
                {
                    break;
                }

                const mon = _ctx.state.getTeam(ident.player).active;
                const fullHP = mon.hp.current >= mon.hp.max;
                damaged = true;
                await base["|-damage|"](_ctx);
                // if the target was at full hp before being deducted, we should
                //  check for focussash-like items that activate on one-hit KOs
                if (fullHP)
                {
                    await unordered.parse(_ctx,
                        effectItem.onTryOHKO(_ctx, ident.player));
                }
                break;
            }
        }
    });

    if (prev.resistSuper && effectiveness as dex.Effectiveness !== "super")
    {
        throw new Error("Move effectiveness expected to be 'super' but got " +
            `'${effectiveness}'`);
    }
    const target = ctx.state.getTeam(args.side === "p1" ? "p2" : "p1").active;
    handleTypeEffectiveness(args.user, args.move, target, effectiveness);
}

//#endregion

//#region post-hit

/** Handles move effects after the move officially hits. */
async function postHit(ctx: BattleParserContext<"gen4">, args: ExecuteArgs):
    Promise<void>
{
    const parsers: unordered.UnorderedDeadline<"gen4">[] = [];
    // TODO(doubles): actually track targets
    const otherSide = args.side === "p1" ? "p2" : "p1";
    const {effects} = args.move.data;
    if (effects)
    {
        switch (effects.damage?.type)
        {
            case "percent":
            {
                if (effects.damage.ghost && !args.user.types.includes("ghost"))
                {
                    break;
                }
                const side = effects.damage.target === "self" ?
                    args.side : otherSide;
                parsers.push(
                    percentDamage(args.side, side, effects.damage.percent));
                break;
            }
            case "split":
                parsers.push(
                    splitDamage(args.side, otherSide, args.move.data.name));
                break;
        }
        switch (effects.count)
        {
            case "perish": parsers.push(perish(args.side)); break;
            case "stockpile": parsers.push(stockpile(args.side)); break;
        }
        if (effects.boost &&
            (!effects.boost.noGhost || !args.user.types.includes("ghost")))
        {
            parsers.push(...boost(ctx, args));
        }
        if (effects.status &&
            (!effects.status.ghost || args.user.types.includes("ghost")))
        {
            parsers.push(...status(ctx, args));
        }
        if (effects.drain) parsers.push(...drain(ctx, args, otherSide));
    }
    if (args.move.data.category !== "status")
    {
        // item on-super (enigmaberry)
        parsers.push(effectItem.onSuper(ctx, otherSide, args));

        // ability on-moveDamage variant (e.g. colorchange)
        const flags = args.targets.mentioned.get(otherSide);
        // choose category with highest precedence
        let qualifier: "damage" | "contact" | "contactKO" | undefined;
        if (args.move.data.flags?.contact)
        {
            if (flags?.damaged === "ko") qualifier = "contactKO";
            else if (flags?.damaged) qualifier = "contact";
        }
        else if (flags?.damaged) qualifier = "damage";
        if (qualifier)
        {
            parsers.push(
                effectAbility.onMoveDamage(ctx, otherSide, qualifier,
                    {userRef: args.side, move: args.move}));
        }

        // item on-postHit (e.g. jabocaberry)
        parsers.push(
            effectItem.onPostHit(ctx, otherSide,
                {userRef: args.side, move: args.move}));
    }
    // item on-update (e.g. sitrusberry)
    parsers.push(
        effectItem.onUpdate(ctx, args.side),
        effectItem.onUpdate(ctx, otherSide));

    // parse untracked effects even if move has no tracked effects
    if (parsers.length <= 0) await eventLoop(ctx, postHitFilter);
    else await unordered.all(ctx, parsers, postHitFilter);
}

//#region count-status effect

const perish = (side: SideID) =>
    unordered.UnorderedDeadline.create(`${side} move countStatus all perish`,
        perishImpl, effectDidntHappen);

async function perishImpl(ctx: BattleParserContext<"gen4">,
    accept: unordered.AcceptCallback): Promise<void>
{
    // parse perish start events
    const mentioned = new Set<SideID>();
    let accepted = false;
    await eventLoop(ctx, async function countStatusPerishLoop(_ctx)
    {
        const event = await tryVerify(_ctx, "|-start|");
        if (!event) return;
        const [, identStr, effectStr] = event.args;
        if (effectStr !== "perish3") return;
        const ident = Protocol.parsePokemonIdent(identStr);
        if (mentioned.has(ident.player)) return;
        mentioned.add(ident.player);
        if (!accepted) accept();
        accepted = true;
        await base["|-start|"](_ctx);
    });
    // parse terminator
    let event2: Event<"|-fieldactivate|">;
    if (accepted) event2 = await verify(ctx, "|-fieldactivate|");
    else
    {
        const e2 = await tryVerify(ctx, "|-fieldactivate|");
        if (!e2) return;
        event2 = e2;
    }
    const [, effect2Str] = event2.args;
    const effect2 = Protocol.parseEffect(effect2Str, toIdName);
    if (effect2.name !== "perishsong")
    {
        if (!accepted) return;
        throw new Error(`Move hit countStatus perish effect failed: ` +
            "invalid |-fieldactivate| event");
    }
    if (!accepted) accept();
    await base["|-fieldactivate|"](ctx);
}

const stockpile = (side: SideID) =>
    unordered.UnorderedDeadline.create(
        `${side} move countStatus ${side} stockpile`, stockpileImpl,
        effectDidntHappen, side);

async function stockpileImpl(ctx: BattleParserContext<"gen4">,
    accept: unordered.AcceptCallback, side: SideID): Promise<void>
{
    const event = await tryVerify(ctx, "|-start|");
    if (!event) return;
    const [, identStr, effectStr] = event.args;
    const ident = Protocol.parsePokemonIdent(identStr);
    if (ident.player !== side) return;
    if (!effectStr.startsWith("stockpile")) return;
    accept();
    await base["|-start|"](ctx);
}

//#endregion

//#region damage effect

const percentDamage = (side: SideID, targetSide: SideID, percent: number) =>
    unordered.UnorderedDeadline.create(
        `${side} move damage ${targetSide} percent ${percent}%`,
        percentDamageImpl, effectDidntHappen, side, percent);

async function percentDamageImpl(ctx: BattleParserContext<"gen4">,
    accept: unordered.AcceptCallback, side: SideID, percent: number):
    Promise<void>
{
    const res = await effectDamage.percentDamage(ctx, side, percent,
        event =>
        {
            if (event.kwArgs.from) return false;
            accept();
            return true;
        });
    if (res === "silent") accept();
}

const splitDamage = (side1: SideID, side2: SideID, moveName: string) =>
    unordered.UnorderedDeadline.create(`${side1} move damage split ${side2}`,
        splitDamageImpl, effectDidntHappen, side1, side2, moveName);

async function splitDamageImpl(ctx: BattleParserContext<"gen4">,
    accept: unordered.AcceptCallback, side1: SideID, side2: SideID,
    moveName: string): Promise<void>
{
    const pending = {[side1]: true, [side2]: true};
    let accepted = false;
    await eventLoop(ctx, async function splitDamageLoop(_ctx)
    {
        const event = await tryVerify(_ctx, "|-sethp|");
        if (!event) return;
        const [, ident1Str, , ident2Str] = event.args;
        const ident1 = Protocol.parsePokemonIdent(ident1Str);
        if (!pending[ident1.player]) return;
        pending[ident1.player] = false;
        if (ident2Str)
        {
            const ident2 = Protocol.parsePokemonIdent(ident2Str);
            if (!pending[ident2.player]) return;
            pending[ident2.player] = false;
        }
        if (!event.kwArgs.from) return;
        const from = Protocol.parseEffect(event.kwArgs.from, toIdName);
        if (from.type && from.type !== "move") return;
        if (from.name !== moveName) return;

        if (!accepted)
        {
            accept();
            accepted = true;
        }
        await base["|-sethp|"](_ctx);
    });
}

//#endregion

//#region boost effect

function boost(ctx: BattleParserContext<"gen4">, args: ExecuteArgs):
    unordered.UnorderedDeadline<"gen4">[]
{
    const result: unordered.UnorderedDeadline<"gen4">[] = [];
    const effect = args.move.data.effects?.boost;
    if (!effect) return result;

    for (const tgt of ["self", "hit"] as dex.MoveEffectTarget[])
    {
        const t = effect[tgt];
        if (!t) continue;
        const table = {...t};
        const targetSide = tgt === "self" ?
            args.side : (args.side === "p1" ? "p2" : "p1");
        const target = ctx.state.getTeam(targetSide).active;
        // can't boost if about to faint
        if (target.fainted) continue;
        // substitute blocks boost effects
        if (tgt === "hit" &&
            args.targets.mentioned.get(targetSide)?.damaged === "substitute")
        {
            continue;
        }

        // check for ability on-tryUnboost effect first
        if (!effect.set && tgt === "hit")
        {
            result.push(
                effectAbility.onTryUnboost(ctx, targetSide,
                        {userRef: args.side, move: args.move})
                    // modify in-progress boost table as this effect gets parsed
                    .transform(
                        blockUnboost =>
                        {
                            if (!blockUnboost) return;
                            for (const b in blockUnboost)
                            {
                                if (!blockUnboost.hasOwnProperty(b)) continue;
                                if (!table.hasOwnProperty(b)) continue;
                                delete table[b as dex.BoostName];
                            }
                        }));
        }
        result.push(
            unordered.UnorderedDeadline.create<"gen4">(
                () => `${args.side} move boost ${targetSide} ` +
                    `${effect.set ? "set": "add"} ` + JSON.stringify(table),
                async function boostImpl(_ctx, accept)
                {
                    // no more boosts to parse, or can't boost if about to faint
                    if (Object.keys(table).length <= 0 || target.fainted)
                    {
                        accept();
                        return;
                    }

                    const boostArgs: effectBoost.BoostArgs =
                    {
                        side: targetSide, table, silent: true,
                        pred(event)
                        {
                            if (event.kwArgs.from) return false;
                            accept();
                            return true;
                        }
                    };
                    if (effect.set) await effectBoost.setBoost(_ctx, boostArgs);
                    else await effectBoost.boost(_ctx, boostArgs);
                },
                effect.chance ? undefined : effectDidntHappen));
    }
    return result;
}

//#endregion

//#region status effect

function status(ctx: BattleParserContext<"gen4">, args: ExecuteArgs):
    unordered.UnorderedDeadline<"gen4">[]
{
    const result: unordered.UnorderedDeadline<"gen4">[] = [];
    const effect = args.move.data.effects?.status;
    if (!effect) return result;
    for (const tgt of ["self", "hit"] as dex.MoveEffectTarget[])
    {
        const statusTypes = effect[tgt];
        if (!statusTypes || statusTypes.length <= 0) continue;

        // status effect for target was blocked
        const blockStatus: {readonly [T in dex.StatusType]?: true} | undefined =
            args.miss !== true ? args.miss : undefined;
        if (tgt === "hit" && blockStatus &&
            statusTypes.some(s => blockStatus![s]))
        {
            continue;
        }

        const targetSide = tgt === "self" ?
            args.side : (args.side === "p1" ? "p2" : "p1");
        const target = ctx.state.getTeam(targetSide).active;

        // can't afflict status if about to faint
        if (target.fainted) continue;

        // substitute blocks status conditions
        if (tgt === "hit" &&
            args.targets.mentioned.get(targetSide)?.damaged === "substitute")
        {
            continue;
        }

        result.push(
            unordered.UnorderedDeadline.create(
                `${args.side} move status ${targetSide} ` +
                    `[${statusTypes.join(", ")}]`,
                statusImpl,
                effect.chance ?
                    undefined : () => statusReject(ctx, args, tgt, statusTypes),
                targetSide, statusTypes));
    }
    return result;
}

async function statusImpl(ctx: BattleParserContext<"gen4">,
    accept: unordered.AcceptCallback, targetRef: SideID,
    statusTypes: readonly dex.StatusType[]): Promise<void>
{
    // can't afflict status if about to faint
    const target = ctx.state.getTeam(targetRef).active;
    if (target.fainted)
    {
        accept();
        return;
    }

    const res = await effectStatus.status(ctx, targetRef, statusTypes,
        event =>
        {
            if ((event.kwArgs as any).from) return false;
            accept();
            return true;
        });
    // allow silent status
    if (res === true) accept();
    // handle imprison assertions
    else if (res === "imprison") imprison(ctx, /*failed*/ false);
}

function statusReject(ctx: BattleParserContext<"gen4">, args: ExecuteArgs,
    tgt: dex.MoveEffectTarget, statusTypes: readonly dex.StatusType[]): void
{
    // target must have an ability immunity
    const targetRef = tgt === "self" ?
        args.side : (args.side === "p1" ? "p2" : "p1");

    // moldbreaker check
    const user = args.user;
    const userAbility = user.traits.ability;
    if (!user.volatile.suppressAbility &&
        [...userAbility.possibleValues].every(
            n => userAbility.map[n].flags?.ignoreTargetAbility))
    {
        throw new Error(`Move '${args.move.data.name}' user '${args.side}' ` +
            "has ability-ignoring ability " +
            `[${[...userAbility.possibleValues].join(", ")}] but status ` +
            `[${statusTypes.join(", ")}] was still blocked by target ` +
            `'${targetRef}'`);
    }

    // the target must have a status immunity ability, so it should've been
    //  active here and not suppressed
    const target = ctx.state.getTeam(targetRef).active;
    if (target.volatile.suppressAbility)
    {
        throw new Error(`Move '${args.move.data.name}' status ` +
            `[${statusTypes.join(", ")}] was blocked by target ` +
            `'${targetRef}' but target's ability is suppressed`);
    }

    // find abilities that grant applicable status immunities
    const targetAbility = target.traits.ability;
    // note: can consider immunities to either status if there are multiple
    //  possible statuses to afflict
    // TODO: rework api to allow for custom overnarrowing errors/recovery
    const filteredAbilities = [...targetAbility.possibleValues]
        .filter(n => statusTypes.some(s =>
                // TODO: some abilities distinguish between self/hit statuses
                dex.getAbility(targetAbility.map[n]).canBlockStatus(s,
                    ctx.state.status.weather.type)));
    if (filteredAbilities.length <= 0)
    {
        // overnarrowed error
        throw new Error(`Move '${args.move.data.name}' status ` +
            `[${statusTypes.join(", ")}] was blocked by target ` +
            `'${targetRef}' but target's ability ` +
            `[${[...targetAbility.possibleValues].join(", ")}] can't block it`);
    }
    targetAbility.narrow(filteredAbilities);
}

//#endregion

//#region drain effect

function drain(ctx: BattleParserContext<"gen4">, args: ExecuteArgs,
    targetRef: SideID): unordered.UnorderedDeadline<"gen4">[]
{
    // drain effect could either be handled normally or by ability on-moveDrain
    let handled = false;
    return [
        effectAbility.onMoveDrain(ctx, targetRef, args.side)
            .transform(function transformMoveDrain(drainRes)
            {
                if (drainRes !== "invert") return;
                if (handled)
                {
                    throw new Error("Drain effect handled but ability " +
                        "on-moveDrain also activated afterwards");
                }
                handled = true;
            }),
        unordered.UnorderedDeadline.create<"gen4">(`${args.side} move drain`,
            async function drainImpl(_ctx, accept)
            {
                if (handled)
                {
                    accept();
                    return;
                }
                const damageRes = await effectDamage.percentDamage(_ctx,
                    args.side, /*heal*/ 1,
                    event => event.kwArgs.from === "drain");
                if (!damageRes) return;
                handled = true;
                accept();
            },
            function drainReject(name)
            {
                if (!handled) return effectDidntHappen(name);
            })
    ];
}

//#endregion

//#region untracked effects

async function postHitFilter(ctx: BattleParserContext<"gen4">): Promise<void>
{
    // untracked status effects
    // TODO: support curing/rapidspin effects in status() or separate section?
    const event = await tryVerify(ctx, "|-end|");
    if (!event) return;
    // distinguish from ability/item effects
    const from = Protocol.parseEffect(event.kwArgs.from, toIdName);
    if (from.type === "ability" || from.type === "item") return;

    const [, , effectStr] = event.args;
    const effect = Protocol.parseEffect(effectStr, toIdName);
    if (![...dex.majorStatusKeys, "confusion", "leechseed"]
            .includes(effect.name))
    {
        return;
    }
    await base["|-end|"](ctx);
}

//#endregion

//#endregion

//#endregion

//#region other move effects

async function otherEffects(ctx: BattleParserContext<"gen4">,
    args: ExecuteArgs): Promise<void>
{
    const parsers: unordered.UnorderedDeadline<"gen4">[] = [];
    // TODO(doubles): actually track targets
    const otherSide = args.side === "p1" ? "p2" : "p1";
    const {effects} = args.move.data;
    if (effects)
    {
        if (effects.swapBoosts)
        {
            parsers.push(
                swapBoosts(args.move, args.side, otherSide,
                    effects.swapBoosts));
        }
        if (effects.team) parsers.push(...teamEffect(args, otherSide));
        if (effects.field)
        {
            parsers.push(
                fieldEffect(args.side, args.user, effects.field.effect,
                    effects.field.toggle));
        }
        if (effects.changeType)
        {
            parsers.push(changeType(args.side, effects.changeType));
        }
        if (effects.disableMove) parsers.push(disableMove(otherSide));
    }

    // parse untracked effects even if current move doesn't have any
    //  other-effects
    if (parsers.length <= 0) await eventLoop(ctx, otherEffectsFilter);
    else await unordered.all(ctx, parsers, otherEffectsFilter);
}

//#region swap-boost effect

const swapBoosts = (move: dex.Move, side1: SideID, side2: SideID,
        boosts: Partial<dex.BoostTable<true>>) =>
    unordered.UnorderedDeadline.create(
        `${side1} move swap-boosts ${side2} ` +
            `[${Object.keys(boosts).join(", ")}]`,
        swapBoostsImpl, effectDidntHappen, move, side1, side2, boosts);

async function swapBoostsImpl(ctx: BattleParserContext<"gen4">,
    accept: unordered.AcceptCallback, move: dex.Move, side1: SideID,
    side2: SideID, boosts: Partial<dex.BoostTable<true>>): Promise<void>
{
    const event = await tryVerify(ctx, "|-swapboost|");
    if (!event) return;
    const [, ident1Str, ident2Str, boostsStr] = event.args;
    const ident1 = Protocol.parsePokemonIdent(ident1Str);
    if (ident1.player !== side1) return;
    const ident2 = Protocol.parsePokemonIdent(ident2Str);
    if (ident2.player !== side2) return;
    // get list of boosts
    // default to all boosts
    const boosts2 = boostsStr?.split(", ") as dex.BoostName[] ?? dex.boostKeys;
    // intersect boosts and boosts2 to see if they have the same elements
    // TODO: move to lib/utility function?
    const superset = new Map<dex.BoostName, boolean>();
    for (const b in boosts)
    {
        if (!boosts.hasOwnProperty(b)) continue;
        superset.set(b as dex.BoostName, true);
    }
    for (const b of boosts2)
    {
        if (!superset.has(b)) return;
        superset.set(b, false);
    }
    for (const [, v] of superset) if (v) return;
    // verify suffix
    const from = Protocol.parseEffect(event.kwArgs.from, toIdName);
    if (from.type && from.type !== "move") return;
    if (from.name !== move.data.name) return;

    accept();
    await base["|-swapboost|"](ctx);
}

//#endregion

//#region team effect

function teamEffect(args: ExecuteArgs, otherSide: SideID):
    unordered.UnorderedDeadline<"gen4">[]
{
    const result: unordered.UnorderedDeadline<"gen4">[] = [];
    const effects = args.move.data.effects?.team;
    if (!effects) return result;
    for (const tgt of ["self", "hit"] as dex.MoveEffectTarget[])
    {
        const effect = effects[tgt];
        if (!effect) continue;
        const side = tgt === "self" ? args.side : otherSide;
        result.push(
            unordered.UnorderedDeadline.create(
                `${args.side} move team ${side} ${effect}`, teamEffectImpl,
                effectDidntHappen, side, effect));
    }
    return result;
}

async function teamEffectImpl(ctx: BattleParserContext<"gen4">,
    accept: unordered.AcceptCallback, side: SideID, effect: dex.TeamEffectType):
    Promise<void>
{
    // silently consume effect if already present
    // usually the move should fail, but some gen8 moves require this behavior
    const ts = ctx.state.getTeam(side).status;
    switch (effect)
    {
        // TODO: lightscreen/reflect should set source pokemon
        case "lightscreen": case "luckychant": case "mist": case "reflect":
        case "safeguard": case "tailwind":
            if (!ts[effect].isActive) break;
            accept();
            return;
        case "spikes":
            if (ts[effect] < 3) break;
            accept();
            return;
        case "stealthrock":
            if (ts[effect] < 1) break;
            accept();
            return;
        case "toxicspikes":
            if (ts[effect] < 2) break;
            accept();
            return;
    }

    const event = await tryVerify(ctx, "|-sidestart|");
    if (!event) return;
    const [, sideStr, effectStr] = event.args;
    // note: Protocol.Side is in a similar format to Protocol.PokemonIdent, just
    //  without the position letter and with the nickname replaced with username
    const sideObj =
        Protocol.parsePokemonIdent(sideStr as any as Protocol.PokemonIdent);
    if (sideObj.player !== side) return;
    const effectObj = Protocol.parseEffect(effectStr, toIdName);
    if (effectObj.name !== effect) return;

    accept();
    await base["|-sidestart|"](ctx);
}

//#endregion

//#region field effect

const fieldEffect = (side: SideID, source: Pokemon, effect: dex.FieldEffectType,
        toggle?: boolean) =>
    unordered.UnorderedDeadline.create(
        `${side} move field ${effect}${toggle ? " toggle" : ""}`,
        fieldEffectImpl, effectDidntHappen, source, effect, toggle);

async function fieldEffectImpl(ctx: BattleParserContext<"gen4">,
    accept: unordered.AcceptCallback, source: Pokemon,
    effect: dex.FieldEffectType, toggle?: boolean): Promise<void>
{
    // silently consume effect if already present
    // usually the move should fail, but some gen8 moves require this behavior
    // note that weather can't be toggled
    const rs = ctx.state.status;
    switch (effect)
    {
        case "gravity": case "trickroom":
        {
            if (!toggle && rs[effect].isActive)
            {
                accept();
                break;
            }

            let event:
                Event<"|-fieldstart|" | "|-fieldend|"> | null | undefined;
            if (!toggle) event = await tryVerify(ctx, "|-fieldstart|");
            else event = await tryVerify(ctx, "|-fieldstart|", "|-fieldend|");
            if (!event) break;
            const [, effectStr] = event.args;
            const effectObj = Protocol.parseEffect(effectStr, toIdName);
            if (effectObj.name !== effect) break;
            // distinguish from ability/item effect
            const from = Protocol.parseEffect(event.kwArgs.from, toIdName);
            if (from.type === "ability" || from.type === "item") break;
            accept();
            await dispatch(ctx);
            break;
        }
        default:
            if (dex.isWeatherType(effect))
            {
                await effectWeather.weather(ctx, source, effect,
                    event =>
                    {
                        if (event.kwArgs.from) return false;
                        accept();
                        return true;
                    });
                break;
            }
            const invalid: never = effect;
            throw new Error(`Unknown field effect '${invalid}'`);
    }
}

//#endregion

//#region change-type effect

const changeType = (side: SideID, effect: "conversion") =>
    unordered.UnorderedDeadline.create(`${side} move change-type ${effect}`,
        changeTypeImpl, effectDidntHappen, side, effect);

async function changeTypeImpl(ctx: BattleParserContext<"gen4">,
    accept: unordered.AcceptCallback, side: SideID, effect: "conversion"):
    Promise<void>
{
    // can't do anything if fainted
    const mon = ctx.state.getTeam(side).active;
    if (mon.fainted)
    {
        accept();
        return;
    }

    const event = await tryVerify(ctx, "|-start|");
    if (!event) return;
    const [, identStr, effectStr, typesStr] = event.args;
    const ident = Protocol.parsePokemonIdent(identStr);
    if (ident.player !== side) return;
    if (effectStr !== "typechange") return;
    if (!typesStr) return;
    const types = typesStr.split("/").map(toIdName) as dex.Type[];
    if (types.length <= 0) return;

    // TODO: track type change effects: camouflage, conversion2
    switch (effect)
    {
        case "conversion":
            // change user's type to that of a known move
            // note: treat modifyType moves as their default type
            mon.moveset.addMoveSlotConstraint(dex.typeToMoves[types[0]]);
            break;
        // istanbul ignore next: should never happen
        default:
            const invalid: never = effect;
            throw new Error(`Invalid change-type move effect '${invalid}'`);
    }

    accept();
    await base["|-start|"](ctx);
}

//#endregion

//#region disable-move effect

const disableMove = (side: SideID) =>
    unordered.UnorderedDeadline.create(`${side} move disable`, disableMoveImpl,
        effectDidntHappen, side);

async function disableMoveImpl(ctx: BattleParserContext<"gen4">,
    accept: unordered.AcceptCallback, side: SideID): Promise<void>
{
    const event = await tryVerify(ctx, "|-start|");
    if (!event) return;
    if (event.kwArgs.from) return;
    const [, identStr, effectStr] = event.args;
    const ident = Protocol.parsePokemonIdent(identStr);
    if (ident.player !== side) return;
    const effect = Protocol.parseEffect(effectStr, toIdName);
    if (effect.name !== "disable") return;

    accept();
    await base["|-start|"](ctx);
}

//#endregion

//#region untracked effects

async function otherEffectsFilter(ctx: BattleParserContext<"gen4">):
    Promise<void>
{
    // unsupported team effects and item-removal effects
    const event = await tryVerify(ctx, "|-sideend|", "|-enditem|");
    if (!event) return;
    if (event.args[0] === "-sideend")
    {
        // team effect
        const [, , effectStr] = event.args;
        const effect = Protocol.parseEffect(effectStr, toIdName);
        switch (effect.name)
        {
            // TODO: support rapidspin
            case "spikes": case "stealthrock": case "toxicspikes":
            // TODO: support brickbreak
            case "lightscreen": case "reflect":
                break;
            default: return;
        }
        await base["|-sideend|"](ctx);
        return;
    }
    // item-removal effect
    const e = event as Event<"|-enditem|">;
    const [, , itemStr] = e.args;
    const itemId = toIdName(itemStr);
    const from = Protocol.parseEffect(e.kwArgs.from, toIdName);
    // ignore micleberry eat event but handle non-eat (effect) event for it
    // TODO: support micleberry effect
    if (itemId === "micleberry")
    {
        if (e.kwArgs.eat) return;
    }
    // TODO: support bugbite, knockoff, etc
    else if (from.name !== "stealeat" &&
        !dex.itemRemovalMoves.includes(from.name))
    {
        return;
    }
    await base["|-enditem|"](ctx);
}

//#endregion

//#endregion

//#region implicit effects

function implicitEffects(ctx: BattleParserContext<"gen4">, args: ExecuteArgs):
    void
{
    // infer naturalgift move effect
    if (args.move.data.name === "naturalgift")
    {
        naturalGift(args.user, /*failed*/ false);
    }

    const {implicit} = args.move.data;

    let lockedMove = false;
    const {lockedMove: lock} = args.user.volatile;
    switch (implicit?.status)
    {
        case "defensecurl": case "minimize": case "mustRecharge":
            args.user.volatile[implicit.status] = true;
            break;
        case "lockedMove":
            if (!dex.isLockedMove(args.move.data.name))
            {
                // istanbul ignore next: should never happen
                throw new Error(`Invalid locked move '${args.move.data.name}'`);
            }
            // continue locked status
            // already prevented from consuming pp in constructor
            if (lock.type === args.move.data.name) lock.tick();
            // start locked status
            else lock.start(args.move.data.name, !!args.called);
            lockedMove = true;
            break;
    }
    // if the locked move was called by an effect, then this current context is
    //  the one that called the move so we shouldn't reset it
    if (!lockedMove && (lock.turns !== 0 || !lock.called)) lock.reset();

    // TODO: add rollout to implicit status above
    const {rollout} = args.user.volatile;
    if (dex.isRolloutMove(args.move.data.name))
    {
        // TODO: add rollout moves to ImplicitStatusEffect
        // start/continue rollout status
        // already prevented from consuming pp in constructor if continuing
        if (rollout.type === args.move.data.name) rollout.tick();
        else rollout.start(args.move.data.name, !!args.called);
    }
    // must've missed the status ending
    // if the rollout move was called, then this current context is the one that
    //  called the move so we shouldn't reset it
    else if (rollout.turns !== 0 || !rollout.called) rollout.reset();

    // team effects

    const team = ctx.state.getTeam(args.side);
    switch (implicit?.team)
    {
        case "healingwish": case "lunardance":
            team.status[implicit.team] = true;
            break;
        // wish can be used consecutively, but only the first use counts
        case "wish":
            team.status.wish.start(/*restart*/false);
            break;
    }
}

//#endregion

//#region faint event handlers

async function faints(ctx: BattleParserContext<"gen4">, args: ExecuteArgs):
    Promise<void>
{
    const candidates = new Set<SideID>();
    for (const [monRef, flags] of args.targets.mentioned)
    {
        if (flags.damaged !== "ko") continue;
        candidates.add(monRef);
    }
    const selfFaint = args.move.data.effects?.selfFaint;
    if (args.user.fainted || selfFaint === "always" ||
        (selfFaint === "ifHit" && args.miss !== true))
    {
        candidates.add(args.side);
    }
    await expectFaints(ctx, candidates);
}

//#endregion

//#region final move effects

async function finalEffects(ctx: BattleParserContext<"gen4">,
    args: ExecuteArgs): Promise<MoveActionResult>
{
    // TODO: item-transfer moves
    await recoil(ctx, args);
    await postDamage(ctx, args);
    await transform(ctx, args);
    const res = await selfSwitch(ctx, args);
    await moveCall(ctx, args);
    return res;
}

//#region recoil effect

async function recoil(ctx: BattleParserContext<"gen4">, args: ExecuteArgs):
    Promise<void>
{
    const data = args.move.data.effects?.recoil;
    if (!data) return;
    const damageResult = await effectDamage.percentDamage(ctx, args.side, -1,
        event =>
        {
            const from = Protocol.parseEffect(event.kwArgs.from, toIdName);
            return from.name === "recoil";
        });
    if (damageResult !== "silent" && !data.struggle)
    {
        inferRecoil(args, /*consumed*/ !!damageResult);
    }
    if (damageResult === true)
    {
        // berries can activate directly after receiving recoil damage, and/or
        //  just faint instead
        if (args.user.fainted) await expectFaints(ctx, new Set([args.side]));
        else await unordered.parse(ctx, effectItem.onUpdate(ctx, args.side));
    }
}

/**
 * Makes an inference based on whether the recoil effect was consumed or
 * ignored.
 */
function inferRecoil(args: ExecuteArgs, consumed: boolean): void
{
    if (args.user.volatile.suppressAbility)
    {
        if (!consumed)
        {
            throw new Error(`Move ${args.move.data.name} user '${args.side}' ` +
                "suppressed recoil through an ability but ability is " +
                "suppressed");
        }
        // can't make any meaningful inferences here
    }
    else
    {
        // get possible recoil-canceling abilities
        const userAbility = args.user.traits.ability;
        const noRecoilAbilities = [...userAbility.possibleValues]
            .filter(n => userAbility.map[n].flags?.noIndirectDamage);
        // can't have recoil-canceling abilities
        if (consumed)
        {
            if (noRecoilAbilities.length === userAbility.size)
            {
                throw new Error(`Move ${args.move.data.name} user ` +
                    `'${args.side}' must have a recoil-canceling ability ` +
                    `[${noRecoilAbilities.join(", ")}] but recoil still ` +
                    "happened");
            }
            userAbility.remove(noRecoilAbilities);
        }
        // must have a recoil-canceling ability
        else if (noRecoilAbilities.length <= 0)
        {
            throw new Error(`Move ${args.move.data.name} user '${args.side}' ` +
                `ability [${[...userAbility.possibleValues].join(", ")}] ` +
                "can't suppress recoil but it still suppressed recoil");
        }
        else userAbility.narrow(noRecoilAbilities);
    }
}

//#endregion

//#region item on-movePostDamage effect

async function postDamage(ctx: BattleParserContext<"gen4">, args: ExecuteArgs):
    Promise<void>
{
    // lifeorb
    if (!args.move.dealsBPDamage) return;
    if (![...args.targets.mentioned.values()].some(f => f.damaged)) return;
    if (args.user.fainted) return;

    await unordered.parse(ctx, effectItem.onMovePostDamage(ctx, args.side));
    if (args.user.fainted) await expectFaints(ctx, new Set([args.side]));
}

//#endregion

//#region transform effect

async function transform(ctx: BattleParserContext<"gen4">, args: ExecuteArgs):
    Promise<void>
{
    if (args.user.fainted) return;
    if (!args.move.data.effects?.transform) return;

    const event = await verify(ctx, "|-transform|");
    const [, sourceStr, targetStr] = event.args;
    const source = Protocol.parsePokemonIdent(sourceStr);
    if (source.player !== args.side)
    {
        throw new Error("Transform effect failed: " +
            `Expected source '${args.side}' but got '${source.player}'`);
    }
    const target = Protocol.parsePokemonIdent(targetStr);
    if (!addTarget(ctx, {...args, side: target.player}))
    {
        throw new Error("Transform effect failed");
    }
    return await base["|-transform|"](ctx);
}

//#endregion

//#region self-switch effect

async function selfSwitch(ctx: BattleParserContext<"gen4">, args: ExecuteArgs):
    Promise<MoveActionResult>
{
    const effect = args.move.data.effects?.selfSwitch;
    if (!effect) return {};
    const team = ctx.state.getTeam(args.side);
    // no one left to switch into
    if (team.pokemon.every((mon, i) => i === 0 || mon?.fainted)) return {};

    // gen4: self-faint self-switch moves (e.g. healingwish) send out the
    //  replacement immediately rather than waiting until the end of the turn
    if (args.user.fainted && !args.move.data.effects?.selfFaint) return {};

    team.status.selfSwitch = effect;

    // view last |request| event
    // see BattleHandler#halt()
    const event = await tryVerify(ctx, "|request|", "|win|", "|tie|");
    if (!event) return effectDidntHappen(`move self-switch ${effect}`);
    // if a self-switch move wins the game before switching, the game ends
    //  immediately while ignoring the self-switch effect
    if (event.args[0] !== "request") return {};
    const [, reqStr] = event.args;
    const req = Protocol.parseRequest(reqStr);
    const expectedType: Protocol.Request["requestType"] =
        ctx.state.ourSide === args.side ? "switch" : "wait";
    if (req.requestType !== expectedType)
    {
        throw new Error(`SelfSwitch effect '${effect}' failed: ` +
            `Expected |request| type '${expectedType}' but got ` +
            `'${req.requestType}'`);
    }

    // make sure all information is up to date before possibly
    //  requesting a decision
    if (!args.called && !args.user.volatile.stalling)
    {
        args.user.volatile.stall(false);
    }

    // make the decision
    await base["|request|"](ctx);

    // TODO: communicate self-switch/healingwish effects to the function we're
    //  calling
    let sres: actionSwitch.SwitchActionResult;
    if (!(sres = await actionSwitch.selfSwitch(ctx, args.side)))
    {
        return effectDidntHappen(`move self-switch ${effect}`);
    }
    // communicate action consumption in case of pursuit interactions
    const mres: MoveActionResult = {};
    for (const side in sres.actioned ?? {})
    {
        if (!sres.actioned!.hasOwnProperty(side)) continue;
        // exclude move user since moveAction() caller already includes it
        if (side === args.side) continue;
        (mres.actioned ??= {})[side as SideID] = true;
    }
    return mres;
}

//#endregion

//#region move-call effect

async function moveCall(ctx: BattleParserContext<"gen4">, args: ExecuteArgs):
    Promise<void>
{
    const call = args.move.data.effects?.call;
    if (!call) return;

    // can't do anything if fainted
    if (args.user.fainted) return;

    const event = await tryVerify(ctx, "|move|");
    if (!event) return effectDidntHappen(`move call ${call}`);
    const [, userStr, moveName] = event.args;
    const user = Protocol.parsePokemonIdent(userStr);
    if (user.player !== args.side)
    {
        throw new Error(`Call effect '${call}' failed: ` +
            `Expected '${args.side}' but got '${user.player}'`);
    }
    const moveId = toIdName(moveName);

    switch (call)
    {
        case true: break; // nondeterministic call
        case "copycat":
            if (args.lastMove !== moveId)
            {
                throw new Error("Call effect 'copycat' failed: " +
                    `Should've called '${args.lastMove}' but got ` +
                    `'${moveId}'`);
            }
            if (dex.moves[args.lastMove].flags?.noCopycat)
            {
                throw new Error("Call effect 'copycat' failed: " +
                    `Can't call move '${args.lastMove}' with flag ` +
                    "noCopycat=true");
            }
            break;
        case "mirror":
            if (args.user.volatile.mirrormove !== moveId)
            {
                throw new Error("Call effect 'mirror' failed: Should've " +
                    `called '${args.user.volatile.mirrormove}' but got ` +
                    `'${moveId}'`);
            }
            break;
        case "self":
            // calling a move that is part of the user's moveset
            if (!addTarget(ctx, args))
            {
                throw new Error("Call effect 'self' failed");
            }
            args.user.moveset.reveal(moveId);
            break;
        case "target":
        {
            // TODO: track actual target
            const otherSide = args.side === "p1" ? "p2" : "p1";
            if (!addTarget(ctx, {...args, side: otherSide}))
            {
                throw new Error("Call effect 'target' failed");
            }
            ctx.state.getTeam(otherSide).active.moveset.reveal(moveId);
            break;
        }
        default:
            // regular string specifies the move that should be
            //  called
            // TODO: what if copycat is supposed to be called rather
            //  than the copycat effect?
            if (moveId !== call)
            {
                throw new Error(`Call effect '${call}' failed`);
            }
    }

    await base["|move|"](ctx);
}

//#endregion

//#endregion

//#endregion

//#region event parsing helpers

/**
 * Expects a set of faint messages.
 * @param candidates Pokemon references that should faint. These are removed
 * from the Set whenever this function handles a `|faint|` event.
 */
async function expectFaints(ctx: BattleParserContext<"gen4">,
    candidates: Set<SideID>): Promise<void>
{
    if (candidates.size <= 0) return;
    await eventLoop(ctx, async function faintLoop(_ctx)
    {
        const event = await tryVerify(_ctx, "|faint|");
        if (!event) return;
        const [, identStr] = event.args;
        const ident = Protocol.parsePokemonIdent(identStr);
        if (!candidates.delete(ident.player)) return;
        await base["|faint|"](_ctx);
        return {};
    });
    if (candidates.size > 0)
    {
        throw new Error(`Pokemon [${[...candidates].join(", ")}] haven't ` +
            "fainted yet");
    }
}

//#endregion

//#region inference helpers

/** Handles the implications of the Natural Gift move succeeding or failing. */
function naturalGift(user: Pokemon, failed: boolean): void
{
    // naturalgift only succeeds if the user has a berry, and implicitly
    //  consumes it
    if (!failed)
    {
        // TODO: narrow further based on perceived power and type
        user.item.narrow(Object.keys(dex.berries));
        user.removeItem(/*consumed*/ true);
    }
    // fails if the user doesn't have a berry
    // TODO: also check for klutz/embargo blocking the berry from being used
    else user.item.remove(Object.keys(dex.berries));
}

/** Handles the implications of an Imprison effect succeeding or failing. */
function imprison(ctx: BattleParserContext<"gen4">, failed: boolean): void
{
    // assume client's side is fully known, while opponent is unknown
    // TODO: what if both are known/unknown?
    if (!ctx.state.ourSide) return;
    const us = ctx.state.getTeam(ctx.state.ourSide).active.moveset;
    const usMoves = [...us.moves.keys()];
    const oppSide = ctx.state.ourSide === "p1" ? "p2" : "p1";
    const them = ctx.state.getTeam(oppSide).active.moveset;

    if (failed)
    {
        // imprison failed, which means both active pokemon don't have each
        //  other's moves
        // infer that the opponent doesn't have any of our moves

        // sanity check: opponent should not already have one of our moves
        const commonMoves = usMoves.filter(
            name => them.moves.has(name));
        if (commonMoves.length > 0)
        {
            throw new Error("Imprison failed but both Pokemon have " +
                `common moves: ${commonMoves.join(", ")}`);
        }

        // remove our moves from their move possibilities
        them.inferDoesntHave(usMoves);
    }
    else
    {
        // imprison succeeded, which means both active pokemon have at least one
        //  common move
        // infer that one of our moves has to be contained by the opponent's
        //  moveset

        // sanity check: opponent should have or be able to have at least one of
        //  our moves
        if (usMoves.every(name =>
            !them.moves.has(name) && !them.constraint.has(name)))
        {
            throw new Error("Imprison succeeded but both Pokemon " +
                "cannot share any moves");
        }

        them.addMoveSlotConstraint(usMoves);
    }
}

/**
 * Handles type effectiveness assertions, even for status moves. Not implemented
 * for now.
 */
function handleTypeEffectiveness(user: Pokemon, move: dex.Move, target: Pokemon,
    effectiveness: dex.Effectiveness): void
{
    // TODO: need to be able to handle all corner cases first, specifically
    //  things like type-changing moves and abilities (e.g. normalize)
    // TODO(doubles): do this for each defender
    void user, move, target, effectiveness;
}

//#endregion

//#region target helpers

/** State of a move's pending targets. */
interface PendingTargets
{
    /** Targets that should be hit by the move. */
    pending: {[T in SideID]?: true};
    /** Total number of pending targets. */
    total: number;
    /**
     * Target-refs currently mentioned by listening to events. Lays groundwork
     * for future double/triple battle support.
     */
    readonly mentioned: Map<SideID, TargetFlags>;
}

interface TargetFlags
{
    /**
     * Whether the target was damaged directly or KO'd, or had its damage
     * suppressed by Substitute.
     */
    damaged?: true | "ko" | "substitute";
    /** Whether the target applied Pressure. */
    pressured?: true;
}

/** Options for {@link addTarget}. */
interface TargetOptions
{
    /** Move user. */
    readonly user: Pokemon;
    /** Move being used. */
    readonly move: dex.Move;
    /** User's move slot if applicable. */
    readonly moveSlot?: Move;
    /** Target ref. */
    readonly side: SideID;
    /** Currently pending targets state. */
    readonly targets: PendingTargets,
    /** Whether the move can be mirrored via Mirror Move. */
    readonly mirror: boolean;
    /**
     * Whether the target was damaged directly (`true`), KO'd (`"ko"`), or had
     * its damage suppressed by Substitute (`"substitute"`). Otherwise
     * `false`/`undefined` if the target was just mentioned/inferred normally.
     */
    readonly damaged?: "ko" | boolean | "substitute";
}

/**
 * Indicates that the BattleEvents mentioned a target for the current move.
 * @returns False on error, true otherwise.
 */
function addTarget(ctx: BattleParserContext<"gen4">,
    {user, move, moveSlot, side, targets, mirror, damaged}: TargetOptions):
    boolean
{
    let flags = targets.mentioned.get(side);
    // already mentioned target earlier
    if (flags)
    {
        // update damaged status if higher precedence (ko > true > sub > false)
        if (damaged === "ko" ||
            (damaged === true && flags.damaged !== "ko") ||
            (damaged === "substitute" && !flags.damaged))
        {
            flags.damaged = damaged;
        }
    }
    else
    {
        // assertions about the move target
        if (!targets.pending[side])
        {
            ctx.logger.error(`Mentioned target '${side}' but the ` +
                `current move '${move.data.name}' can't target it`);
            return false;
        }
        if (targets.mentioned.size >= targets.total)
        {
            ctx.logger.error("Can't add more targets. Already " +
                `mentioned ${targets.mentioned.size} ` +
                (targets.mentioned.size > 0 ?
                    `('${[...targets.mentioned].join("', '")}') ` : "") +
                `but trying to add ${side}.`);
            return false;
        }

        targets.mentioned.set(side, flags = {...(!!damaged && {damaged})});
    }

    // TODO: make it so that fainting prior to the move should cause active to
    //  be null so this check won't be as complicated
    const target = ctx.state.getTeam(side).active;
    if (flags.damaged && flags.damaged !== "substitute")
    {
        target.volatile.damaged = true;
    }
    if (user !== target && (!target.fainted || flags.damaged === "ko"))
    {
        // update opponent's mirror move tracker
        if (mirror) target.volatile.mirrormove = move.data.name;

        // deduct an extra pp if the target has pressure
        // TODO(gen>=5): don't count allies
        if (!flags.pressured && moveSlot &&
            !target.volatile.suppressAbility && target.ability === "pressure" &&
            // only ability that can cancel pressure
            // TODO: use ignoreTargetAbility flag
            user.ability !== "moldbreaker")
        {
            moveSlot.pp -= 1;
            flags.pressured = true;
        }

        if (target.volatile.substitute && !move.data.flags?.ignoreSub &&
            flags.damaged && flags.damaged !== "substitute")
        {
            throw new Error("Move should've been blocked by target's " +
                "Substitute");
        }
    }

    return true;
}

//#endregion

//#region other helpers

function effectDidntHappen(name: string): never
{
    throw new Error("Expected effect that didn't happen: " + name);
}

//#endregion

//#endregion