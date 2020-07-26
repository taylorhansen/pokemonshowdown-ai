import { Logger } from "../../../Logger";
import * as dex from "../../dex/dex";
import { isRolloutMove, MoveData, otherMoveCallers, selfMoveCallers,
    SelfSwitch, SelfVolatileEffect, SideCondition, targetMoveCallers,
    VolatileEffect } from "../../dex/dex-util";
import { BattleState } from "../../state/BattleState";
import { Move } from "../../state/Move";
import { Pokemon } from "../../state/Pokemon";
import { otherSide, Side } from "../../state/Side";
import { ActivateFieldCondition, ActivateSideCondition, ActivateStatusEffect,
    AnyDriverEvent, FieldConditionType, SetSingleMoveStatus,
    SetSingleTurnStatus, SetWeather, SideConditionType, StatusEffectType,
    UseMove } from "../DriverEvent";
import { AbilityContext } from "./AbilityContext";
import { ContextResult, DriverContext } from "./DriverContext";
import { SwitchContext } from "./SwitchContext";

// tslint:disable: no-trailing-whitespace (force newlines in doc)
/**
 * If the move being used calls another move, this specifies how it will be
 * called, or `false` if nothing should happen.
 *
 * `true` - Calls a move normally.  
 * `"self"` - Calls a move from the user's moveset.  
 * `"target"` - Calls a move from the target's moveset (must have only one
 * target).
 */
// tslint:enable: no-trailing-whitespace
type CallEffect = boolean | "self" | "target";

/** Handles events related to a move. */
export class MoveContext extends DriverContext
{
    // TODO: should these be the same strings?
    // could mention DriverEvents in dex data to make it clearer which types of
    //  events are expected
    /**
     * Maps SideConditionTypes from ActivateSideCondition events to
     * SideCondition strings from dex-util.
     */
    private static readonly sideConditionMap:
        {readonly [T in SideConditionType]: SideCondition} =
    {
        healingWish: "healingwish", lightScreen: "lightscreen",
        luckyChant: "luckychant", lunarDance: "lunardance", mist: "mist",
        reflect: "reflect", safeguard: "safeguard", spikes: "spikes",
        stealthRock: "stealthrock", tailwind: "tailwind",
        toxicSpikes: "toxicspikes"
    };

    /**
     * Maps StatusEffectTypes from ActivateStatusEffect events to VolatileEffect
     * strings from dex-util.
     */
    private static readonly statusEffectMap:
        {readonly [T in Exclude<StatusEffectType, "slowStart" | "uproar">]:
            VolatileEffect} =
    {
        aquaRing: "aquaring", attract: "attract", bide: "bide",
        charge: "charge", confusion: "confusion", curse: "curse",
        embargo: "embargo", encore: "encore", focusEnergy: "focusenergy",
        foresight: "foresight", healBlock: "healblock", imprison: "imprison",
        ingrain: "ingrain", leechSeed: "leechseed", magnetRise: "magnetrise",
        miracleEye: "miracleeye", mudSport: "mudsport", nightmare: "nightmare",
        powerTrick: "powertrick", substitute: "substitute", taunt: "taunt",
        torment: "torment", waterSport: "watersport", yawn: "yawn"
    };

    // event data
    /** User of the move. */
    private readonly user: Pokemon;
    /** Reference to find the user within the BattleState. */
    private readonly userRef: Side;
    /** Name of the move. */
    private readonly moveName: string;
    /** Dex data for the move. */
    private readonly moveData: MoveData;
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

    // TODO: add more flags, and/or don't use fields to track this
    // move expectations (reset once handled)
    /** Whether all implicit effects have been handled. */
    private handled = false;
    /** Specifies how to expect a called move. */
    private callEffect: CallEffect;
    /** Self-switch flag. */
    private selfSwitch: SelfSwitch;
    /** Field effect flag. */
    private fieldCondition: FieldConditionType | null;
    /** Team effect flag. */
    private sideCondition: SideCondition | null;
    /** Volatile effect flag. */
    private volatileEffect: VolatileEffect | null;
    /** Self-volatile effect flag. */
    private selfVolatileEffect: SelfVolatileEffect | null;

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
    constructor(state: BattleState, event: UseMove, logger: Logger,
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
            case "adjacentAllyOrSelf": case "allySide": case "allyTeam":
            case "self":
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

        // move expectation flags
        this.callEffect =
            selfMoveCallers.includes(this.moveName) ? "self"
            : targetMoveCallers.includes(this.moveName) ? "target"
            : otherMoveCallers.includes(this.moveName) ? true
            : false;
        this.selfSwitch = this.moveData.selfSwitch ?? false;
        // TODO: make field condition part of dex data
        this.fieldCondition =
            this.moveName === "gravity" ? "gravity"
            : this.moveName === "trickroom" ? "trickRoom"
            : null;
        // TODO: make side conditions part of dex data
        this.sideCondition = this.moveData.sideCondition ??
            (this.moveName === "healingwish" ? "healingwish" : null);
        this.volatileEffect = this.moveData.volatileEffect ?? null;
        this.selfVolatileEffect = this.moveData.selfVolatileEffect ?? null;

        // override for non-ghost type curse effect
        // TODO(gen6): handle interactions with protean
        if (this.volatileEffect === "curse" &&
            !this.user.types.includes("ghost"))
        {
            this.pendingTargets = this.framePendingTargets(
                {us: true, them: false});
            this.totalTargets = 1;
            this.volatileEffect = null;
        }

        // throw for unsupported effects
        // TODO: support these
        // istanbul ignore next: can't reproduce
        if (this.sideCondition &&
            (["auroraveil", "stickyweb"] as SideCondition[])
                .includes(this.sideCondition))
        {
            throw new Error(
                `Unsupported SideCondition '${this.sideCondition}'`);
        }

        // release two-turn move
        let releasedTwoTurn = false;
        if (this.user.volatile.twoTurn.type === this.moveName)
        {
            this.user.volatile.twoTurn.reset();
            releasedTwoTurn = true;
        }

        // if this isn't a called move, then the user must have this move in its
        //  moveset (i.e. it is an actual move decision)
        if (called) return;

        // every move decision resets any single-move statuses
        this.user.volatile.resetSingleMove();

        // only struggle can be selected without being a part of the moveset
        if (this.moveName === "struggle") return;

        const revealedMove = this.user.moveset.reveal(this.moveName);

        // only deduct pp if this event isn't continuing a multi-turn
        //  move
        if (releasedTwoTurn ||
            this.user.volatile.lockedMove.type === this.moveName ||
            this.user.volatile.rollout.type === this.moveName)
        {
            return;
        }

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
    public handle(event: AnyDriverEvent): ContextResult | DriverContext
    {
        switch (event.type)
        {
            // handle move results/interruptions
            case "fail":
                if (this.userRef !== event.monRef) return "expire";
                this.handleImplicitEffects(/*failed*/true);
                return "base";
            case "stall":
                if (event.endure) return "base";
                // fallthrough
            case "immune":
            case "miss":
                // generally a complete miss fails the move
                // TODO: partial misses (requires doubles support)
                this.handleImplicitEffects(/*failed*/true);
                return this.addTarget(event.monRef);
            case "transform":
                if (this.userRef !== event.source) return "expire";
                return this.addTarget(event.target);
            case "faint":
                if (this.user.team && event.monRef === this.userRef)
                {
                    // indicate successful use of healing wish
                    if (this.sideCondition === "healingwish")
                    {
                        this.user.team.status.healingWish = true;
                        this.sideCondition = null;
                    }
                    else if (this.sideCondition === "lunardance")
                    {
                        this.user.team.status.lunarDance = true;
                        this.sideCondition = null;
                    }
                }
                // fallthrough
                // TODO: does this handle self-destruct moves?
            // TODO: other target-mentioning events?
            case "crit": case "resisted": case "superEffective":
            case "takeDamage":
                return this.addTarget(event.monRef);
            // handle move expectations/flags
            case "useMove":
                // if we're not expecting a move to be called, treat this as a
                //  normal move event
                if (!this.callEffect) return "expire";

                switch (this.callEffect)
                {
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

                this.callEffect = false;

                // make sure this is handled like a called move
                return new MoveContext(this.state, event,
                    this.logger.addPrefix(`Move(${event.monRef}, ` +
                        `${event.move}, called): `),
                    /*called*/true);
            case "switchIn":
                // consume self-switch flag
                if (this.userRef !== event.monRef || !this.selfSwitch)
                {
                    return "expire";
                }
                const selfSwitch = this.selfSwitch;
                this.selfSwitch = false;

                // handle the switch in the context of this move
                return new SwitchContext(this.state, event,
                    this.logger.addPrefix(`Switch(${event.monRef}, ` +
                        `${event.species}, self` +
                        (selfSwitch === "copyvolatile" ? ", copy" : "") +
                        "): "));
            case "activateAbility":
                return new AbilityContext(this.state, event,
                    this.logger.addPrefix(`Ability(${event.monRef}, ` +
                        `${event.ability}): `));
            case "activateFieldCondition":
                return this.activateFieldCondition(event);
            case "activateSideCondition":
                return this.activateSideCondition(event);
            case "activateStatusEffect":
                return this.activateStatusEffect(event);
            case "setSingleMoveStatus": return this.setSingleMoveStatus(event);
            case "setSingleTurnStatus": return this.setSingleTurnStatus(event);
            case "setWeather": return this.setWeather(event);
            case "clearSelfSwitch": case "gameOver": case "inactive":
            case "preTurn": case "postTurn":
                return "expire";
            // let the default context handle the event
            // TODO: should erroneous events cause a throw/expire?
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
        if (!this.user.team) throw new Error("Move user doesn't have a team");
        this.user.team.status.selfSwitch = this.selfSwitch = false;

        // TODO: find cases where we shouldn't throw
        if (this.callEffect)
        {
            throw new Error(`Expected CallEffect '${this.callEffect}' but it ` +
                "didn't happen");
        }
        if (this.fieldCondition)
        {
            throw new Error("Expected FieldCondition " +
                `'${this.fieldCondition}' but it didn't happen`);
        }
        if (this.sideCondition)
        {
            throw new Error(`Expected SideCondition '${this.sideCondition}' ` +
                "but it didn't happen");
        }
        if (this.volatileEffect)
        {
            throw new Error("Expected VolatileEffect " +
                `'${this.volatileEffect}' but it didn't happen`);
        }
        if (this.selfVolatileEffect)
        {
            throw new Error("Expected SelfVolatileEffect " +
                `'${this.selfVolatileEffect}' but it didn't happen`);
        }
    }

    /**
     * Indicates that the DriverEvents mentioned a target for the current move.
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

        // deduct an extra pp if the target has pressure
        // TODO: gen>=5: don't count allies
        const target = this.state.teams[targetRef].active;
        if (this.move && this.user !== target &&
            target.ability === "pressure" &&
            // only ability that can cancel it
            this.user.ability !== "moldbreaker")
        {
            this.move.pp -= 1;
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
        if (this.handled) return;
        this.handled = true;

        // singles: try to infer targets
        // TODO: in doubles, this may be more complicated or just ignored
        const opponent = otherSide(this.userRef);
        if (this.pendingTargets[opponent]) this.addTarget(opponent);
        if (this.pendingTargets[this.userRef]) this.addTarget(this.userRef);

        if (this.moveName === "naturalgift")
        {
            this.naturalGift(failed);
        }

        // reset stall counter if it wasn't updated this turn
        if (!this.called && !this.user.volatile.stalling)
        {
            this.user.volatile.stall(false);
        }

        if (failed)
        {
            // handle fail inferences
            // the failed=false side of this is handled by a separate event
            if (this.volatileEffect === "imprison")
            {
                this.imprison(/*failed*/true);
            }

            // clear pending flags
            this.callEffect = false;
            this.fieldCondition = null;
            this.sideCondition = null;
            this.volatileEffect = null;
            this.selfVolatileEffect = null;

            // clear continuous moves
            // TODO: can a called move lock the user?
            if (!this.called)
            {
                this.user.volatile.lockedMove.reset();
                this.user.volatile.rollout.reset();
            }

            // TODO: other implications of a move failing
            return;
        }

        // user effects

        switch (this.volatileEffect)
        {
            case "minimize":
                this.user.volatile.minimize = true;
                this.volatileEffect = null;
                break;
            case "defensecurl":
                this.user.volatile.defenseCurl = true;
                this.volatileEffect = null;
                break;
        }

        if (!this.called)
        {
            // TODO: can a locking move be called and still lock the user?
            // start/continue locked move status
            if (dex.isLockedMove(this.moveName))
            {
                if (this.user.volatile.lockedMove.type === this.moveName)
                {
                    // already prevented from consuming pp in constructor
                    this.user.volatile.lockedMove.tick();
                }
                else this.user.volatile.lockedMove.start(this.moveName);

                // consume lockedmove flag
                if (this.selfVolatileEffect === "lockedmove")
                {
                    this.selfVolatileEffect = null;
                }
            }
            // shouldn't have this flag set
            else if (this.selfVolatileEffect === "lockedmove")
            {
                // istanbul ignore next: should never happen
                throw new Error(`Invalid locked move '${this.moveName}'`);
            }
            // must've missed the status ending
            else this.user.volatile.lockedMove.reset();

            // TODO: can a rollout move be called and still lock the user?
            // start/continue rollout status
            if (this.user.volatile.rollout.type === this.moveName)
            {
                // already prevented from consuming pp in constructor
                this.user.volatile.rollout.tick();
            }
            else if (isRolloutMove(this.moveName))
            {
                this.user.volatile.rollout.start(this.moveName);
            }
            // must've missed the status ending
            else this.user.volatile.rollout.reset();
        }

        // team effects

        if (!this.user.team) throw new Error("Move user doesn't have a team");
        const team = this.user.team;

        switch (this.moveName)
        {
            // wish can be used consecutively, but only the first use counts
            case "wish": team.status.wish.start(/*restart*/false); break;
        }

        team.status.selfSwitch = this.selfSwitch;
    }

    /**
     * Handles the implications of Imprison succeeding or failing.
     * @param failed Whether the move failed.
     */
    private imprison(failed: boolean): void
    {
        // assume us is fully known, while them is unknown
        const us = this.state.teams.us.active.moveset;
        const usMoves = [...us.moves].map(([name]) => name);
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
     * Activates a field status condition. Consumes matching fieldCondition
     * flags to make inferences.
     * @returns Whether the parent DriverContexts should also handle this event.
     */
    private activateFieldCondition(event: ActivateFieldCondition): ContextResult
    {
        // is this event possible within the context of this move?
        if (event.condition !== this.fieldCondition) return "expire";
        // consume field condition flag
        this.fieldCondition = null;
        return "base";
    }

    /**
     * Activates a team status condition. Consumes matching sideCondition flags
     * to make inferences.
     * @returns Whether the parent DriverContexts should also handle this event.
     */
    private activateSideCondition(event: ActivateSideCondition): ContextResult
    {
        switch (event.condition)
        {
            case "healingWish": case "lunarDance":
                // no known move can explicitly cause a DriverEvent like this
                // instead, the user of said move should faint
                return "expire";
            case "luckyChant": case "mist": case "safeguard": case "tailwind":
                // no known move can explicitly end these SideConditions, only
                //  when we're at the end of their durations
                if (!event.start) return "expire";
                if (this.checkSideCondition(event.condition)) return "expire";
                this.sideCondition = null;
                return "base";
            case "spikes": case "stealthRock": case "toxicSpikes":
                // can be cleared by a move, but aren't covered by a flag yet
                //  (TODO)
                if (!event.start) return "base";
                if (this.checkSideCondition(event.condition)) return "expire";
                this.sideCondition = null;
                return "base";
            case "lightScreen": case "reflect":
                // can be cleared by a move, but aren't covered by a flag yet
                //  (TODO)
                if (!event.start) return "base";
                if (this.checkSideCondition(event.condition)) return "expire";
                this.sideCondition = null;
                // fill in the user of the move (BaseContext just puts null)
                this.state.teams[event.teamRef].status[event.condition]
                    .start(this.user);
                return "stop";
        }
    }

    /**
     * @returns True if the given SideConditionType doesn't match the current
     * pending flag, false otherwise.
     */
    private checkSideCondition(condition: SideConditionType): boolean
    {
        return MoveContext.sideConditionMap[condition] !== this.sideCondition;
    }

    /**
     * Activates a volatile status condition. Consumes matching volatileEffect
     * and selfVolatileEffect flags to make inferences.
     * @returns Whether the parent DriverContexts should also handle this event.
     */
    private activateStatusEffect(event: ActivateStatusEffect): ContextResult
    {
        switch (event.status)
        {
            case "aquaRing": case "attract": case "bide": case "charge":
            case "confusion": case "curse": case "embargo": case "encore":
            case "focusEnergy": case "foresight": case "healBlock":
            case "ingrain": case "magnetRise": case "miracleEye":
            case "mudSport": case "nightmare": case "powerTrick": case "taunt":
            case "torment": case "waterSport": case "yawn":
                if (!event.start) return "expire";
                if (this.checkStatusEffect(event.status)) return "expire";
                this.volatileEffect = null;
                return this.addTarget(event.monRef);
            case "leechSeed": case "substitute":
                // can be removed by a different move, but currently not tracked
                //  yet (TODO)
                if (!event.start) return "base";
                if (this.checkStatusEffect(event.status)) return "expire";
                this.volatileEffect = null;
                return this.addTarget(event.monRef);
            case "imprison":
                if (!event.start) return "expire";
                if (this.checkStatusEffect(event.status)) return "expire";
                if (this.userRef !== event.monRef) return "expire";
                // verified that imprison was successful
                this.volatileEffect = null;
                this.addTarget(this.userRef);
                this.imprison(/*failed*/false);
                return "base";
            case "slowStart":
                return "expire";
            case "uproar":
                if (!event.start) return "expire";
                if (this.selfVolatileEffect !== "uproar") return "expire";
                this.selfVolatileEffect = null;
                return "base";
        }
    }

    /**
     * @returns True if the given StatusEffectType doesn't match the
     * corresponding pending flag, false otherwise.
     */
    private checkStatusEffect(status: Exclude<StatusEffectType, "uproar">):
        boolean
    {
        return status === "slowStart" ||
            MoveContext.statusEffectMap[status] !== this.volatileEffect;
    }

    /**
     * Sets a single-move status. Consumes matching volatileEffect and
     * selfVolatileEffect flags to make inferences.
     * @returns Whether the parent DriverContext should also handle this event.
     */
    private setSingleMoveStatus(event: SetSingleMoveStatus): ContextResult
    {
        switch (event.status)
        {
            case "destinyBond":
                if (this.volatileEffect !== "destinybond") return "expire";
                this.volatileEffect = null;
                break;
            case "grudge":
                if (this.volatileEffect !== "grudge") return "expire";
                this.volatileEffect = null;
                break;
            case "rage":
                if (this.selfVolatileEffect !== "rage") return "expire";
                this.selfVolatileEffect = null;
                break;
        }
        return "base";
    }

    /**
     * Sets a single-turn status. Consumes matching volatileEffect and
     * selfVolatileEffect flags to make inferences.
     * @returns Whether the parent DriverContext should also handle this event.
     */
    private setSingleTurnStatus(event: SetSingleTurnStatus): ContextResult
    {
        switch (event.status)
        {
            case "magicCoat":
                if (this.volatileEffect !== "magiccoat") return "expire";
                this.volatileEffect = null;
                break;
            case "roost":
                if (this.selfVolatileEffect !== "roost") return "expire";
                this.selfVolatileEffect = null;
                break;
            case "snatch":
                if (this.volatileEffect !== "snatch") return "expire";
                this.volatileEffect = null;
                break;
            // TODO: distinguish between endure/protect/etc
            case "stalling":
                if (this.volatileEffect !== "endure" &&
                    this.volatileEffect !== "protect")
                {
                    return "expire";
                }
                this.volatileEffect = null;
                break;
        }
        return "base";
    }

    /**
     * Sets the current weather.
     * @returns Whether the parent DriverContext should also handle this event.
     */
    private setWeather(event: SetWeather): ContextResult
    {
        // make sure weather move matches
        if (event.weatherType.toLowerCase() !== this.moveName) return "expire";

        // fill in the user of the weather move (BaseContext just puts null)
        this.state.status.weather.start(this.user, event.weatherType);
        return "stop";
    }
}
