import { Logger } from "../../../Logger";
import * as dex from "../../dex/dex";
import * as dexutil from "../../dex/dex-util";
import { BattleState } from "../../state/BattleState";
import { Move } from "../../state/Move";
import { Pokemon } from "../../state/Pokemon";
import { otherSide, Side } from "../../state/Side";
import * as events from "../BattleEvent";
import { AbilityContext } from "./AbilityContext";
import { ContextResult, DriverContext } from "./DriverContext";
import { PendingEffects } from "./PendingEffects";
import { SwitchContext } from "./SwitchContext";

/** Handles events related to a move. */
export class MoveContext extends DriverContext
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
    private readonly effects: PendingEffects;
    /**
     * Whether this move should be recorded by its targets for Mirror Move.
     * `"reset"` resets the target's recorded move.
     */
    private readonly mirror: boolean | "reset";

    // in-progress move result flags
    /**
     * Target-refs currently mentioned by listening to events. Lays groundwork
     * for future double/triple battle support.
     */
    private readonly mentionedTargets = new Set<Side>();

    /**
     * Constructs a MoveContext.
     * @param state State object to mutate while handling events.
     * @param event Event that started this context.
     * @param logger Logger object.
     * @param called Whether this move was called by another move. Default
     * false.
     */
    constructor(state: BattleState, event: events.UseMove, logger: Logger,
        private readonly called = false)
    {
        super(state, logger);

        if (!dex.moves.hasOwnProperty(event.move))
        {
            throw new Error(`Unsupported move '${event.move}'`);
        }

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

        this.effects = new PendingEffects(this.moveData);

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

        // expected to be a charging turn
        if (this.effects.get("primary")?.delay === "twoTurn")
        {
            this.mirror = false;
        }
        // called+released two-turn moves reset the mirror move field
        // TODO: is this unique to PS?
        else if (called && releasedTwoTurn) this.mirror = "reset";
        // default to move flag
        else this.mirror = this.moveData.mirror;

        // only reveal and deduct pp if this event isn't continuing a multi-turn
        //  move
        const reveal = !releasedTwoTurn &&
            this.user.volatile.lockedMove.type !== this.moveName &&
            this.user.volatile.rollout.type !== this.moveName;

        // if this isn't a called move, then the user must have this move in its
        //  moveset (i.e. it is an actual move selection by the player)
        if (called) return;

        // every move decision resets any single-move statuses
        this.user.volatile.resetSingleMove();

        // only struggle can be selected without being a part of the moveset
        if (this.moveName === "struggle" || !reveal) return;

        if (!reveal) return;

        const revealedMove = this.user.moveset.reveal(this.moveName);

        // record the move object in case further deductions need to be made
        this.move = revealedMove;
        --this.move.pp;
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
    public handle(event: events.Any): ContextResult | DriverContext
    {
        // TODO: track all move effects, then allow this statement
        // if (this.effects.handled) return "expire";

        switch (event.type)
        {
            // handle move results/interruptions
            case "fail": case "noTarget":
                if (this.userRef !== event.monRef) return "expire";
                this.handleImplicitEffects(/*failed*/true);
                return "base";
            case "block":
                // endure only protects from going to 0hp, so the move effects
                //  still take place
                if (event.effect === "endure") return "base";
                // fallthrough
            case "immune": case "miss":
                // generally a complete miss fails the move
                // TODO: partial misses (requires doubles support)
                this.handleImplicitEffects(/*failed*/true);
                return this.addTarget(event.monRef);
            // handle move expectations/flags
            case "activateAbility":
                return new AbilityContext(this.state, event,
                    this.logger.addPrefix(`Ability(${event.monRef}, ` +
                        `${event.ability}): `));
            case "activateFieldEffect": return this.activateFieldEffect(event);
            case "activateStatusEffect":
                return this.activateStatusEffect(event);
            case "activateTeamEffect": return this.activateTeamEffect(event);
            case "boost": return this.boost(event);
            case "changeType": return this.changeType(event);
            case "clearSelfSwitch": case "gameOver": case "inactive":
            case "preTurn": case "postTurn": case "updateFieldEffect":
                // TODO: other unrelated events?
                return "expire";
            case "countStatusEffect": return this.countStatusEffect(event);
            case "crit": case "resisted": case "superEffective":
            case "takeDamage":
                // TODO: other target-mentioning events?
                return this.addTarget(event.monRef);
            case "faint": return this.faint(event);
            case "futureMove": return this.futureMove(event);
            case "prepareMove": return this.prepareMove(event);
            case "swapBoosts": return this.swapBoosts(event);
            case "switchIn": return this.switchIn(event);
            case "transform":
                if (this.userRef !== event.source) return "expire";
                return this.addTarget(event.target);
            case "useMove": return this.useMove(event);
            // let the default context handle the event
            // TODO: should erroneous events cause a throw or expire?
            default: return "base";
        }
    }

    /** @override */
    public halt(): void
    {
        // if a fail event hasn't been encountered yet, then it likely never
        //  will happen
        this.handleImplicitEffects(/*failed*/false);
    }

    /** @override */
    public expire(): void
    {
        // clean up flags
        this.handleImplicitEffects(/*failed*/false);

        // all other pending flags must be accounted for

        // if we had a self-switch flag, the game must've ignored it
        this.effects.consume("primary", "selfSwitch");
        this.state.teams[this.userRef].status.selfSwitch = null;

        this.effects.assert();
    }

    /**
     * Indicates that the BattleEvents mentioned a target for the current move.
     * @returns `expire` on error, `base` otherwise.
     */
    private addTarget(targetRef: Side): ContextResult
    {
        if (this.mentionedTargets.has(targetRef)) return "base";

        // assertions about the move target
        // generally this happens when the move has been fully handled but the
        //  context hasn't yet realized it and expired (TODO)
        if (!this.pendingTargets[targetRef])
        {
            this.logger.error(`Mentioned target '${targetRef}' but the ` +
                `current move '${this.moveName}' can't target it`);
            return "expire";
        }
        if (this.mentionedTargets.size >= this.totalTargets)
        {
            this.logger.error("Can't add more targets. Already have " +
                `${this.mentionedTargets.size} ` +
                (this.mentionedTargets.size > 0 ?
                    `('${[...this.mentionedTargets].join("', '")}') `
                    : "") +
                `but trying to add '${targetRef}'.`);
            return "expire";
        }

        this.mentionedTargets.add(targetRef);

        const target = this.state.teams[targetRef].active;
        if (this.user !== target)
        {
            // update opponent's mirror move tracker
            if (this.mirror)
            {
                target.volatile.mirrorMove =
                    this.mirror === "reset" ? null : this.moveName;
            }

            // deduct an extra pp if the target has pressure
            // TODO: gen>=5: don't count allies
            if (this.move &&
                target.ability === "pressure" &&
                // only ability that can cancel it
                this.user.ability !== "moldbreaker")
            {
                this.move.pp -= 1;
            }
        }

        return "base";
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
            if (this.effects.get("primary")?.call === "mirror" &&
                this.user.volatile.mirrorMove)
            {
                throw new Error("Mirror Move effect failed but should've " +
                    `called '${this.user.volatile.mirrorMove}'`)
            }

            // the failed=false side of this is handled by a separate event
            if (this.effects.get("self")?.status === "imprison")
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

        // consume any silent boosts that were already maxed out
        for (const ctg of ["self", "hit"] as const)
        {
            const add = this.effects.get(ctg)?.boost?.add;
            if (!add) continue;
            for (const stat of Object.keys(add) as dexutil.BoostName[])
            {
                const cur = this.user.volatile.boosts[stat];
                this.effects.consume(ctg, "boost", stat, 0, cur);
            }
        }

        let lockedMove = false;
        switch (this.effects.get("self")?.implicitStatus)
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
                if (this.user.volatile.lockedMove.type === this.moveName)
                {
                    // continue locked status
                    // already prevented from consuming pp in constructor
                    this.user.volatile.lockedMove.tick();
                }
                // start locked status
                else this.user.volatile.lockedMove.start(this.moveName);
                lockedMove = true;
                break;
            case "minimize":
                this.effects.consume("self", "implicitStatus");
                this.user.volatile.minimize = true;
                break;
            // TODO: mustRecharge
        }
        if (!lockedMove) this.user.volatile.lockedMove.reset();

        // TODO: add rollout to implicitStatus above
        if (dexutil.isRolloutMove(this.moveName))
        {
            // TODO: add rollout moves to ImplicitStatusEffect
            // start/continue rollout status
            if (this.user.volatile.rollout.type === this.moveName)
            {
                // continue rollout status
                // already prevented from consuming pp in constructor
                this.user.volatile.rollout.tick();
            }
            else this.user.volatile.rollout.start(this.moveName);
        }
        // must've missed the status ending
        else this.user.volatile.rollout.reset();

        // team effects

        const team = this.state.teams[this.userRef];
        switch (this.effects.get("self")?.implicitTeam)
        {
            // wish can be used consecutively, but only the first use counts
            case "wish":
                team.status.wish.start(/*restart*/false);
                this.effects.consume("self", "implicitTeam");
                break;
        }
        team.status.selfSwitch =
            this.effects.get("primary")?.selfSwitch ?? null;
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
     * Activates a field-wide effect.
     * @returns Whether the parent DriverContexts should also handle this event.
     */
    private activateFieldEffect(event: events.ActivateFieldEffect):
        ContextResult
    {
        // is this event possible within the context of this move?
        if (!this.effects.consume("primary", "field", event.effect))
        {
            return "expire";
        }

        if (event.start && dexutil.isWeatherType(event.effect))
        {
            // fill in the user of the weather move (BaseContext just puts null)
            this.state.status.weather.start(this.user, event.effect);
            return "stop";
        }
        return "base";
    }

    /**
     * Activates a volatile status condition.
     * @returns Whether the parent DriverContexts should also handle this event.
     */
    private activateStatusEffect(event: events.ActivateStatusEffect):
        ContextResult
    {
        const ctg = event.monRef === this.userRef ? "self" : "hit";
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
                if (!event.start) return "expire";
                if (!this.effects.consume(ctg, "status", event.effect))
                {
                    return "expire";
                }
                return this.addTarget(event.monRef);
            case "confusion": case "leechSeed": case "substitute":
                // can be removed by a different move, but currently not tracked
                //  yet (TODO)
                if (!event.start) return "base";
                if (!this.effects.consume(ctg, "status", event.effect))
                {
                    return "expire";
                }
                return this.addTarget(event.monRef);
            case "imprison":
            {
                if (!event.start) return "expire";
                if (!this.effects.consume(ctg, "status", event.effect))
                {
                    return "expire";
                }
                // verified that imprison was successful
                const result = this.addTarget(this.userRef);
                this.imprison(/*failed*/false);
                return result;
            }
            case "rage": case "roost": case "uproar":
                if (!event.start) return "expire";
                if (!this.effects.consume(ctg, "status", event.effect))
                {
                    return "expire";
                }
                return "base";
            case "slowStart":
                return "expire";
            default:
                // TODO: also track curing moves
                // for now, curing moves are ignored
                if (dexutil.isMajorStatus(event.effect) && event.start &&
                    !this.effects.consume(ctg, "status", event.effect))
                {
                    return "expire";
                }
                return "base";
        }
    }

    /**
     * Activates a team-wide effect.
     * @returns Whether the parent DriverContexts should also handle this event.
     */
    private activateTeamEffect(event: events.ActivateTeamEffect): ContextResult
    {
        switch (event.effect)
        {
            case "healingWish": case "lunarDance":
                // no known move can explicitly start this effect, only when the
                //  user faints and a replacement is sent
                // TODO(gen>4): replacement is not sent out immediately
                if (event.start) return "expire";
                if (event.teamRef !== this.userRef) return "expire";
                if (!this.effects.consume("self", "team", event.effect))
                {
                    return "expire";
                }
                return "base";
            case "luckyChant": case "mist": case "safeguard": case "tailwind":
                // no known move can explicitly end these effects, only when
                //  we're at the end of their durations
                if (!event.start) return "expire";
                if (event.teamRef !== this.userRef) return "expire";
                if (!this.effects.consume("self", "team", event.effect))
                {
                    return "expire";
                }
                return "base";
            case "spikes": case "stealthRock": case "toxicSpikes":
                // can be cleared by a move, but aren't covered by a flag yet
                //  (TODO)
                if (!event.start) return "base";
                if (event.teamRef === this.userRef) return "expire";
                if (!this.effects.consume("hit", "team", event.effect))
                {
                    return "expire";
                }
                return "base";
            case "lightScreen": case "reflect":
                // can be cleared by a move, but aren't covered by a flag yet
                //  (TODO)
                if (!event.start) return "base";
                if (event.teamRef !== this.userRef) return "expire";
                if (!this.effects.consume("self", "team", event.effect))
                {
                    return "expire";
                }
                // fill in the user of the move (BaseContext just puts null)
                this.state.teams[event.teamRef].status[event.effect]
                    .start(this.user);
                return "stop";
        }
    }

    /**
     * Updates a stat boost.
     * @returns Whether the parent DriverContexts should also handle this event.
     */
    private boost(event: events.Boost): ContextResult
    {
        const ctg = event.monRef === this.userRef ? "self" : "hit";
        const mon = this.state.teams[event.monRef].active;
        if (!this.effects.consume(ctg, "boost", event.stat, event.amount,
                mon.volatile.boosts[event.stat]))
        {
            // TODO: complete full tracking, then allow expire
            // return "expire";
            return "base";
        }

        // some moves can have a target but also boost the user's stats, but the
        //  user still isn't technically a target in this case
        if (ctg === "self") return "base";
        return this.addTarget(event.monRef);
    }

    /** Temporarily changes the pokemon's type. */
    private changeType(event: events.ChangeType): ContextResult
    {
        if (event.monRef === this.userRef &&
            this.effects.consume("self", "unique", "conversion"))
        {
            // changes the user's type into that of a known move
            this.user.moveset.addMoveSlotConstraint(
                dex.typeToMoves[event.newTypes[0]]);
        }
        // TODO: track type change effects: camouflage, conversion2, colorchange
        return "base";
    }

    private countStatusEffect(event: events.CountStatusEffect): ContextResult
    {
        switch (event.effect)
        {
            case "perish":
                // event is sent for each pokemon targeted by the perish
                //  song move, so it's difficult to pinpoint who exactly
                //  it will hit for now
                // TODO: a better solution would be to use the
                //  `|-fieldactivate|` event (#138) to consume the
                //  status (still letting BaseContext set the counters via this
                //  event), then rely on end-of-turn events for updating the
                //  counters
                // TODO: infer soundproof if the counter doesn't take place at
                //  the end of the turn
                this.effects.consume("primary", "countableStatus");
                return "base";
            case "stockpile":
                if (event.monRef !== this.userRef ||
                    !this.effects.consume("primary", "countableStatus",
                    "stockpile"))
                {
                    return "expire";
                }
                return "base";
            default: return "expire";
        }
    }

    /** Indicates that the pokemon fainted. */
    private faint(event: events.Faint): ContextResult
    {
        // handle self-faint effects from healingWish/lunarDance
        // TODO(gen>4): consume healingWish/lunarDance since replacement is no
        //  longer sent out immediately
        if (event.monRef === this.userRef)
        {
            const teamEffect = this.effects.get("self")?.team;
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
        return this.addTarget(event.monRef);
    }

    private futureMove(event: events.FutureMove): ContextResult
    {
        if (!event.start) return "expire";
        if (!dex.isFutureMove(this.moveName))
        {
            throw new Error(`Invalid future move ${this.moveName}`);
        }
        if (!this.effects.consume("primary", "delay", "future"))
        {
            return "expire";
        }
        return "base";
    }

    private prepareMove(event: events.PrepareMove): ContextResult
    {
        if (event.monRef !== this.userRef) return "expire";
        if (event.move !== this.moveName)
        {
            throw new Error("Mismatched prepareMove: Using " +
                `'${this.moveName}' but got '${event.move}'`);
        }
        if (!dex.isTwoTurnMove(this.moveName))
        {
            throw new Error(`Invalid future move ${this.moveName}`);
        }
        if (!this.effects.consume("primary", "delay", "twoTurn"))
        {
            return "expire";
        }
        return "base";
    }

    /** Swaps temporary stat boosts between pokemon. */
    private swapBoosts(event: events.SwapBoosts): ContextResult
    {
        // should be swapping with the user and a target
        if (![event.monRef1, event.monRef2].includes(this.userRef))
        {
            return "expire";
        }
        if (!this.effects.consume("primary", "swapBoost", event.stats))
        {
            return "expire";
        }
        return this.addTarget(event.monRef1 === this.userRef ?
            event.monRef2 : event.monRef1);
    }

    /** Indicates that a pokemon has switched in. */
    private switchIn(event: events.SwitchIn): ContextResult | DriverContext
    {
        // consume self-switch flag
        const selfSwitch = this.effects.get("primary")?.selfSwitch;
        if (this.userRef !== event.monRef ||
            !this.effects.consume("primary", "selfSwitch"))
        {
            return "expire";
        }

        // handle the switch in the context of this move
        return new SwitchContext(this.state, event,
            this.logger.addPrefix(`Switch(${event.monRef}, ${event.species}, ` +
                `self${selfSwitch === "copyvolatile" ? ", copy" : ""}): `));
    }

    /** Indicates that the pokemon is attempting to use a move. */
    private useMove(event: events.UseMove): ContextResult | DriverContext
    {
        // if we're not expecting a move to be called, treat this as a
        //  normal move event
        const callEffect = this.effects.get("primary")?.call;
        if (!callEffect) return "expire";

        switch (callEffect)
        {
            case "mirror":
                if (this.user.volatile.mirrorMove !== event.move)
                {
                    return "expire";
                }
                break;
            case "self":
                // calling a move that is part of the user's moveset
                if (this.userRef !== event.monRef ||
                    this.addTarget(this.userRef) === "expire")
                {
                    return "expire";
                }
                this.user.moveset.reveal(event.move);
                break;
            case "target":
            {
                const targetRef = otherSide(this.userRef);
                if (this.userRef !== event.monRef ||
                    this.addTarget(targetRef) === "expire")
                {
                    return "expire";
                }
                this.state.teams[targetRef].active.moveset
                    .reveal(event.move);
                break;
            }
        }

        this.effects.consume("primary", "call");

        // make sure this is handled like a called move
        return new MoveContext(this.state, event,
            this.logger.addPrefix(`Move(${event.monRef}, ` +
                `${event.move}, called): `),
            /*called*/true);
    }
}
