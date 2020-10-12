import * as dexutil from "../../dex/dex-util";
import { Pokemon } from "../../state/Pokemon";
import { otherSide, Side } from "../../state/Side";
import * as events from "../BattleEvent";
import { ParserState, SubParser } from "../BattleParser";
import { baseHandler } from "../helpers";
import { activateAbility } from "./activateAbility";
import { activateItem } from "./activateItem";
import { halt } from "./halt";
import { useMove } from "./useMove";

/** Base handlers for each event. */
export const handlers =
{
    activateAbility(
        ...[pstate, event, ...args]: Parameters<typeof activateAbility>):
        SubParser
    {
        return activateAbility(
        {
            ...pstate,
            logger: pstate.logger.addPrefix(`Ability(${event.monRef}, ` +
                `${event.ability}): `)
        },
            event, ...args);
    },
    async* activateFieldEffect(pstate: ParserState,
        event: events.ActivateFieldEffect, weatherSource: Pokemon | null = null,
        weatherInfinite?: boolean): SubParser
    {
        if (dexutil.isWeatherType(event.effect))
        {
            pstate.state.status.weather.start(weatherSource, event.effect,
                weatherInfinite);
        }
        else pstate.state.status[event.effect][event.start ? "start" : "end"]();
    },
    activateItem(...[pstate, event, ctg = "turn", ...args]:
        Parameters<typeof activateItem>): SubParser
    {
        return activateItem(
        {
            ...pstate,
            logger: pstate.logger.addPrefix(`Item(${event.monRef}, ` +
                `${event.item}, ctg=${ctg}): `)
        },
            event, ctg, ...args);
    },
    async* activateStatusEffect(pstate: ParserState,
        event: events.ActivateStatusEffect): SubParser
    {
        const mon = pstate.state.teams[event.monRef].active;
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
    },
    async* activateTeamEffect(pstate: ParserState,
        event: events.ActivateTeamEffect, source: Pokemon | null = null):
        SubParser
    {
        const ts = pstate.state.teams[event.teamRef].status;
        switch (event.effect)
        {
            case "healingWish": case "lunarDance":
                ts[event.effect] = event.start;
                break;
            case "lightScreen": case "reflect":
                // start should normally be handled under a MoveContext
                if (event.start) ts[event.effect].start(source);
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
    },
    async* block(pstate: ParserState, event: events.Block): SubParser {},
    async* boost(pstate: ParserState, event: events.Boost): SubParser
    {
        const {boosts} = pstate.state.teams[event.monRef].active.volatile;
        if (event.set) boosts[event.stat] = event.amount;
        else boosts[event.stat] += event.amount;
    },
    async* changeType(pstate: ParserState, event: events.ChangeType): SubParser
    {
        const mon = pstate.state.teams[event.monRef].active;
        mon.volatile.overrideTraits.types = event.newTypes;
        mon.volatile.addedType = "???";
    },
    async* clause(pstate: ParserState, event: events.Clause): SubParser
    {
    },
    async* clearAllBoosts(pstate: ParserState, event: events.ClearAllBoosts):
        SubParser
    {
        for (const side of Object.keys(pstate.state.teams) as Side[])
        {
            for (const stat of dexutil.boostKeys)
            {
                pstate.state.teams[side].active.volatile.boosts[stat] = 0;
            }
        }
    },
    async* clearNegativeBoosts(pstate: ParserState,
        event: events.ClearNegativeBoosts): SubParser
    {
        const boosts = pstate.state.teams[event.monRef].active.volatile.boosts;
        for (const stat of dexutil.boostKeys)
        {
            if (boosts[stat] < 0) boosts[stat] = 0;
        }
    },
    async* clearPositiveBoosts(pstate: ParserState,
        event: events.ClearPositiveBoosts): SubParser
    {
        const boosts = pstate.state.teams[event.monRef].active.volatile.boosts;
        for (const stat of dexutil.boostKeys)
        {
            if (boosts[stat] > 0) boosts[stat] = 0;
        }
    },
    async* copyBoosts(pstate: ParserState, event: events.CopyBoosts): SubParser
    {
        const from = pstate.state.teams[event.from].active.volatile.boosts;
        const to = pstate.state.teams[event.to].active.volatile.boosts;
        for (const stat of dexutil.boostKeys) to[stat] = from[stat];
    },
    async* countStatusEffect(pstate: ParserState,
        event: events.CountStatusEffect): SubParser
    {
        pstate.state.teams[event.monRef].active.volatile[event.effect] =
            event.amount;
    },
    async* crit(pstate: ParserState, event: events.Crit): SubParser {},
    async* cureTeam(pstate: ParserState, event: events.CureTeam): SubParser
    {
        pstate.state.teams[event.teamRef].cure();
    },
    async* disableMove(pstate: ParserState, event: events.DisableMove):
        SubParser
    {
        pstate.state.teams[event.monRef].active.volatile
            .disableMove(event.move);
    },
    async* fail(pstate: ParserState, event: events.Fail): SubParser {},
    async* faint(pstate: ParserState, event: events.Faint): SubParser
    {
        pstate.state.teams[event.monRef].active.faint();
    },
    async* fatigue(pstate: ParserState, event: events.Fatigue): SubParser
    {
        pstate.state.teams[event.monRef].active.volatile.lockedMove.reset();
    },
    async* feint(pstate: ParserState, event: events.Feint): SubParser
    {
        pstate.state.teams[event.monRef].active.volatile.feint();
    },
    async* formChange(pstate: ParserState, event: events.FormChange): SubParser
    {
        const mon = pstate.state.teams[event.monRef].active;
        mon.formChange(event.species, event.perm);

        // set other details just in case
        mon.traits.stats.level = event.level;
        mon.traits.stats.hp.set(event.hpMax);
        // TODO: should gender also be in the traits object?
        mon.gender = event.gender;
        mon.hp.set(event.hp, event.hpMax);
    },
    async* futureMove(pstate: ParserState, event: events.FutureMove): SubParser
    {
        if (event.start)
        {
            // starting a future move mentions the user
            pstate.state.teams[event.monRef].status
                .futureMoves[event.move].start(/*restart*/false);
        }
        else
        {
            // ending a future move mentions the target before
            //  taking damage
            pstate.state.teams[otherSide(event.monRef)].status
                .futureMoves[event.move].end();
        }
    },
    halt(pstate: ParserState, event: events.Halt): SubParser
    {
        return halt(
        {
            ...pstate,
            logger: pstate.logger.addPrefix(`Halt(${event.reason}): `)
        },
            event);
    },
    async* hitCount(pstate: ParserState, event: events.HitCount): SubParser {},
    async* immune(pstate: ParserState, event: events.Immune): SubParser {},
    async* inactive(pstate: ParserState, event: events.Inactive): SubParser
    {
        const mon = pstate.state.teams[event.monRef].active;
        if (event.move) mon.moveset.reveal(event.move);

        switch (event.reason)
        {
            case "imprison":
                // opponent's imprison caused the pokemon to be prevented from
                //  moving, so the revealed move can be revealed for both sides
                if (!event.move) break;
                pstate.state.teams[otherSide(event.monRef)].active.moveset
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
    },
    async* initOtherTeamSize(pstate: ParserState,
        event: events.InitOtherTeamSize): SubParser
    {
        pstate.state.teams.them.size = event.size;
    },
    async* initTeam(pstate: ParserState, event: events.InitTeam): SubParser
    {
        const team = pstate.state.teams.us;
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
    },
    async* invertBoosts(pstate: ParserState, event: events.InvertBoosts):
        SubParser
    {
        const boosts = pstate.state.teams[event.monRef].active.volatile.boosts;
        for (const stat of dexutil.boostKeys) boosts[stat] = -boosts[stat];
    },
    async* lockOn(pstate: ParserState, event: events.LockOn): SubParser
    {
        pstate.state.teams[event.monRef].active.volatile.lockOn(
            pstate.state.teams[event.target].active.volatile);
    },
    async* mimic(pstate: ParserState, event: events.Mimic): SubParser
    {
        pstate.state.teams[event.monRef].active.mimic(event.move);
    },
    async* miss(pstate: ParserState, event: events.Miss): SubParser {},
    async* modifyPP(pstate: ParserState, event: events.ModifyPP): SubParser
    {
        const move = pstate.state.teams[event.monRef].active.moveset.reveal(
            event.move);
        if (event.amount === "deplete") move.pp = 0;
        else move.pp += event.amount;
    },
    async* mustRecharge(pstate: ParserState, event: events.MustRecharge):
        SubParser
    {
        // TODO: imply this in useMove event
        pstate.state.teams[event.monRef].active.volatile.mustRecharge = true;
    },
    async* noTarget(pstate: ParserState, event: events.NoTarget): SubParser {},
    async* postTurn(pstate: ParserState, event: events.PostTurn): SubParser
    {
        pstate.state.postTurn();
    },
    async* prepareMove(pstate: ParserState, event: events.PrepareMove):
        SubParser
    {
        pstate.state.teams[event.monRef].active.volatile.twoTurn
            .start(event.move);
    },
    async* preTurn(pstate: ParserState, event: events.PreTurn): SubParser
    {
        pstate.state.preTurn();
    },
    async* reenableMoves(pstate: ParserState, event: events.ReenableMoves):
        SubParser
    {
        pstate.state.teams[event.monRef].active.volatile.enableMoves();
    },
    async* removeItem(pstate: ParserState, event: events.RemoveItem): SubParser
    {
        pstate.state.teams[event.monRef].active.removeItem(event.consumed);
    },
    async* resetWeather(pstate: ParserState, event: events.ResetWeather):
        SubParser
    {
        pstate.state.status.weather.reset();
    },
    async* resisted(pstate: ParserState, event: events.Resisted): SubParser {},
    async* restoreMoves(pstate: ParserState, event: events.RestoreMoves):
        SubParser
    {
        const moveset = pstate.state.teams[event.monRef].active.moveset;
        for (const move of moveset.moves.values()) move.pp = move.maxpp;
    },
    async* revealItem(pstate: ParserState, event: events.RevealItem): SubParser
    {
        pstate.state.teams[event.monRef].active
            .setItem(event.item, event.gained);
    },
    async* revealMove(pstate: ParserState, event: events.RevealMove): SubParser
    {
        pstate.state.teams[event.monRef].active.moveset.reveal(event.move);
    },
    async* setThirdType(pstate: ParserState, event: events.SetThirdType):
        SubParser
    {
        pstate.state.teams[event.monRef].active.volatile.addedType =
            event.thirdType;
    },
    async* sketch(pstate: ParserState, event: events.Sketch): SubParser
    {
        pstate.state.teams[event.monRef].active.sketch(event.move);
    },
    async* superEffective(pstate: ParserState, event: events.SuperEffective):
        SubParser {},
    async* swapBoosts(pstate: ParserState, event: events.SwapBoosts): SubParser
    {
        const v1 = pstate.state.teams[event.monRef1].active.volatile.boosts;
        const v2 = pstate.state.teams[event.monRef2].active.volatile.boosts;
        for (const stat of event.stats)
        {
            [v1[stat], v2[stat]] = [v2[stat], v1[stat]];
        }
    },
    async* switchIn(pstate: ParserState, event: events.SwitchIn): SubParser
    {
        // TODO: switch ctx
        pstate.state.teams[event.monRef].switchIn(event);
    },
    async* takeDamage(pstate: ParserState, event: events.TakeDamage): SubParser
    {
        const mon = pstate.state.teams[event.monRef].active;
        mon.hp.set(event.hp);
    },
    async* transform(pstate: ParserState, event: events.Transform): SubParser
    {
        pstate.state.teams[event.source].active.transform(
            pstate.state.teams[event.target].active);
    },
    async* trap(pstate: ParserState, event: events.Trap): SubParser
    {
        pstate.state.teams[event.by].active.volatile.trap(
            pstate.state.teams[event.target].active.volatile);
    },
    async* updateFieldEffect(pstate: ParserState,
        event: events.UpdateFieldEffect): SubParser
    {
        // currently only applies to weather
        const weather = pstate.state.status.weather;
        if (weather.type !== event.effect)
        {
            throw new Error(`Weather is '${weather.type}' but ticked ` +
                `weather is '${event.effect}'`);
        }
        weather.tick();
    },
    async* updateMoves(pstate: ParserState, event: events.UpdateMoves):
        SubParser
    {
        const mon = pstate.state.teams[event.monRef].active;

        // infer moveset
        for (const data of event.moves)
        {
            const move = mon.moveset.reveal(data.id, data.maxpp);
            if (data.pp != null) move.pp = data.pp;
        }
    },
    async* updateStatusEffect(pstate: ParserState,
        event: events.UpdateStatusEffect): SubParser
    {
        pstate.state.teams[event.monRef].active.volatile[event.effect].tick();
    },
    useMove(...[pstate, event, called = false, ...args]:
        Parameters<typeof useMove>): SubParser
    {
        let calledStr = "";
        if (called === "bounced") calledStr = ", bounced";
        else if (called) calledStr = ", called";

        return useMove(
        {
            ...pstate,
            logger: pstate.logger.addPrefix(`Move(${event.monRef}, ` +
                `${event.move}${calledStr}): `)
        },
            event, called, ...args);
    }
} as const;

/** Dispatches event handler. */
export const dispatch = baseHandler(handlers);
