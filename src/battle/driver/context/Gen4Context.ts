import { Logger } from "../../../Logger";
import * as dexutil from "../../dex/dex-util";
import * as effects from "../../dex/effects";
import { BattleState } from "../../state/BattleState";
import { otherSide, Side } from "../../state/Side";
import * as events from "../BattleEvent";
import { AbilityContext, ContextResult, DriverContext, MoveContext,
    SwitchContext } from "./context";

/** Handles and accepts all events in a gen-4 context. */
export class Gen4Context extends DriverContext
{
    /**
     * Creates a Gen4Context.
     * @param state State object to mutate while handling events.
     * @param logger Logger object.
     */
    constructor(state: BattleState, logger: Logger)
    {
        super(state, logger, /*accept*/ true);
    }

    /** @override */
    public activateAbility(event: events.ActivateAbility,
        on: effects.ability.On | null = null, hitByMove?: string): ContextResult
    {
        return AbilityContext.from(this.state, event,
            this.logger.addPrefix(`Ability(${event.monRef}, ${event.ability}` +
                "): "),
            on, hitByMove);
    }

    /** @override */
    public activateFieldEffect(event: events.ActivateFieldEffect): ContextResult
    {
        if (dexutil.isWeatherType(event.effect))
        {
            this.state.status.weather.start(null, event.effect);
        }
        else this.state.status[event.effect][event.start ? "start" : "end"]();
        return super.activateFieldEffect(event);
    }

    /** @override */
    public activateItem(event: events.ActivateItem): ContextResult
    {
        this.state.teams[event.monRef].active.setItem(event.item);
        return super.activateItem(event);
    }

    /** @override */
    public activateStatusEffect(event: events.ActivateStatusEffect):
        ContextResult
    {
        const mon = this.state.teams[event.monRef].active;
        switch (event.effect)
        {
            case "aquaRing": case "attract": case "curse": case "flashFire":
            case "focusEnergy": case "imprison": case "ingrain":
            case "leechSeed": case "mudSport": case "nightmare":
            case "powerTrick": case "substitute": case "suppressAbility":
            case "torment": case "waterSport":
            case "destinyBond": case "grudge": case "rage": // singlemove
            case "magicCoat": case "roost": case "snatch": // singleturn
                mon.volatile[event.effect] = event.start;
                break;
            case "bide": case "confusion": case "charge": case "magnetRise":
            case "embargo": case "healBlock": case "slowStart": case "taunt":
            case "uproar": case "yawn":
                mon.volatile[event.effect][event.start ? "start" : "end"]();
                break;
            case "encore":
                if (event.start)
                {
                    if (!mon.volatile.lastMove)
                    {
                        throw new Error("Can't Encore if lastMove is null");
                    }
                    mon.volatile.encoreMove(mon.volatile.lastMove);
                }
                else mon.volatile.removeEncore();
                break;
            case "endure": case "protect": // stall
                mon.volatile.stall(event.start);
                break;
            case "foresight": case "miracleEye":
                mon.volatile.identified = event.start ? event.effect : null;
                break;
            default:
                if (dexutil.isMajorStatus(event.effect))
                {
                    // afflict status
                    if (event.start) mon.majorStatus.afflict(event.effect);
                    // cure status (assert mentioned status)
                    else mon.majorStatus.assert(event.effect).cure();
                }
                else
                {
                    throw new Error(
                        `Invalid status effect '${event.effect}' with ` +
                        `start=${event.start}`);
                }
        }
        return super.activateStatusEffect(event);
    }

    /** @override */
    public activateTeamEffect(event: events.ActivateTeamEffect): ContextResult
    {
        const ts = this.state.teams[event.teamRef].status;
        switch (event.effect)
        {
            case "healingWish": case "lunarDance":
                ts[event.effect] = event.start;
                break;
            case "lightScreen": case "reflect":
                // start should normally be handled under a MoveContext
                if (event.start) ts[event.effect].start(/*source*/null);
                else ts[event.effect].reset();
                break;
            case "luckyChant": case "mist": case "safeguard": case "tailwind":
                if (event.start) ts[event.effect].start();
                else ts[event.effect].end();
                break;
            case "spikes": case "stealthRock": case "toxicSpikes":
                if (event.start) ++ts[event.effect];
                else ts[event.effect] = 0;
                break;
        }
        return super.activateTeamEffect(event);
    }

    /** @override */
    public boost(event: events.Boost): ContextResult
    {
        const {boosts} = this.state.teams[event.monRef].active.volatile;
        if (event.set) boosts[event.stat] = event.amount;
        else boosts[event.stat] += event.amount;
        return super.boost(event);
    }

    /** @override */
    public changeType(event: events.ChangeType): ContextResult
    {
        const mon = this.state.teams[event.monRef].active;
        mon.volatile.overrideTraits.types = event.newTypes;
        mon.volatile.addedType = "???";
        return super.changeType(event);
    }

    /** @override */
    public clearAllBoosts(event: events.ClearAllBoosts): ContextResult
    {
        for (const side of Object.keys(this.state.teams) as Side[])
        {
            for (const stat of dexutil.boostKeys)
            {
                this.state.teams[side].active.volatile.boosts[stat] = 0;
            }
        }
        return super.clearAllBoosts(event);
    }

    /** @override */
    public clearNegativeBoosts(event: events.ClearNegativeBoosts): ContextResult
    {
        const boosts = this.state.teams[event.monRef].active.volatile.boosts;
        for (const stat of dexutil.boostKeys)
        {
            if (boosts[stat] < 0) boosts[stat] = 0;
        }
        return super.clearNegativeBoosts(event);
    }

    /** @override */
    public clearPositiveBoosts(event: events.ClearPositiveBoosts): ContextResult
    {
        const boosts = this.state.teams[event.monRef].active.volatile.boosts;
        for (const stat of dexutil.boostKeys)
        {
            if (boosts[stat] > 0) boosts[stat] = 0;
        }
        return super.clearPositiveBoosts(event);
    }

    /** @override */
    public copyBoosts(event: events.CopyBoosts): ContextResult
    {
        const from = this.state.teams[event.from].active.volatile.boosts;
        const to = this.state.teams[event.to].active.volatile.boosts;
        for (const stat of dexutil.boostKeys) to[stat] = from[stat];
        return super.copyBoosts(event);
    }

    /** @override */
    public countStatusEffect(event: events.CountStatusEffect): ContextResult
    {
        this.state.teams[event.monRef].active.volatile[event.effect] =
            event.amount;
        return super.countStatusEffect(event);
    }

    /** @override */
    public cureTeam(event: events.CureTeam): ContextResult
    {
        this.state.teams[event.teamRef].cure();
        return super.cureTeam(event);
    }

    /** @override */
    public disableMove(event: events.DisableMove): ContextResult
    {
        this.state.teams[event.monRef].active.volatile.disableMove(event.move);
        return super.disableMove(event);
    }

    /** @override */
    public faint(event: events.Faint): ContextResult
    {
        this.state.teams[event.monRef].active.faint();
        return super.faint(event);
    }

    /** @override */
    public fatigue(event: events.Fatigue): ContextResult
    {
        this.state.teams[event.monRef].active.volatile.lockedMove.reset();
        return super.fatigue(event);
    }

    /** @override */
    public feint(event: events.Feint): ContextResult
    {
        this.state.teams[event.monRef].active.volatile.feint();
        return super.feint(event);
    }

    /** @override */
    public formChange(event: events.FormChange): ContextResult
    {
        const mon = this.state.teams[event.monRef].active;
        mon.formChange(event.species, event.perm);

        // set other details just in case
        mon.traits.stats.level = event.level;
        mon.traits.stats.hp.set(event.hpMax);
        // TODO: should gender also be in the traits object?
        mon.gender = event.gender;
        mon.hp.set(event.hp, event.hpMax);
        return super.formChange(event);
    }

    /** @override */
    public futureMove(event: events.FutureMove): ContextResult
    {
        if (event.start)
        {
            // starting a future move mentions the user
            this.state.teams[event.monRef].status
                .futureMoves[event.move].start(/*restart*/false);
        }
        else
        {
            // ending a future move mentions the target before
            //  taking damage
            this.state.teams[otherSide(event.monRef)].status
                .futureMoves[event.move].end();
        }
        return super.futureMove(event);
    }

    /** @override */
    public inactive(event: events.Inactive): ContextResult
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
        return super.inactive(event);
    }

    /** @override */
    public initOtherTeamSize(event: events.InitOtherTeamSize): ContextResult
    {
        this.state.teams.them.size = event.size;
        return super.initOtherTeamSize(event);
    }

    /** @override */
    public initTeam(event: events.InitTeam): ContextResult
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
                mon.traits.stats[stat as dexutil.StatExceptHP]
                    .set(data.stats[stat as dexutil.StatExceptHP]);
            }
            mon.traits.setAbility(data.baseAbility);
            // TODO: handle case where there's no item? change typings or
            //  default to "none"
            mon.setItem(data.item);

            if (data.hpType) mon.hpType.narrow(data.hpType);
            if (data.happiness) mon.happiness = data.happiness;
        }
        return super.initTeam(event);
    }

    /** @override */
    public invertBoosts(event: events.InvertBoosts): ContextResult
    {
        const boosts = this.state.teams[event.monRef].active.volatile.boosts;
        for (const stat of dexutil.boostKeys) boosts[stat] = -boosts[stat];
        return super.invertBoosts(event);
    }

    /** @override */
    public lockOn(event: events.LockOn): ContextResult
    {
        this.state.teams[event.monRef].active.volatile.lockOn(
            this.state.teams[event.target].active.volatile);
        return super.lockOn(event);
    }

    /** @override */
    public mimic(event: events.Mimic): ContextResult
    {
        this.state.teams[event.monRef].active.mimic(event.move);
        return super.mimic(event);
    }

    /** @override */
    public modifyPP(event: events.ModifyPP): ContextResult
    {
        const move = this.state.teams[event.monRef].active.moveset.reveal(
            event.move);
        if (event.amount === "deplete") move.pp = 0;
        else move.pp += event.amount;
        return super.modifyPP(event);
    }

    /** @override */
    public mustRecharge(event: events.MustRecharge): ContextResult
    {
        // TODO: imply this in useMove event
        this.state.teams[event.monRef].active.volatile.mustRecharge = true;
        return super.mustRecharge(event);
    }

    /** @override */
    public postTurn(event: events.PostTurn): ContextResult
    {
        this.state.postTurn();
        return super.postTurn(event);
    }

    /** @override */
    public prepareMove(event: events.PrepareMove): ContextResult
    {
        this.state.teams[event.monRef].active.volatile.twoTurn
            .start(event.move);
        return super.prepareMove(event);
    }

    /** @override */
    public preTurn(event: events.PreTurn): ContextResult
    {
        this.state.preTurn();
        return super.preTurn(event);
    }

    /** @override */
    public reenableMoves(event: events.ReenableMoves): ContextResult
    {
        this.state.teams[event.monRef].active.volatile.enableMoves();
        return super.reenableMoves(event);
    }

    /** @override */
    public rejectSwitchTrapped(event: events.RejectSwitchTrapped): ContextResult
    {
        this.state.teams[event.monRef].active.trapped(
            this.state.teams[event.by].active);
        return super.rejectSwitchTrapped(event);
    }

    /** @override */
    public removeItem(event: events.RemoveItem): ContextResult
    {
        this.state.teams[event.monRef].active.removeItem(event.consumed);
        return super.removeItem(event);
    }

    /** @override */
    public resetWeather(event: events.ResetWeather): ContextResult
    {
        this.state.status.weather.reset();
        return super.resetWeather(event);
    }

    /** @override */
    public restoreMoves(event: events.RestoreMoves): ContextResult
    {
        const moveset = this.state.teams[event.monRef].active.moveset;
        for (const move of moveset.moves.values()) move.pp = move.maxpp;
        return super.restoreMoves(event);
    }

    /** @override */
    public revealItem(event: events.RevealItem): ContextResult
    {
        this.state.teams[event.monRef].active.setItem(event.item, event.gained);
        return super.revealItem(event);
    }

    /** @override */
    public revealMove(event: events.RevealMove): ContextResult
    {
        this.state.teams[event.monRef].active.moveset.reveal(event.move);
        return super.revealMove(event);
    }

    /** @override */
    public setThirdType(event: events.SetThirdType): ContextResult
    {
        this.state.teams[event.monRef].active.volatile.addedType =
            event.thirdType;
        return super.setThirdType(event);
    }

    /** @override */
    public sketch(event: events.Sketch): ContextResult
    {
        this.state.teams[event.monRef].active.sketch(event.move);
        return super.sketch(event);
    }

    /** @override */
    public swapBoosts(event: events.SwapBoosts): ContextResult
    {
        const v1 = this.state.teams[event.monRef1].active.volatile.boosts;
        const v2 = this.state.teams[event.monRef2].active.volatile.boosts;
        for (const stat of event.stats)
        {
            [v1[stat], v2[stat]] = [v2[stat], v1[stat]];
        }
        return super.swapBoosts(event);
    }

    /** @override */
    public switchIn(event: events.SwitchIn): ContextResult
    {
        return new SwitchContext(this.state, event,
            this.logger.addPrefix(`Switch(${event.monRef}, ${event.species})` +
                ": "));
    }

    /** @override */
    public takeDamage(event: events.TakeDamage): ContextResult
    {
        const mon = this.state.teams[event.monRef].active;
        mon.hp.set(event.newHP[0], event.newHP[1]);
        return super.takeDamage(event);
    }

    /** @override */
    public transform(event: events.Transform): ContextResult
    {
        this.state.teams[event.source].active.transform(
            this.state.teams[event.target].active);
        return super.transform(event);
    }

    /** @override */
    public trap(event: events.Trap): ContextResult
    {
        this.state.teams[event.by].active.volatile.trap(
            this.state.teams[event.target].active.volatile);
        return super.trap(event);
    }

    /** @override */
    public updateFieldEffect(event: events.UpdateFieldEffect): ContextResult
    {
        // currently only applies to weather
        const weather = this.state.status.weather;
        if (weather.type !== event.effect)
        {
            throw new Error(`Weather is '${weather.type}' but ticked ` +
                `weather is '${event.effect}'`);
        }
        weather.tick();
        return super.updateFieldEffect(event);
    }

    /** @override */
    public updateMoves(event: events.UpdateMoves): ContextResult
    {
        const mon = this.state.teams[event.monRef].active;

        // infer moveset
        for (const data of event.moves)
        {
            const move = mon.moveset.reveal(data.id, data.maxpp);
            if (data.pp != null) move.pp = data.pp;
        }
        return super.updateMoves(event);
    }

    /** @override */
    public updateStatusEffect(event: events.UpdateStatusEffect): ContextResult
    {
        this.state.teams[event.monRef].active.volatile[event.effect].tick();
        return super.updateStatusEffect(event);
    }

    /** @override */
    public useMove(event: events.UseMove): ContextResult
    {
        return new MoveContext(this.state, event,
            this.logger.addPrefix(`Move(${event.monRef}, ${event.move}): `));
    }
}
