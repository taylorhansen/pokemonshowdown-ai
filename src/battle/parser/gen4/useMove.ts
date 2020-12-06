import * as dex from "../../dex/dex";
import * as dexutil from "../../dex/dex-util";
import * as effects from "../../dex/effects";
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
 */
export async function* useMove(pstate: ParserState,
    event: events.UseMove, called: boolean | "bounced" = false,
    lastEvent?: events.Any): SubParser
{
    // setup context
    const ctx = initCtx(pstate, event, called);

    // check for move interruptions
    const preDamageResult = yield* preDamage(ctx, lastEvent);
    if (!ctx.failed) handleImplicitEffects(ctx, /*failed*/ false);

    // expect move damage if applicable
    lastEvent = preDamageResult.event;
    if (!ctx.failed && ctx.moveData.category !== "status" &&
        !preDamageResult.delay)
    {
        const damageResult = yield* damage(ctx, lastEvent);
        lastEvent = damageResult.event;
    }

    // expect post-damage move effects
    const postDamageResult = yield* postDamage(ctx, lastEvent);
    lastEvent = postDamageResult.event;

    // clean up flags
    preHaltIgnoredEffects(ctx);

    if (preDamageResult.delay === "shorten")
    {
        // execute event again to handle shortened release turn
        // by creating a new MoveContext in this call, it'll no longer think
        //  it's in the charging turn so certain obscure effects are still
        //  handled properly (e.g. mirrormove tracking on release turn)
        return yield* useMove(pstate, event, /*called*/ false, lastEvent);
    }
    return postDamageResult;
}

/** Extended parser state for move context. */
interface MoveContext
{
    /** Base ParserState. */
    readonly pstate: ParserState;
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
    readonly moveData: dexutil.MoveData;
    /** Move object if this event came directly from the user's moveset. */
    readonly move?: Move;
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
    if (!dex.moves.hasOwnProperty(event.move))
    {
        throw new Error(`Unsupported move '${event.move}'`);
    }

    // set last move
    const lastMove = pstate.state.status.lastMove;
    pstate.state.status.lastMove = event.move;

    // event data
    const userRef = event.monRef;
    const moveName = event.move;
    const user = pstate.state.teams[userRef].active;
    const moveData = dex.moves[moveName];

    // find out which pokemon should be targeted by the move
    let pendingTargets: {readonly [TMonRef in Side]: boolean};
    let totalTargets: number;
    // TODO(gen6): nonGhostTarget interactions with protean
    switch (moveData.nonGhostTarget && !user.types.includes("ghost") ?
        moveData.nonGhostTarget : moveData.target)
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
        if (moveData.effects?.delay?.type !== "twoTurn")
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
        (moveData.effects?.delay?.type !== "twoTurn" || releasedTwoTurn) &&
        // can't mirror called moves
        !called &&
        // can't mirror called rampage moves
        (!continueLock || !user.volatile.lockedMove.called) &&
        (!continueRollout || !user.volatile.rollout.called) &&
        // default to mirror move flag
        // TODO: should called+released two-turn count? (unique to PS?)
        !moveData.flags?.noMirror;

    // setup result object
    const result: MoveContext =
    {
        pstate, called, userRef, moveName, user, moveData, pendingTargets,
        totalTargets, implicitHandled: false, ignoredHandled: false,
        mirror, ...lastMove && {lastMove},
        ...releasedTwoTurn && {releasedTwoTurn}, mentionedTargets: new Map()
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

    return {...result, move: revealedMove};
}

/** Converts a user(us)/target(them) map to an actual monRef us/them map. */
function framePendingTargets(userRef: Side,
    obj: {readonly [TRelMonRef in Side]: boolean}):
    {readonly [TMonRef in Side]: boolean}
{
    if (userRef === "us") return obj;
    return {them: obj.us, us: obj.them};
}

/** Result of `preDamage()`. */
interface PreDamageResult extends SubParserResult
{
    /**
     * Whether move damage is being prepared or delayed due to an effect, or the
     * delay is being shortened.
     */
    delay?: true | "shorten";
}

/** Handles effects that interrupt before move damage. */
async function* preDamage(ctx: MoveContext, lastEvent?: events.Any):
    SubParser<PreDamageResult>
{
    // TODO: deconstruct eventLoop like in postDamage()
    const result = yield* eventLoop(async function*(event)
    {
        switch (event.type)
        {
            case "block":
                // move effects were blocked
                // endure event should happen after damage
                // TODO: testing shows this is where the endure event should
                //  happen on PS, but not on cartridge
                if (event.effect === "endure")
                {
                    // endure only protects from going to 0hp, so the move
                    //  effects still take place
                    return yield* base.block(ctx.pstate, event);
                }
                // substitute event should happen during damage
                if (event.effect === "substitute") break;
                // reflecting the move, expect the next event to call it
                // TODO: expect this immediately instead of waiting for
                //  postDamage()
                if (event.effect === "magicCoat")
                {
                    const mon = ctx.pstate.state.teams[event.monRef].active;
                    // verify magiccoat and reflectable flags
                    if (!mon.volatile.magicCoat || ctx.called === "bounced" ||
                        !ctx.moveData.flags?.reflectable)
                    {
                        break;
                    }
                    ctx.bouncing = event.monRef;
                }
                if (!handleBlock(ctx, event.monRef)) break;
                return yield* base.block(ctx.pstate, event);
            case "fail":
                // move couldn't be used
                // TODO: assertions on why the move could fail?
                if (!handleFail(ctx)) break;
                return yield* base.fail(ctx.pstate, event);
            case "immune":
                // TODO: check type effectiveness?
                if (!handleBlock(ctx, event.monRef)) break;
                return yield* base.immune(ctx.pstate, event);
            case "miss":
                // TODO: check accuracy?
                if (!handleBlock(ctx, event.monRef)) break;
                return yield* base.miss(ctx.pstate, event);
            case "noTarget":
                // no opponent to target
                if (!ctx.pstate.state.teams[otherSide(ctx.userRef)].active
                    .fainted)
                {
                    break;
                }
                if (!handleFail(ctx)) break;
                return yield* base.noTarget(ctx.pstate, event);
            case "removeItem":
                // TODO: type resist berry to modify damage calcs
                // TODO: move to damage()?
                return yield* base.removeItem(ctx.pstate, event);
        }
        return {event};
    }, lastEvent);
    lastEvent = result.event;

    let delay: boolean | "shorten" | undefined;
    if (!ctx.failed && ctx.moveData.effects?.delay)
    {
        const delayResult = yield* expectDelay(ctx, lastEvent);
        lastEvent = delayResult.event;
        delay = delayResult.success;
    }

    // TODO: assert no type resist berry (weird if hiddenpower)

    // TODO(doubles): multiple eligible targets
    const targetRef = otherSide(ctx.userRef);
    if (!ctx.failed && !delay && ctx.pendingTargets[targetRef])
    {
        // ability blocking
        // TODO: precedence with regard to type resist berries, and others?
        const expectResult = yield* ability.onBlock(ctx.pstate,
            {[otherSide(ctx.userRef)]: true}, ctx.userRef, ctx.moveData,
            result.event);
        for (const abilityResult of expectResult.results)
        {
            // handle block results
            // TODO: what about blockStatus?
            if (abilityResult.immune) handleBlock(ctx, targetRef);
            else if (abilityResult.failed) handleFail(ctx);
        }
        return {
            ...expectResult.event && {event: expectResult.event},
            ...expectResult.permHalt && {permHalt: expectResult.permHalt}
        };
    }

    return {...lastEvent && {event: lastEvent}, ...delay && {delay}};
}

/** Handles an event where the pokemon's move failed to take effect. */
function handleFail(ctx: MoveContext): boolean
{
    handleImplicitEffects(ctx, /*failed*/true);
    ctx.failed = true;
    return true;
}

/** Handles an event where a pokemon blocked the move. */
function handleBlock(ctx: MoveContext, monRef: Side): boolean
{
    // generally a complete miss fails the move
    // TODO(doubles): support partial misses
    handleImplicitEffects(ctx, /*failed*/true);
    ctx.failed = "miss";
    return addTarget(ctx, monRef);
}

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
    switch (ctx.moveData.effects?.delay?.type)
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
                ctx.moveData.effects?.delay.solar &&
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

/** Result of `damage()`. */
interface DamageResult extends SubParserResult
{
    /** Whether the damage was blocked by a Substitute. */
    substitute?: true;
}

/** Handles move damage modifier events, e.g. crits and type effectiveness. */
async function* damage(ctx: MoveContext, lastEvent?: events.Any):
    SubParser<DamageResult>
{
    let substitute: true | undefined;
    const result = yield* eventLoop(async function*(event)
    {
        switch (event.type)
        {
            // TODO: support multi-hit moves
            case "activateStatusEffect":
                // substitute could break after blocking
                if (event.effect !== "substitute" || !substitute) break;
                if (event.start) break;
                return yield* base.activateStatusEffect(ctx.pstate, event);
            case "block":
                if (event.effect !== "substitute") break;
                if (ctx.moveData.flags?.ignoreSub)
                {
                    // istanbul ignore next: can't reproduce until gen5 with
                    //  damaging sub-ignoring moves
                    throw new Error("Substitute-ignoring move shouldn't have " +
                        "been blocked by Substitute");
                }
                substitute = true;
                return yield* base.block(ctx.pstate, event);
            case "crit":
                if (!addTarget(ctx, event.monRef)) break;
                return yield* base.crit(ctx.pstate, event);
            // TODO: support type effectiveness
            case "resisted":
                if (ctx.userRef === event.monRef) break;
                if (!addTarget(ctx, event.monRef)) break;
                return yield* base.resisted(ctx.pstate, event);
            case "superEffective":
                if (ctx.userRef === event.monRef) break;
                if (!addTarget(ctx, event.monRef)) break;
                return yield* base.superEffective(ctx.pstate, event);
            case "takeDamage":
                // main move damage
                if (event.from || ctx.userRef === event.monRef) break;
                if (substitute) break;
                if (!addTarget(ctx, event.monRef,
                    /*damaged*/ event.hp <= 0 ? "ko" : true))
                {
                    break;
                }
                return yield* base.takeDamage(ctx.pstate, event);
        }
        return {event};
    }, lastEvent);

    // TODO: assert type effectiveness
    // TODO: include damage dealt in result for drain/recoil/etc
    return {...result, ...(substitute && {substitute})};
}

/** Handles effects after the main damage event. */
async function* postDamage(ctx: MoveContext, lastEvent?: events.Any): SubParser
{

    // TODO: verify order
    // TODO: move bounce handling to preDamage where ctx.bouncing was set?
    if (ctx.bouncing)
    {
        const callResult = yield* expectCalledMove(ctx, ctx.bouncing,
            ctx.moveName, /*bounced*/ true, lastEvent);
        // TODO: permHalt check?
        lastEvent = callResult.event;
    }
    const moveEffects = ctx.moveData.effects;
    const selfFaint =
        // if selfFaint=always, count failed=false or miss
        (moveEffects?.selfFaint === "always" && ctx.failed !== true) ||
        // if selfFaint=ifHit, only count failed=false
        (moveEffects?.selfFaint === "ifHit" && !ctx.failed);
    if (!ctx.failed)
    {
        if (moveEffects?.call)
        {
            const callResult = yield* expectCalledMove(ctx, ctx.userRef,
                moveEffects.call, /*bounced*/ false, lastEvent);
            lastEvent = callResult.event;
        }
        if (moveEffects?.transform)
        {
            const transformResult = yield* expectTransform(ctx, lastEvent);
            lastEvent = transformResult.event;
        }
        if (moveEffects?.damage &&
            // shouldn't activate if non-ghost type and ghost flag is set
            !(moveEffects.damage.ghost && !ctx.user.types.includes("ghost")))
        {
            // TODO(doubles): actually track targets
            const targetRef = moveEffects.damage.target === "self" ?
                ctx.userRef : otherSide(ctx.userRef);
            const damageResult = yield* parsers.percentDamage(ctx.pstate,
                targetRef, moveEffects.damage.percent, lastEvent);
            if (!damageResult.success)
            {
                throw new Error("Expected effect that didn't happen: " +
                    `${moveEffects.damage.target} percentDamage ` +
                    `${moveEffects.damage.percent}%`);
            }
            lastEvent = damageResult.event;
        }
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
            lastEvent = countResult.event;
        }
        if (moveEffects?.boost &&
            // shouldn't activate if ghost type and noGhost flag is set
            !(moveEffects.boost.noGhost && ctx.user.types.includes("ghost")))
        {
            const chance = moveEffects.boost.chance;
            for (const tgt of ["self", "hit"] as dexutil.MoveEffectTarget[])
            {
                const table = moveEffects.boost[tgt];
                if (!table) continue;
                const targetRef = tgt === "self" ?
                    ctx.userRef : otherSide(ctx.userRef);
                // substitute blocks boost effects
                if (tgt === "hit" && !ctx.moveData.flags?.ignoreSub &&
                    ctx.pstate.state.teams[targetRef].active.volatile
                        .substitute)
                {
                    continue;
                }
                const {set} = moveEffects.boost;
                const boostResult = yield* moveBoost(ctx, targetRef, table,
                    chance, set, lastEvent);
                if (Object.keys(boostResult.remaining).length > 0 &&
                    !moveEffects.boost.chance)
                {
                    throw new Error("Expected effect that didn't happen: " +
                        `${tgt} boost ${set ? "set" : "add"} ` +
                        JSON.stringify(boostResult.remaining));
                }
                lastEvent = boostResult.event;
            }
        }
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
        if (moveEffects?.status &&
            // shouldn't activate if non-ghost type and ghost flag is set
            !(moveEffects.status.ghost && !ctx.user.types.includes("ghost")))
        {
            for (const tgt of ["self", "hit"] as dexutil.MoveEffectTarget[])
            {
                const statusTypes = moveEffects.status[tgt];
                if (!statusTypes) continue;
                const targetRef = tgt === "self" ?
                    ctx.userRef : otherSide(ctx.userRef);
                // substitute blocks status conditions
                if (tgt === "hit" && !ctx.moveData.flags?.ignoreSub &&
                    ctx.pstate.state.teams[targetRef].active.volatile
                        .substitute)
                {
                    continue;
                }
                const statusResult = yield* parsers.status(ctx.pstate,
                    targetRef, statusTypes, lastEvent);
                if (!statusResult.success)
                {
                    // status was the main effect of the move (e.g. thunderwave)
                    if (!moveEffects.status.chance &&
                        ctx.moveData.category === "status")
                    {
                        throw new Error("Expected effect that didn't happen: " +
                            `${tgt} status [${statusTypes.join(", ")}]`);
                    }
                    // may have a status immunity ability
                    statusImmunity(ctx, targetRef);
                }
                lastEvent = statusResult.event;

                // verify if imprison was successful
                if (statusResult.success === "imprison")
                {
                    imprison(ctx, /*failed*/ false);
                }
            }
        }
        const statusLoopResult = yield* eventLoop(
            async function* statusLoop(event): SubParser
            {
                if (event.type !== "activateStatusEffect") return {event};

                let accept = false;
                switch (event.effect)
                {
                    case "confusion": case "leechSeed": case "substitute":
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
                moveEffects.field, lastEvent);
            if (!fieldResult.success)
            {
                throw new Error("Expected effect that didn't happen: " +
                    `field ${moveEffects.field}`);
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

        if (ctx.moveData.category !== "status")
        {
            // drain effect
            if (moveEffects?.drain)
            {
                // see if an ability interrupts the drain effect
                let blocked: boolean | undefined;
                const expectResult = yield* ability.onMoveDrain(ctx.pstate,
                    {[otherSide(ctx.userRef)]: true}, ctx.moveData, lastEvent);
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
                }
            }

            // see if an on-moveDamage variant ability will activate
            // TODO: track actual move targets
            const holderRef = otherSide(ctx.userRef);
            const flags = ctx.mentionedTargets.get(holderRef);
            // choose category with highest precedence
            let qualifier: "damage" | "contact" | "contactKO" | undefined;
            if (ctx.moveData.flags?.contact)
            {
                if (flags?.damaged === "ko") qualifier = "contactKO";
                else if (flags?.damaged) qualifier = "contact";
            }
            else if (flags?.damaged) qualifier = "damage";
            if (qualifier)
            {
                const expectResult = yield* ability.onMoveDamage(ctx.pstate,
                    {[holderRef]: true}, qualifier, ctx.moveData, lastEvent);
                lastEvent = expectResult.event;
            }

            // recoil effect
            if (moveEffects?.recoil)
            {
                const damageResult = yield* parsers.damage(ctx.pstate,
                    ctx.userRef, "recoil", -1, lastEvent);
                if (damageResult.success !== "silent")
                {
                    recoil(ctx, /*consumed*/ !!damageResult.success);
                }
                lastEvent = damageResult.event;
            }
        }

        // TODO: focussash
        // TODO: item removal effects
        // TODO: when do resist berries activate?
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
        if (ctx.moveData.category !== "status" &&
            [...ctx.mentionedTargets].some(([, flags]) => flags.damaged) &&
            !ctx.user.fainted && !selfFaint)
        {
            const itemResult = yield* item.onMovePostDamage(ctx.pstate,
                {[ctx.userRef]: true}, lastEvent);
            lastEvent = itemResult.event;
        }
    }

    // expect faint events if applicable
    const faintCandidates = new Set<Side>();
    if (!ctx.failed)
    {
        for (const [monRef, flags] of ctx.mentionedTargets)
        {
            if (flags.damaged !== "ko") continue;
            faintCandidates.add(monRef);
        }
    }
    if (ctx.user.fainted || selfFaint)
    {
        faintCandidates.add(ctx.userRef);
    }
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

    if (!ctx.failed && moveEffects?.selfSwitch &&
        // if last mon remaining, self-switch effects should either fail or be
        //  ignored
        !ctx.pstate.state.teams[ctx.userRef].pokemon.every(
            (mon, i) => i === 0 || mon?.fainted))
    {
        const switchResult = yield* expectSelfSwitch(ctx,
            moveEffects.selfSwitch, lastEvent);
        lastEvent = switchResult.event;
    }

    return {...lastEvent && {event: lastEvent}};
}

// postDamage event helpers

/**
 * Expects a called move effect.
 * @param userRef User of the called move.
 * @param callEffect Call effect.
 * @param bounced Whether the is move was reflected by an effect (e.g. Magic
 * Coat).
 */
async function* expectCalledMove(ctx: MoveContext, userRef: Side,
    callEffect: effects.CallType, bounced?: boolean, lastEvent?: events.Any):
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
    if (ctx.user.fainted)
    {
        return {...lastEvent && {event: lastEvent}};
    }

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
            {[targetRef]: true}, ctx.userRef, ctx.moveData, lastEvent);
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

    // TODO: refactor parsers.boost to accept deconstructed Effect
    const effect: effects.Boost =
        {type: "boost", ...set ? {set: table} : {add: table}};
    const boostResult = yield* parsers.boost(ctx.pstate, targetRef,
        effect, /*silent*/ chance != null, lastEvent);

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
    effect: effects.SelfSwitchType, lastEvent?: events.Any): SubParser
{
    // can't do anything if fainted, unless this was intended like with
    //  healingwish/lunardance moves (gen4: replacement is sent out immediately)
    if (ctx.user.fainted && !ctx.moveData.effects?.selfFaint)
    {
        return {...lastEvent && {event: lastEvent}};
    }

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
        // generally this happens when the move has been fully handled but the
        //  context hasn't yet realized it and expired (TODO)
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

    const target = ctx.pstate.state.teams[targetRef].active;
    if (ctx.user !== target)
    {
        // update opponent's mirror move tracker
        if (ctx.mirror) target.volatile.mirrorMove = ctx.moveName;

        // deduct an extra pp if the target has pressure
        // TODO(gen>=5): don't count allies
        if (!flags.pressured && ctx.move && !target.volatile.suppressAbility &&
            target.ability === "pressure" &&
            // only ability that can cancel pressure
            // TODO: use ignoreTargetAbility flag
            ctx.user.ability !== "moldbreaker")
        {
            ctx.move.pp -= 1;
            flags.pressured = true;
        }

        if (target.volatile.substitute && !ctx.moveData.flags?.ignoreSub &&
            flags.damaged)
        {
            throw new Error("Move should've been blocked by target's " +
                "Substitute");
        }
    }

    return true;
}

/**
 * Handles implicit move effects, consuming most remaining flags. This should be
 * called once it is confirmed whether the move failed or not.
 * @param failed Whether this is being called in the context of a move failure.
 */
function handleImplicitEffects(ctx: MoveContext, failed: boolean): void
{
    if (ctx.implicitHandled) return;
    ctx.implicitHandled = true;

    // singles: try to infer targets
    // TODO: in doubles, this may be more complicated or just ignored
    const opponent = otherSide(ctx.userRef);
    if (ctx.pendingTargets[opponent]) addTarget(ctx, opponent);
    if (ctx.pendingTargets[ctx.userRef]) addTarget(ctx, ctx.userRef);

    if (ctx.moveName === "naturalgift") naturalGift(ctx, failed);

    // handle fail inferences
    if (failed)
    {
        // the failed=false side of this is handled by a separate event
        if (ctx.moveData.effects?.status?.self?.includes("imprison") &&
            !ctx.moveData.effects.status.chance)
        {
            imprison(ctx, /*failed*/true);
        }

        if (!ctx.called) ctx.user.volatile.stall(false);

        // clear continuous moves
        ctx.user.volatile.lockedMove.reset();
        ctx.user.volatile.rollout.reset();

        // TODO: other implications of a move failing
        return;
    }

    // user effects

    let lockedMove = false;
    const {lockedMove: lock} = ctx.user.volatile;
    switch (ctx.moveData.implicit?.status)
    {
        case "defenseCurl": case "minimize": case "mustRecharge":
            ctx.user.volatile[ctx.moveData.implicit.status] = true;
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
    switch (ctx.moveData.implicit?.team)
    {
        case "healingWish": case "lunarDance":
            team.status[ctx.moveData.implicit.team] = true;
            break;
        // wish can be used consecutively, but only the first use counts
        case "wish":
            team.status.wish.start(/*restart*/false);
            break;
    }
    team.status.selfSwitch = ctx.moveData.effects?.selfSwitch ?? null;
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

/**
 * Infers an implicit status immunity. Assumes the move's effect couldn't have
 * been silently consumed.
 * @param targetRef Target that was supposed to receive the move's status
 * effect.
 */
function statusImmunity(ctx: MoveContext, targetRef: Side): void
{
    // status must have a 100% secondary chance
    const status = ctx.moveData.effects?.status;
    // TODO: what about self-status moves? e.g. locked move w/owntempo ability
    if (!status?.hit) return;
    if ((status.chance ?? 0) < 100) return;

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
            `[${status.hit.join(", ")}] was still blocked by target ` +
            `'${targetRef}'`);
    }

    // the target must have a status immunity ability
    // make sure the ability isn't suppressed or we'll have a problem
    const target = ctx.pstate.state.teams[targetRef].active;
    if (target.volatile.suppressAbility)
    {
        throw new Error(`Move '${ctx.moveName}' status ` +
            `[${status.hit.join(", ")}] was blocked by target '${targetRef}' ` +
            "but target's ability is suppressed");
    }

    // find abilities that grant applicable status immunities
    const targetAbility = target.traits.ability;
    const filtered = [...targetAbility.possibleValues]
        // use some instead of every since if there are 2 possible statuses to
        //  inflict, it should consider immunities to either
        .filter(n => status.hit!.some(
            s => targetAbility.map[n].on?.block?.status?.[s]));
    if (filtered.length <= 0)
    {
        throw new Error(`Move '${ctx.moveName}' status ` +
            `[${status.hit.join(", ")}] was blocked by target '${targetRef}' ` +
            "but target's ability " +
            `[${[...targetAbility.possibleValues].join(", ")}] can't block it`);
    }
    targetAbility.narrow(...filtered);
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
        ctx.user.item.narrow(...Object.keys(dex.berries));
        ctx.user.removeItem(/*consumed*/true);
    }
    // fails if the user doesn't have a berry
    else ctx.user.item.remove(...Object.keys(dex.berries));
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
            if (noRecoilAbilities.length === userAbility.possibleValues.size)
            {
                throw new Error(`Move ${ctx.moveName} user '${ctx.userRef}' ` +
                    "must have a recoil-canceling ability " +
                    `[${noRecoilAbilities.join(", ")}] but recoil still ` +
                    "happened");
            }
            userAbility.remove(...noRecoilAbilities);
        }
        // must have a recoil-canceling ability
        else if (noRecoilAbilities.length <= 0)
        {
            throw new Error(`Move ${ctx.moveName} user '${ctx.userRef}' ` +
                `ability [${[...userAbility.possibleValues].join(", ")}] ` +
                "can't suppress recoil but it still suppressed recoil");
        }
        else userAbility.narrow(...noRecoilAbilities);
    }
}
