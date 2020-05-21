import * as dex from "../dex/dex";
import { boostKeys, isRolloutMove, selfMoveCallers, StatExceptHP,
    targetMoveCallers } from "../dex/dex-util";
import { BattleState, ReadonlyBattleState } from "../state/BattleState";
import { Pokemon } from "../state/Pokemon";
import { otherSide, Side } from "../state/Side";
import { Team } from "../state/Team";
import { ActivateAbility, ActivateFieldCondition, ActivateFutureMove,
    ActivateSideCondition, ActivateStatusEffect, AfflictStatus, AnyDriverEvent,
    Boost, ChangeType, ClearAllBoosts, ClearNegativeBoosts, ClearPositiveBoosts,
    ClearSelfSwitch, CopyBoosts, CountStatusEffect, Crit, CureStatus, CureTeam,
    DisableMove, DriverEvent, DriverEventType, Fail, Faint, Fatigue, Feint,
    FormChange, GameOver, GastroAcid, Immune, Inactive, InitOtherTeamSize,
    InitTeam, InvertBoosts, LockOn, Mimic, Miss, ModifyPP, MustRecharge,
    PostTurn, PrepareMove, PreTurn, ReenableMoves, RejectSwitchTrapped,
    RemoveItem, ResetWeather, RestoreMoves, RevealItem, RevealMove, SetBoost,
    SetSingleMoveStatus, SetSingleTurnStatus, SetThirdType, SetWeather, Sketch,
    Stall, SwapBoosts, SwitchIn, TakeDamage, TickWeather, Transform,
    TransformPost, Trap, Unboost, UpdateStatusEffect, UseMove } from
    "./DriverEvent";

/**
 * Ensures that the BattleDriver implements handlers for each type of
 * DriverEvent.
 */
type DriverEventHandler =
{
    [T in DriverEventType]:
        (event: DriverEvent<T>, cause?: AnyDriverEvent) => void
};

/** Handles all frontend-interpreted state mutations and inferences. */
export class BattleDriver implements DriverEventHandler
{
    /** Internal battle state. */
    public get state(): ReadonlyBattleState { return this._state; }
    protected readonly _state = new BattleState();

    /** Handles multiple DriverEvents. */
    public handleEvents(events: readonly AnyDriverEvent[],
        cause?: AnyDriverEvent): void
    {
        for (const event of events) this.handleEvent(event, cause);
    }

    /** Handles a DriverEvent. */
    public handleEvent<T extends DriverEventType>(event: DriverEvent<T>,
        cause?: AnyDriverEvent): void
    {
        (this[event.type] as
            (event: DriverEvent<T>, cause?: AnyDriverEvent) => void)(
                event, cause);
    }

    // TODO: rearrange methods based on relevance to each other

    /**
     * Handles an InitTeam event.
     * @virtual
     */
    public initTeam(event: InitTeam): void
    {
        const team = this._state.teams.us;
        team.size = event.team.length;
        for (const data of event.team)
        {
            // initial revealed pokemon can't be null, since we already
            //  set the teamsize
            const mon = team.reveal(data)!;
            mon.traits.stats.hp.set(data.hpMax);
            for (const stat in data.stats)
            {
                // istanbul ignore if
                if (!data.stats.hasOwnProperty(stat)) continue;
                mon.traits.stats[stat as StatExceptHP]
                    .set(data.stats[stat as StatExceptHP]);
            }
            mon.traits.setAbility(data.baseAbility);
            // TODO: handle case where there's no item? change typings or
            //  default to "none"
            mon.setItem(data.item);

            if (data.hpType) mon.hpType.narrow(data.hpType);
            if (data.happiness) mon.happiness = data.happiness;

            // initialize moveset
            mon.moveset.size = data.moves.length;
            for (const move of data.moves) mon.moveset.reveal(move);
        }
        if (event.consequences) this.handleEvents(event.consequences, event);
    }

    /**
     * Initializes the opponent's team size.
     * @virtual
     */
    public initOtherTeamSize(event: InitOtherTeamSize): void
    {
        this._state.teams.them.size = event.size;
        if (event.consequences) this.handleEvents(event.consequences, event);
    }

    /**
     * Indicates that the turn is about to begin.
     * @virtual
     */
    public preTurn(event: PreTurn): void
    {
        this._state.preTurn();
        if (event.consequences) this.handleEvents(event.consequences, event);
    }

    /**
     * Indicates that the turn is about to end.
     * @virtual
     */
    public postTurn(event: PostTurn): void
    {
        this._state.postTurn();
        if (event.consequences) this.handleEvents(event.consequences, event);
    }

    /**
     * Reveals, changes, and/or activates a pokemon's ability.
     * @virtual
     */
    public activateAbility(event: ActivateAbility): void
    {
        // override current ability with the new one
        this.getMon(event.monRef).traits.setAbility(event.ability);
        if (event.consequences) this.handleEvents(event.consequences, event);
    }

    /**
     * Reveals and suppresses a pokemon's ability due to Gastro Acid.
     * @virtual
     */
    public gastroAcid(event: GastroAcid): void
    {
        const mon = this.getMon(event.monRef);

        mon.traits.setAbility(event.ability);
        mon.volatile.gastroAcid = true;

        if (event.consequences) this.handleEvents(event.consequences, event);
    }

    /**
     * Starts, sets, or ends a trivial status effect.
     * @virtual
     */
    public activateStatusEffect(event: ActivateStatusEffect): void
    {
        const mon = this.getMon(event.monRef);
        switch (event.status)
        {
            case "aquaRing":
            case "attract":
            case "curse":
            case "focusEnergy":
            case "imprison":
            case "ingrain":
            case "leechSeed":
            case "mudSport":
            case "nightmare":
            case "powerTrick":
            case "substitute":
            case "torment":
            case "waterSport":
                mon.volatile[event.status] = event.start;
                break;
            case "bide":
            case "confusion":
            case "charge":
            case "encore":
            case "magnetRise":
            case "embargo":
            case "healBlock":
            case "slowStart":
            case "taunt":
            case "uproar":
            case "yawn":
                mon.volatile[event.status][event.start ? "start" : "end"]();
                break;
            case "foresight":
            case "miracleEye":
                mon.volatile.identified = event.start ? event.status : null;
                break;
            default:
                throw new Error(`Invalid status effect '${event.status}'`);
        }
        if (event.consequences) this.handleEvents(event.consequences, event);
    }

    /**
     * Explicitly updates status counters.
     * @virtual
     */
    public countStatusEffect(event: CountStatusEffect): void
    {
        this.getMon(event.monRef).volatile[event.status] = event.turns;
        if (event.consequences) this.handleEvents(event.consequences, event);
    }

    /**
     * Temporarily disables the pokemon's move.
     * @virtual
     */
    public disableMove(event: DisableMove): void
    {
        this.getMon(event.monRef).volatile.disableMove(event.move);
        if (event.consequences) this.handleEvents(event.consequences, event);
    }

    /**
     * Re-enables the pokemon's disabled moves.
     * @virtual
     */
    public reenableMoves(event: ReenableMoves): void
    {
        this.getMon(event.monRef).volatile.enableMoves();
        if (event.consequences) this.handleEvents(event.consequences, event);
    }

    /**
     * Prepares or releases a future move.
     * @virtual
     */
    public activateFutureMove(event: ActivateFutureMove): void
    {
        const futureMove = this.getMon(event.monRef).team!.status
            .futureMoves[event.move];
        if (event.start) futureMove.start(/*restart*/false);
        else futureMove.end();

        if (event.consequences) this.handleEvents(event.consequences, event);
    }

    /**
     * Indicates that the pokemon's stalling move was broken by Feint.
     * @virtual
     */
    public feint(event: Feint): void
    {
        this.getMon(event.monRef).volatile.feint();
        if (event.consequences) this.handleEvents(event.consequences, event);
    }

    /**
     * Indicates that a status effect is still going. Usually this is implied at
     * the end of the turn unless the game usually sends an explicit message,
     * which this DriverEvent covers.
     * @virtual
     */
    public updateStatusEffect(event: UpdateStatusEffect): void
    {
        this.getMon(event.monRef).volatile[event.status].tick();
        if (event.consequences) this.handleEvents(event.consequences, event);
    }

    /**
     * Indicates that the pokemon's locked move ended in fatigue.
     * @virtual
     */
    public fatigue(event: Fatigue): void
    {
        this.getMon(event.monRef).volatile.lockedMove.reset();
        if (event.consequences) this.handleEvents(event.consequences, event);
    }

    /**
     * Sets the pokemon's temporary third type.
     * @virtual
     */
    public setThirdType(event: SetThirdType): void
    {
        this.getMon(event.monRef).volatile.addedType = event.thirdType;
        if (event.consequences) this.handleEvents(event.consequences, event);
    }

    /**
     * Temporarily changes the pokemon's types. Also resets third type.
     * @virtual
     */
    public changeType(event: ChangeType): void
    {
        const mon = this.getMon(event.monRef);
        mon.volatile.overrideTraits.types = event.newTypes;
        mon.volatile.addedType = "???";
        if (event.consequences) this.handleEvents(event.consequences, event);
    }

    /**
     * Indicates that the pokemon is taking aim due to Lock-On.
     * @virtual
     */
    public lockOn(event: LockOn): void
    {
        this.getMon(event.monRef).volatile.lockOn(
            this.getMon(event.target).volatile);
        if (event.consequences) this.handleEvents(event.consequences, event);
    }

    /**
     * Indicates that the pokemon is Mimicking a move.
     * @virtual
     */
    public mimic(event: Mimic): void
    {
        this.getMon(event.monRef).mimic(event.move);
        if (event.consequences) this.handleEvents(event.consequences, event);
    }

    /**
     * Indicates that the pokemon is Sketching a move.
     * @virtual
     */
    public sketch(event: Sketch): void
    {
        this.getMon(event.monRef).sketch(event.move);
        if (event.consequences) this.handleEvents(event.consequences, event);
    }

    /**
     * Indicates that the pokemon is being trapped by another.
     * @virtual
     */
    public trap(event: Trap): void
    {
        this.getMon(event.by).volatile.trap(this.getMon(event.target).volatile);
        if (event.consequences) this.handleEvents(event.consequences, event);
    }

    /**
     * Temporarily boosts one of the pokemon's stats by the given amount of
     * stages.
     * @virtual
     */
    public boost(event: Boost): void
    {
        this.getMon(event.monRef).volatile.boosts[event.stat] += event.amount;
        if (event.consequences) this.handleEvents(event.consequences, event);
    }

    // TODO: doesn't need to exist since Boost supports negative numbers
    /**
     * Temporarily unboosts one of the pokemon's stats by the given amount of
     * stages.
     * @virtual
     */
    public unboost(event: Unboost): void
    {
        this.getMon(event.monRef).volatile.boosts[event.stat] -= event.amount;
        if (event.consequences) this.handleEvents(event.consequences, event);
    }

    /**
     * Clears all temporary stat boosts from the field.
     * @virtual
     */
    public clearAllBoosts(event: ClearAllBoosts): void
    {
        const mons = this.getAllActive();
        for (const mon of mons)
        {
            for (const stat of boostKeys) mon.volatile.boosts[stat] = 0;
        }
        if (event.consequences) this.handleEvents(event.consequences, event);
    }

    /**
     * Clears temporary negative stat boosts from the pokemon.
     * @virtual
     */
    public clearNegativeBoosts(event: ClearNegativeBoosts): void
    {
        const boosts = this.getMon(event.monRef).volatile.boosts;
        for (const stat of boostKeys) if (boosts[stat] < 0) boosts[stat] = 0;
        if (event.consequences) this.handleEvents(event.consequences, event);
    }

    /**
     * Clears temporary positive stat boosts from the pokemon.
     * @virtual
     */
    public clearPositiveBoosts(event: ClearPositiveBoosts): void
    {
        const boosts = this.getMon(event.monRef).volatile.boosts;
        for (const stat of boostKeys) if (boosts[stat] > 0) boosts[stat] = 0;
        if (event.consequences) this.handleEvents(event.consequences, event);
    }

    /**
     * Copies temporary stat boosts from one pokemon to the other.
     * @virtual
     */
    public copyBoosts(event: CopyBoosts): void
    {
        const from = this.getMon(event.from).volatile.boosts;
        const to = this.getMon(event.to).volatile.boosts;
        for (const stat of boostKeys) to[stat] = from[stat];
        if (event.consequences) this.handleEvents(event.consequences, event);
    }

    /**
     * Inverts all of the pokemon's temporary stat boosts.
     * @virtual
     */
    public invertBoosts(event: InvertBoosts): void
    {
        const boosts = this.getMon(event.monRef).volatile.boosts;
        for (const stat of boostKeys) boosts[stat] = -boosts[stat];
        if (event.consequences) this.handleEvents(event.consequences, event);
    }

    /**
     * Sets the pokemon's temporary stat boost to a given amount
     * @virtual
     */
    public setBoost(event: SetBoost): void
    {
        this.getMon(event.monRef).volatile.boosts[event.stat] = event.amount;
        if (event.consequences) this.handleEvents(event.consequences, event);
    }

    /**
     * Swaps the given temporary stat boosts of two pokemon.
     * @virtual
     */
    public swapBoosts(event: SwapBoosts): void
    {
        const v1 = this.getMon(event.monRef1).volatile.boosts;
        const v2 = this.getMon(event.monRef2).volatile.boosts;
        for (const stat of event.stats)
        {
            [v1[stat], v2[stat]] = [v2[stat], v1[stat]];
        }
        if (event.consequences) this.handleEvents(event.consequences, event);
    }

    /**
     * Indicates that the pokemon spent its turn being inactive.
     * @virtual
     */
    public inactive(event: Inactive): void
    {
        const mon = this.getMon(event.monRef);
        if (event.move) mon.moveset.reveal(event.move);

        switch (event.reason)
        {
            case "imprison":
                // opponent's imprison caused the pokemon to be prevented from
                //  moving, so the revealed move can be revealed for both sides
                if (!event.move) break;
                this.getMon(otherSide(event.monRef)).moveset
                    .reveal(event.move);
                break;
            case "truant":
                mon.volatile.activateTruant();
                // fallthrough: truant and recharge turns overlap
            case "recharge":
                mon.volatile.mustRecharge = false;
                break;
            case "slp":
                mon.majorStatus.assert("slp").tick(mon.ability);
                break;
        }

        // consumed an action this turn
        mon.inactive();

        if (event.consequences) this.handleEvents(event.consequences, event);
    }

    /**
     * Afflicts the pokemon with a major status condition.
     * @virtual
     */
    public afflictStatus(event: AfflictStatus): void
    {
        this.getMon(event.monRef).majorStatus.afflict(event.status);
        if (event.consequences) this.handleEvents(event.consequences, event);
    }

    /** Cures the pokemon of the given major status. */
    public cureStatus(event: CureStatus): void
    {
        this.getMon(event.monRef).majorStatus.assert(event.status).cure();
        if (event.consequences) this.handleEvents(event.consequences, event);
    }

    /**
     * Cures all pokemon of a team of any major status conditions.
     * @virtual
     */
    public cureTeam(event: CureTeam): void
    {
        this.getTeam(event.teamRef).cure();
        if (event.consequences) this.handleEvents(event.consequences, event);
    }

    /**
     * Indicates that the pokemon changed its form.
     * @virtual
     */
    public formChange(event: FormChange): void
    {
        const mon = this.getMon(event.monRef);
        mon.formChange(event.species, event.perm);

        // set other details just in case
        mon.traits.stats.level = event.level;
        mon.traits.stats.hp.set(event.hpMax);
        // TODO: should gender also be in the traits object?
        mon.gender = event.gender;
        mon.hp.set(event.hp, event.hpMax);

        if (event.consequences) this.handleEvents(event.consequences, event);
    }

    /**
     * Indicates that a pokemon has transformed into its target.
     * @virtual
     */
    public transform(event: Transform): void
    {
        this.getMon(event.source).transform(this.getMon(event.target));
        if (event.consequences) this.handleEvents(event.consequences, event);
    }

    /**
     * Reveals and infers more details due to Transform. The referenced pokemon
     * should already have been referenced in a recent Transform event.
     * @virtual
     */
    public transformPost(event: TransformPost): void
    {
        this.getMon(event.monRef).transformPost(event.moves);
        if (event.consequences) this.handleEvents(event.consequences, event);
    }

    /**
     * Indicates that the pokemon fainted.
     * @virtual
     */
    public faint(event: Faint): void
    {
        this.getMon(event.monRef).faint();
        if (event.consequences) this.handleEvents(event.consequences, event);
    }

    /**
     * Reveals that the pokemon is now holding an item.
     * @virtual
     */
    public revealItem(event: RevealItem): void
    {
        this.getMon(event.monRef).setItem(event.item, event.gained);
        if (event.consequences) this.handleEvents(event.consequences, event);
    }

    /**
     * Indicates that an item was just removed from the pokemon.
     * @virtual
     */
    public removeItem(event: RemoveItem): void
    {
        this.getMon(event.monRef).removeItem(event.consumed);
        if (event.consequences) this.handleEvents(event.consequences, event);
    }

    /**
     * Indicates that the pokemon used a move.
     * @virtual
     */
    public useMove(event: UseMove, cause?: AnyDriverEvent): void
    {
        const team = this.getTeam(event.monRef);
        const mon = this.getMon(event.monRef);

        // handle move effects/inferences

        const called = !!cause;
        if (!called && event.move !== "struggle")
        {
            mon.moveset.reveal(event.move);
        }
        let nopp = false; // used at the end for pp dedution

        // reset single move statuses, waiting for an explicit event after
        //  handling this one
        mon.volatile.resetSingleMove();

        // lookahead to see what happened as a result of this move
        let failed = false;
        const missed: Side[] = [];
        if (event.consequences)
        {
            this.recurseOverConsequences(event.consequences, consequence =>
            {
                switch (consequence.type)
                {
                    case "fail":
                        if (event.monRef === consequence.monRef) failed = true;
                        return true;
                    case "miss":
                        if (event.monRef === consequence.monRef)
                        {
                            missed.push(consequence.target);
                        }
                        return true;
                    case "immune": missed.push(consequence.monRef); return true;
                    case "stall":
                        if (!consequence.endure)
                        {
                            missed.push(consequence.monRef);
                        }
                        return true;
                    case "useMove":
                        if (event.monRef !== consequence.monRef) return false;
                        if (targetMoveCallers.includes(event.move))
                        {
                            // calling a move that is a part of the target's
                            //  moveset
                            const targets = event.targets.map(
                                t => this.getMon(t));
                            for (const target of targets)
                            {
                                target.moveset.reveal(consequence.move);
                            }
                        }
                        else if (selfMoveCallers.includes(event.move))
                        {
                            // calling a move that is a part of the user's
                            //  moveset
                            mon.moveset.reveal(consequence.move);
                        }
                        // inactive/move/switch are major events that imply a
                        //  different meaning to above handled events so don't
                        //  recurse through those
                        // fallthrough
                    case "switchIn": case "inactive":
                        return false;
                    default:
                        return true;
                }
            });
        }

        // handle implicit inferences

        const moveData = dex.moves[event.move];

        // make inferences with whether imprison failed
        if (moveData.volatileEffect === "imprison")
        {
            // assume us is fully known, while them is unknown
            const us = this._state.teams.us.active.moveset;
            const usMoves = [...us.moves].map(([name]) => name);
            const them = this._state.teams.them.active.moveset;

            if (failed)
            {
                // imprison failed, which means both active pokemon don't have
                //  each other's moves
                // infer that the opponent cannot have any of our moves

                // sanity check: opponent should not already have one of our
                //  moves
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
                // imprison succeeded, which means both active pokemon have at
                //  least one common move
                // infer that one of our moves has to be contained by the
                //  opponent's moveset

                // sanity check: opponent should have or be able to have at
                //  least one of our moves
                if (usMoves.every(name =>
                    !them.moves.has(name) && !them.constraint.has(name)))
                {
                    throw new Error("Imprison succeeded but both Pokemon " +
                        "cannot share any moves");
                }

                them.addMoveSlotConstraint(usMoves);
            }
        }

        // handle natural gift move
        if (event.move === "naturalgift")
        {
            // naturalgift only succeeds if the user has a berry, and implicitly
            //  consumes it
            // TODO: narrow further based on perceived power and type
            if (!failed)
            {
                mon.item.narrow(...Object.keys(dex.berries));
                mon.removeItem(/*consumed*/true);
            }
            // fails if the user doesn't have a berry
            else mon.item.remove(...Object.keys(dex.berries));
        }

        if (dex.isTwoTurnMove(event.move))
        {
            // could already be in the process of using a two-turn move, so make
            //  sure pp is only deducted on the first turn
            if (mon.volatile.twoTurn.type === event.move) nopp = true;
            // otherwise, the prepareMove event should later start the status
        }
        // release two-turn move if it was prepared the previous turn
        mon.volatile.twoTurn.reset();

        // reset stall counter if the stalling move failed or a different move
        //  was used
        // if another move was called, this will not reset the stall counter
        if (!called &&
            (failed ||
                (moveData.volatileEffect !== "endure" &&
                    moveData.volatileEffect !== "protect")))
        {
            mon.volatile.stall(false);
        }

        if (!failed)
        {
            // handle implicit move effects

            switch (moveData.volatileEffect)
            {
                case "minimize": mon.volatile.minimize = true; break;
                case "defensecurl": mon.volatile.defenseCurl = true; break;
            }

            switch (event.move)
            {
                case "healingwish": team.status.healingWish = true; break;
                case "lunardance": team.status.lunarDance = true; break;
                // wish can be used consecutively, but only the first use counts
                case "wish": team.status.wish.start(/*restart*/false); break;
            }

            team.status.selfSwitch = moveData.selfSwitch ?? false;
        }

        // below inferences don't happen when the move was called by another
        //  move
        if (!called)
        {
            // if not a complete miss, these locking moves will still execute
            if (!failed && !event.targets.every(t => missed.includes(t)))
            {
                // apply rollout status
                if (isRolloutMove(event.move))
                {
                    // could already be in the process of using rollout
                    if (mon.volatile.rollout.type === event.move)
                    {
                        // only deduct pp on the first use
                        mon.volatile.rollout.tick();
                        nopp = true;
                    }
                    else mon.volatile.rollout.start(event.move);
                }
                else mon.volatile.rollout.reset();

                // handle locked moves, e.g. outrage
                if (dex.isLockedMove(event.move))
                {
                    // could already be in the process of the locked move
                    if (mon.volatile.lockedMove.type === event.move)
                    {
                        mon.volatile.lockedMove.tick();
                        // only deduct pp on the first use
                        nopp = true;
                    }
                    else mon.volatile.lockedMove.start(event.move);
                }
                else mon.volatile.lockedMove.reset();
            }
            else
            {
                mon.volatile.rollout.reset();
                mon.volatile.lockedMove.reset();
            }

            // reveal move and deduct pp
            // TODO: infer no pp for available moves if struggle (ambiguous)
            if (event.move !== "struggle")
            {
                const move = mon.moveset.get(event.move)!; // revealed earlier
                const targets = event.targets.map(t => this.getMon(t));
                if (!nopp)
                {
                    move.pp -= 1;
                    // moldbreaker cancels pressure
                    if (mon.ability !== "moldbreaker")
                    {
                        // consume an extra pp for each target with pressure
                        for (const target of targets)
                        {
                            if (target !== mon && target.ability === "pressure")
                            {
                                move.pp -= 1;
                            }
                        }
                    }
                }
            }
        }

        if (event.consequences) this.handleEvents(event.consequences, event);
    }

    /**
     * Recursively visits a DriverEvent's consequence tree.
     * @param events Events to visit.
     * @param callback Callback to execute for each event. If the event returns
     * `true`, it will recurse over that event's consequences tree if it exists,
     * or skip over it if `false` is returned.
     */
    private recurseOverConsequences(events: readonly AnyDriverEvent[],
        callback: (event: AnyDriverEvent) => boolean): void
    {
        for (const event of events)
        {
            if (callback(event) && event.consequences)
            {
                this.recurseOverConsequences(event.consequences, callback);
            }
        }
    }

    /**
     * Reveals that the pokemon knows a move.
     * @virtual
     */
    public revealMove(event: RevealMove): void
    {
        this.getMon(event.monRef).moveset.reveal(event.move);
        if (event.consequences) this.handleEvents(event.consequences, event);
    }

    /**
     * Indicates that the pokemon is preparing a two-turn move.
     * @virtual
     */
    public prepareMove(event: PrepareMove): void
    {
        const mon = this.getMon(event.monRef);
        mon.moveset.reveal(event.move);
        mon.volatile.twoTurn.start(event.move);
        if (event.consequences) this.handleEvents(event.consequences, event);
    }

    /**
     * Indicates a critical hit of a move on the pokemon.
     * @virtual
     */
    public crit(event: Crit): void
    {
        if (event.consequences) this.handleEvents(event.consequences, event);
    }

    /**
     * Indicates that the pokemon failed at doing something.
     * @virtual
     */
    public fail(event: Fail): void
    {
        if (event.consequences) this.handleEvents(event.consequences, event);
    }

    /**
     * Indicates that the pokemon missed its target.
     * @virtual
     */
    public miss(event: Miss): void
    {
        if (event.consequences) this.handleEvents(event.consequences, event);
    }

    /**
     * Indicates that the pokemon was immune to an effect.
     * @virtual
     */
    public immune(event: Immune): void
    {
        if (event.consequences) this.handleEvents(event.consequences, event);
    }

    /**
     * Indicates that the pokemon successfully stalled an attack.
     * @virtual
     */
    public stall(event: Stall): void
    {
        if (event.consequences) this.handleEvents(event.consequences, event);
    }

    /**
     * Reveals a move and modifies its PP value.
     * @virtual
     */
    public modifyPP(event: ModifyPP): void
    {
        const move = this.getMon(event.monRef).moveset.reveal(event.move);
        if (event.amount === "deplete") move.pp = 0;
        else move.pp += event.amount;
        if (event.consequences) this.handleEvents(event.consequences, event);
    }

    /**
     * Restores the PP of each of the pokemon's moves.
     * @virtual
     */
    public restoreMoves(event: RestoreMoves): void
    {
        const moveset = this.getMon(event.monRef).moveset;
        for (const move of moveset.moves.values()) move.pp = move.maxpp;
        if (event.consequences) this.handleEvents(event.consequences, event);
    }

    /**
     * Indicates that the pokemon must recharge from the previous action.
     * @virtual
     */
    public mustRecharge(event: MustRecharge): void
    {
        // TODO: imply this in #useMove()
        this.getMon(event.monRef).volatile.mustRecharge = true;
        if (event.consequences) this.handleEvents(event.consequences, event);
    }

    /**
     * Sets a single-move status for the pokemon.
     * @virtual
     */
    public setSingleMoveStatus(event: SetSingleMoveStatus): void
    {
        this.getMon(event.monRef).volatile[event.status] = true;
        if (event.consequences) this.handleEvents(event.consequences, event);
    }

    /**
     * Sets a single-turn status for the pokemon.
     * @virtual
     */
    public setSingleTurnStatus(event: SetSingleTurnStatus): void
    {
        const mon = this.getMon(event.monRef);
        if (event.status === "stalling") mon.volatile.stall(true);
        else mon.volatile[event.status] = true;
        if (event.consequences) this.handleEvents(event.consequences, event);
    }

    /**
     * Indicates that a pokemon took damage and its HP changed.
     * @virtual
     */
    public takeDamage(event: TakeDamage): void
    {
        const mon = this.getMon(event.monRef);
        mon.hp.set(event.newHP[0], event.newHP[1]);
        // TODO: move tick call to postTurn() because sometimes tox damage isn't
        //  taken but still builds up
        if (event.tox && mon.majorStatus.current === "tox")
        {
            mon.majorStatus.tick();
        }
        if (event.consequences) this.handleEvents(event.consequences, event);
    }

    /**
     * Activates a team status condition.
     * @virtual
     */
    public activateSideCondition(event: ActivateSideCondition,
        cause?: AnyDriverEvent): void
    {
        const ts = this.getTeam(event.teamRef).status;
        switch (event.condition)
        {
            case "healingWish":
            case "lunarDance":
                ts[event.condition] = event.start;
                break;
            case "lightScreen":
            case "reflect":
                if (event.start)
                {
                    // see if a useMove event caused it
                    let source: Pokemon | null = null;
                    // must also check if the move that was used can actually
                    //  cause this effect
                    const sideConditionMap =
                        {lightscreen: "lightScreen", reflect: "reflect"} as
                        {
                            [name: string]: string | undefined,
                            lightscreen: "lightScreen", reflect: "reflect"
                        };
                    if (cause?.type === "useMove" &&
                        sideConditionMap[
                                dex.moves[cause.move]?.sideCondition ?? ""] ===
                            event.condition)
                    {
                        source = this.getMon(cause.monRef);
                    }
                    ts[event.condition].start(source);
                }
                else ts[event.condition].reset();
                break;
            case "luckyChant":
            case "mist":
            case "tailwind":
                if (event.start) ts[event.condition].start();
                else ts[event.condition].end();
                break;
            case "spikes":
            case "stealthRock":
            case "toxicSpikes":
                if (event.start) ++ts[event.condition];
                else ts[event.condition] = 0;
                break;
        }
        if (event.consequences) this.handleEvents(event.consequences, event);
    }

    /**
     * Activates a field status condition.
     * @virtual
     */
    public activateFieldCondition(event: ActivateFieldCondition): void
    {
        this._state.status[event.condition][event.start ? "start" : "end"]();
        if (event.consequences) this.handleEvents(event.consequences, event);
    }

    /**
     * Indicates that a pokemon has switched in.
     * @virtual
     */
    public switchIn(event: SwitchIn): void
    {
        this.getTeam(event.monRef).switchIn(event);
        if (event.consequences) this.handleEvents(event.consequences, event);
    }

    /**
     * Indicates that the pokemon is being trapped by an unknown ability and
     * tries to infer it.
     * @virtual
     */
    public rejectSwitchTrapped(event: RejectSwitchTrapped): void
    {
        this.getMon(event.monRef).trapped(this.getMon(event.by));
        if (event.consequences) this.handleEvents(event.consequences, event);
    }

    /**
     * Clears self-switch flags for both teams.
     * @virtual
     */
    public clearSelfSwitch(event: ClearSelfSwitch): void
    {
        this._state.teams.us.status.selfSwitch = false;
        this._state.teams.them.status.selfSwitch = false;
        if (event.consequences) this.handleEvents(event.consequences, event);
    }

    /**
     * Resets the weather back to none.
     * @virtual
     */
    public resetWeather(event: ResetWeather): void
    {
        this._state.status.weather.reset();
        if (event.consequences) this.handleEvents(event.consequences, event);
    }

    /**
     * Sets the current weather.
     * @virtual
     */
    public setWeather(event: SetWeather, cause?: AnyDriverEvent): void
    {
        let source: Pokemon | null = null;
        let infinite: boolean | undefined;
        if (cause)
        {
            if (cause.type === "useMove") source = this.getMon(cause.monRef);
            else if (cause.type === "activateAbility")
            {
                source = this.getMon(cause.monRef);
                // gen<=4: ability-caused weather is infinite
                infinite = true;
            }
        }
        this._state.status.weather.start(source, event.weatherType, infinite);

        if (event.consequences) this.handleEvents(event.consequences, event);
    }

    /**
     * Indicates that the current weather condition is still active.
     * @virtual
     */
    public tickWeather(event: TickWeather): void
    {
        const weather = this._state.status.weather;
        if (weather.type === event.weatherType) weather.tick();
        else
        {
            throw new Error(`Weather is '${weather.type}' but upkept ` +
                `weather is '${event.weatherType}'`);
        }
        if (event.consequences) this.handleEvents(event.consequences, event);
    }

    /**
     * Indicates that the game has ended.
     * @virtual
     */
    public gameOver(event: GameOver): void
    {
        if (event.consequences) this.handleEvents(event.consequences, event);
    }

    // TODO: make this not the case
    // istanbul ignore next: unstable, hard to verify
    /** Stringifies the BattleState. */
    public getStateString(): string
    {
        return this._state.toString();
    }

    /** Gets the Team from the given Side. */
    protected getTeam(side: Side): Team
    {
        return this._state.teams[side];
    }

    /** Gets the active Pokemon from the given Side. */
    protected getMon(side: Side): Pokemon
    {
        return this.getTeam(side).active;
    }

    /** Gets all active Pokemon on the field. */
    protected getAllActive(): Pokemon[]
    {
        return [this._state.teams.us.active, this._state.teams.them.active];
    }
}
