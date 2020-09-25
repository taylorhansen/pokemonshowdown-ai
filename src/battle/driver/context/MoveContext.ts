import { Logger } from "../../../Logger";
import * as dex from "../../dex/dex";
import * as dexutil from "../../dex/dex-util";
import * as effects from "../../dex/effects";
import { BattleState } from "../../state/BattleState";
import { Move } from "../../state/Move";
import { Pokemon } from "../../state/Pokemon";
import { otherSide, Side } from "../../state/Side";
import * as events from "../BattleEvent";
import { ContextResult, Gen4Context, SwitchContext } from "./context";
import { PendingMoveEffects } from "./effect/PendingMoveEffects";

/** Handles events related to a move. */
export class MoveContext extends Gen4Context
{
    // event data
    /** User of the move. */
    private readonly user: Pokemon;
    /** Reference to find the user within the BattleState. */
    private readonly userRef: Side;
    /** Name of the move. */
    private readonly moveName: string;
    /** Dex data for the move. */
    private readonly moveData: dexutil.MoveData;
    /** Move object if this event is supposed to consume pp. */
    private readonly move?: Move;
    // TODO: expand for doubles/triples
    /** Maps mon-ref to whether the move may hit them. */
    private readonly pendingTargets: {readonly [TMonRef in Side]: boolean};
    /**
     * Total number of expected targets. If `#pendingTargets` allows for more
     * than this number, only the first `totalTargets` mentioned targets will be
     * counted.
     */
    private readonly totalTargets: number;

    // move expectations (reset once handled)
    /** Whether all implicit effects should have been handled by now. */
    private implicitHandled = false;
    /** Pending move effects. */
    private readonly effects: PendingMoveEffects;
    /** Whether this move should be recorded by its targets for Mirror Move. */
    private readonly mirror: boolean;
    /** Last move before this one. */
    private readonly lastMove?: string;

    // in-progress move result flags
    /**
     * Target-refs currently mentioned by listening to events. Lays groundwork
     * for future double/triple battle support. Value type is whether the
     * pokemon was damaged by this move, or `"ko"` if it was KO'd.
     */
    private readonly mentionedTargets = new Map<Side, boolean | "ko">();

    /**
     * Constructs a MoveContext.
     * @param state State object to mutate while handling events.
     * @param event Event that started this context.
     * @param logger Logger object.
     * @param called Whether this move was called by another move, or reflected
     * (`"bounced"`) via another effect. Default false.
     */
    constructor(state: BattleState, event: events.UseMove, logger: Logger,
        private readonly called: boolean | "bounced" = false)
    {
        super(state, logger);

        if (!dex.moves.hasOwnProperty(event.move))
        {
            throw new Error(`Unsupported move '${event.move}'`);
        }

        // set last move
        this.lastMove = state.status.lastMove;
        state.status.lastMove = event.move;

        // event data
        this.user = this.state.teams[event.monRef].active;
        this.userRef = event.monRef;
        this.moveName = event.move;
        this.moveData = dex.moves[event.move];
        switch (this.moveData.target)
        {
            // TODO: support non-single battles
            case "adjacentAlly":
                // these moves should always fail in singles
                this.pendingTargets = {us: false, them: false};
                this.totalTargets = 0;
                break;
            case "adjacentAllyOrSelf": case "allies": case "allySide":
            case "allyTeam": case "self":
                this.pendingTargets =
                    this.framePendingTargets({us: true, them: false});
                this.totalTargets = 1;
                break;
            case "all":
                this.pendingTargets =
                    this.framePendingTargets({us: true, them: true});
                this.totalTargets = 2;
                break;
            case "adjacentFoe": case "allAdjacent": case "allAdjacentFoes":
            case "any": case "foeSide": case "normal": case "randomNormal":
            case "scripted":
                this.pendingTargets =
                    this.framePendingTargets({us: false, them: true});
                this.totalTargets = 1;
                break;
        }

        this.effects = new PendingMoveEffects(this.moveData);

        // override for non-ghost type curse effect
        // TODO(gen6): handle interactions with protean
        if (!this.user.types.includes("ghost") &&
            this.effects.consume("hit", "status", "curse"))
        {
            this.pendingTargets = this.framePendingTargets(
                {us: true, them: false});
            this.totalTargets = 1;
        }

        // release two-turn move
        let releasedTwoTurn = false;
        if (this.user.volatile.twoTurn.type === this.moveName)
        {
            this.user.volatile.twoTurn.reset();
            if (!this.effects.consume("primary", "delay", "twoTurn"))
            {
                throw new Error(`Two-turn move ${this.moveName} does not ` +
                    "have delay=twoTurn");
            }
            releasedTwoTurn = true;
        }

        const continueLock =
            this.user.volatile.lockedMove.type === this.moveName;
        const continueRollout =
            this.user.volatile.rollout.type === this.moveName;

        this.mirror =
            // expected to be a charging turn, no mirror
            this.effects.get("primary", "delay") !== "twoTurn" &&
            // can't mirror called moves
            !called &&
            // can't mirror called rampage moves
            (!continueLock || !this.user.volatile.lockedMove.called) &&
            (!continueRollout || !this.user.volatile.rollout.called) &&
            // default to mirror move flag
            // TODO: should called+released two-turn count? (unique to PS?)
            !this.moveData.flags?.noMirror;

        // only reveal and deduct pp if this event isn't continuing a multi-turn
        //  move
        const reveal = !releasedTwoTurn && !continueLock && !continueRollout;

        // if this isn't a called move, then the user must have this move in its
        //  moveset (i.e. it is an actual move selection by the player)
        if (called) return;

        // every move decision resets any single-move statuses
        this.user.volatile.resetSingleMove();

        // set last move if directly selecting from moveset/struggle
        if (!reveal) return;
        this.user.volatile.lastMove = this.moveName;

        // only struggle can be selected without being a part of the moveset
        if (this.moveName === "struggle") return;

        const revealedMove = this.user.moveset.reveal(this.moveName);

        // record the move object in case further deductions need to be made
        this.move = revealedMove;
        --this.move.pp;

        // activate choice item lock
        // TODO: how to infer choice lock when the item is revealed?
        // TODO: what if the item is removed after setting choice lock?
        if (this.user.item.definiteValue &&
            this.user.item.map[this.user.item.definiteValue].isChoice)
        {
            this.user.volatile.choiceLock = this.moveName;
        }

        // taunt assertion
        if (revealedMove.data.category === "status" &&
            this.user.volatile.taunt.isActive)
        {
            throw new Error(`Using status move '${this.moveName}' but ` +
                "should've been Taunted");
        }
    }

    /** Used when initializing `#pendingTargets`. */
    private framePendingTargets(
        obj: {readonly [TRelMonRef in Side]: boolean}):
        {readonly [TMonRef in Side]: boolean}
    {
        if (this.userRef === "us") return obj;
        return {them: obj.us, us: obj.them};
    }

    /** @override */
    public handle(event: events.Any): ContextResult
    {
        // TODO: track all move effects, then allow this statement
        // if (this.effects.handled) return;
        return super.handle(event);
    }

    /** @override */
    public halt(): void
    {
        // if a fail event hasn't been encountered yet, then it likely never
        //  will happen
        this.handleImplicitEffects(/*failed*/false);
        super.halt();
    }

    /** @override */
    public expire(): void
    {
        // clean up flags
        this.handleImplicitEffects(/*failed*/false);
        // TODO: simple way to infer blocked ability effects?

        // all other pending flags must be accounted for

        // if we had a self-switch flag, the game must've ignored it
        // TODO: detech when this should be ignored
        this.effects.consume("primary", "selfSwitch");
        this.state.teams[this.userRef].status.selfSwitch = null;

        this.effects.assert();
        super.expire();
    }

    // event handlers

    /** @override */
    public activateAbility(event: events.ActivateAbility): ContextResult
    {
        const on = this.getAbilityCategory(event.monRef);
        const hitByMove = this.moveName;

        // TODO: make inference based on Ability#blockedBy
        return super.activateAbility(event, on, hitByMove);
    }

    /** Gets the category of the pokemon's ability activation. */
    private getAbilityCategory(monRef: Side): effects.ability.On | null
    {
        // choose category with highest precedence
        const damaged = this.mentionedTargets.get(monRef);
        let on: effects.ability.On | null = null;
        if (this.moveData.flags?.contact)
        {
            if (damaged === "ko") on = "contactKO";
            else if (damaged) on = "contact";
        }
        else if (damaged) on = "damaged";
        return on;
    }

    /** @override */
    public activateFieldEffect(event: events.ActivateFieldEffect):
        ContextResult
    {
        // is this event possible within the context of this move?
        if (!this.effects.consume("primary", "field", event.effect)) return;

        if (event.start && dexutil.isWeatherType(event.effect))
        {
            // fill in the user of the weather move (base ctx just puts null)
            this.state.status.weather.start(this.user, event.effect);
            return true;
        }
        return super.activateFieldEffect(event);
    }

    /** @override */
    public activateItem(event: events.ActivateItem): ContextResult
    {
        if (this.userRef === event.monRef &&
            this.moveData.category !== "status")
        {
            // override effect category
            return super.activateItem(event, "selfDamageMove");
        }
    }

    /** @override */
    public activateStatusEffect(event: events.ActivateStatusEffect):
        ContextResult
    {
        const ctg = event.monRef === this.userRef ? "self" : "hit";
        let result: ContextResult;
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
                result = event.start &&
                    this.effects.consume(ctg, "status", event.effect) &&
                    this.addTarget(event.monRef);
                break;
            case "confusion": case "leechSeed": case "substitute":
                // can be removed by a different move, but currently not tracked
                //  yet (TODO)
                result = !event.start ||
                    this.effects.consume(ctg, "status", event.effect) &&
                    this.addTarget(event.monRef);
                break;
            case "imprison":
                result = ctg === "self" && event.start &&
                    this.effects.consume(ctg, "status", event.effect) &&
                    this.addTarget(this.userRef);
                // verified that imprison was successful
                if (result) this.imprison(/*failed*/false);
                break;
            case "rage": case "roost": case "uproar":
                result = event.start &&
                    this.effects.consume(ctg, "status", event.effect);
                break;
            default:
                if (dexutil.isMajorStatus(event.effect))
                {
                    // TODO: also track curing moves
                    // for now, curing moves are ignored and silently passed
                    result = !event.start ||
                        this.effects.consume(ctg, "status", event.effect);
                }
        }
        return result && super.activateStatusEffect(event);
    }

    /** @override */
    public activateTeamEffect(event: events.ActivateTeamEffect): ContextResult
    {
        let result: ContextResult;
        switch (event.effect)
        {
            case "healingWish": case "lunarDance":
                // no known move can explicitly start this effect, only when the
                //  user faints and a replacement is sent
                // TODO(gen>4): replacement is not sent out immediately
                result = !event.start && event.teamRef === this.userRef &&
                    this.effects.consume("self", "team", event.effect);
                break;
            case "luckyChant": case "mist": case "safeguard": case "tailwind":
                // no known move can explicitly end these effects, only when
                //  we're at the end of their durations
                result = event.start && event.teamRef === this.userRef &&
                    this.effects.consume("self", "team", event.effect);
                break;
            case "spikes": case "stealthRock": case "toxicSpikes":
            {
                // can be cleared by a move, but aren't covered by a flag yet
                //  (TODO)
                // if start, should mention opposing side
                const opposing = event.teamRef !== this.userRef;
                if (event.start && opposing)
                {
                    result =
                        this.effects.consume("hit", "team", event.effect) &&
                        this.addTarget(event.teamRef);
                }
                else result = !event.start && !opposing;
                break;
            }
            case "lightScreen": case "reflect":
            {
                // can be cleared by a move, but aren't covered by a flag yet
                //  (TODO)
                const opposing = event.teamRef !== this.userRef;
                if (event.start && !opposing)
                {
                    result =
                        this.effects.consume("self", "team", event.effect) &&
                        this.addTarget(event.teamRef);
                    if (!result) break;
                    // fill in the user of the move (base ctx just puts null)
                    this.state.teams[event.teamRef].status[event.effect]
                        .start(this.user);
                    return result;
                }
                else result = !event.start;
            }
        }
        return result && super.activateTeamEffect(event);
    }

    /** @override */
    public block(event: events.Block): ContextResult
    {
        // endure only protects from going to 0hp, so the move effects still
        //  take place
        if (event.effect === "endure") return super.block(event);
        // move effects were blocked
        if (!this.handleBlock(event)) return;
        // reflecting the move, expect the next event to call it
        if (event.effect === "magicCoat")
        {
            const mon = this.state.teams[event.monRef].active;
            if (!mon.volatile.magicCoat || this.called === "bounced" ||
                !this.moveData.flags?.reflectable)
            {
                return;
            }
            this.effects.setCall(this.moveName, /*bounced*/ true);
        }
        return super.block(event);
    }

    /** @override */
    public boost(event: events.Boost): ContextResult
    {
        const ctg = event.monRef === this.userRef ? "self" : "hit";
        const mon = this.state.teams[event.monRef].active;
        // TODO: complete full tracking, then expire if consume returns false
        return (!this.effects.consume(ctg, "boost", event.stat, event.amount,
                    ...(event.set ? [] : [mon.volatile.boosts[event.stat]])) ||
                // some moves can have a target but also boost the user's stats,
                //  but the user still isn't technically a target in this case
                ctg === "self" || this.addTarget(event.monRef)) &&
            super.boost(event);
    }

    /** Temporarily changes the pokemon's type. */
    public changeType(event: events.ChangeType): ContextResult
    {
        if (event.monRef === this.userRef &&
            this.effects.consume("self", "unique", "conversion"))
        {
            // changes the user's type into that of a known move
            this.user.moveset.addMoveSlotConstraint(
                dex.typeToMoves[event.newTypes[0]]);
        }
        // TODO: track type change effects: camouflage, conversion2, colorchange
        return super.changeType(event);
    }

    /** @override */
    public clearAllBoosts(event: events.ClearAllBoosts): ContextResult
    { return false; }

    /** @override */
    public clearNegativeBoosts(event: events.ClearNegativeBoosts): ContextResult
    { return false; }

    /** @override */
    public clearPositiveBoosts(event: events.ClearPositiveBoosts): ContextResult
    { return false; }

    /** @override */
    public countStatusEffect(event: events.CountStatusEffect): ContextResult
    {
        let result: ContextResult;
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
                this.effects.consume("primary", "countableStatus", "perish");
                result = true;
                break;
            case "stockpile":
                result = event.monRef === this.userRef &&
                    this.effects.consume("primary", "countableStatus",
                        "stockpile");
                break;
        }
        return result && super.countStatusEffect(event);
    }

    /** @override */
    public crit(event: events.Crit): ContextResult
    {
        return this.addTarget(event.monRef) && super.crit(event);
    }

    /** @override */
    public disableMove(event: events.DisableMove): ContextResult
    {
        const ctg = event.monRef === this.userRef ? "self" : "hit";
        return this.effects.consume(ctg, "unique", "disable") &&
            // TODO: track cursedbody, other disable effects
            (ctg === "self" || this.addTarget(event.monRef)) &&
            super.disableMove(event);
    }

    /** @override */
    public fail(event: events.Fail): ContextResult
    {
        return this.handleFail(event) && super.fail(event);
    }

    /** @override */
    public faint(event: events.Faint): ContextResult
    {
        // handle self-faint effects from healingWish/lunarDance
        // TODO(gen>4): consume healingWish/lunarDance since replacement is no
        //  longer sent out immediately
        if (event.monRef === this.userRef)
        {
            const teamEffect = this.effects.get("self", "team");
            if (teamEffect === "healingWish" || teamEffect === "lunarDance")
            {
                this.state.teams[this.userRef].status[teamEffect] = true;
                // gen4: replacement is sent out immediately, so communicate
                //  that by setting self-switch
                this.effects.setSelfSwitch();
            }
        }

        // if the target fainted, some effects have to be canceled
        this.effects.clearFaint(event.monRef === this.userRef ? "self" : "hit");
        // TODO: handle self-destruct moves
        return this.addTarget(event.monRef, "ko") && super.faint(event);
    }

    /** @override */
    public futureMove(event: events.FutureMove): ContextResult
    {
        if (!event.start) return;
        if (!dex.isFutureMove(this.moveName))
        {
            throw new Error(`Invalid future move ${this.moveName}`);
        }
        return event.move === this.moveName &&
            this.effects.consume("primary", "delay", "future") &&
            super.futureMove(event);
    }

    /** @override */
    public gameOver(event: events.GameOver): ContextResult { return false; }

    /** @override */
    public immune(event: events.Immune): ContextResult
    {
        return this.handleBlock(event) && super.immune(event);
    }

    /** @override */
    public inactive(event: events.Inactive): ContextResult { return false; }

    /** @override */
    public initOtherTeamSize(event: events.InitOtherTeamSize): ContextResult
    { return false; }

    /** @override */
    public initTeam(event: events.InitTeam): ContextResult { return false; }

    /** @override */
    public miss(event: events.Miss): ContextResult
    {
        return this.handleBlock(event) && super.miss(event);
    }

    /** @override */
    public mustRecharge(event: events.MustRecharge): ContextResult
    { return false; }

    /** @override */
    public noTarget(event: events.NoTarget): ContextResult
    {
        return this.userRef === event.monRef && this.handleFail(event) &&
            super.noTarget(event);
    }

    /** @override */
    public postTurn(event: events.PostTurn): ContextResult { return false; }

    /** @override */
    public prepareMove(event: events.PrepareMove): ContextResult
    {
        if (event.monRef !== this.userRef) return;
        if (event.move !== this.moveName)
        {
            throw new Error("Mismatched prepareMove: Using " +
                `'${this.moveName}' but got '${event.move}'`);
        }
        if (!dex.isTwoTurnMove(this.moveName))
        {
            throw new Error(`Invalid future move ${this.moveName}`);
        }
        return this.effects.consume("primary", "delay", "twoTurn") &&
            super.prepareMove(event);
    }

    /** @override */
    public preTurn(event: events.PreTurn): ContextResult { return false; }

    /** @override */
    public reenableMoves(event: events.ReenableMoves): ContextResult
    { return false; }

    /** @override */
    public rejectSwitchTrapped(event: events.RejectSwitchTrapped): ContextResult
    { return false; }

    /** @override */
    public resetWeather(event: events.ResetWeather): ContextResult
    { return false; }

    /** @override */
    public resisted(event: events.Resisted): ContextResult
    {
        return this.addTarget(event.monRef) && super.resisted(event);
    }

    /** @override */
    public superEffective(event: events.SuperEffective): ContextResult
    {
        return this.addTarget(event.monRef) && super.superEffective(event);
    }

    /** @override */
    public swapBoosts(event: events.SwapBoosts): ContextResult
    {
        // should be swapping with the user and a target
        return [event.monRef1, event.monRef2].includes(this.userRef) &&
            this.effects.consume("primary", "swapBoost", event.stats) &&
            this.addTarget(event.monRef1 === this.userRef ?
                event.monRef2 : event.monRef1) &&
            super.swapBoosts(event);
    }

    /** @override */
    public switchIn(event: events.SwitchIn): ContextResult
    {
        // consume self-switch flag
        return this.userRef === event.monRef &&
            this.effects.consume("primary", "selfSwitch") &&
            // handle the switch in the context of this move
            new SwitchContext(this.state, event,
                this.logger.addPrefix(
                    `Switch(${event.monRef}, ${event.species}, self` +
                    // note self-switch setting
                    (this.effects.get("primary", "selfSwitch") ===
                            "copyvolatile" ? ", copy" : "") +
                    "): "));
    }

    /** @override */
    public takeDamage(event: events.TakeDamage): ContextResult
    {
        return (event.recoil ?
                event.monRef === this.userRef &&
                    // TODO: verify damage fraction
                    this.effects.consume("primary", "recoil") &&
                    // infer recoil effect was consumed
                    (this.recoil(/*consumed*/ true), true)
                : this.addTarget(event.monRef,
                    /*damaged*/ event.newHP[0] <= 0 ? "ko" : true)) &&
            super.takeDamage(event);
    }

    /** @override */
    public transform(event: events.Transform): ContextResult
    {
        return this.userRef === event.source && this.addTarget(event.target) &&
            super.transform(event);
    }

    /** @override */
    public updateFieldEffect(event: events.UpdateFieldEffect): ContextResult
    { return false; }

    /** @override */
    public updateMoves(event: events.UpdateMoves): ContextResult
    { return false; }

    public updateStatusEffect(event: events.UpdateStatusEffect): ContextResult
    { return false; }

    /** @override */
    public useMove(event: events.UseMove): ContextResult
    {
        // if we're not expecting a move to be called, treat this as a
        //  normal move event
        const callEffect = this.effects.get("primary", "call");
        if (!callEffect) return;

        let bounced: boolean | undefined;
        switch (callEffect)
        {
            case true: break; // nondeterministic move call
            case "copycat":
                if (this.lastMove !== event.move) return;
                break;
            case "mirror":
                if (this.user.volatile.mirrorMove !== event.move) return;
                break;
            case "self":
                // calling a move that is part of the user's moveset
                if (this.userRef !== event.monRef ||
                    !this.addTarget(this.userRef))
                {
                    return;
                }
                this.user.moveset.reveal(event.move);
                break;
            case "target":
            {
                const targetRef = otherSide(this.userRef);
                if (this.userRef !== event.monRef || !this.addTarget(targetRef))
                {
                    return;
                }
                this.state.teams[targetRef].active.moveset
                    .reveal(event.move);
                break;
            }
            default:
                // regular string specifies the move that should be called
                if (event.move !== callEffect) return;
                bounced = this.effects.consume("primary", "call", "bounced");
        }

        this.effects.consume("primary", "call", callEffect);

        // make sure this is handled like a called move
        return new MoveContext(this.state, event,
            this.logger.addPrefix(`Move(${event.monRef}, ` +
                `${event.move}, called): `),
            /*called*/ bounced ? "bounced" : true);
    }

    // grouped event handlers

    /** Handles an event where the pokemon's move failed to take effect. */
    private handleFail(event: events.Fail | events.NoTarget): ContextResult
    {
        this.handleImplicitEffects(/*failed*/true);
        return true;
    }

    /** Handles an event where a pokemon blocked the move. */
    private handleBlock(event: events.Block | events.Immune | events.Miss):
        ContextResult
    {
        // generally a complete miss fails the move
        // TODO: partial misses (requires doubles support)
        this.handleImplicitEffects(/*failed*/true);
        return this.addTarget(event.monRef);
    }

    // helper methods

    /**
     * Indicates that the BattleEvents mentioned a target for the current move.
     * @param damaged Whether the pokemon was damaged (true) or KO'd ('"ko"`).
     * @returns Falsy on error, true otherwise.
     */
    private addTarget(targetRef: Side, damaged: boolean | "ko" = false):
        ContextResult
    {
        const last = this.mentionedTargets.get(targetRef);
        if (last !== undefined)
        {
            // update damaged status if higher precedence (ko > true > false)
            if (!last || damaged === "ko")
            {
                this.mentionedTargets.set(targetRef, damaged);
            }

            return true;
        }

        // assertions about the move target
        // generally this happens when the move has been fully handled but the
        //  context hasn't yet realized it and expired (TODO)
        if (!this.pendingTargets[targetRef])
        {
            this.logger.error(`Mentioned target '${targetRef}' but the ` +
                `current move '${this.moveName}' can't target it`);
            return;
        }
        if (this.mentionedTargets.size >= this.totalTargets)
        {
            this.logger.error("Can't add more targets. Already have " +
                `${this.mentionedTargets.size} ` +
                (this.mentionedTargets.size > 0 ?
                    `('${[...this.mentionedTargets].join("', '")}') `
                    : "") +
                `but trying to add '${targetRef}'.`);
            return;
        }

        this.mentionedTargets.set(targetRef, damaged);

        const target = this.state.teams[targetRef].active;
        if (this.user !== target)
        {
            // update opponent's mirror move tracker
            if (this.mirror) target.volatile.mirrorMove = this.moveName;

            // deduct an extra pp if the target has pressure
            // TODO: gen>=5: don't count allies
            if (this.move &&
                !target.volatile.suppressAbility &&
                target.ability === "pressure" &&
                // only ability that can cancel pressure
                this.user.ability !== "moldbreaker")
            {
                this.move.pp -= 1;
            }
        }

        return true;
    }

    /**
     * Handles implicit move effects, consuming most remaining flags. This
     * should be called once it is confirmed whether the move failed.
     * @param failed Whether this is being called in the context of a move
     * failure.
     */
    private handleImplicitEffects(failed: boolean): void
    {
        if (this.implicitHandled) return;
        this.implicitHandled = true;

        // singles: try to infer targets
        // TODO: in doubles, this may be more complicated or just ignored
        const opponent = otherSide(this.userRef);
        if (this.pendingTargets[opponent]) this.addTarget(opponent);
        if (this.pendingTargets[this.userRef]) this.addTarget(this.userRef);

        if (this.moveName === "naturalgift") this.naturalGift(failed);

        // reset stall counter if it wasn't updated this turn
        if (!this.called && !this.user.volatile.stalling)
        {
            this.user.volatile.stall(false);
        }

        // handle fail inferences
        if (failed)
        {
            if (this.effects.get("primary", "call") === "copycat" &&
                this.lastMove && !dex.moves[this.lastMove].flags?.noCopycat)
            {
                throw new Error("Copycat effect failed but should've called " +
                    `'${this.lastMove}'`);
            }
            if (this.effects.get("primary", "call") === "mirror" &&
                this.user.volatile.mirrorMove)
            {
                throw new Error("Mirror Move effect failed but should've " +
                    `called '${this.user.volatile.mirrorMove}'`);
            }

            // the failed=false side of this is handled by a separate event
            if (this.effects.get("self", "status") === "imprison")
            {
                this.imprison(/*failed*/true);
            }

            // clear pending flags
            this.effects.clear();

            // clear continuous moves
            this.user.volatile.lockedMove.reset();
            this.user.volatile.rollout.reset();

            // TODO: other implications of a move failing
            return;
        }

        // user effects

        for (const ctg of ["self", "hit"] as const)
        {
            // TODO(non-singles): support multiple targets
            const monRefs =
                ctg === "self" ? [this.userRef]
                : [...this.mentionedTargets.keys()]
                    .filter(r => r !== this.userRef);
            for (const monRef of monRefs)
            {
                const mon = this.state.teams[monRef].active;

                // consume any silent confusion effects if silently immune
                if (mon.volatile.confusion.isActive ||
                    (mon.ability &&
                        dex.abilities[mon.ability].immune === "confusion"))
                {
                    this.effects.consume(ctg, "status", "confusion");
                }
                else if (this.effects.check(ctg, "status", "confusion"))
                {
                    // the only other source of immunity that can be secret is
                    //  the ability
                    const {ability} = mon.traits;
                    const newAbilities = [...ability.possibleValues]
                        .filter(n => dex.abilities[n].immune === "confusion");
                    if (newAbilities.length > 0)
                    {
                        ability.narrow(...newAbilities);
                        this.effects.consume(ctg, "status", "confusion");
                    }
                }

                // consume any silent major status effects if already afflicted
                //  by a major status
                if (mon.majorStatus.current)
                {
                    this.effects.consume(ctg, "status", "MajorStatus");
                }

                // consume any silent boosts that were already maxed out
                for (const stat of dexutil.boostKeys)
                {
                    const cur = mon.volatile.boosts[stat];
                    this.effects.consume(ctg, "boost", stat, 0, cur);
                }
            }
        }

        // infer recoil effect ignored
        if (this.effects.get("primary", "recoil"))
        {
            this.recoil(/*consumed*/ false);
            this.effects.consume("primary", "recoil");
        }

        let lockedMove = false;
        const {lockedMove: lock} = this.user.volatile;
        switch (this.effects.get("self", "implicitStatus"))
        {
            case "defenseCurl":
                this.effects.consume("self", "implicitStatus");
                this.user.volatile.defenseCurl = true;
                break;
            case "lockedMove":
                this.effects.consume("self", "implicitStatus");
                if (!dex.isLockedMove(this.moveName))
                {
                    throw new Error(`Invalid locked move ${this.moveName}`);
                }
                // continue locked status
                // already prevented from consuming pp in constructor
                if (lock.type === this.moveName) lock.tick();
                // start locked status
                else lock.start(this.moveName, !!this.called);
                lockedMove = true;
                break;
            case "minimize":
                this.effects.consume("self", "implicitStatus");
                this.user.volatile.minimize = true;
                break;
            // TODO: mustRecharge
        }
        // if the locked move was called, then this current context is the one
        //  that called the move so we shouldn't reset it
        if (!lockedMove && (lock.turns !== 0 || !lock.called)) lock.reset();

        // TODO: add rollout to implicitStatus above
        const {rollout} = this.user.volatile;
        if (dexutil.isRolloutMove(this.moveName))
        {
            // TODO: add rollout moves to ImplicitStatusEffect
            // start/continue rollout status
            // already prevented from consuming pp in constructor if continuing
            if (rollout.type === this.moveName) rollout.tick();
            else rollout.start(this.moveName, !!this.called);
        }
        // must've missed the status ending
        // if the rollout move was called, then this current context is the one
        //  that called the move so we shouldn't reset it
        else if (rollout.turns !== 0 || !rollout.called) rollout.reset();

        // team effects

        const team = this.state.teams[this.userRef];
        switch (this.effects.get("self", "implicitTeam"))
        {
            // wish can be used consecutively, but only the first use counts
            case "wish":
                team.status.wish.start(/*restart*/false);
                this.effects.consume("self", "implicitTeam");
                break;
        }
        team.status.selfSwitch =
            this.effects.get("primary", "selfSwitch") ?? null;
    }

    /**
     * Handles the implications of Imprison succeeding or failing.
     * @param failed Whether the move failed.
     */
    private imprison(failed: boolean): void
    {
        // assume us is fully known, while them is unknown
        // TODO: what if both are unknown?
        const us = this.state.teams.us.active.moveset;
        const usMoves = [...us.moves.keys()];
        const them = this.state.teams.them.active.moveset;

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
            // imprison succeeded, which means both active pokemon have at least
            //  one common move
            // infer that one of our moves has to be contained by the opponent's
            //  moveset

            // sanity check: opponent should have or be able to have at least
            //  one of our moves
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
    private naturalGift(failed: boolean): void
    {
        // naturalgift only succeeds if the user has a berry, and implicitly
        //  consumes it
        if (!failed)
        {
            // TODO: narrow further based on perceived power and type
            this.user.item.narrow(...Object.keys(dex.berries));
            this.user.removeItem(/*consumed*/true);
        }
        // fails if the user doesn't have a berry
        else this.user.item.remove(...Object.keys(dex.berries));
    }

    /**
     * Makes an inference based on whether the recoil effect was consumed or
     * ignored.
     */
    private recoil(consumed: boolean): void
    {
        // get possible recoil-canceling abilities
        const {ability} = this.user.traits;
        let noRecoilAbilities: string[];
        if (!this.user.volatile.suppressAbility)
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
}
