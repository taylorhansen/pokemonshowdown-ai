import * as dex from "../../dex/dex";
import * as dexutil from "../../dex/dex-util";
import { canBlockStatus, Effectiveness, getAttackerTypes, getTypeEffectiveness }
    from "../../dex/typechart";
import { Move } from "../../state/Move";
import { Pokemon } from "../../state/Pokemon";
import { otherSide, Side } from "../../state/Side";
import * as events from "../BattleEvent";
import { ParserState, SubParser, SubParserResult } from "../BattleParser";
import { eventLoop } from "../helpers";
import * as ability from "./activateAbility";
import * as item from "./activateItem";
import { handlers as base } from "./base";
import * as parsers from "./parsers";
import * as consumeItem from "./removeItem";
import { expectSwitch } from "./switchIn";

/**
 * Handles events within the context of a move being used. Returns the
 * last event that it didn't handle.
 * @param called Whether this move was called by another move, or reflected
 * (`"bounced"`) via another effect. Default false.
 * @param lastEvent Next event after the useMove event, if it was taken.
 */
export async function* useMove(pstate: ParserState,
    event: events.UseMove, called: boolean | "bounced" = false,
    lastEvent?: events.Any): SubParser
{
    // setup context
    const ctx = initCtx(pstate, event, called);
    preMoveAssertions(ctx);
    inferTargets(ctx);

    // look for move interruptions
    const tryResult = yield* tryExecute(ctx, lastEvent);
    if (tryResult.fail === "fail")
    {
        return {...tryResult.event && {event: tryResult.event}};
    }
    lastEvent = tryResult.event;

    // execute move effects
    const execResult = yield* execute(ctx, tryResult.fail === "miss",
        lastEvent);

    // clean up flags and return
    preHaltIgnoredEffects(ctx);
    return execResult;
}

/** Extended parser state for move context. */
interface MoveContext
{
    /** Base ParserState. */
    readonly pstate: ParserState;
    /** Original UseMove event. */
    readonly event: events.UseMove;
    /**
     * Whether this move was called by another move, or reflected (`"bounced"`)
     * via another effect.
     */
    readonly called: boolean | "bounced";

    // event data
    /** Reference to find the user within the BattleState. */
    readonly userRef: Side;
    /** Name of the move. */
    readonly moveName: string;
    /** User of the move. */
    readonly user: Pokemon;
    /** Dex data for the move. */
    readonly move: dex.Move;
    /** Move object if this event came directly from the user's moveset. */
    readonly moveState?: Move;
    // TODO: expand for doubles/triples
    /** Maps mon-ref to whether the move may hit them. */
    readonly pendingTargets: {readonly [TMonRef in Side]: boolean};
    /**
     * Total number of expected targets. If `#pendingTargets` allows for more
     * than this number, only the first `totalTargets` mentioned targets will be
     * counted.
     */
    readonly totalTargets: number;

    // move expectations
    /** Whether all implicit effects should have been handled by now. */
    implicitHandled: boolean;
    /** Whether all silently ignored effects should have been handled by now. */
    ignoredHandled: boolean;
    /** Whether this move should be recorded by its targets for Mirror Move. */
    readonly mirror: boolean;
    /** Last move before this one. */
    readonly lastMove?: string;
    /** Whether this is a two-turn move on its second turn. */
    readonly releasedTwoTurn?: true;

    // in-progress move result flags
    /**
     * Target-refs currently mentioned by listening to events. Lays groundwork
     * for future double/triple battle support.
     */
    readonly mentionedTargets: Map<Side, TargetFlags>;
    /**
     * If defined, the current move has been bounced by the given Pokemon
     * reference so a call effect should be expected immediately after this is
     * set.
     */
    bouncing?: Side;
    /** Whether the move failed on its own or just missed its targets. */
    failed?: true | "miss";
    // TODO(doubles): index by opponent as well
    /** Status effects being blocked for the target. */
    blockStatus?: {readonly [T in dexutil.StatusType]?: true};
}

interface TargetFlags
{
    /** Whether the target was damaged directly or KO'd. */
    damaged?: true | "ko";
    /** Whether the target applied Pressure. */
    pressured?: true;
}

/** Initializes move context state. */
function initCtx(pstate: ParserState, event: events.UseMove,
    called: boolean | "bounced"): MoveContext
{
    // TODO: should there be so many exceptions? replace these with error logs
    //  and provide a recovery path if not testing
    const moveName = event.move;
    const move = dex.getMove(moveName);
    if (!move) throw new Error(`Unknown move '${moveName}'`);

    // set last move
    const lastMove = pstate.state.status.lastMove;
    pstate.state.status.lastMove = event.move;

    // other trivial event data
    const userRef = event.monRef;
    const user = pstate.state.teams[userRef].active;

    // find out which pokemon should be targeted by the move
    let pendingTargets: {readonly [TMonRef in Side]: boolean};
    let totalTargets: number;
    switch (move.getTarget(user))
    {
        // TODO: support non-single battles
        case "adjacentAlly":
            // these moves should always fail in singles
            pendingTargets = {us: false, them: false};
            totalTargets = 0;
            break;
        case "adjacentAllyOrSelf": case "allies": case "allySide":
        case "allyTeam": case "self":
            pendingTargets =
                framePendingTargets(userRef, {us: true, them: false});
            totalTargets = 1;
            break;
        case "all":
            pendingTargets =
                framePendingTargets(userRef, {us: true, them: true});
            totalTargets = 2;
            break;
        case "adjacentFoe": case "allAdjacent": case "allAdjacentFoes":
        case "any": case "foeSide": case "normal": case "randomNormal":
        case "scripted":
            pendingTargets =
                framePendingTargets(userRef, {us: false, them: true});
            totalTargets = 1;
            break;
    }

    // release two-turn move
    let releasedTwoTurn = false;
    if (user.volatile.twoTurn.type === moveName)
    {
        user.volatile.twoTurn.reset();
        if (move.data.effects?.delay?.type !== "twoTurn")
        {
            // istanbul ignore next: should never happen
            throw new Error(`Two-turn move '${moveName}' does not have ` +
                "delay=twoTurn");
        }
        releasedTwoTurn = true;
    }

    const continueLock = user.volatile.lockedMove.type === moveName;
    const continueRollout = user.volatile.rollout.type === moveName;

    const mirror =
        // expected to be a charging turn, can't mirror those
        (move.data.effects?.delay?.type !== "twoTurn" || releasedTwoTurn) &&
        // can't mirror called moves
        !called &&
        // can't mirror called rampage moves
        (!continueLock || !user.volatile.lockedMove.called) &&
        (!continueRollout || !user.volatile.rollout.called) &&
        // default to mirror move flag
        // TODO: should called+released two-turn count? (unique to PS?)
        !move.data.flags?.noMirror;

    // setup result object
    const result: MoveContext =
    {
        pstate, event, called, userRef, moveName, user, move, pendingTargets,
        totalTargets, implicitHandled: false, ignoredHandled: false, mirror,
        ...lastMove && {lastMove}, ...releasedTwoTurn && {releasedTwoTurn},
        mentionedTargets: new Map()
    };

    // only reveal and deduct pp if this event isn't continuing a multi-turn
    //  move
    const reveal = !releasedTwoTurn && !continueLock && !continueRollout;

    // if this isn't a called move, then the user must have this move in its
    //  moveset (i.e., it's an actual move selection by the player)
    if (called) return result;

    // every move decision resets any single-move statuses
    user.volatile.resetSingleMove();

    // set last move if directly selecting from moveset/struggle
    if (!reveal) return result;
    user.volatile.lastMove = moveName;

    // only struggle can be selected without being a part of the moveset
    if (moveName === "struggle") return result;

    // record the move object in case further deductions need to be made
    const revealedMove = user.moveset.reveal(moveName);
    --revealedMove.pp;

    // activate choice item lock
    // TODO: how to infer choice lock when the item is revealed?
    // TODO: what if the item is removed after setting choice lock?
    if (user.item.definiteValue &&
        user.item.map[user.item.definiteValue].isChoice)
    {
        user.volatile.choiceLock = moveName;
    }

    // taunt assertion
    if (revealedMove.data.category === "status" &&
        user.volatile.taunt.isActive)
    {
        throw new Error(`Using status move '${moveName}' but should've been ` +
            "Taunted");
    }

    return {...result, moveState: revealedMove};
}

/** Converts a user(us)/target(them) map to an actual monRef us/them map. */
function framePendingTargets(userRef: Side,
    obj: {readonly [TRelMonRef in Side]: boolean}):
    {readonly [TMonRef in Side]: boolean}
{
    if (userRef === "us") return obj;
    return {them: obj.us, us: obj.them};
}

/** Assertions surrounding the selection of a move. */
function preMoveAssertions(ctx: MoveContext): void
{
    if (ctx.move.data.flags?.focus && !ctx.user.volatile.focus &&
        !ctx.user.volatile.encore.ts.isActive && !ctx.called)
    {
        ctx.pstate.logger.error("User has focus=false yet focus move being " +
            "used");
    }
}

/** Result of `tryExecute()`. */
interface TryExecuteResult extends SubParserResult
{
    /** Whether the move failed on its own or missed/was blocked. */
    fail?: "fail" | "miss";
}

/**
 * Checks if the move can be executed normally. Result has `#success=true` if it
 * can.
 */
async function* tryExecute(ctx: MoveContext, lastEvent?: events.Any):
    SubParser<TryExecuteResult>
{
    // see if the move failed on its own
    const failResult = yield* checkFail(ctx, lastEvent);
    // TODO: separate implicit effects
    if (failResult.success)
    {
        return {...failResult.event && {event: failResult.event}, fail: "fail"};
    }
    lastEvent = failResult.event;

    // check for delayed move
    const delayResult = yield* checkDelay(ctx, lastEvent);
    if (delayResult.ret === true)
    {
        // set fail marker here so the caller short-circuits
        return {
            ...delayResult.event && {event: delayResult.event}, fail: "fail"
        };
    }
    if (delayResult.ret) return {...yield* delayResult.ret, fail: "fail"};
    lastEvent = delayResult.event;

    // accuracy calculations start here, consume micleberry status
    // TODO(later): accuracy calcs and probablistic inductions
    ctx.user.volatile.micleberry = false;

    // check for other effects/abilities blocking this move
    // TODO(doubles): allow move to execute with fewer targets if only one of
    //  them blocks it
    const blockResult = yield* checkBlock(ctx, lastEvent);
    if (blockResult.success)
    {
        return {
            ...blockResult.event && {event: blockResult.event}, fail: "miss"
        };
    }
    lastEvent = blockResult.event;

    // all checks passed
    return {...lastEvent && {event: lastEvent}};
}

/** Checks if the move failed on its own. */
async function* checkFail(ctx: MoveContext, lastEvent?: events.Any):
    SubParser<parsers.SuccessResult>
{
    let success: boolean | undefined;
    const result = yield* eventLoop(async function* checkFailLoop(event)
    {
        switch (event.type)
        {
            case "fail":
                // move couldn't be used
                // TODO: assertions on why the move could fail?
                success = true;
                handleFail(ctx);
                return yield* base.fail(ctx.pstate, event);
            case "noTarget":
                // no opponent to target
                if (!ctx.pstate.state.teams[otherSide(ctx.userRef)].active
                    .fainted)
                {
                    break;
                }
                success = true;
                handleNoTarget(ctx);
                return yield* base.noTarget(ctx.pstate, event);
        }
        return {event};
    }, lastEvent);

    // fail assertions
    if (success)
    {
        if (ctx.move.data.flags?.focus && !ctx.user.volatile.damaged)
        {
            ctx.pstate.logger.error("User has damaged=false yet focus move " +
                "failed");
        }
    }
    else
    {
        if (ctx.move.data.flags?.focus && ctx.user.volatile.damaged)
        {
            ctx.pstate.logger.error("User has damaged=true yet focus move " +
                "didn't fail");
        }
    }

    return {...result, ...success && {success}};
}

/** Result of `checkDelay()`. */
interface CheckDelayResult extends SubParserResult
{
    /**
     * Whether to short-circuit the move execution. If true it should stop
     * immediately, but if there's a SubParser (expected to be a tail call to
     * `useMove()` with the same original event) the original `useMove()` call
     * should `return yield*` this value.
     */
    ret?: true | SubParser;
}

/** Checks for a delayed move effect. */
async function* checkDelay(ctx: MoveContext, lastEvent?: events.Any):
    SubParser<CheckDelayResult>
{
    if (!ctx.move.data.effects?.delay)
    {
        return {...lastEvent && {event: lastEvent}};
    }
    const delayResult = yield* expectDelay(ctx, lastEvent);
    lastEvent = delayResult.event;
    if (delayResult.success === "shorten")
    {
        // execute event again to handle shortened release turn
        // by creating a new MoveContext in this call, it'll no longer think
        //  it's in the charging turn so certain obscure effects are still
        //  handled properly (e.g. mirrormove tracking on release turn)
        return {
            ret: useMove(ctx.pstate, ctx.event, /*called*/ false, lastEvent)
        };
    }
    if (delayResult.success)
    {
        preHaltIgnoredEffects(ctx);
        return {...lastEvent && {event: lastEvent}, ret: true};
    }
    return {...lastEvent && {event: lastEvent}};
}

// TODO(doubles): handle multiple targets
/**
 * Checks for and acts upon any pre-hit blocking effects and abilities. Result
 * has `#success=true` if the move was blocked.
 */
async function* checkBlock(ctx: MoveContext, lastEvent?: events.Any):
    SubParser<parsers.SuccessResult>
{
    // check for a block event due to an effect
    lastEvent ??= yield;
    if (lastEvent.type === "block" && lastEvent.effect !== "substitute" &&
        addTarget(ctx, lastEvent.monRef))
    {
        if (lastEvent.effect === "magicCoat")
        {
            const mon = ctx.pstate.state.teams[lastEvent.monRef].active;
            // verify magiccoat and reflectable flags
            if (!mon.volatile.magicCoat || ctx.called === "bounced" ||
                !ctx.move.data.flags?.reflectable)
            {
                return {event: lastEvent};
            }
            handleBlock(ctx);
            const blockResult = yield* base.block(ctx.pstate, lastEvent);
            return {
                ...yield* expectCalledMove(ctx, lastEvent.monRef,
                    ctx.moveName, /*bounced*/ true, blockResult.event),
                success: true
            };
        }
        // normal block event (safeguard, protect, etc)
        // this may also include endure due to weird PS event ordering
        if (lastEvent.effect !== "endure")
        {
            handleBlock(ctx);
            return {...yield* base.block(ctx.pstate, lastEvent), success: true};
        }
        lastEvent = (yield* base.block(ctx.pstate, lastEvent)).event;
    }
    else if (lastEvent.type === "miss" && addTarget(ctx, lastEvent.monRef))
    {
        handleBlock(ctx);
        return {...yield* base.miss(ctx.pstate, lastEvent), success: true};
    }
    else if (lastEvent.type === "immune" && addTarget(ctx, lastEvent.monRef))
    {
        handleBlock(ctx);
        handleTypeEffectiveness(ctx, "immune");
        return {...yield* base.immune(ctx.pstate, lastEvent), success: true};
    }

    // check for a blocking ability
    // TODO(doubles): multiple eligible targets
    let success: boolean | undefined;
    const targetRef = otherSide(ctx.userRef);
    if (!ctx.failed && !ctx.pendingTargets[ctx.userRef] &&
        ctx.totalTargets > 0 && addTarget(ctx, targetRef))
    {
        // ability blocking
        // TODO: precedence with regard to type resist berries, and others?
        const expectResult = yield* ability.onBlock(ctx.pstate,
            {[targetRef]: true}, ctx, lastEvent);
        for (const abilityResult of expectResult.results)
        {
            // handle block results
            // TODO: if wonderguard, assert type effectiveness
            success ||= abilityResult.immune || abilityResult.failed;
            // in the event that success=false, block parts of the move that the
            //  ability takes issue with
            ctx.blockStatus =
                {...ctx.blockStatus, ...abilityResult.blockStatus};
        }
        if (success) handleBlock(ctx);
        lastEvent = expectResult.event;
    }
    return {...lastEvent && {event: lastEvent}, ...success && {success: true}};
}

/**
 * Dispatches move effects and hits.
 * @param miss Whether the move missed on the first accuracy check, which can
 * affect certain moves.
 */
async function* execute(ctx: MoveContext, miss?: boolean,
    lastEvent?: events.Any): SubParser
{
    // TODO: add helpers for composing SubParsers?
    if (!miss)
    {
        lastEvent = (yield* hitLoop(ctx, lastEvent)).event;
        lastEvent = (yield* otherEffects(ctx, lastEvent)).event;
        handleImplicitEffects(ctx);
    }
    lastEvent = (yield* handleFaint(ctx, miss, lastEvent)).event;
    if (!miss) lastEvent = (yield* handleFinalEffects(ctx, lastEvent)).event;
    return {...lastEvent && {event: lastEvent}};
}

/** Handles the possibly multiple hits from a move. */
async function* hitLoop(ctx: MoveContext, lastEvent?: events.Any): SubParser
{
    const maxHits = ctx.move.data.multihit?.[1] ?? 1;
    let multihitEnded: boolean | undefined; // presence of hitcount event
    for (let i = 0; i < maxHits; ++i)
    {
        if (ctx.move.data.category !== "status")
        {
            const preHitResult = yield* preHit(ctx, lastEvent);
            const hitResult = yield* hit(ctx, preHitResult.event);
            if (preHitResult.resistSuper && hitResult.effectiveness !== "super")
            {
                throw new Error("Move effectiveness expected to be 'super' " +
                    `but got '${hitResult.effectiveness}'`);
            }
            handleTypeEffectiveness(ctx, hitResult.effectiveness);
            lastEvent = hitResult.event;
        }

        const postHitResult = yield* postHit(ctx, lastEvent);
        lastEvent = postHitResult.event;

        // check for hitcount event to terminate hit loop
        const hitCountResult = yield* checkHitCount(ctx, i + 1, lastEvent);
        lastEvent = hitCountResult.event;
        if (hitCountResult.success)
        {
            multihitEnded = true;
            break;
        }
    }
    if (ctx.move.data.multihit && !multihitEnded)
    {
        throw new Error("Expected HitCount event to terminate multi-hit move");
    }
    return {...lastEvent && {event: lastEvent}};
}

/**
 * Checks for a `HitCount` event.
 * @param hits Current number of hits.
 */
async function* checkHitCount(ctx: MoveContext, hits: number,
    lastEvent?: events.Any): SubParser<parsers.SuccessResult>
{
    const event = lastEvent ?? (yield);
    if (event.type === "hitCount")
    {
        if (hits !== event.count || !addTarget(ctx, event.monRef))
        {
            throw new Error("Invalid HitCount event: expected " +
                `non-'${ctx.userRef}' ${hits} but got '${event.monRef}' ` +
                event.count);
        }
        return {success: true};
    }
    return {event};
}

/** Result of `preHit()`. */
interface PreHitResult extends SubParserResult
{
    /** Resist berry type. */
    resistSuper?: dexutil.Type;
}

/** Check for pre-hit modifier events. */
async function* preHit(ctx: MoveContext, lastEvent?: events.Any):
    SubParser<PreHitResult>
{
    // check for resist berry effect
    let resistSuper: dexutil.Type | undefined;
    const itemPreHitResult = yield* consumeItem.consumeOnPreHit(ctx.pstate,
        {[otherSide(ctx.userRef)]: true}, ctx, lastEvent);
    for (const result of itemPreHitResult.results)
    {
        resistSuper ||= result.resistSuper;
    }

    return {
        ...itemPreHitResult.event && {event: itemPreHitResult.event},
        ...resistSuper && {resistSuper}
    };
}

/** Result of `hit()`. */
interface HitResult extends SubParserResult
{
    /** Whether the damage was blocked by a Substitute. */
    substitute?: true;
    /** Type effectiveness of the move. */
    effectiveness: Effectiveness;
}

/** Handles move damage modifier events, e.g. crits and type effectiveness. */
async function* hit(ctx: MoveContext, lastEvent?: events.Any):
    SubParser<HitResult>
{
    let effectiveness: Effectiveness = "regular";
    let damaged: boolean | "substitute" | undefined;
    let crit: boolean | undefined;
    const result = yield* eventLoop(async function*(event)
    {
        switch (event.type)
        {
            // TODO: support multi-hit moves
            case "activateStatusEffect":
                // substitute could break after blocking
                if (event.effect !== "substitute" || event.start) break;
                if (ctx.userRef === event.monRef) break;
                if (damaged !== "substitute") break;
                if (!addTarget(ctx, event.monRef)) break;
                return yield* base.activateStatusEffect(ctx.pstate, event);
            case "block":
                if (event.effect !== "substitute") break;
                if (ctx.userRef === event.monRef) break;
                if (damaged) break;
                if (!addTarget(ctx, event.monRef)) break;
                if (ctx.move.data.flags?.ignoreSub)
                {
                    // istanbul ignore next: can't reproduce until gen5 with
                    //  damaging sub-ignoring moves
                    throw new Error("Substitute-ignoring move shouldn't have " +
                        "been blocked by Substitute");
                }
                damaged = "substitute";
                return yield* base.block(ctx.pstate, event);
            case "crit":
                if (ctx.userRef === event.monRef) break;
                if (crit) break;
                if (!addTarget(ctx, event.monRef)) break;
                crit = true;
                return yield* base.crit(ctx.pstate, event);
            case "resisted":
                if (ctx.userRef === event.monRef) break;
                if (effectiveness !== "regular") break;
                if (!addTarget(ctx, event.monRef)) break;
                effectiveness = "resist";
                return yield* base.resisted(ctx.pstate, event);
            case "superEffective":
                if (ctx.userRef === event.monRef) break;
                if (effectiveness !== "regular") break;
                if (!addTarget(ctx, event.monRef)) break;
                effectiveness = "super";
                return yield* base.superEffective(ctx.pstate, event);
            case "takeDamage":
                // main move damage
                if (event.from || ctx.userRef === event.monRef) break;
                if (damaged) break;
                if (!addTarget(ctx, event.monRef,
                    /*damaged*/ event.hp <= 0 ? "ko" : true))
                {
                    break;
                }
                damaged = true;
                return yield* base.takeDamage(ctx.pstate, event);
        }
        return {event};
    }, lastEvent);

    // TODO: include damage dealt for drain/recoil handling
    return {
        ...result, ...(damaged === "substitute" && {substitute: true}),
        effectiveness
    };
}

/** Handles move effects after the move officially hits. */
async function* postHit(ctx: MoveContext, lastEvent?: events.Any): SubParser
{
    const moveEffects = ctx.move.data.effects;
    if (moveEffects?.count)
    {
        // TODO: if perish, infer soundproof if the counter doesn't take
        //  place at the end of the turn
        const countResult = yield* parsers.countStatus(ctx.pstate,
            ctx.userRef, moveEffects.count, lastEvent);
        if (!countResult.success)
        {
            throw new Error("Expected effect that didn't happen: " +
                `countStatus ${moveEffects.count}`);
        }
        // TODO: permHalt check?
        lastEvent = countResult.event;
    }
    if (moveEffects?.damage?.type === "split")
    {
        lastEvent = (yield* handleSplitDamage(ctx, lastEvent)).event;
    }
    // TODO: some weird contradictory ordering when testing on PS is
    //  reflected here, should the PSEventHandler re-order them or should
    //  the dex make clearer distinguishments for these specific effects?
    // self-heal generally happens before status (e.g. roost)
    if (moveEffects?.damage?.type === "percent" &&
        moveEffects.damage.percent > 0)
    {
        lastEvent = (yield* handlePercentDamage(ctx, moveEffects?.damage,
            lastEvent)).event;
    }
    // charge message happens after boost so handle it earlier in this
    //  specific case
    if (moveEffects?.status?.self?.includes("charge"))
    {
        lastEvent = (yield* handleBoost(ctx, moveEffects?.boost, lastEvent))
            .event;
    }
    // move status effects
    lastEvent = (yield* handleStatus(ctx, moveEffects?.status, lastEvent))
        .event;
    // untracked statuses
    const statusLoopResult = yield* eventLoop(
        async function* statusLoop(event): SubParser
        {
            if (event.type !== "activateStatusEffect") return {event};

            let accept = false;
            switch (event.effect)
            {
                case "confusion": case "leechSeed":
                    // can be removed by a different move, but currently not
                    //  tracked yet (TODO)
                    accept = !event.start;
                    break;
                default:
                    if (dexutil.isMajorStatus(event.effect))
                    {
                        // TODO: also track curing moves
                        // for now, curing moves are ignored and silently
                        //  passed
                        accept = !event.start;
                    }
            }
            if (!accept) return {event};
            return yield* base.activateStatusEffect(ctx.pstate, event);
        },
        lastEvent);
    lastEvent = statusLoopResult.event;
    // self-damage generally happens after status effects (e.g. curse,
    //  substitute)
    if (moveEffects?.damage?.type === "percent" &&
        moveEffects.damage.percent < 0)
    {
        lastEvent = (yield* handlePercentDamage(ctx, moveEffects?.damage,
            lastEvent)).event;
    }
    // boost generally happens after damage effects (e.g. bellydrum)
    if (!moveEffects?.status?.self?.includes("charge"))
    {
        lastEvent = (yield* handleBoost(ctx, moveEffects?.boost, lastEvent))
            .event;
    }
    if (ctx.move.data.category !== "status")
    {
        // drain effect
        if (moveEffects?.drain)
        {
            // see if an ability interrupts the drain effect
            let blocked: boolean | undefined;
            const expectResult = yield* ability.onMoveDrain(ctx.pstate,
                {[otherSide(ctx.userRef)]: true}, ctx, lastEvent);
            for (const abilityResult of expectResult.results)
            {
                blocked ||= abilityResult.invertDrain;
            }
            lastEvent = expectResult.event;

            if (!blocked)
            {
                const damageResult = yield* parsers.damage(ctx.pstate,
                    ctx.userRef, "drain", +1, lastEvent);
                if (!damageResult.success)
                {
                    throw new Error("Expected effects that didn't " +
                        "happen: drain " +
                        `${moveEffects.drain[0]}/${moveEffects.drain[1]}`);
                }
                lastEvent = damageResult.event;
                lastEvent = (yield* parsers.update(ctx.pstate, lastEvent))
                    .event;
            }
        }

        // check for target effects

        // TODO: track actual move targets
        const holderRef = otherSide(ctx.userRef);
        const holder = ctx.pstate.state.teams[holderRef].active;

        // consumeOn-super item (enigmaberry)
        // note: doesn't work if fainted
        if (!holder.fainted)
        {
            const itemSuperResult = yield* consumeItem.consumeOnSuper(
                ctx.pstate, {[holderRef]: true}, ctx, lastEvent);
            lastEvent = itemSuperResult.event;
        }

        // see if an on-moveDamage variant ability will activate
        // note: still works if fainted
        const flags = ctx.mentionedTargets.get(holderRef);
        // choose category with highest precedence
        let qualifier: "damage" | "contact" | "contactKO" | undefined;
        if (ctx.move.data.flags?.contact)
        {
            if (flags?.damaged === "ko") qualifier = "contactKO";
            else if (flags?.damaged) qualifier = "contact";
        }
        else if (flags?.damaged) qualifier = "damage";
        if (qualifier)
        {
            const expectResult = yield* ability.onMoveDamage(ctx.pstate,
                {[holderRef]: true}, qualifier, ctx, lastEvent);
            lastEvent = expectResult.event;
        }

        // consumeOn-postHit item (jabocaberry/rowapberry)
        // note: still works if fainted
        const itemPostHitResult = yield* consumeItem.consumeOnPostHit(
            ctx.pstate, {[holderRef]: true}, ctx, lastEvent);
        lastEvent = itemPostHitResult.event;
    }
    // make sure no more items need to activate
    return yield* parsers.update(ctx.pstate, lastEvent);
}

/** Handles other effects of a move apart from status/boost/damage. */
async function* otherEffects(ctx: MoveContext, lastEvent?: events.Any):
    SubParser
{
    const moveEffects = ctx.move.data.effects;

    // TODO: verify order, or stop it from being enforced
    if (moveEffects?.swapBoosts)
    {
        const targetRef = otherSide(ctx.userRef);
        const swapResult = yield* parsers.swapBoosts(ctx.pstate,
            ctx.userRef, targetRef, moveEffects.swapBoosts, lastEvent);
        if (!swapResult.success)
        {
            throw new Error("Expected effect that didn't happen: " +
                "swapBoosts " +
                `[${Object.keys(moveEffects.swapBoosts).join(", ")}]`);
        }
        lastEvent = swapResult.event;
    }
    if (moveEffects?.team)
    {
        for (const tgt of ["self", "hit"] as dexutil.MoveEffectTarget[])
        {
            const effectType = moveEffects.team[tgt];
            if (!effectType) continue;
            const targetRef = tgt === "self" ?
                ctx.userRef : otherSide(ctx.userRef);
            const teamResult = yield* parsers.teamEffect(ctx.pstate,
                ctx.user, targetRef, effectType, lastEvent);
            if (!teamResult.success)
            {
                throw new Error("Expected effect that didn't happen: " +
                    `${tgt} team ${effectType}`);
            }
            lastEvent = teamResult.event;
        }
    }
    // unsupported team effects
    const teamLoopResult = yield* eventLoop(
        async function* teamLoop(event): SubParser
        {
            if (event.type !== "activateTeamEffect") return {event};

            let accept: boolean | undefined;
            switch (event.effect)
            {
                case "spikes": case "stealthRock": case "toxicSpikes":
                    // TODO: cover hazard removal moves
                    accept = !event.start;
                    break;
                case "lightScreen": case "reflect":
                    // TODO: cover screens removal moves
                    accept = !event.start && event.teamRef !== ctx.userRef;
                    break;
            }
            if (!accept) return {event};
            return yield* base.activateTeamEffect(ctx.pstate, event);
        },
        lastEvent);
    lastEvent = teamLoopResult.event;
    if (moveEffects?.field)
    {
        const fieldResult = yield* parsers.fieldEffect(ctx.pstate, ctx.user,
            moveEffects.field.effect, moveEffects.field.toggle, lastEvent);
        if (!fieldResult.success)
        {
            throw new Error("Expected effect that didn't happen: " +
                `field ${moveEffects.field.effect}` +
                (moveEffects.field.toggle ? " toggle" : ""));
        }
        lastEvent = fieldResult.event;
    }
    if (moveEffects?.changeType)
    {
        const changeTypeResult = yield* expectChangeType(ctx,
            moveEffects.changeType, lastEvent);
        lastEvent = changeTypeResult.event;
    }
    if (moveEffects?.disableMove)
    {
        const disableResult = yield* expectDisable(ctx, lastEvent);
        lastEvent = disableResult.event;
    }
    // recoil
    if (moveEffects?.recoil)
    {
        const damageResult = yield* parsers.damage(ctx.pstate,
            ctx.userRef, "recoil", -1, lastEvent);
        if (damageResult.success !== "silent")
        {
            recoil(ctx, /*consumed*/ !!damageResult.success);
        }
        lastEvent = damageResult.event;
        lastEvent = (yield* parsers.update(ctx.pstate, lastEvent)).event;
    }
    // TODO: focussash
    // TODO: item removal effects
    const removeItemResult = yield* eventLoop(
        async function* removeItemLoop(event): SubParser
        {
            // TODO: track effects that can cause this
            if (event.type !== "removeItem") return {event};
            return yield* base.removeItem(ctx.pstate, event);
        },
        lastEvent);
    lastEvent = removeItemResult.event;
    // item effect after damaging move effects
    // TODO(gen5): properly respect selfFaint for finalgambit
    if (ctx.move.data.category !== "status" &&
        [...ctx.mentionedTargets].some(([, flags]) => flags.damaged) &&
        !ctx.user.fainted && !moveEffects?.selfFaint)
    {
        const itemResult = yield* item.onMovePostDamage(ctx.pstate,
            {[ctx.userRef]: true}, lastEvent);
        lastEvent = itemResult.event;
    }

    return {...lastEvent && {event: lastEvent}};
}

/**
 * Handles expected faint events from the targets of the current move, as well
 * as self-fainting.
 * @param miss Whether the move missed or was blocked, which can affect certain
 * self-faint moves.
 */
async function* handleFaint(ctx: MoveContext, miss?: boolean,
    lastEvent?: events.Any): SubParser
{
    const moveEffects = ctx.move.data.effects;
    const selfFaint = moveEffects?.selfFaint === "always" ||
        (moveEffects?.selfFaint === "ifHit" && !miss);
    const faintCandidates = new Set<Side>();

    // see if the move directly KO'd a target
    for (const [monRef, flags] of ctx.mentionedTargets)
    {
        if (flags.damaged !== "ko") continue;
        faintCandidates.add(monRef);
    }
    // see if self-damage or self-faint effect would cause the user to faint
    if (ctx.user.fainted || selfFaint) faintCandidates.add(ctx.userRef);
    if (faintCandidates.size > 0)
    {
        const faintResult = yield* eventLoop(
            async function* faintLoop(event): SubParser
            {
                if (event.type !== "faint") return {event};
                if (!faintCandidates.delete(event.monRef)) return {event}
                return yield* base.faint(ctx.pstate, event);
            },
            lastEvent);
        if (faintCandidates.size > 0)
        {
            throw new Error(`Pokemon [${[...faintCandidates].join(", ")}] ` +
                "haven't fainted yet");
        }
        lastEvent = faintResult.event;
    }
    return {...lastEvent && {event: lastEvent}};
}

/** Handles terminating move effects, e.g. self-switch, called moves, etc. */
async function* handleFinalEffects(ctx: MoveContext, lastEvent?: events.Any):
    SubParser
{
    const moveEffects = ctx.move.data.effects;
    // TODO: should transform be moved out?
    if (moveEffects?.transform) return yield* expectTransform(ctx, lastEvent);
    if (moveEffects?.selfSwitch &&
        // if last mon remaining, self-switch effects should either fail or be
        //  ignored
        !ctx.pstate.state.teams[ctx.userRef].pokemon.every(
            (mon, i) => i === 0 || mon?.fainted))
    {
        return yield* expectSelfSwitch(ctx, moveEffects.selfSwitch, lastEvent);
    }
    if (moveEffects?.call)
    {
        return yield* expectCalledMove(ctx, ctx.userRef,
            moveEffects.call, /*bounced*/ false, lastEvent);
    }
    return {...lastEvent && {event: lastEvent}};
}

/** Result from `expectDelay()`. */
interface DelayResult extends SubParserResult
{
    /**
     * Whether the effect was successful. If `"shorten"`, the move should be
     * expected to execute immediately.
     */
    success?: true | "shorten";
}

/** Expects a move delay effect if applicable. */
async function* expectDelay(ctx: MoveContext, lastEvent?: events.Any):
    SubParser<DelayResult>
{
    switch (ctx.move.data.effects?.delay?.type)
    {
        case "twoTurn":
        {
            if (!dex.isTwoTurnMove(ctx.moveName))
            {
                // istanbul ignore next: should never happen
                throw new Error(`Invalid two-turn move '${ctx.moveName}'`);
            }
            // can't expect event if releasing two-turn move, should instead get
            //  the damage()/postDamage() events
            if (ctx.releasedTwoTurn) break;

            const event = lastEvent ?? (yield);
            if (event.type !== "prepareMove" || event.monRef !== ctx.userRef)
            {
                throw new Error(`TwoTurn effect '${ctx.moveName}' failed`);
            }
            if (event.move !== ctx.moveName)
            {
                throw new Error(`TwoTurn effect '${ctx.moveName}' failed: ` +
                    `Expected '${ctx.moveName}' but got '${event.move}'`);
            }
            const prepareResult = yield* base.prepareMove(ctx.pstate, event);
            lastEvent = prepareResult.event;

            // TODO: move shorten logic to base prepareMove handler?

            // check solar move (suppressed by airlock/cloudnine)
            let suppressWeather: boolean | undefined;
            for (const monRef of ["us", "them"] as Side[])
            {
                const mon = ctx.pstate.state.teams[monRef].active;
                if (dex.abilities[mon.ability]?.flags?.suppressWeather)
                {
                    suppressWeather = true;
                    break;
                }
            }
            let shorten = !suppressWeather &&
                ctx.move.data.effects?.delay.solar &&
                ctx.pstate.state.status.weather.type === "SunnyDay";
            // check for powerherb
            if (!shorten)
            {
                // expect consumeOn-moveCharge item
                const chargeResult = yield* consumeItem.consumeOnMoveCharge(
                    ctx.pstate, {[ctx.userRef]: true}, lastEvent);
                lastEvent = chargeResult.event;
                for (const consumeResult of chargeResult.results)
                {
                    shorten ||= consumeResult.shorten;
                }
            }

            return {
                ...lastEvent && {event: lastEvent},
                success: shorten ? "shorten" : true
            };
        }
        case "future":
        {
            if (!dex.isFutureMove(ctx.moveName))
            {
                // istanbul ignore next: should never happen
                throw new Error(`Invalid future move '${ctx.moveName}'`);
            }
            // can't expect event if future move already active, should instead
            //  fail the move
            if (ctx.pstate.state.teams[ctx.userRef].status
                .futureMoves[ctx.moveName].isActive)
            {
                break;
            }

            const event = lastEvent ?? (yield);
            if (event.type !== "futureMove" || !event.start)
            {
                throw new Error(`Future effect '${ctx.moveName}' failed`);
            }
            if (event.move !== ctx.moveName)
            {
                throw new Error(`Future effect '${ctx.moveName}' failed: ` +
                    `Expected '${ctx.moveName}' but got '${event.move}'`);
            }
            return {
                ...yield* base.futureMove(ctx.pstate, event), success: true
            };
        }
    }
    return {...lastEvent && {event: lastEvent}};
}

/**
 * Handles type effectiveness assertions, even for status moves.
 * @param effectiveness Type effectiveness.
 */
function handleTypeEffectiveness(ctx: MoveContext,
    effectiveness: Effectiveness): void
{
    // TODO(doubles): do this for each defender
    const defender = ctx.pstate.state.teams[otherSide(ctx.userRef)].active;

    const binary = !ctx.move.canBeEffective;
    const expectedMoveTypes = getAttackerTypes(defender.types, effectiveness,
        binary);
    let moveType: dexutil.Type;
    switch (ctx.move.data.modifyType)
    {
        case "hpType":
        {
            const {hpType} = ctx.user;
            if (!hpType.definiteValue)
            {
                // look for types that would match the given effectiveness
                hpType.narrow(expectedMoveTypes);
                // the assertion at the end would be guaranteed to pass if we
                //  fully narrowed the hpType, so return regardless
                return;
            }

            moveType = hpType.definiteValue as dexutil.Type;
            break;
        }
        case "plateType":
        {
            const heldItem = ctx.user.item;
            if (!heldItem.definiteValue)
            {
                // look for plate items that would match the given effectiveness
                heldItem.narrow(
                    (_, i) => expectedMoveTypes.has(
                        i.plateType ?? ctx.move.data.type));
                // the assertion at the end would be guaranteed to pass if we
                //  fully narrowed the item/plate, so return regardless
                return;
            }

            const {plateType} = heldItem.map[heldItem.definiteValue];
            moveType = plateType ?? ctx.move.data.type;
            break;
        }
        case "???": moveType = "???"; break;
        default: moveType = ctx.move.data.type;
    }

    // assert type effectiveness
    const expectedEff = getTypeEffectiveness(defender.types, moveType, binary);
    if (effectiveness !== expectedEff)
    {
        // could be a status move being blocked by a type-based status immunity
        if (effectiveness === "immune" && ctx.move.data.category === "status" &&
            ctx.move.data.effects?.status?.hit?.every(s =>
                    canBlockStatus(defender.types, s)))
        {
            return;
        }

        // immunity-ignoring move
        if (effectiveness === "immune" && ctx.move.data.flags?.ignoreImmunity)
        {
            return;
        }

        throw new Error(`Move effectiveness expected to be '${expectedEff}' ` +
            `but got '${effectiveness}'`);
    }
}

/**
 * Expects a called move effect.
 * @param userRef User of the called move.
 * @param callEffect Call effect.
 * @param bounced Whether the is move was reflected by an effect (e.g. Magic
 * Coat).
 */
async function* expectCalledMove(ctx: MoveContext, userRef: Side,
    callEffect: dexutil.CallType, bounced?: boolean, lastEvent?: events.Any):
    SubParser
{
    // can't do anything if fainted
    if (ctx.pstate.state.teams[userRef].active.fainted)
    {
        return {...lastEvent && {event: lastEvent}};
    }

    const event = lastEvent ?? (yield);
    if (event.type !== "useMove")
    {
        throw new Error("Expected effect that didn't happen: " +
            `call '${callEffect}'`);
    }
    if (event.monRef !== userRef)
    {
        throw new Error(`Call effect '${callEffect}' failed: ` +
            `Expected '${userRef}' but got '${event.monRef}'`);
    }

    switch (callEffect)
    {
        case true: break; // nondeterministic call
        case "copycat":
            if (ctx.lastMove !== event.move)
            {
                throw new Error("Call effect 'copycat' failed: " +
                    `Should've called '${ctx.lastMove}' but got ` +
                    `'${event.move}'`);
            }
            if (dex.moves[ctx.lastMove].flags?.noCopycat)
            {
                throw new Error("Call effect 'copycat' failed: " +
                    `Can't call move '${ctx.lastMove}' with flag ` +
                    "noCopycat=true");
            }
            break;
        case "mirror":
            if (ctx.user.volatile.mirrorMove !== event.move)
            {
                throw new Error("Call effect 'mirror' failed: Should've " +
                    `called '${ctx.user.volatile.mirrorMove}' but got ` +
                    `'${event.move}'`);
            }
            break;
        case "self":
            // calling a move that is part of the user's moveset
            if (!addTarget(ctx, userRef))
            {
                throw new Error("Call effect 'self' failed");
            }
            ctx.user.moveset.reveal(event.move);
            break;
        case "target":
        {
            // TODO: track actual target
            const targetRef = otherSide(userRef);
            if (!addTarget(ctx, targetRef))
            {
                throw new Error("Call effect 'target' failed");
            }
            ctx.pstate.state.teams[targetRef].active.moveset.reveal(event.move);
            break;
        }
        default:
            // regular string specifies the move that should be
            //  called
            // TODO: what if copycat is supposed to be called rather
            //  than the copycat effect?
            if (event.move !== callEffect)
            {
                throw new Error(`Call effect '${callEffect}' failed`);
            }
    }

    // make sure this is handled like a called move
    return yield* base.useMove(ctx.pstate, event,
        /*called*/ bounced ? "bounced" : true);
}

/** Expects a transform effect. */
async function* expectTransform(ctx: MoveContext, lastEvent?: events.Any):
    SubParser
{
    // can't do anything if fainted
    if (ctx.user.fainted) return {...lastEvent && {event: lastEvent}};

    const event = lastEvent ?? (yield);
    if (event.type !== "transform")
    {
        throw new Error("Expected effect that didn't happen: transform");
    }
    if (event.source !== ctx.userRef)
    {
        throw new Error("Transform effect failed: " +
            `Expected source '${ctx.userRef}' but got '${event.source}'`);
    }
    if (!addTarget(ctx, event.target))
    {
        throw new Error("Transform effect failed");
    }
    return yield* base.transform(ctx.pstate, event);
}

/** Handles the status effects of a move. */
async function* handleStatus(ctx: MoveContext,
    status?: NonNullable<dexutil.MoveData["effects"]>["status"],
    lastEvent?: events.Any): SubParser
{
    for (const tgt of ["self", "hit"] as dexutil.MoveEffectTarget[])
    {
        // try to parse any possible status effect from the move
        const statusTypes = ctx.move.getAllStatusEffects(tgt, ctx.user.types);
        if (statusTypes.length <= 0) continue;

        // status effect for target was blocked
        if (tgt === "hit" && ctx.blockStatus &&
            statusTypes.some(s => ctx.blockStatus![s]))
        {
            continue;
        }

        // can't inflict status if about to faint
        const targetRef = tgt === "self" ? ctx.userRef : otherSide(ctx.userRef);
        const target = ctx.pstate.state.teams[targetRef].active;
        if (target.hp.current <= 0) continue;

        if (tgt === "hit")
        {
            // substitute blocks status conditions
            if (!ctx.move.data.flags?.ignoreSub && target.volatile.substitute)
            {
                continue;
            }
        }

        // expect status effects
        const statusResult = yield* parsers.status(ctx.pstate, targetRef,
            statusTypes, lastEvent);
        lastEvent = statusResult.event;
        // if no statuses happened, target must have an ability immunity
        if (!statusResult.success) statusImmunity(ctx, targetRef);
        // verify if imprison was successful
        else if (statusResult.success === "imprison")
        {
            imprison(ctx, /*failed*/ false);
        }
        lastEvent = (yield* parsers.update(ctx.pstate, lastEvent)).event;
    }

    return {...lastEvent && {event: lastEvent}};
}

/** Handles the split-damage effect of a move (e.g. painsplit). */
async function* handleSplitDamage(ctx: MoveContext, lastEvent?: events.Any):
    SubParser
{
    let usMentioned = false;
    let targetMentioned = false;
    const result = yield* eventLoop(
        async function* splitDamageLoop(event)
        {
            if (event.type !== "takeDamage") return {event};
            if (event.from) return {event};
            if (event.monRef !== ctx.userRef)
            {
                if (targetMentioned || !addTarget(ctx, event.monRef))
                {
                    return {event};
                }
                targetMentioned = true;
            }
            else if (usMentioned) return {event};
            else usMentioned = true;
            return yield* base.takeDamage(ctx.pstate, event);
        },
        lastEvent);
    lastEvent = (yield* parsers.update(ctx.pstate, lastEvent)).event;
    return result;
}

/** Handles the percent-damage/heal effects of a move. */
async function* handlePercentDamage(ctx: MoveContext,
    effect?: NonNullable<dexutil.MoveData["effects"]>["damage"],
    lastEvent?: events.Any): SubParser
{
    // shouldn't activate if non-ghost type and ghost flag is set
    if (!effect || effect.type !== "percent" ||
        (effect.ghost && !ctx.user.types.includes("ghost")))
    {
        return {...lastEvent && {event: lastEvent}};
    }
    // TODO(doubles): actually track targets
    const targetRef = effect.target === "self" ?
        ctx.userRef : otherSide(ctx.userRef);
    const damageResult = yield* parsers.percentDamage(ctx.pstate, targetRef,
        effect.percent, lastEvent);
    if (!damageResult.success)
    {
        throw new Error("Expected effect that didn't happen: " +
            `${effect.target} percentDamage ${effect.percent}%`);
    }
    return yield* parsers.update(ctx.pstate, damageResult.event);
}

/** Handles the boost effects of a move. */
async function* handleBoost(ctx: MoveContext,
    effect?: NonNullable<dexutil.MoveData["effects"]>["boost"],
    lastEvent?: events.Any): SubParser
{
    // shouldn't activate if ghost type and noGhost flag is set
    if (!effect || (effect.noGhost && ctx.user.types.includes("ghost")))
    {
        return {...lastEvent && {event: lastEvent}};
    }
    const chance = effect.chance;
    for (const tgt of ["self", "hit"] as dexutil.MoveEffectTarget[])
    {
        const table = effect[tgt];
        if (!table) continue;
        const targetRef = tgt === "self" ? ctx.userRef : otherSide(ctx.userRef);
        const target = ctx.pstate.state.teams[targetRef].active;
        // can't boost target if about to faint
        if (target.hp.current <= 0) continue;
        if (tgt === "hit")
        {
            // substitute blocks boosts
            if (!ctx.move.data.flags?.ignoreSub && target.volatile.substitute)
            {
                continue;
            }
        }
        const boostResult = yield* moveBoost(ctx, targetRef, table, chance,
            effect.set, lastEvent);
        if (Object.keys(boostResult.remaining).length > 0 && !effect.chance)
        {
            throw new Error("Expected effect that didn't happen: " +
                `${tgt} boost ${effect.set ? "set" : "add"} ` +
                JSON.stringify(boostResult.remaining));
        }
        lastEvent = boostResult.event;
    }
    return {...lastEvent && {event: lastEvent}};
}

/**
 * Handles events due to a move's Boost effect.
 * @param targetRef Target pokemon reference receiving the boosts.
 * @param boosts Boost table.
 * @param chance Chance of the effect happening, or undefined if guaranteed.
 * @param set Whether boosts are being added or set.
 */
async function* moveBoost(ctx: MoveContext, targetRef: Side,
    boosts: Partial<dexutil.BoostTable>, chance?: number, set?: boolean,
    lastEvent?: events.Any):
    SubParser<parsers.BoostResult>
{
    // can't do anything if fainted
    if (ctx.pstate.state.teams[targetRef].active.fainted)
    {
        return {...lastEvent && {event: lastEvent}, remaining: {}};
    }

    const table = {...boosts};

    // see if the target's ability blocks the boost effect
    if (targetRef !== ctx.userRef && !set)
    {
        const expectResult = yield* ability.onTryUnboost(ctx.pstate,
            {[targetRef]: true}, ctx, lastEvent);
        // only one ability should activate
        if (expectResult.results.length === 1)
        {
            // remove blocked boosts from the pending boost table
            const abilityResult = expectResult.results[0];
            if (abilityResult.blockUnboost)
            {
                for (const b in abilityResult.blockUnboost)
                {
                    if (!abilityResult.blockUnboost.hasOwnProperty(b))
                    {
                        continue;
                    }
                    delete table[b as dexutil.BoostName];
                }
            }
        }
        lastEvent = expectResult.event;
    }
    // effect should pass silently
    if (Object.keys(table).length <= 0)
    {
        return {...lastEvent && {event: lastEvent}, remaining: {}};
    }

    const boostResult = yield* parsers.boost(ctx.pstate, targetRef,
        table, set, /*silent*/ true, lastEvent);

    if ((chance == null || chance >= 100) &&
        Object.keys(boostResult.remaining).length > 0)
    {
        throw new Error("Expected effect that didn't happen: " +
            `${targetRef === ctx.userRef ? "self" : "hit"} boost ` +
            `${set ? "set" : "add"} ${JSON.stringify(boostResult.remaining)}`);
    }
    return boostResult;
}

/**
 * Expects a changeType effect for the move user.
 * @param effect Type of effect.
 */
async function* expectChangeType(ctx: MoveContext, effect: "conversion",
    lastEvent?: events.Any): SubParser
{
    // can't do anything if fainted
    if (ctx.user.fainted) return {...lastEvent && {event: lastEvent}};

    const event = lastEvent ?? (yield);
    if (event.type !== "changeType")
    {
        throw new Error("Expected effect that didn't happen: " +
            `changeType '${effect}'`);
    }
    if (!addTarget(ctx, event.monRef))
    {
        throw new Error(`ChangeType effect '${effect}' failed`);
    }
    // TODO: track type change effects: camouflage, conversion2
    // for now only conversion is tracked, which changes the user's type into
    //  that of a known move
    // note: conversion move treats modifyType moves as their default type
    ctx.user.moveset.addMoveSlotConstraint(dex.typeToMoves[event.newTypes[0]]);
    return yield* base.changeType(ctx.pstate, event);
}

/** Expects a disableMove effect. */
async function* expectDisable(ctx: MoveContext, lastEvent?: events.Any):
    SubParser
{
    const event = lastEvent ?? (yield);
    if (event.type !== "disableMove")
    {
        throw new Error("Expected effect that didn't happen: disableMove");
    }
    if (!addTarget(ctx, event.monRef))
    {
        throw new Error("DisableMove effect failed");
    }
    return yield* base.disableMove(ctx.pstate, event);
}

/**
 * Expects a selfSwitch effect.
 * @param effect Type of effect.
 */
async function* expectSelfSwitch(ctx: MoveContext,
    effect: dexutil.SelfSwitchType, lastEvent?: events.Any): SubParser
{
    // can't do anything if fainted, unless this was intended like with
    //  healingwish/lunardance moves (gen4: replacement is sent out immediately)
    if (ctx.user.fainted && !ctx.move.data.effects?.selfFaint)
    {
        return {...lastEvent && {event: lastEvent}};
    }

    const team = ctx.pstate.state.teams[ctx.userRef];
    team.status.selfSwitch = effect;

    // expect a halt event requesting a switch choice
    const haltEvent = lastEvent ?? (yield);
    if (haltEvent.type !== "halt")
    {
        throw new Error("Expected effect that didn't happen: " +
            `selfSwitch '${effect}'`);
    }
    const expectedReason = ctx.userRef === "us" ? "switch" : "wait";
    if (haltEvent.reason !== expectedReason)
    {
        throw new Error(`SelfSwitch effect '${effect}' failed: ` +
            `Expected halt reason '${expectedReason}' but got ` +
            `'${haltEvent.reason}'`);
    }
    // make sure all information is up to date before possibly
    //  requesting a decision
    preHaltIgnoredEffects(ctx);
    ctx.pstate.state.teams[ctx.userRef].status.selfSwitch = effect;
    const haltResult = yield* base.halt(ctx.pstate, haltEvent);
    lastEvent = haltResult.event;

    // expect the subsequent switch event
    // TODO: communicate self-switch/healingwish effects
    const switchResult = yield* expectSwitch(ctx.pstate, ctx.userRef,
        lastEvent);
    if (!switchResult.success)
    {
        throw new Error(`SelfSwitch effect '${effect}' failed`);
    }
    return switchResult;
}

// inference helper functions

/** Infers move targets. */
function inferTargets(ctx: MoveContext): void
{
    // TODO(doubles): this may be more complicated or just ignored
    const opponent = otherSide(ctx.userRef);
    if (ctx.pendingTargets[opponent]) addTarget(ctx, opponent);
    if (ctx.pendingTargets[ctx.userRef]) addTarget(ctx, ctx.userRef);
}

/**
 * Indicates that the BattleEvents mentioned a target for the current move.
 * @param damaged Whether the pokemon was damaged directly (true) or KO'd
 * ('"ko"`).
 * @returns False on error, true otherwise.
 */
function addTarget(ctx: MoveContext, targetRef: Side,
    damaged: boolean | "ko" = false): boolean
{
    let flags = ctx.mentionedTargets.get(targetRef);
    // already mentioned target earlier
    if (flags)
    {
        // update damaged status if higher precedence (ko > true > false)
        if (damaged && (!flags.damaged || damaged === "ko"))
        {
            flags.damaged = damaged;
        }
    }
    else
    {
        // assertions about the move target
        if (!ctx.pendingTargets[targetRef])
        {
            ctx.pstate.logger.error(`Mentioned target '${targetRef}' but the ` +
                `current move '${ctx.moveName}' can't target it`);
            return false;
        }
        if (ctx.mentionedTargets.size >= ctx.totalTargets)
        {
            ctx.pstate.logger.error("Can't add more targets. Already " +
                `mentioned ${ctx.mentionedTargets.size} ` +
                (ctx.mentionedTargets.size > 0 ?
                    `('${[...ctx.mentionedTargets].join("', '")}') ` : "") +
                `but trying to add '${targetRef}'.`);
            return false;
        }

        ctx.mentionedTargets.set(targetRef,
            flags = {...(!!damaged && {damaged})});
    }

    // TODO: fainting prior to the move should cause active to be null so this
    //  check isn't as complicated
    const target = ctx.pstate.state.teams[targetRef].active;
    if (flags.damaged) target.volatile.damaged = true;
    if (ctx.user !== target && (!target.fainted || flags.damaged === "ko"))
    {
        // update opponent's mirror move tracker
        if (ctx.mirror) target.volatile.mirrorMove = ctx.moveName;

        // deduct an extra pp if the target has pressure
        // TODO(gen>=5): don't count allies
        if (!flags.pressured && ctx.moveState &&
            !target.volatile.suppressAbility && target.ability === "pressure" &&
            // only ability that can cancel pressure
            // TODO: use ignoreTargetAbility flag
            ctx.user.ability !== "moldbreaker")
        {
            ctx.moveState.pp -= 1;
            flags.pressured = true;
        }

        if (target.volatile.substitute && !ctx.move.data.flags?.ignoreSub &&
            flags.damaged)
        {
            throw new Error("Move should've been blocked by target's " +
                "Substitute");
        }
    }

    return true;
}

/** Handles the implications of a move failing. */
function handleFail(ctx: MoveContext): void
{
    // TODO: add MoveData field to support this move
    if (ctx.moveName === "naturalgift") naturalGift(ctx, /*failed*/ true);

    // imprison move failed, make inferences based on fail conditions
    if (ctx.move.data.effects?.status?.self?.includes("imprison") &&
        !ctx.move.data.effects.status.chance)
    {
        imprison(ctx, /*failed*/ true);
    }

    // non-called moves affect the stall counter
    if (!ctx.called) ctx.user.volatile.stall(false);

    // clear continuous moves
    ctx.user.volatile.lockedMove.reset();
    ctx.user.volatile.rollout.reset();

    // when the move fails, micle status is silently ended
    ctx.user.volatile.micleberry = false;

    // TODO: verify other implications
}

/** Handles the implications of a move lacking a target. */
function handleNoTarget(ctx: MoveContext): void
{
    // non-called moves affect the stall counter
    if (!ctx.called) ctx.user.volatile.stall(false);

    // clear continuous moves
    ctx.user.volatile.lockedMove.reset();
    ctx.user.volatile.rollout.reset();

    // TODO: verify other implications
}

/** Handles the implications of a move being blocked by an effect. */
function handleBlock(ctx: MoveContext): void
{
    // non-called moves affect the stall counter
    if (!ctx.called) ctx.user.volatile.stall(false);

    // interrupted momentum move
    // TODO(gen>=5): also reset rampage move
    ctx.user.volatile.rollout.reset();
}

/** Handles implicit move effects, consuming most remaining flags. */
function handleImplicitEffects(ctx: MoveContext): void
{
    if (ctx.moveName === "naturalgift") naturalGift(ctx, /*failed*/ false);

    let lockedMove = false;
    const {lockedMove: lock} = ctx.user.volatile;
    switch (ctx.move.data.implicit?.status)
    {
        case "defenseCurl": case "minimize": case "mustRecharge":
            ctx.user.volatile[ctx.move.data.implicit.status] = true;
            break;
        case "lockedMove":
            if (!dex.isLockedMove(ctx.moveName))
            {
                // istanbul ignore next: should never happen
                throw new Error(`Invalid locked move ${ctx.moveName}`);
            }
            // continue locked status
            // already prevented from consuming pp in constructor
            if (lock.type === ctx.moveName) lock.tick();
            // start locked status
            else lock.start(ctx.moveName, !!ctx.called);
            lockedMove = true;
            break;
    }
    // if the locked move was called, then this current context is the one that
    //  called the move so we shouldn't reset it
    if (!lockedMove && (lock.turns !== 0 || !lock.called)) lock.reset();

    // TODO: add rollout to implicit status above
    const {rollout} = ctx.user.volatile;
    if (dexutil.isRolloutMove(ctx.moveName))
    {
        // TODO: add rollout moves to ImplicitStatusEffect
        // start/continue rollout status
        // already prevented from consuming pp in constructor if continuing
        if (rollout.type === ctx.moveName) rollout.tick();
        else rollout.start(ctx.moveName, !!ctx.called);
    }
    // must've missed the status ending
    // if the rollout move was called, then this current context is the one that
    //  called the move so we shouldn't reset it
    else if (rollout.turns !== 0 || !rollout.called) rollout.reset();

    // team effects

    const team = ctx.pstate.state.teams[ctx.userRef];
    switch (ctx.move.data.implicit?.team)
    {
        case "healingWish": case "lunarDance":
            team.status[ctx.move.data.implicit.team] = true;
            break;
        // wish can be used consecutively, but only the first use counts
        case "wish":
            team.status.wish.start(/*restart*/false);
            break;
    }

    preHaltIgnoredEffects(ctx);
}

/**
 * Handles ignored effects prior to a halt event, where a possible switch
 * decision could be requested which would require all information to be up to
 * date.
 */
function preHaltIgnoredEffects(ctx: MoveContext): void
{
    if (ctx.ignoredHandled) return;
    ctx.ignoredHandled = true;

    // reset stall counter if it wasn't updated this turn
    if (!ctx.called && !ctx.user.volatile.stalling)
    {
        ctx.user.volatile.stall(false);
    }
}

// TODO: refactor to use EventInference helpers
/**
 * Infers an implicit status immunity. Assumes the move's effect couldn't have
 * been silently consumed.
 * @param targetRef Target that was supposed to receive the move's status
 * effect.
 */
function statusImmunity(ctx: MoveContext, targetRef: Side): void
{
    // get guaranteed status effects
    const tgt = targetRef === ctx.userRef ? "self" : "hit";
    const statuses = ctx.move.getGuaranteedStatusEffects(tgt, ctx.user.types);
    if (statuses.length <= 0) return;

    // moldbreaker check
    const user = ctx.user;
    const userAbility = user.traits.ability;
    if (!user.volatile.suppressAbility &&
        [...userAbility.possibleValues].every(
            n => userAbility.map[n].flags?.ignoreTargetAbility))
    {
        throw new Error(`Move '${ctx.moveName}' user '${ctx.userRef}' has ` +
            "ability-ignoring ability " +
            `[${[...userAbility.possibleValues].join(", ")}] but status ` +
            `[${statuses.join(", ")}] was still blocked by target ` +
            `'${targetRef}'`);
    }

    // the target must have a status immunity ability
    // make sure the ability isn't suppressed or we'll have a problem
    const target = ctx.pstate.state.teams[targetRef].active;
    if (target.volatile.suppressAbility)
    {
        throw new Error(`Move '${ctx.moveName}' status ` +
            `[${statuses.join(", ")}] was blocked by target '${targetRef}' ` +
            "but target's ability is suppressed");
    }

    // find abilities that grant applicable status immunities
    const targetAbility = target.traits.ability;
    // note: can consider immunities to either status if there are multiple
    //  possible statuses to afflict
    // TODO: rework api to allow for custom overnarrowing errors/recovery
    const filteredAbilities = [...targetAbility.possibleValues]
        .filter(n => statuses.some(s =>
                // TODO: some abilities distinguish between self/hit statuses
                dex.getAbility(targetAbility.map[n]).canBlockStatus(s,
                    ctx.pstate.state.status.weather.type)));
    if (filteredAbilities.length <= 0)
    {
        // overnarrowed error
        throw new Error(`Move '${ctx.moveName}' status ` +
            `[${statuses.join(", ")}] was blocked by target '${targetRef}' ` +
            "but target's ability " +
            `[${[...targetAbility.possibleValues].join(", ")}] can't block it`);
    }
    targetAbility.narrow(filteredAbilities);
}

/**
 * Handles the implications of Imprison succeeding or failing.
 * @param failed Whether the move failed.
 */
function imprison(ctx: MoveContext, failed: boolean): void
{
    // assume us is fully known, while them is unknown
    // TODO: what if both are unknown?
    const us = ctx.pstate.state.teams.us.active.moveset;
    const usMoves = [...us.moves.keys()];
    const them = ctx.pstate.state.teams.them.active.moveset;

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
 * Handles the implications of Natural Gift succeeding or failing.
 * @param failed Whether the move failed.
 */
function naturalGift(ctx: MoveContext, failed: boolean): void
{
    // naturalgift only succeeds if the user has a berry, and implicitly
    //  consumes it
    if (!failed)
    {
        // TODO: narrow further based on perceived power and type
        ctx.user.item.narrow(Object.keys(dex.berries));
        ctx.user.removeItem(/*consumed*/ true);
    }
    // fails if the user doesn't have a berry
    // TODO: also check for klutz/embargo blocking the berry from being used
    else ctx.user.item.remove(Object.keys(dex.berries));
}

/**
 * Makes an inference based on whether the recoil effect was consumed or
 * ignored.
 */
function recoil(ctx: MoveContext, consumed: boolean): void
{
    if (ctx.user.volatile.suppressAbility)
    {
        if (!consumed)
        {
            throw new Error(`Move ${ctx.moveName} user '${ctx.userRef}' ` +
                "suppressed recoil through an ability but ability is " +
                "suppressed");
        }
        // can't make any meaningful inferences here
    }
    else
    {
        // get possible recoil-canceling abilities
        const userAbility = ctx.user.traits.ability;
        const noRecoilAbilities = [...userAbility.possibleValues]
            .filter(n => userAbility.map[n].flags?.noIndirectDamage);
        // can't have recoil-canceling abilities
        if (consumed)
        {
            if (noRecoilAbilities.length === userAbility.size)
            {
                throw new Error(`Move ${ctx.moveName} user '${ctx.userRef}' ` +
                    "must have a recoil-canceling ability " +
                    `[${noRecoilAbilities.join(", ")}] but recoil still ` +
                    "happened");
            }
            userAbility.remove(noRecoilAbilities);
        }
        // must have a recoil-canceling ability
        else if (noRecoilAbilities.length <= 0)
        {
            throw new Error(`Move ${ctx.moveName} user '${ctx.userRef}' ` +
                `ability [${[...userAbility.possibleValues].join(", ")}] ` +
                "can't suppress recoil but it still suppressed recoil");
        }
        else userAbility.narrow(noRecoilAbilities);
    }
}
