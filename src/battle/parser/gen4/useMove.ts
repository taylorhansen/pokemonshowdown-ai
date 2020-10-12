import * as dex from "../../dex/dex";
import * as dexutil from "../../dex/dex-util";
import * as effects from "../../dex/effects";
import { Move } from "../../state/Move";
import { Pokemon } from "../../state/Pokemon";
import { otherSide, Side } from "../../state/Side";
import * as events from "../BattleEvent";
import { ParserState, SubParser } from "../BattleParser";
import { eventLoop } from "../helpers";
import { handlers as base } from "./base";
import { PendingMoveEffects } from "./pending/PendingMoveEffects";

/**
 * Handles events within the context of a move being used. Returns the
 * last event that it didn't handle.
 * @param called Whether this move was called by another move, or reflected
 * (`"bounced"`) via another effect. Default false.
 */
export async function* useMove(pstate: ParserState,
    initialEvent: events.UseMove, called: boolean | "bounced" = false):
    SubParser
{
    // start event loop
    const ctx = initCtx(pstate, initialEvent, called);
    // TODO: enfore order of move effects?
    const result = yield* eventLoop(event => loop(ctx, event));

    // clean up flags
    handleImplicitEffects(ctx, /*failed*/false);
    // TODO: simple way to infer blocked ability effects?

    // if we had a self-switch flag, the game must've ignored it
    // TODO: detech when this should be ignored
    ctx.pendingEffects.consume("primary", "selfSwitch");
    ctx.pstate.state.teams[ctx.userRef].status.selfSwitch = null;

    // make sure all pending effects were accounted for
    ctx.pendingEffects.assert();

    return result;
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

    // move expectations (reset once handled)
    /** Whether all implicit effects should have been handled by now. */
    implicitHandled: boolean;
    /** Pending move effects. */
    readonly pendingEffects: PendingMoveEffects;
    /** Whether this move should be recorded by its targets for Mirror Move. */
    readonly mirror: boolean;
    /** Last move before this one. */
    readonly lastMove?: string;

    // in-progress move result flags
    /**
     * Target-refs currently mentioned by listening to events. Lays groundwork
     * for future double/triple battle support. Value type is whether the
     * pokemon was damaged by this move, or `"ko"` if it was KO'd.
     */
    readonly mentionedTargets: Map<Side, boolean | "ko">;
}

/** Initializes move context state. */
function initCtx(pstate: ParserState, event: events.UseMove,
    called: boolean | "bounced"): MoveContext
{
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
    switch (moveData.target)
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

    // setup pending effects

    const pendingEffects = new PendingMoveEffects(moveData);

    // override for non-ghost type curse effect
    // TODO(gen6): handle interactions with protean
    if (!user.types.includes("ghost") &&
        pendingEffects.consume("hit", "status", "curse"))
    {
        pendingTargets = framePendingTargets(userRef, {us: true, them: false});
        totalTargets = 1;
    }

    // release two-turn move
    let releasedTwoTurn = false;
    if (user.volatile.twoTurn.type === moveName)
    {
        user.volatile.twoTurn.reset();
        if (!pendingEffects.consume("primary", "delay", "twoTurn"))
        {
            throw new Error(`Two-turn move '${moveName}' does not have ` +
                "delay=twoTurn");
        }
        releasedTwoTurn = true;
    }

    const continueLock = user.volatile.lockedMove.type === moveName;
    const continueRollout = user.volatile.rollout.type === moveName;

    const mirror =
        // expected to be a charging turn, no mirror
        pendingEffects.get("primary", "delay") !== "twoTurn" &&
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
        totalTargets, implicitHandled: false, pendingEffects, mirror,
        ...(lastMove && {lastMove}), mentionedTargets: new Map()
    };


    // only reveal and deduct pp if this event isn't continuing a multi-turn
    //  move
    const reveal = !releasedTwoTurn && !continueLock && !continueRollout;

    // if this isn't a called move, then the user must have this move in its
    //  moveset (i.e. it is an actual move selection by the player)
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

/** Loop function for iterating through events. */
async function* loop(ctx: MoveContext, event: events.Any): SubParser
{
    if (!handlers.hasOwnProperty(event.type)) return event;
    const handler = handlers[event.type as keyof typeof handlers] as
        (ctx: MoveContext, event: events.Any) => SubParser;
    return yield* handler(ctx, event);
}

/** Handlers for each move-related event. */
const handlers =
{
    async* activateAbility(ctx: MoveContext, event: events.ActivateAbility):
        SubParser
    {
        // if an invert-drain ability is activating, it must be overriding the
        //  current pending drain effect
        // TODO: only do this once the AbilityContext consumes the corresponding
        //  takeDamage event
        if (dex.abilities[event.ability]?.invertDrain &&
            !ctx.pendingEffects.consume("primary", "drain"))
        {
            return;
        }

        // choose category with highest precedence
        const damaged = ctx.mentionedTargets.get(event.monRef);
        let on: effects.ability.On | null = null;
        if (ctx.moveData.flags?.contact)
        {
            if (damaged === "ko") on = "contactKO";
            else if (damaged) on = "contact";
        }
        else if (damaged) on = "damaged";

        // TODO: make inference based on Ability#blockedBy
        return yield* base.activateAbility(ctx.pstate, event, on, ctx.moveName);
    },
    async* activateFieldEffect(ctx: MoveContext,
        event: events.ActivateFieldEffect): SubParser
    {
        // is this event possible within the context of this move?
        if (!ctx.pendingEffects.consume("primary", "field", event.effect))
        {
            return event;
        }

        // fill in the user of the weather move
        let source: Pokemon | undefined;
        if (event.start && dexutil.isWeatherType(event.effect))
        {
            source = ctx.user;
        }
        return yield* base.activateFieldEffect(ctx.pstate, event, source);
    },
    async* activateItem(ctx: MoveContext, event: events.ActivateItem): SubParser
    {
        // currently only supports selfDamageMove activations
        if (ctx.userRef !== event.monRef ||
            ctx.moveData.category === "status")
        {
            return event;
        }

        return yield* base.activateItem(ctx.pstate, event, "selfDamageMove");
    },
    async* activateStatusEffect(ctx: MoveContext,
        event: events.ActivateStatusEffect): SubParser
    {
        const ctg = event.monRef === ctx.userRef ? "self" : "hit";
        let accept = false;
        switch (event.effect)
        {
            case "aquaRing": case "attract": case "bide": case "charge":
            case "curse": case "embargo": case "encore": case "focusEnergy":
            case "foresight": case "healBlock": case "ingrain":
            case "magnetRise": case "miracleEye": case "mudSport":
            case "nightmare": case "powerTrick": case "suppressAbility":
            case "taunt": case "torment": case "waterSport": case "yawn":
            // singlemove
            case "destinyBond": case "grudge":
            // singleturn
            case "endure": case "magicCoat": case "protect": case "snatch":
                accept = event.start &&
                    ctx.pendingEffects.consume(ctg, "status", event.effect) &&
                    addTarget(ctx, event.monRef);
                break;
            case "confusion": case "leechSeed": case "substitute":
                // can be removed by a different move, but currently not tracked
                //  yet (TODO)
                accept = !event.start ||
                    ctx.pendingEffects.consume(ctg, "status", event.effect) &&
                    addTarget(ctx, event.monRef);
                break;
            case "imprison":
                accept = ctg === "self" && event.start &&
                    ctx.pendingEffects.consume(ctg, "status", event.effect) &&
                    addTarget(ctx, ctx.userRef);
                // verified that imprison was successful
                if (accept) imprison(ctx, /*failed*/false);
                break;
            case "rage": case "roost": case "uproar":
                accept = event.start &&
                    ctx.pendingEffects.consume(ctg, "status", event.effect);
                break;
            default:
                if (dexutil.isMajorStatus(event.effect))
                {
                    // TODO: also track curing moves
                    // for now, curing moves are ignored and silently passed
                    accept = !event.start ||
                        ctx.pendingEffects.consume(ctg, "status", event.effect);
                }
        }
        return accept ?
            yield* base.activateStatusEffect(ctx.pstate, event) : event;
    },
    async* activateTeamEffect(ctx: MoveContext,
        event: events.ActivateTeamEffect): SubParser
    {
        let accept: boolean;
        let source: Pokemon | null = null;
        switch (event.effect)
        {
            case "healingWish": case "lunarDance":
                // no known move can explicitly start this effect, only when the
                //  user faints and a replacement is sent
                // TODO(gen>4): replacement is not sent out immediately
                accept = !event.start && event.teamRef === ctx.userRef &&
                    ctx.pendingEffects.consume("self", "team", event.effect);
                break;
            case "luckyChant": case "mist": case "safeguard": case "tailwind":
                // no known move can explicitly end these effects, only when
                //  we're at the end of their durations
                accept = event.start && event.teamRef === ctx.userRef &&
                    ctx.pendingEffects.consume("self", "team", event.effect);
                break;
            case "spikes": case "stealthRock": case "toxicSpikes":
            {
                // can be cleared by a move, but aren't covered by a flag yet
                //  (TODO)
                // if start, should mention opposing side
                const opposing = event.teamRef !== ctx.userRef;
                if (event.start && opposing)
                {
                    accept =
                        ctx.pendingEffects.consume("hit", "team",
                            event.effect) &&
                        addTarget(ctx, event.teamRef);
                }
                else accept = !event.start && !opposing;
                break;
            }
            case "lightScreen": case "reflect":
            {
                // can be cleared by a move, but aren't covered by a flag yet
                //  (TODO)
                const opposing = event.teamRef !== ctx.userRef;
                if (event.start && !opposing)
                {
                    accept =
                        ctx.pendingEffects.consume("self", "team",
                            event.effect) &&
                        addTarget(ctx, event.teamRef);
                    // fill in the user of the move
                    source = ctx.user;
                }
                else accept = !event.start;
            }
        }
        return accept ?
            yield* base.activateTeamEffect(ctx.pstate, event, source) : event;
    },
    async* block(ctx: MoveContext, event: events.Block): SubParser
    {
        // endure only protects from going to 0hp, so the move effects still
        //  take place
        if (event.effect !== "endure")
        {
            // move effects were blocked
            if (!handleBlock(ctx, event)) return event;
            // reflecting the move, expect the next event to call it
            if (event.effect === "magicCoat")
            {
                const mon = ctx.pstate.state.teams[event.monRef].active;
                // verify magiccoat and reflectable flags
                if (!mon.volatile.magicCoat || ctx.called === "bounced" ||
                    !ctx.moveData.flags?.reflectable)
                {
                    return event;
                }
                ctx.pendingEffects.setCall(ctx.moveName, /*bounced*/ true);
            }
        }
        return yield* base.block(ctx.pstate, event);
    },
    async* boost(ctx: MoveContext, event: events.Boost): SubParser
    {
        const ctg = event.monRef === ctx.userRef ? "self" : "hit";
        const mon = ctx.pstate.state.teams[event.monRef].active;
        // TODO: complete full tracking, then expire if consume returns false
        const accept =
            (!ctx.pendingEffects.consume(ctg, "boost", event.stat, event.amount,
                ...(event.set ? [] : [mon.volatile.boosts[event.stat]])) ||
            // some moves can have a target but also boost the user's stats, but
            //  the user still isn't technically a target in this case
            ctg === "self" || addTarget(ctx, event.monRef));
        return accept ? yield* base.boost(ctx.pstate, event) : event;
    },
    changeType(ctx: MoveContext, event: events.ChangeType): SubParser
    {
        // TODO: track type change effects: camouflage, conversion2, colorchange
        if (event.monRef === ctx.userRef &&
            ctx.pendingEffects.consume("self", "unique", "conversion"))
        {
            // changes the user's type into that of a known move
            ctx.user.moveset.addMoveSlotConstraint(
                dex.typeToMoves[event.newTypes[0]]);
        }
        return base.changeType(ctx.pstate, event);
    },
    async* clause(ctx: MoveContext, event: events.Clause): SubParser
    {
        // ps-specific clause mod is blocking an effect
        let accept = false;
        switch (event.clause)
        {
            case "slp":
                accept = ctx.pendingEffects.consume("hit", "status", "slp");
                break;
        }
        return accept ? yield* base.clause(ctx.pstate, event) : event;
    },
    async* countStatusEffect(ctx: MoveContext, event: events.CountStatusEffect):
        SubParser
    {
        let accept = false;
        switch (event.effect)
        {
            case "perish":
                // event is sent for each pokemon targeted by the perish
                //  song move, so it's difficult to pinpoint who exactly
                //  it will hit for now
                // TODO: a better solution would be to use the
                //  `|-fieldactivate|` event (#138) to consume the
                //  status (still letting base context set the counters via this
                //  event), then rely on end-of-turn events for updating the
                //  counters
                // TODO: infer soundproof if the counter doesn't take place at
                //  the end of the turn
                ctx.pendingEffects.consume("primary", "countableStatus",
                    "perish");
                accept = true;
                break;
            case "stockpile":
                accept = event.monRef === ctx.userRef &&
                    ctx.pendingEffects.consume("primary", "countableStatus",
                        "stockpile");
                break;
        }
        return accept ?
            yield* base.countStatusEffect(ctx.pstate, event) : event;
    },
    async* crit(ctx: MoveContext, event: events.Crit): SubParser
    {
        return addTarget(ctx, event.monRef) ?
            yield* base.crit(ctx.pstate, event) : event;
    },
    async* disableMove(ctx: MoveContext, event: events.DisableMove): SubParser
    {
        const ctg = event.monRef === ctx.userRef ? "self" : "hit";
        const accept = ctx.pendingEffects.consume(ctg, "unique", "disable") &&
            // TODO: track cursedbody, other disable effects
            (ctg === "self" || addTarget(ctx, event.monRef));
        return accept ?
            yield* base.disableMove(ctx.pstate, event) : event;
    },
    async* fail(ctx: MoveContext, event: events.Fail): SubParser
    {
        return handleFail(ctx, event) ?
            yield* base.fail(ctx.pstate, event) : event;
    },
    async* faint(ctx: MoveContext, event: events.Faint): SubParser
    {
        // handle self-faint effects from healingWish/lunarDance
        // TODO(gen>4): consume healingWish/lunarDance since replacement is no
        //  longer sent out immediately
        if (event.monRef === ctx.userRef)
        {
            const teamEffect = ctx.pendingEffects.get("self", "team");
            if (teamEffect === "healingWish" || teamEffect === "lunarDance")
            {
                ctx.pstate.state.teams[ctx.userRef].status[teamEffect] = true;
                // gen4: replacement is sent out immediately, so communicate
                //  that by setting self-switch
                ctx.pendingEffects.setSelfSwitch();
            }
        }

        // if the target fainted, some effects have to be canceled
        ctx.pendingEffects.clearFaint(
            event.monRef === ctx.userRef ? "self" : "hit");
        // TODO: handle self-destruct moves
        return addTarget(ctx, event.monRef, "ko") ?
            yield* base.faint(ctx.pstate, event) : event;
    },
    async* futureMove(ctx: MoveContext, event: events.FutureMove): SubParser
    {
        if (!event.start) return event;
        if (!dex.isFutureMove(ctx.moveName))
        {
            throw new Error(`Invalid future move ${ctx.moveName}`);
        }
        const accept = event.move === ctx.moveName &&
            ctx.pendingEffects.consume("primary", "delay", "future");
        return accept ? yield* base.futureMove(ctx.pstate, event) : event;
    },
    async* halt(ctx: MoveContext, event: events.Halt): SubParser
    {
        switch (event.reason)
        {
            case "switch":
                // is a self-switch effect pending for us? if so, then we should
                //  be getting a request for a switch decision
                if (ctx.userRef === "us" &&
                    ctx.pendingEffects.get("primary", "selfSwitch"))
                {
                    break;
                }
                // fallthrough
            // decide happens after the turn, can't happen during a move
            case "decide":
            // game-over could happen directly after a move, but not as part of
            //  a move effect
            case "gameOver":
                return event;
            // moves can force a switch decision for either side
            case "wait": break;
        }
        // if a fail event hasn't been encountered yet, then it likely never
        //  will happen since one of the move's effects (self-switch, faint,
        //  etc) is being invoked right now
        handleImplicitEffects(ctx, /*failed*/ false);
        return yield* base.halt(ctx.pstate, event);
    },
    async* immune(ctx: MoveContext, event: events.Immune): SubParser
    {
        // TODO: check type effectiveness?
        return handleBlock(ctx, event) ?
            yield* base.immune(ctx.pstate, event) : event;
    },
    async* miss(ctx: MoveContext, event: events.Miss): SubParser
    {
        // TODO: check accuracy?
        return handleBlock(ctx, event) ?
            yield* base.miss(ctx.pstate, event) : event;
    },
    async* noTarget(ctx: MoveContext, event: events.NoTarget): SubParser
    {
        // TODO: check target presence?
        const accept = ctx.userRef === event.monRef && handleFail(ctx, event);
        return accept ? yield* base.noTarget(ctx.pstate, event) : event;
    },
    async* prepareMove(ctx: MoveContext, event: events.PrepareMove): SubParser
    {
        if (event.monRef !== ctx.userRef) return event;
        if (event.move !== ctx.moveName)
        {
            throw new Error(`Mismatched prepareMove: Using '${ctx.moveName}' ` +
                `but got '${event.move}'`);
        }
        if (!dex.isTwoTurnMove(ctx.moveName))
        {
            throw new Error(`Invalid future move '${ctx.moveName}'`);
        }
        return ctx.pendingEffects.consume("primary", "delay", "twoTurn") ?
            yield* base.prepareMove(ctx.pstate, event) : event;
    },
    // TODO
    async* removeItem(ctx: MoveContext, event: events.RemoveItem): SubParser {},
    async* resisted(ctx: MoveContext, event: events.Resisted): SubParser
    {
        // TODO: check type effectiveness?
        return addTarget(ctx, event.monRef) ?
            yield* base.resisted(ctx.pstate, event) : event;
    },
    async* superEffective(ctx: MoveContext, event: events.SuperEffective):
        SubParser
    {
        // TODO: check type effectiveness?
        return addTarget(ctx, event.monRef) ?
            yield* base.superEffective(ctx.pstate, event) : event;
    },
    async* swapBoosts(ctx: MoveContext, event: events.SwapBoosts): SubParser
    {
        // should be swapping with the user and a target
        const accept = [event.monRef1, event.monRef2].includes(ctx.userRef) &&
            ctx.pendingEffects.consume("primary", "swapBoost", event.stats) &&
            addTarget(ctx,
                event.monRef1 === ctx.userRef ? event.monRef2 : event.monRef1);
        return accept ? yield* base.swapBoosts(ctx.pstate, event) : event;
    },
    async* switchIn(ctx: MoveContext, event: events.SwitchIn): SubParser
    {
        // consume self-switch flag
        const accept = ctx.userRef === event.monRef &&
            ctx.pendingEffects.consume("primary", "selfSwitch");
        // handle the switch in the context of this move
        // TODO: add params to switchIn: self, copyvolatile
        return accept ? yield* base.switchIn(ctx.pstate, event) : event;
    },
    async* takeDamage(ctx: MoveContext, event: events.TakeDamage): SubParser
    {
        let accept: boolean;
        switch (event.from)
        {
            case "drain":
                accept = event.monRef === ctx.userRef &&
                    // TODO: verify damage fraction
                    ctx.pendingEffects.consume("primary", "drain") &&
                    // infer drain effect was consumed
                    (drain(ctx), true);
                // TODO: infer no liquidooze
                break;
            case "recoil":
                accept = event.monRef === ctx.userRef &&
                    // TODO: verify damage fraction
                    ctx.pendingEffects.consume("primary", "recoil") &&
                    // infer recoil effect was consumed
                    (recoil(ctx, /*consumed*/ true), true);
                break;
            default:
                accept = addTarget(ctx, event.monRef,
                    /*damaged*/ event.hp <= 0 ? "ko" : true);
        }
        return accept ? yield* base.takeDamage(ctx.pstate, event) : event;
    },
    async* transform(ctx: MoveContext, event: events.Transform): SubParser
    {
        const accept = ctx.userRef === event.source &&
            addTarget(ctx, event.target);
        return accept ? yield* base.transform(ctx.pstate, event) : event;
    },
    async* useMove(ctx: MoveContext, event: events.UseMove): SubParser
    {
        // if we're not expecting a move to be called, treat this as a
        //  normal move event
        const callEffect = ctx.pendingEffects.get("primary", "call");
        if (!callEffect) return event;

        let bounced: boolean | undefined;
        switch (callEffect)
        {
            case true: break; // nondeterministic move call
            case "copycat":
                if (ctx.lastMove !== event.move) return event;
                break;
            case "mirror":
                if (ctx.user.volatile.mirrorMove !== event.move) return event;
                break;
            case "self":
                // calling a move that is part of the user's moveset
                if (ctx.userRef !== event.monRef ||
                    !addTarget(ctx, ctx.userRef))
                {
                    return event;
                }
                ctx.user.moveset.reveal(event.move);
                break;
            case "target":
            {
                const targetRef = otherSide(ctx.userRef);
                if (ctx.userRef !== event.monRef || !addTarget(ctx, targetRef))
                {
                    return event;
                }
                ctx.pstate.state.teams[targetRef].active.moveset
                    .reveal(event.move);
                break;
            }
            default:
                // regular string specifies the move that should be called
                // TODO: what if copycat is supposed to be called rather than
                //  the copycat effect?
                if (event.move !== callEffect) return event;
                bounced = ctx.pendingEffects.consume("primary", "call",
                    "bounced");
        }

        ctx.pendingEffects.consume("primary", "call");

        // make sure this is handled like a called move
        return yield* base.useMove(ctx.pstate, event,
            /*called*/ bounced ? "bounced" : true);
    }
} as const;

// grouped event handlers

/** Handles an event where the pokemon's move failed to take effect. */
function handleFail(ctx: MoveContext, event: events.Fail | events.NoTarget):
    boolean
{
    handleImplicitEffects(ctx, /*failed*/true);
    return true;
}

/** Handles an event where a pokemon blocked the move. */
function handleBlock(ctx: MoveContext,
    event: events.Block | events.Immune | events.Miss): boolean
{
    // generally a complete miss fails the move
    // TODO: partial misses (requires doubles support)
    handleImplicitEffects(ctx, /*failed*/true);
    return addTarget(ctx, event.monRef);
}

// inference helper functions
/**
 * Indicates that the BattleEvents mentioned a target for the current move.
 * @param damaged Whether the pokemon was damaged (true) or KO'd ('"ko"`).
 * @returns False on error, true otherwise.
 */
function addTarget(ctx: MoveContext, targetRef: Side,
    damaged: boolean | "ko" = false): boolean
{
    const last = ctx.mentionedTargets.get(targetRef);
    // already mentioned target earlier
    if (last !== undefined)
    {
        // update damaged status if higher precedence (ko > true > false)
        if (!last || damaged === "ko")
        {
            ctx.mentionedTargets.set(targetRef, damaged);
        }
        return true;
    }

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
        ctx.pstate.logger.error("Can't add more targets. Already mentioned " +
            `${ctx.mentionedTargets.size} ` +
            (ctx.mentionedTargets.size > 0 ?
                `('${[...ctx.mentionedTargets].join("', '")}') ` : "") +
            `but trying to add '${targetRef}'.`);
        return false;
    }

    ctx.mentionedTargets.set(targetRef, damaged);

    const target = ctx.pstate.state.teams[targetRef].active;
    if (ctx.user !== target)
    {
        // update opponent's mirror move tracker
        if (ctx.mirror) target.volatile.mirrorMove = ctx.moveName;

        // deduct an extra pp if the target has pressure
        // TODO: gen>=5: don't count allies
        if (ctx.move && !target.volatile.suppressAbility &&
            target.ability === "pressure" &&
            // only ability that can cancel pressure
            ctx.user.ability !== "moldbreaker")
        {
            ctx.move.pp -= 1;
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

    // reset stall counter if it wasn't updated this turn
    if (!ctx.called && !ctx.user.volatile.stalling)
    {
        ctx.user.volatile.stall(false);
    }

    // handle fail inferences
    if (failed)
    {
        if (ctx.pendingEffects.get("primary", "call") === "copycat" &&
            ctx.lastMove && !dex.moves[ctx.lastMove].flags?.noCopycat)
        {
            throw new Error("Copycat effect failed but should've called " +
                `'${ctx.lastMove}'`);
        }
        if (ctx.pendingEffects.get("primary", "call") === "mirror" &&
            ctx.user.volatile.mirrorMove)
        {
            throw new Error("Mirror Move effect failed but should've " +
                `called '${ctx.user.volatile.mirrorMove}'`);
        }

        // the failed=false side of this is handled by a separate event
        if (ctx.pendingEffects.get("self", "status") === "imprison")
        {
            imprison(ctx, /*failed*/true);
        }

        // clear pending flags
        ctx.pendingEffects.clear();

        // clear continuous moves
        ctx.user.volatile.lockedMove.reset();
        ctx.user.volatile.rollout.reset();

        // TODO: other implications of a move failing
        return;
    }

    // user effects

    for (const ctg of ["self", "hit"] as const)
    {
        // TODO(non-singles): support multiple targets
        const monRefs = ctg === "self" ?
            [ctx.userRef]
            : [...ctx.mentionedTargets.keys()].filter(r => r !== ctx.userRef);
        for (const monRef of monRefs)
        {
            const mon = ctx.pstate.state.teams[monRef].active;

            // consume any silent confusion effects if silently immune
            if (mon.volatile.confusion.isActive ||
                (mon.ability &&
                    dex.abilities[mon.ability].immune === "confusion"))
            {
                ctx.pendingEffects.consume(ctg, "status", "confusion");
            }
            else if (ctx.pendingEffects.check(ctg, "status", "confusion"))
            {
                // the only other source of immunity that can be secret is
                //  the ability
                const {ability} = mon.traits;
                const newAbilities = [...ability.possibleValues]
                    .filter(n => dex.abilities[n].immune === "confusion");
                if (newAbilities.length > 0)
                {
                    ability.narrow(...newAbilities);
                    ctx.pendingEffects.consume(ctg, "status", "confusion");
                }
            }

            // consume any silent major status effects if already afflicted
            //  by a major status
            if (mon.majorStatus.current)
            {
                ctx.pendingEffects.consume(ctg, "status", "MajorStatus");
            }

            // consume any silent boosts that were already maxed out
            for (const stat of dexutil.boostKeys)
            {
                const cur = mon.volatile.boosts[stat];
                ctx.pendingEffects.consume(ctg, "boost", stat, 0, cur);
            }
        }
    }

    // infer recoil effect ignored
    if (ctx.pendingEffects.get("primary", "recoil"))
    {
        recoil(ctx, /*consumed*/ false);
        ctx.pendingEffects.consume("primary", "recoil");
    }

    let lockedMove = false;
    const {lockedMove: lock} = ctx.user.volatile;
    switch (ctx.pendingEffects.get("self", "implicitStatus"))
    {
        case "defenseCurl":
            ctx.pendingEffects.consume("self", "implicitStatus");
            ctx.user.volatile.defenseCurl = true;
            break;
        case "lockedMove":
            ctx.pendingEffects.consume("self", "implicitStatus");
            if (!dex.isLockedMove(ctx.moveName))
            {
                throw new Error(`Invalid locked move ${ctx.moveName}`);
            }
            // continue locked status
            // already prevented from consuming pp in constructor
            if (lock.type === ctx.moveName) lock.tick();
            // start locked status
            else lock.start(ctx.moveName, !!ctx.called);
            lockedMove = true;
            break;
        case "minimize":
            ctx.pendingEffects.consume("self", "implicitStatus");
            ctx.user.volatile.minimize = true;
            break;
        // TODO: mustRecharge
    }
    // if the locked move was called, then this current context is the one that
    //  called the move so we shouldn't reset it
    if (!lockedMove && (lock.turns !== 0 || !lock.called)) lock.reset();

    // TODO: add rollout to implicitStatus above
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
    switch (ctx.pendingEffects.get("self", "implicitTeam"))
    {
        // wish can be used consecutively, but only the first use counts
        case "wish":
            team.status.wish.start(/*restart*/false);
            ctx.pendingEffects.consume("self", "implicitTeam");
            break;
    }
    team.status.selfSwitch =
        ctx.pendingEffects.get("primary", "selfSwitch") ?? null;
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

/** Makes an inference if the drain effect activated normally. */
function drain(ctx: MoveContext): void
{
    // go through opposing targets that were damaged by this move
    for (const [monRef, damaged] of ctx.mentionedTargets)
    {
        if (monRef === ctx.userRef || !damaged) continue;
        const mon = ctx.pstate.state.teams[monRef].active;

        // get possible invert-drain abilities
        const {ability} = mon.traits;
        const invertDrainAbilities = mon.volatile.suppressAbility ? []
            : [...ability.possibleValues]
                .filter(n => ability.map[n].invertDrain);
        // can't have invert-drain ability if drain effect activated
        //  normally
        ability.remove(...invertDrainAbilities);
    }
}

/**
 * Makes an inference based on whether the recoil effect was consumed or
 * ignored.
 */
function recoil(ctx: MoveContext, consumed: boolean): void
{
    // get possible recoil-canceling abilities
    const {ability} = ctx.user.traits;
    let noRecoilAbilities: string[];
    if (!ctx.user.volatile.suppressAbility)
    {
        noRecoilAbilities = [...ability.possibleValues]
            .filter(n => ability.map[n].noRecoil);
    }
    // can't infer ability if it's being suppressed
    else noRecoilAbilities = [];

    // can't have recoil-canceling abilities
    if (consumed) ability.remove(...noRecoilAbilities);
    // must have a recoil-canceling ability
    else if (noRecoilAbilities.length <= 0)
    {
        throw new Error("Ability suppressed but still suppressed recoil");
    }
    else ability.narrow(...noRecoilAbilities);
}
