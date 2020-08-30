import { Logger } from "../../../Logger";
import { isFutureMove, isTwoTurnMove } from "../../dex/dex";
import { boostKeys, isBoostName, isMajorStatus, isWeatherType, StatExceptHP }
    from "../../dex/dex-util";
import { BattleState } from "../../state/BattleState";
import { otherSide, Side } from "../../state/Side";
import * as events from "../BattleEvent";
import { AbilityContext } from "./AbilityContext";
import { ContextResult, DriverContext } from "./DriverContext";
import { MoveContext } from "./MoveContext";
import { SwitchContext } from "./SwitchContext";

/**
 * Ensures that the BaseContext implements handlers for each type of
 * BattleEvent.
 */
type BattleEventHandler =
    {[T in events.Type]: (event: events.Event<T>) => void | DriverContext};

/** Handles events normally. */
export class BaseContext extends DriverContext implements BattleEventHandler
{
    /**
     * Constructs a base context for handling BattleEvents.
     * @param state State object to mutate while handling events.
     * @param logger Logger object.
     */
    constructor(state: BattleState, logger: Logger)
    {
        super(state, logger);
    }

    /** @override */
    public handle(event: events.Any): ContextResult | DriverContext
    {
        const result =
            (this[event.type] as
                (event: events.Any) => void | DriverContext)(event);
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
    public activateAbility(event: events.ActivateAbility): AbilityContext
    {
        return new AbilityContext(this.state, event,
            this.logger.addPrefix(`Ability(${event.monRef}, ${event.ability}` +
                "): "));
    }

    /** Activates a field-wide effect. */
    public activateFieldEffect(event: events.ActivateFieldEffect): void
    {
        if (isWeatherType(event.effect))
        {
            this.state.status.weather.start(null, event.effect);
        }
        else this.state.status[event.effect][event.start ? "start" : "end"]();
    }

    /** Starts, sets, or ends a trivial status effect. */
    public activateStatusEffect(event: events.ActivateStatusEffect): void
    {
        const mon = this.state.teams[event.monRef].active;
        switch (event.effect)
        {
            case "aquaRing": case "attract": case "curse": case "focusEnergy":
            case "imprison": case "ingrain": case "leechSeed": case "mudSport":
            case "nightmare": case "powerTrick": case "substitute":
            case "suppressAbility": case "torment": case "waterSport":
            case "destinyBond": case "grudge": case "rage": // singlemove
            case "magicCoat": case "roost": case "snatch": // singleturn
                mon.volatile[event.effect] = event.start;
                break;
            case "bide": case "confusion": case "charge": case "encore":
            case "magnetRise": case "embargo": case "healBlock":
            case "slowStart": case "taunt": case "uproar": case "yawn":
                mon.volatile[event.effect][event.start ? "start" : "end"]();
                break;
            case "endure": case "protect": // stall
                mon.volatile.stall(event.start);
                break;
            case "foresight": case "miracleEye":
                mon.volatile.identified = event.start ? event.effect : null;
                break;
            default:
                if (isMajorStatus(event.effect))
                {
                    // afflict status
                    if (event.start) mon.majorStatus.afflict(event.effect);
                    // cure status (assert mentioned status)
                    else mon.majorStatus.assert(event.effect).cure();
                }
                else if (isFutureMove(event.effect))
                {
                    if (event.start)
                    {
                        // starting a future move mentions the user
                        this.state.teams[event.monRef].status
                            .futureMoves[event.effect].start(/*restart*/false);
                    }
                    else
                    {
                        // ending a future move mentions the target before
                        //  taking damage
                        this.state.teams[otherSide(event.monRef)].status
                            .futureMoves[event.effect].end();
                    }
                }
                else if (isTwoTurnMove(event.effect))
                {
                    mon.volatile.twoTurn.start(event.effect);
                }
                else
                {
                    throw new Error(
                        `Invalid status effect '${event.effect}' with ` +
                        `start=${event.start}`);
                }
        }
    }

    /** Activates a team-wide effect. */
    public activateTeamEffect(event: events.ActivateTeamEffect): void
    {
        const ts = this.state.teams[event.teamRef].status;
        switch (event.effect)
        {
            case "healingWish":
            case "lunarDance":
                ts[event.effect] = event.start;
                break;
            case "lightScreen":
            case "reflect":
                // start should normally be handled under a MoveContext
                if (event.start) ts[event.effect].start(/*source*/null);
                else ts[event.effect].reset();
                break;
            case "luckyChant":
            case "mist":
            case "safeguard":
            case "tailwind":
                if (event.start) ts[event.effect].start();
                else ts[event.effect].end();
                break;
            case "spikes":
            case "stealthRock":
            case "toxicSpikes":
                if (event.start) ++ts[event.effect];
                else ts[event.effect] = 0;
                break;
        }
    }

    /** Temporarily changes the pokemon's types. Also resets third type. */
    public changeType(event: events.ChangeType): void
    {
        const mon = this.state.teams[event.monRef].active;
        mon.volatile.overrideTraits.types = event.newTypes;
        mon.volatile.addedType = "???";
    }

    /** Clears all temporary stat boosts from the field. */
    public clearAllBoosts(event: events.ClearAllBoosts): void
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
    public clearNegativeBoosts(event: events.ClearNegativeBoosts): void
    {
        const boosts = this.state.teams[event.monRef].active.volatile.boosts;
        for (const stat of boostKeys) if (boosts[stat] < 0) boosts[stat] = 0;
    }

    /** Clears temporary positive stat boosts from the pokemon. */
    public clearPositiveBoosts(event: events.ClearPositiveBoosts): void
    {
        const boosts = this.state.teams[event.monRef].active.volatile.boosts;
        for (const stat of boostKeys) if (boosts[stat] > 0) boosts[stat] = 0;
    }

    /** Clears self-switch flags for both teams. */
    public clearSelfSwitch(event: events.ClearSelfSwitch): void
    {
        this.state.teams.us.status.selfSwitch = false;
        this.state.teams.them.status.selfSwitch = false;
    }

    /**
     * Copies temporary stat boosts from one pokemon to the other.
     */
    public copyBoosts(event: events.CopyBoosts): void
    {
        const from = this.state.teams[event.from].active.volatile.boosts;
        const to = this.state.teams[event.to].active.volatile.boosts;
        for (const stat of boostKeys) to[stat] = from[stat];
    }

    /** Explicitly updates status counters. */
    public countStatusEffect(event: events.CountStatusEffect): void
    {
        const v = this.state.teams[event.monRef].active.volatile;
        if (isBoostName(event.effect))
        {
            if (event.add) v.boosts[event.effect] += event.amount;
            else v.boosts[event.effect] = event.amount;
        }
        else
        {
            if (event.add) v[event.effect] += event.amount;
            else v[event.effect] = event.amount;
        }
    }

    /** Indicates a critical hit of a move on a pokemon. */
    public crit(event: events.Crit): void {}

    /** Cures all pokemon of a team of any major status conditions. */
    public cureTeam(event: events.CureTeam): void
    {
        this.state.teams[event.teamRef].cure();
    }

    /** Temporarily disables the pokemon's move. */
    public disableMove(event: events.DisableMove): void
    {
        this.state.teams[event.monRef].active.volatile.disableMove(event.move);
    }

    /** Indicates that the pokemon failed at doing something. */
    public fail(event: events.Fail): void {}

    /** Indicates that the pokemon fainted. */
    public faint(event: events.Faint): void
    {
        this.state.teams[event.monRef].active.faint();
    }

    /** Indicates that the pokemon's locked move ended in fatigue. */
    public fatigue(event: events.Fatigue): void
    {
        this.state.teams[event.monRef].active.volatile.lockedMove.reset();
    }

    /** Indicates that the pokemon's stalling move was broken by Feint. */
    public feint(event: events.Feint): void
    {
        this.state.teams[event.monRef].active.volatile.feint();
    }

    /** Indicates that the pokemon changed its form. */
    public formChange(event: events.FormChange): void
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
    public gameOver(event: events.GameOver): void {}

    /** Indicates that the pokemon was hit by a move multiple times. */
    public hitCount(event: events.HitCount): void {}

    /** Indicates that the pokemon was immune to an effect. */
    public immune(event: events.Immune): void {}

    /** Indicates that the pokemon spent its turn being inactive. */
    public inactive(event: events.Inactive): void
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
    public initOtherTeamSize(event: events.InitOtherTeamSize): void
    {
        this.state.teams.them.size = event.size;
    }

    /** Handles an InitTeam event. */
    public initTeam(event: events.InitTeam): void
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
    public invertBoosts(event: events.InvertBoosts): void
    {
        const boosts = this.state.teams[event.monRef].active.volatile.boosts;
        for (const stat of boostKeys) boosts[stat] = -boosts[stat];
    }

    /** Indicates that the pokemon is taking aim due to Lock-On. */
    public lockOn(event: events.LockOn): void
    {
        this.state.teams[event.monRef].active.volatile.lockOn(
            this.state.teams[event.target].active.volatile);
    }

    /** Indicates that the pokemon is Mimicking a move. */
    public mimic(event: events.Mimic): void
    {
        this.state.teams[event.monRef].active.mimic(event.move);
    }

    /** Indicates that the pokemon avoided a move. */
    public miss(event: events.Miss): void {}

    /** Reveals a move and modifies its PP value. */
    public modifyPP(event: events.ModifyPP): void
    {
        const move = this.state.teams[event.monRef].active.moveset.reveal(
            event.move);
        if (event.amount === "deplete") move.pp = 0;
        else move.pp += event.amount;
    }

    /** Indicates that the pokemon must recharge from the previous action. */
    public mustRecharge(event: events.MustRecharge): void
    {
        // TODO: imply this in useMove event
        this.state.teams[event.monRef].active.volatile.mustRecharge = true;
    }

    /** Indicates that the pokemon's move couldn't target anything. */
    public noTarget(event: events.NoTarget): void {}

    /** Indicates that the turn is about to end. */
    public postTurn(event: events.PostTurn): void
    {
        this.state.postTurn();
    }

    /** Indicates that the turn is about to begin. */
    public preTurn(event: events.PreTurn): void
    {
        this.state.preTurn();
    }

    /** Re-enables the pokemon's disabled moves. */
    public reenableMoves(event: events.ReenableMoves): void
    {
        this.state.teams[event.monRef].active.volatile.enableMoves();
    }

    /**
     * Indicates that the pokemon is being trapped by an unknown ability and
     * tries to infer it.
     */
    public rejectSwitchTrapped(event: events.RejectSwitchTrapped): void
    {
        this.state.teams[event.monRef].active.trapped(
            this.state.teams[event.by].active);
    }

    /** Indicates that an item was just removed from the pokemon. */
    public removeItem(event: events.RemoveItem): void
    {
        this.state.teams[event.monRef].active.removeItem(event.consumed);
    }

    /** Resets the weather back to none. */
    public resetWeather(event: events.ResetWeather): void
    {
        this.state.status.weather.reset();
    }

    /** Indicates that the pokemon was hit by a move it resists. */
    public resisted(event: events.Resisted): void {}

    /** Restores the PP of each of the pokemon's moves. */
    public restoreMoves(event: events.RestoreMoves): void
    {
        const moveset = this.state.teams[event.monRef].active.moveset;
        for (const move of moveset.moves.values()) move.pp = move.maxpp;
    }

    /** Reveals that the pokemon is now holding an item. */
    public revealItem(event: events.RevealItem): void
    {
        this.state.teams[event.monRef].active.setItem(event.item, event.gained);
    }

    /** Reveals that the pokemon knows a move. */
    public revealMove(event: events.RevealMove): void
    {
        this.state.teams[event.monRef].active.moveset.reveal(event.move);
    }

    /** Sets the pokemon's temporary third type. */
    public setThirdType(event: events.SetThirdType): void
    {
        this.state.teams[event.monRef].active.volatile.addedType =
            event.thirdType;
    }

    /** Indicates that the pokemon is Sketching a move. */
    public sketch(event: events.Sketch): void
    {
        this.state.teams[event.monRef].active.sketch(event.move);
    }

    /** Indicates that the pokemon successfully stalled an attack. */
    public stall(event: events.Stall): void {}

    /** Indicates that the pokemon was hit by a move it was weak to. */
    public superEffective(event: events.SuperEffective): void {}

    /** Swaps the given temporary stat boosts of two pokemon. */
    public swapBoosts(event: events.SwapBoosts): void
    {
        const v1 = this.state.teams[event.monRef1].active.volatile.boosts;
        const v2 = this.state.teams[event.monRef2].active.volatile.boosts;
        for (const stat of event.stats)
        {
            [v1[stat], v2[stat]] = [v2[stat], v1[stat]];
        }
    }

    /** Indicates that a pokemon has switched in. */
    public switchIn(event: events.SwitchIn): SwitchContext
    {
        return new SwitchContext(this.state, event,
            this.logger.addPrefix(`Switch(${event.monRef}, ${event.species})` +
                ": "));
    }

    /** Indicates that a pokemon took damage and its HP changed. */
    public takeDamage(event: events.TakeDamage): void
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

    /** Indicates that a pokemon has transformed into its target. */
    public transform(event: events.Transform): void
    {
        this.state.teams[event.source].active.transform(
            this.state.teams[event.target].active);
    }

    /**
     * Reveals and infers more details due to Transform. The referenced pokemon
     * should already have been referenced in a recent Transform event.
     */
    public transformPost(event: events.TransformPost): void
    {
        this.state.teams[event.monRef].active.transformPost(event.moves);
    }

    /** Indicates that the pokemon is being trapped by another. */
    public trap(event: events.Trap): void
    {
        this.state.teams[event.by].active.volatile.trap(
            this.state.teams[event.target].active.volatile);
    }

    /** Explicitly indicates that a field effect is still going. */
    public updateFieldEffect(event: events.UpdateFieldEffect): void
    {
        // currently only applies to weather
        const weather = this.state.status.weather;
        if (weather.type === event.effect) weather.tick();
        else
        {
            throw new Error(`Weather is '${weather.type}' but ticked ` +
                `weather is '${event.effect}'`);
        }
    }

    /**
     * Indicates that a status effect is still going. Usually this is implied at
     * the end of the turn unless the game usually sends an explicit message,
     * which this BattleEvent covers.
     */
    public updateStatusEffect(event: events.UpdateStatusEffect): void
    {
        this.state.teams[event.monRef].active.volatile[event.effect].tick();
    }

    /** Indicates that the pokemon used a move. */
    public useMove(event: events.UseMove): MoveContext
    {
        return new MoveContext(this.state, event,
            this.logger.addPrefix(`Move(${event.monRef}, ${event.move}): `));
    }
}
