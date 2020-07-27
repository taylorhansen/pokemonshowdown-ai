import { Logger } from "../../../Logger";
import { boostKeys, StatExceptHP } from "../../dex/dex-util";
import { BattleState } from "../../state/BattleState";
import { otherSide, Side } from "../../state/Side";
import { ActivateAbility, ActivateFieldCondition, ActivateFutureMove,
    ActivateSideCondition, ActivateStatusEffect, AfflictStatus, AnyDriverEvent,
    Boost, ChangeType, ClearAllBoosts, ClearNegativeBoosts, ClearPositiveBoosts,
    ClearSelfSwitch, CopyBoosts, CountStatusEffect, Crit, CureStatus, CureTeam,
    DisableMove, DriverEvent, DriverEventType, Fail, Faint, Fatigue, Feint,
    FormChange, GameOver, GastroAcid, HitCount, Immune, Inactive,
    InitOtherTeamSize, InitTeam, InvertBoosts, LockOn, Mimic, Miss, ModifyPP,
    MustRecharge, PostTurn, PrepareMove, PreTurn, ReenableMoves,
    RejectSwitchTrapped, RemoveItem, ResetWeather, Resisted, RestoreMoves,
    RevealItem, RevealMove, SetBoost, SetSingleMoveStatus, SetSingleTurnStatus,
    SetThirdType, SetWeather, Sketch, Stall, SuperEffective, SwapBoosts,
    SwitchIn, TakeDamage, TickWeather, Transform, TransformPost, Trap, Unboost,
    UpdateStatusEffect, UseMove } from "../DriverEvent";
import { AbilityContext } from "./AbilityContext";
import { ContextResult, DriverContext } from "./DriverContext";
import { MoveContext } from "./MoveContext";
import { SwitchContext } from "./SwitchContext";

/**
 * Ensures that the BaseContext implements handlers for each type of
 * DriverEvent.
 */
type DriverEventHandler =
    {[T in DriverEventType]: (event: DriverEvent<T>) => void | DriverContext};

/** Handles events normally. */
export class BaseContext extends DriverContext implements DriverEventHandler
{
    /**
     * Constructs a base context for handling DriverEvents.
     * @param state State object to mutate while handling events.
     * @param logger Logger object.
     */
    constructor(state: BattleState, logger: Logger)
    {
        super(state, logger);
    }

    /** @override */
    public handle(event: AnyDriverEvent): ContextResult | DriverContext
    {
        const result =
            (this[event.type] as
                (event: AnyDriverEvent) => void | DriverContext)(event);
        if (result) return result;
        return "stop";
    }

    // istanbul ignore next: should never be called
    /** @override */
    public expire(): void
    {
        throw new Error("BaseContext should never expire");
    }

    /** Reveals, changes, and/or activates a pokemon's ability. */
    public activateAbility(event: ActivateAbility): AbilityContext
    {
        return new AbilityContext(this.state, event,
            this.logger.addPrefix(`Ability(${event.monRef}, ${event.ability}` +
                "): "));
    }

    /** Activates a field status condition. */
    public activateFieldCondition(event: ActivateFieldCondition): void
    {
        this.state.status[event.condition][event.start ? "start" : "end"]();
    }

    /** Prepares or releases a future move. */
    public activateFutureMove(event: ActivateFutureMove): void
    {
        const futureMove = this.state.teams[event.monRef].status
            .futureMoves[event.move];
        if (event.start) futureMove.start(/*restart*/false);
        else futureMove.end();
    }

    /** Activates a team status condition. */
    public activateSideCondition(event: ActivateSideCondition): void
    {
        const ts = this.state.teams[event.teamRef].status;
        switch (event.condition)
        {
            case "healingWish":
            case "lunarDance":
                ts[event.condition] = event.start;
                break;
            case "lightScreen":
            case "reflect":
                // start should normally be handled under a MoveContext
                if (event.start) ts[event.condition].start(/*source*/null);
                else ts[event.condition].reset();
                break;
            case "luckyChant":
            case "mist":
            case "safeguard":
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

    /** Starts, sets, or ends a trivial status effect. */
    public activateStatusEffect(event: ActivateStatusEffect): void
    {
        const mon = this.state.teams[event.monRef].active;
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

    /** Afflicts the pokemon with a major status condition. */
    public afflictStatus(event: AfflictStatus): void
    {
        this.state.teams[event.monRef].active.majorStatus.afflict(event.status);
    }

    /**
     * Temporarily boosts one of the pokemon's stats by the given amount of
     * stages.
     */
    public boost(event: Boost): void
    {
        this.state.teams[event.monRef].active.volatile.boosts[event.stat] +=
            event.amount;
    }

    /** Temporarily changes the pokemon's types. Also resets third type. */
    public changeType(event: ChangeType): void
    {
        const mon = this.state.teams[event.monRef].active;
        mon.volatile.overrideTraits.types = event.newTypes;
        mon.volatile.addedType = "???";
    }

    /** Clears all temporary stat boosts from the field. */
    public clearAllBoosts(event: ClearAllBoosts): void
    {
        for (const side of Object.keys(this.state.teams) as Side[])
        {
            for (const stat of boostKeys)
            {
                this.state.teams[side].active.volatile.boosts[stat] = 0;
            }
        }
    }

    /** Clears temporary negative stat boosts from the pokemon. */
    public clearNegativeBoosts(event: ClearNegativeBoosts): void
    {
        const boosts = this.state.teams[event.monRef].active.volatile.boosts;
        for (const stat of boostKeys) if (boosts[stat] < 0) boosts[stat] = 0;
    }

    /** Clears temporary positive stat boosts from the pokemon. */
    public clearPositiveBoosts(event: ClearPositiveBoosts): void
    {
        const boosts = this.state.teams[event.monRef].active.volatile.boosts;
        for (const stat of boostKeys) if (boosts[stat] > 0) boosts[stat] = 0;
    }

    /** Clears self-switch flags for both teams. */
    public clearSelfSwitch(event: ClearSelfSwitch): void
    {
        this.state.teams.us.status.selfSwitch = false;
        this.state.teams.them.status.selfSwitch = false;
    }

    /**
     * Copies temporary stat boosts from one pokemon to the other.
     */
    public copyBoosts(event: CopyBoosts): void
    {
        const from = this.state.teams[event.from].active.volatile.boosts;
        const to = this.state.teams[event.to].active.volatile.boosts;
        for (const stat of boostKeys) to[stat] = from[stat];
    }

    /** Explicitly updates status counters. */
    public countStatusEffect(event: CountStatusEffect): void
    {
        this.state.teams[event.monRef].active.volatile[event.status] =
            event.turns;
    }

    /** Indicates a critical hit of a move on a pokemon. */
    public crit(event: Crit): void {}

    /** Cures the pokemon of the given major status. */
    public cureStatus(event: CureStatus): void
    {
        this.state.teams[event.monRef].active.majorStatus.assert(event.status)
            .cure();
    }

    /** Cures all pokemon of a team of any major status conditions. */
    public cureTeam(event: CureTeam): void
    {
        this.state.teams[event.teamRef].cure();
    }

    /** Temporarily disables the pokemon's move. */
    public disableMove(event: DisableMove): void
    {
        this.state.teams[event.monRef].active.volatile.disableMove(event.move);
    }

    /** Indicates that the pokemon failed at doing something. */
    public fail(event: Fail): void {}

    /** Indicates that the pokemon fainted. */
    public faint(event: Faint): void
    {
        this.state.teams[event.monRef].active.faint();
    }

    /** Indicates that the pokemon's locked move ended in fatigue. */
    public fatigue(event: Fatigue): void
    {
        this.state.teams[event.monRef].active.volatile.lockedMove.reset();
    }

    /** Indicates that the pokemon's stalling move was broken by Feint. */
    public feint(event: Feint): void
    {
        this.state.teams[event.monRef].active.volatile.feint();
    }

    /** Indicates that the pokemon changed its form. */
    public formChange(event: FormChange): void
    {
        const mon = this.state.teams[event.monRef].active;
        mon.formChange(event.species, event.perm);

        // set other details just in case
        mon.traits.stats.level = event.level;
        mon.traits.stats.hp.set(event.hpMax);
        // TODO: should gender also be in the traits object?
        mon.gender = event.gender;
        mon.hp.set(event.hp, event.hpMax);
    }

    /** Indicates that the game has ended. */
    public gameOver(event: GameOver): void {}

    /** Reveals and suppresses a pokemon's ability due to Gastro Acid. */
    public gastroAcid(event: GastroAcid): void
    {
        const mon = this.state.teams[event.monRef].active;
        mon.traits.setAbility(event.ability);
        mon.volatile.gastroAcid = true;
    }

    /** Indicates that the pokemon was hit by a move multiple times. */
    public hitCount(event: HitCount): void {}

    /** Indicates that the pokemon was immune to an effect. */
    public immune(event: Immune): void {}

    /** Indicates that the pokemon spent its turn being inactive. */
    public inactive(event: Inactive): void
    {
        const mon = this.state.teams[event.monRef].active;
        if (event.move) mon.moveset.reveal(event.move);

        switch (event.reason)
        {
            case "imprison":
                // opponent's imprison caused the pokemon to be prevented from
                //  moving, so the revealed move can be revealed for both sides
                if (!event.move) break;
                this.state.teams[otherSide(event.monRef)].active.moveset
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
    }

    /** Initializes the opponent's team size. */
    public initOtherTeamSize(event: InitOtherTeamSize): void
    {
        this.state.teams.them.size = event.size;
    }

    /** Handles an InitTeam event. */
    public initTeam(event: InitTeam): void
    {
        const team = this.state.teams.us;
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
        }
    }

    /** Inverts all of the pokemon's temporary stat boosts. */
    public invertBoosts(event: InvertBoosts): void
    {
        const boosts = this.state.teams[event.monRef].active.volatile.boosts;
        for (const stat of boostKeys) boosts[stat] = -boosts[stat];
    }

    /** Indicates that the pokemon is taking aim due to Lock-On. */
    public lockOn(event: LockOn): void
    {
        this.state.teams[event.monRef].active.volatile.lockOn(
            this.state.teams[event.target].active.volatile);
    }

    /** Indicates that the pokemon is Mimicking a move. */
    public mimic(event: Mimic): void
    {
        this.state.teams[event.monRef].active.mimic(event.move);
    }

    /** Indicates that the pokemon avoided a move. */
    public miss(event: Miss): void {}

    /** Reveals a move and modifies its PP value. */
    public modifyPP(event: ModifyPP): void
    {
        const move = this.state.teams[event.monRef].active.moveset.reveal(
            event.move);
        if (event.amount === "deplete") move.pp = 0;
        else move.pp += event.amount;
    }

    /** Indicates that the pokemon must recharge from the previous action. */
    public mustRecharge(event: MustRecharge): void
    {
        // TODO: imply this in useMove event
        this.state.teams[event.monRef].active.volatile.mustRecharge = true;
    }

    /** Indicates that the turn is about to end. */
    public postTurn(event: PostTurn): void
    {
        this.state.postTurn();
    }

    /** Indicates that the pokemon is preparing a two-turn move. */
    public prepareMove(event: PrepareMove): void
    {
        const mon = this.state.teams[event.monRef].active;
        mon.moveset.reveal(event.move);
        mon.volatile.twoTurn.start(event.move);
    }

    /** Indicates that the turn is about to begin. */
    public preTurn(event: PreTurn): void
    {
        this.state.preTurn();
    }

    /** Re-enables the pokemon's disabled moves. */
    public reenableMoves(event: ReenableMoves): void
    {
        this.state.teams[event.monRef].active.volatile.enableMoves();
    }

    /**
     * Indicates that the pokemon is being trapped by an unknown ability and
     * tries to infer it.
     */
    public rejectSwitchTrapped(event: RejectSwitchTrapped): void
    {
        this.state.teams[event.monRef].active.trapped(
            this.state.teams[event.by].active);
    }

    /** Indicates that an item was just removed from the pokemon. */
    public removeItem(event: RemoveItem): void
    {
        this.state.teams[event.monRef].active.removeItem(event.consumed);
    }

    /** Resets the weather back to none. */
    public resetWeather(event: ResetWeather): void
    {
        this.state.status.weather.reset();
    }

    /** Indicates that the pokemon was hit by a move it resists. */
    public resisted(event: Resisted): void {}

    /** Restores the PP of each of the pokemon's moves. */
    public restoreMoves(event: RestoreMoves): void
    {
        const moveset = this.state.teams[event.monRef].active.moveset;
        for (const move of moveset.moves.values()) move.pp = move.maxpp;
    }

    /** Reveals that the pokemon is now holding an item. */
    public revealItem(event: RevealItem): void
    {
        this.state.teams[event.monRef].active.setItem(event.item, event.gained);
    }

    /** Reveals that the pokemon knows a move. */
    public revealMove(event: RevealMove): void
    {
        this.state.teams[event.monRef].active.moveset.reveal(event.move);
    }

    /** Sets the pokemon's temporary stat boost to a given amount */
    public setBoost(event: SetBoost): void
    {
        this.state.teams[event.monRef].active.volatile.boosts[event.stat] =
            event.amount;
    }

    /** Sets a single-move status for the pokemon. */
    public setSingleMoveStatus(event: SetSingleMoveStatus): void
    {
        this.state.teams[event.monRef].active.volatile[event.status] = true;
    }

    /** Sets a single-turn status for the pokemon. */
    public setSingleTurnStatus(event: SetSingleTurnStatus): void
    {
        const mon = this.state.teams[event.monRef].active;
        if (event.status === "endure" || event.status === "protect")
        {
            mon.volatile.stall(true);
        }
        else mon.volatile[event.status] = true;
    }

    /** Sets the pokemon's temporary third type. */
    public setThirdType(event: SetThirdType): void
    {
        this.state.teams[event.monRef].active.volatile.addedType =
            event.thirdType;
    }

    /** Sets the current weather. */
    public setWeather(event: SetWeather): void
    {
        this.state.status.weather.start(null, event.weatherType);
    }

    /** Indicates that the pokemon is Sketching a move. */
    public sketch(event: Sketch): void
    {
        this.state.teams[event.monRef].active.sketch(event.move);
    }

    /** Indicates that the pokemon successfully stalled an attack. */
    public stall(event: Stall): void {}

    /** Indicates that the pokemon was hit by a move it was weak to. */
    public superEffective(event: SuperEffective): void {}

    /** Swaps the given temporary stat boosts of two pokemon. */
    public swapBoosts(event: SwapBoosts): void
    {
        const v1 = this.state.teams[event.monRef1].active.volatile.boosts;
        const v2 = this.state.teams[event.monRef2].active.volatile.boosts;
        for (const stat of event.stats)
        {
            [v1[stat], v2[stat]] = [v2[stat], v1[stat]];
        }
    }

    /** Indicates that a pokemon has switched in. */
    public switchIn(event: SwitchIn): SwitchContext
    {
        return new SwitchContext(this.state, event,
            this.logger.addPrefix(`Switch(${event.monRef}, ${event.species})` +
                ": "));
    }

    /** Indicates that a pokemon took damage and its HP changed. */
    public takeDamage(event: TakeDamage): void
    {
        const mon = this.state.teams[event.monRef].active;
        mon.hp.set(event.newHP[0], event.newHP[1]);
        // TODO: move tick call to postTurn() because sometimes tox damage isn't
        //  taken but still builds up
        if (event.tox && mon.majorStatus.current === "tox")
        {
            mon.majorStatus.tick();
        }
    }

    /** Indicates that the current weather condition is still active. */
    public tickWeather(event: TickWeather): void
    {
        const weather = this.state.status.weather;
        if (weather.type === event.weatherType) weather.tick();
        else
        {
            throw new Error(`Weather is '${weather.type}' but ticked ` +
                `weather is '${event.weatherType}'`);
        }
    }

    /** Indicates that a pokemon has transformed into its target. */
    public transform(event: Transform): void
    {
        this.state.teams[event.source].active.transform(
            this.state.teams[event.target].active);
    }

    /**
     * Reveals and infers more details due to Transform. The referenced pokemon
     * should already have been referenced in a recent Transform event.
     */
    public transformPost(event: TransformPost): void
    {
        this.state.teams[event.monRef].active.transformPost(event.moves);
    }

    /** Indicates that the pokemon is being trapped by another. */
    public trap(event: Trap): void
    {
        this.state.teams[event.by].active.volatile.trap(
            this.state.teams[event.target].active.volatile);
    }

    // TODO: doesn't need to exist since Boost supports negative numbers
    /**
     * Temporarily unboosts one of the pokemon's stats by the given amount of
     * stages.
     */
    public unboost(event: Unboost): void
    {
        this.state.teams[event.monRef].active.volatile.boosts[event.stat] -=
            event.amount;
    }

    /**
     * Indicates that a status effect is still going. Usually this is implied at
     * the end of the turn unless the game usually sends an explicit message,
     * which this DriverEvent covers.
     */
    public updateStatusEffect(event: UpdateStatusEffect): void
    {
        this.state.teams[event.monRef].active.volatile[event.status].tick();
    }

    /** Indicates that the pokemon used a move. */
    public useMove(event: UseMove): MoveContext
    {
        return new MoveContext(this.state, event,
            this.logger.addPrefix(`Move(${event.monRef}, ${event.move}): `));
    }
}
