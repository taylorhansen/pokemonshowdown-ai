import { boostKeys, StatExceptHP } from "../dex/dex-util";
import { BattleState, ReadonlyBattleState } from "../state/BattleState";
import { Pokemon } from "../state/Pokemon";
import { otherSide, Side } from "../state/Side";
import { Team } from "../state/Team";
import { ActivateAbility, ActivateFieldCondition, ActivateFutureMove,
    ActivateSideCondition, ActivateStatusEffect, AfflictStatus, AnyDriverEvent,
    Boost, ChangeType, ClearAllBoosts, ClearNegativeBoosts, ClearPositiveBoosts,
    ClearSelfSwitch, CopyBoosts, CountStatusEffect, CureStatus, CureTeam,
    DisableMove, DriverEvent, DriverEventType, Faint, Fatigue, Feint,
    FormChange, GastroAcid, Inactive, InitOtherTeamSize, InitTeam, InvertBoosts,
    LockOn, Mimic, ModifyPP, MustRecharge, PostTurn, PreTurn, ReenableMoves,
    RejectSwitchTrapped, RemoveItem, ResetWeather, RestoreMoves, RevealItem,
    RevealMove, SetBoost, SetSingleMoveStatus, SetSingleTurnStatus,
    SetThirdType, SetWeather, Sketch, SwapBoosts, SwitchIn, TakeDamage,
    TickWeather, Transform, TransformPost, Trap, Unboost, UpdateStatusEffect,
    UseMove } from "./DriverEvent";

/**
 * Ensures that the BattleDriver implements handlers for each type of
 * DriverEvent.
 */
type DriverEventHandler =
    {[T in DriverEventType]: (event: DriverEvent<T>) => void};

/** Handles all frontend-interpreted state mutations and inferences. */
export class BattleDriver implements DriverEventHandler
{
    /** Internal battle state. */
    public get state(): ReadonlyBattleState { return this._state; }
    protected readonly _state = new BattleState();

    /** Handles multiple DriverEvents. */
    public handleEvents(events: readonly AnyDriverEvent[]): void
    {
        for (const event of events) this.handleEvent(event);
    }

    /** Handles a DriverEvent. */
    public handleEvent<T extends DriverEventType>(event: DriverEvent<T>): void
    {
        (this[event.type] as (event: DriverEvent<T>) => void)(event);
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
    }

    /**
     * Initializes the opponent's team size.
     * @virtual
     */
    public initOtherTeamSize(event: InitOtherTeamSize): void
    {
        this._state.teams.them.size = event.size;
    }

    /**
     * Indicates that the turn is about to begin.
     * @virtual
     */
    public preTurn(event: PreTurn): void
    {
        this._state.preTurn();
    }

    /**
     * Indicates that the turn is about to end.
     * @virtual
     */
    public postTurn(event: PostTurn): void
    {
        this._state.postTurn();
    }

    /**
     * Reveals, changes, and/or activates a pokemon's ability.
     * @virtual
     */
    public activateAbility(event: ActivateAbility): void
    {
        const mon = this.getMon(event.monRef);
        // TODO: move trace logic to outside - these events should reveal one
        //  ability at a time
        if (event.traced)
        {
            // infer trace user's base ability
            mon.traits.ability.narrow("trace");
            // infer opponent's ability due to trace effect
            this.getMon(event.traced).traits.ability.narrow(event.ability);
        }

        // override current ability with the new one
        mon.traits.setAbility(event.ability);
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
    }

    /**
     * Explicitly updates status counters.
     * @virtual
     */
    public countStatusEffect(event: CountStatusEffect): void
    {
        this.getMon(event.monRef).volatile[event.status] = event.turns;
    }

    /**
     * Temporarily disables the pokemon's move.
     * @virtual
     */
    public disableMove(event: DisableMove): void
    {
        this.getMon(event.monRef).disableMove(event.move);
    }

    /**
     * Re-enables the pokemon's disabled moves.
     * @virtual
     */
    public reenableMoves(event: ReenableMoves): void
    {
        this.getMon(event.monRef).volatile.enableMoves();
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
    }

    /**
     * Indicates that the pokemon's stalling move was broken by Feint.
     * @virtual
     */
    public feint(event: Feint): void
    {
        this.getMon(event.monRef).volatile.feint();
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
    }

    /**
     * Indicates that the pokemon's locked move ended in fatigue.
     * @virtual
     */
    public fatigue(event: Fatigue): void
    {
        this.getMon(event.monRef).volatile.lockedMove.reset();
    }

    /**
     * Sets the pokemon's temporary third type.
     * @virtual
     */
    public setThirdType(event: SetThirdType): void
    {
        this.getMon(event.monRef).volatile.addedType = event.thirdType;
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
    }

    /**
     * Indicates that the pokemon is taking aim due to Lock-On.
     * @virtual
     */
    public lockOn(event: LockOn): void
    {
        this.getMon(event.monRef).volatile.lockOn(
            this.getMon(event.target).volatile);
    }

    /**
     * Indicates that the pokemon is Mimicking a move.
     * @virtual
     */
    public mimic(event: Mimic): void
    {
        this.getMon(event.monRef).mimic(event.move);
    }

    /**
     * Indicates that the pokemon is Sketching a move.
     * @virtual
     */
    public sketch(event: Sketch): void
    {
        this.getMon(event.monRef).sketch(event.move);
    }

    /**
     * Indicates that the pokemon is being trapped by another.
     * @virtual
     */
    public trap(event: Trap): void
    {
        this.getMon(event.by).volatile.trap(this.getMon(event.target).volatile);
    }

    /**
     * Temporarily boosts one of the pokemon's stats by the given amount of
     * stages.
     * @virtual
     */
    public boost(event: Boost): void
    {
        this.getMon(event.monRef).volatile.boosts[event.stat] += event.amount;
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
    }

    /**
     * Clears temporary negative stat boosts from the pokemon.
     * @virtual
     */
    public clearNegativeBoosts(event: ClearNegativeBoosts): void
    {
        const boosts = this.getMon(event.monRef).volatile.boosts;
        for (const stat of boostKeys) if (boosts[stat] < 0) boosts[stat] = 0;
    }

    /**
     * Clears temporary positive stat boosts from the pokemon.
     * @virtual
     */
    public clearPositiveBoosts(event: ClearPositiveBoosts): void
    {
        const boosts = this.getMon(event.monRef).volatile.boosts;
        for (const stat of boostKeys) if (boosts[stat] > 0) boosts[stat] = 0;
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
    }

    /**
     * Inverts all of the pokemon's temporary stat boosts.
     * @virtual
     */
    public invertBoosts(event: InvertBoosts): void
    {
        const boosts = this.getMon(event.monRef).volatile.boosts;
        for (const stat of boostKeys) boosts[stat] = -boosts[stat];
    }

    /**
     * Sets the pokemon's temporary stat boost to a given amount
     * @virtual
     */
    public setBoost(event: SetBoost): void
    {
        this.getMon(event.monRef).volatile.boosts[event.stat] = event.amount;
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
                if (event.move)
                {
                    this.getMon(otherSide(event.monRef)).moveset
                        .reveal(event.move);
                }
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
    }

    /**
     * Afflicts the pokemon with a major status condition.
     * @virtual
     */
    public afflictStatus(event: AfflictStatus): void
    {
        this.getMon(event.monRef).majorStatus.afflict(event.status);
    }

    /** Cures the pokemon of the given major status. */
    public cureStatus(event: CureStatus): void
    {
        this.getMon(event.monRef).majorStatus.assert(event.status).cure();
    }

    /**
     * Cures all pokemon of a team of any major status conditions.
     * @virtual
     */
    public cureTeam(event: CureTeam): void
    {
        this.getTeam(event.teamRef).cure();
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
    }

    /**
     * Indicates that a pokemon has transformed into its target.
     * @virtual
     */
    public transform(event: Transform): void
    {
        this.getMon(event.source).transform(this.getMon(event.target));
    }

    /**
     * Reveals and infers more details due to Transform. The referenced pokemon
     * should already have been referenced in a recent Transform event.
     * @virtual
     */
    public transformPost(event: TransformPost): void
    {
        this.getMon(event.monRef).transformPost(event.moves);
    }

    /**
     * Indicates that the pokemon fainted.
     * @virtual
     */
    public faint(event: Faint): void { this.getMon(event.monRef).faint(); }

    /**
     * Reveals that the pokemon is now holding an item.
     * @virtual
     */
    public revealItem(event: RevealItem): void
    {
        this.getMon(event.monRef).setItem(event.item, event.gained);
    }

    /**
     * Indicates that an item was just removed from the pokemon.
     * @virtual
     */
    public removeItem(event: RemoveItem): void
    {
        this.getMon(event.monRef).removeItem(event.consumed);
    }

    /**
     * Indicates that the pokemon used a move.
     * @virtual
     */
    public useMove(event: UseMove): void
    {
        this.getMon(event.monRef).useMove(
            // extract move options from the event
            (({moveId, targets, unsuccessful, reveal, prepare}) =>
            ({
                moveId, unsuccessful, reveal, prepare,
                // transform reference names into object references
                targets: targets.map(targetRef => this.getMon(targetRef))
            }))(event));
    }

    /**
     * Reveals that the pokemon knows a move.
     * @virtual
     */
    public revealMove(event: RevealMove): void
    {
        this.getMon(event.monRef).moveset.reveal(event.move);
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
    }

    /**
     * Restores the PP of each of the pokemon's moves.
     * @virtual
     */
    public restoreMoves(event: RestoreMoves): void
    {
        const moveset = this.getMon(event.monRef).moveset;
        for (const move of moveset.moves.values()) move.pp = move.maxpp;
    }

    /**
     * Indicates that the pokemon must recharge from the previous action.
     * @virtual
     */
    public mustRecharge(event: MustRecharge): void
    {
        // TODO: imply this in #useMove()
        this.getMon(event.monRef).volatile.mustRecharge = true;
    }

    /**
     * Sets a single-move status for the pokemon.
     * @virtual
     */
    public setSingleMoveStatus(event: SetSingleMoveStatus): void
    {
        this.getMon(event.monRef).volatile[event.status] = true;
    }

    /**
     * Sets a single-turn status for the pokemon.
     * @virtual
     */
    public setSingleTurnStatus(event: SetSingleTurnStatus): void
    {
        this.getMon(event.monRef).volatile[event.status] = true;
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
    }

    /**
     * Activates a team status condition.
     * @virtual
     */
    public activateSideCondition(event: ActivateSideCondition): void
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
                    ts[event.condition].start(
                        event.monRef ? this.getMon(event.monRef) : null);
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
    }

    /**
     * Activates a field status condition.
     * @virtual
     */
    public activateFieldCondition(event: ActivateFieldCondition): void
    {
        this._state.status[event.condition][event.start ? "start" : "end"]();
    }

    /**
     * Indicates that a pokemon has switched in.
     * @virtual
     */
    public switchIn(event: SwitchIn): void
    {
        this.getTeam(event.monRef).switchIn(event);
    }

    /**
     * Indicates that the pokemon is being trapped by an unknown ability and
     * tries to infer it.
     * @virtual
     */
    public rejectSwitchTrapped(event: RejectSwitchTrapped): void
    {
        this.getMon(event.monRef).trapped(this.getMon(event.by));
    }

    /**
     * Clears self-switch flags for both teams.
     * @virtual
     */
    public clearSelfSwitch(event: ClearSelfSwitch): void
    {
        this._state.teams.us.status.selfSwitch = false;
        this._state.teams.them.status.selfSwitch = false;
    }

    /**
     * Resets the weather back to none.
     * @virtual
     */
    public resetWeather(event: ResetWeather): void
    {
        this._state.status.weather.reset();
    }

    /**
     * Sets the current weather.
     * @virtual
     */
    public setWeather(event: SetWeather): void
    {
        this._state.status.weather.start(this.getMon(event.monRef),
            // gen<=4: ability-caused weather is infinite
            event.weatherType, /*infinite*/event.cause === "ability");
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
