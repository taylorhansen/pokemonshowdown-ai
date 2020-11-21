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
        ReturnType<typeof activateAbility>
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
        return {};
    },
    activateItem(...[pstate, event, on = "turn", ...args]:
        Parameters<typeof activateItem>): SubParser
    {
        return activateItem(
        {
            ...pstate,
            logger: pstate.logger.addPrefix(`Item(${event.monRef}, ` +
                `${event.item}, on-${on}): `)
        },
            event, on, ...args);
    },
    async* activateStatusEffect(pstate: ParserState,
        event: events.ActivateStatusEffect): SubParser
    {
        const mon = pstate.state.teams[event.monRef].active;
        // TODO: some way to fully reduce this switch statement to indirection?
        switch (event.effect)
        {
            case "aquaRing": case "attract": case "curse": case "flashFire":
            case "focusEnergy": case "imprison": case "ingrain":
            case "leechSeed": case "mudSport": case "nightmare":
            case "powerTrick": case "substitute": case "suppressAbility":
            case "torment": case "waterSport":
            case "destinyBond": case "grudge": case "rage": // singlemove
            case "magicCoat": case "roost": case "snatch": // singleturn
                // TODO: if substitute, remove partial trapping (implicit?)
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
        return {};
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
            case "wish":
                if (event.start) ts[event.effect].start();
                else ts[event.effect].end();
                break;
            case "spikes": case "stealthRock": case "toxicSpikes":
                if (event.start) ++ts[event.effect];
                else ts[event.effect] = 0;
                break;
        }
        return {};
    },
    async* block(pstate: ParserState, event: events.Block): SubParser
    {
        if (event.effect === "substitute" &&
            !pstate.state.teams[event.monRef].active.volatile.substitute)
        {
            throw new Error("Substitute blocked an effect but no Substitute " +
                "exists");
        }
        return {};
    },
    async* boost(pstate: ParserState, event: events.Boost): SubParser
    {
        const {boosts} = pstate.state.teams[event.monRef].active.volatile;
        if (event.set) boosts[event.stat] = event.amount;
        else boosts[event.stat] += event.amount;
        return {};
    },
    async* changeType(pstate: ParserState, event: events.ChangeType): SubParser
    {
        const mon = pstate.state.teams[event.monRef].active;
        mon.volatile.overrideTraits.types = event.newTypes;
        mon.volatile.addedType = "???";
        return {};
    },
    async* clause(pstate: ParserState, event: events.Clause): SubParser
    {
        return {};
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
        return {};
    },
    async* clearNegativeBoosts(pstate: ParserState,
        event: events.ClearNegativeBoosts): SubParser
    {
        const boosts = pstate.state.teams[event.monRef].active.volatile.boosts;
        for (const stat of dexutil.boostKeys)
        {
            if (boosts[stat] < 0) boosts[stat] = 0;
        }
        return {};
    },
    async* clearPositiveBoosts(pstate: ParserState,
        event: events.ClearPositiveBoosts): SubParser
    {
        const boosts = pstate.state.teams[event.monRef].active.volatile.boosts;
        for (const stat of dexutil.boostKeys)
        {
            if (boosts[stat] > 0) boosts[stat] = 0;
        }
        return {};
    },
    async* copyBoosts(pstate: ParserState, event: events.CopyBoosts): SubParser
    {
        const from = pstate.state.teams[event.from].active.volatile.boosts;
        const to = pstate.state.teams[event.to].active.volatile.boosts;
        for (const stat of dexutil.boostKeys) to[stat] = from[stat];
        return {};
    },
    async* countStatusEffect(pstate: ParserState,
        event: events.CountStatusEffect): SubParser
    {
        pstate.state.teams[event.monRef].active.volatile[event.effect] =
            event.amount;
        return {};
    },
    async* crit(pstate: ParserState, event: events.Crit): SubParser
    { return {}; },
    async* cureTeam(pstate: ParserState, event: events.CureTeam): SubParser
    {
        pstate.state.teams[event.teamRef].cure();
        return {};
    },
    async* disableMove(pstate: ParserState, event: events.DisableMove):
        SubParser
    {
        pstate.state.teams[event.monRef].active.volatile
            .disableMove(event.move);
        return {};
    },
    async* fail(pstate: ParserState, event: events.Fail): SubParser
    { return {}; },
    async* faint(pstate: ParserState, event: events.Faint): SubParser
    {
        pstate.state.teams[event.monRef].active.faint();
        return {};
    },
    async* fatigue(pstate: ParserState, event: events.Fatigue): SubParser
    {
        pstate.state.teams[event.monRef].active.volatile.lockedMove.reset();
        return {};
    },
    async* feint(pstate: ParserState, event: events.Feint): SubParser
    {
        pstate.state.teams[event.monRef].active.volatile.feint();
        return {};
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
        return {};
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
        return {};
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
    async* hitCount(pstate: ParserState, event: events.HitCount): SubParser
    { return {}; },
    async* immune(pstate: ParserState, event: events.Immune): SubParser
    { return {}; },
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
        return {};
    },
    async* initOtherTeamSize(pstate: ParserState,
        event: events.InitOtherTeamSize): SubParser
    {
        pstate.state.teams.them.size = event.size;
        return {};
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
        return {};
    },
    async* invertBoosts(pstate: ParserState, event: events.InvertBoosts):
        SubParser
    {
        const boosts = pstate.state.teams[event.monRef].active.volatile.boosts;
        for (const stat of dexutil.boostKeys) boosts[stat] = -boosts[stat];
        return {};
    },
    async* lockOn(pstate: ParserState, event: events.LockOn): SubParser
    {
        pstate.state.teams[event.monRef].active.volatile.lockOn(
            pstate.state.teams[event.target].active.volatile);
        return {};
    },
    async* mimic(pstate: ParserState, event: events.Mimic): SubParser
    {
        pstate.state.teams[event.monRef].active.mimic(event.move);
        return {};
    },
    async* miss(pstate: ParserState, event: events.Miss): SubParser
    { return {}; },
    async* modifyPP(pstate: ParserState, event: events.ModifyPP): SubParser
    {
        const move = pstate.state.teams[event.monRef].active.moveset.reveal(
            event.move);
        if (event.amount === "deplete") move.pp = 0;
        else move.pp += event.amount;
        return {};
    },
    async* mustRecharge(pstate: ParserState, event: events.MustRecharge):
        SubParser
    {
        // TODO: imply this in useMove event
        pstate.state.teams[event.monRef].active.volatile.mustRecharge = true;
        return {};
    },
    async* noTarget(pstate: ParserState, event: events.NoTarget): SubParser
    { return {}; },
    async* postTurn(pstate: ParserState, event: events.PostTurn): SubParser
    {
        pstate.state.postTurn();
        return {};
    },
    async* prepareMove(pstate: ParserState, event: events.PrepareMove):
        SubParser
    {
        pstate.state.teams[event.monRef].active.volatile.twoTurn
            .start(event.move);
        return {};
    },
    async* preTurn(pstate: ParserState, event: events.PreTurn): SubParser
    {
        pstate.state.preTurn();
        return {};
    },
    async* reenableMoves(pstate: ParserState, event: events.ReenableMoves):
        SubParser
    {
        pstate.state.teams[event.monRef].active.volatile.enableMoves();
        return {};
    },
    async* removeItem(pstate: ParserState, event: events.RemoveItem): SubParser
    {
        pstate.state.teams[event.monRef].active.removeItem(event.consumed);
        return {};
    },
    async* resetWeather(pstate: ParserState, event: events.ResetWeather):
        SubParser
    {
        pstate.state.status.weather.reset();
        return {};
    },
    async* resisted(pstate: ParserState, event: events.Resisted): SubParser
    { return {}; },
    async* restoreMoves(pstate: ParserState, event: events.RestoreMoves):
        SubParser
    {
        const moveset = pstate.state.teams[event.monRef].active.moveset;
        for (const move of moveset.moves.values()) move.pp = move.maxpp;
        return {};
    },
    async* revealItem(pstate: ParserState, event: events.RevealItem): SubParser
    {
        pstate.state.teams[event.monRef].active
            .setItem(event.item, event.gained);
        return {};
    },
    async* revealMove(pstate: ParserState, event: events.RevealMove): SubParser
    {
        pstate.state.teams[event.monRef].active.moveset.reveal(event.move);
        return {};
    },
    async* setThirdType(pstate: ParserState, event: events.SetThirdType):
        SubParser
    {
        pstate.state.teams[event.monRef].active.volatile.addedType =
            event.thirdType;
        return {};
    },
    async* sketch(pstate: ParserState, event: events.Sketch): SubParser
    {
        pstate.state.teams[event.monRef].active.sketch(event.move);
        return {};
    },
    async* superEffective(pstate: ParserState, event: events.SuperEffective):
        SubParser { return {}; },
    async* swapBoosts(pstate: ParserState, event: events.SwapBoosts): SubParser
    {
        const v1 = pstate.state.teams[event.monRef1].active.volatile.boosts;
        const v2 = pstate.state.teams[event.monRef2].active.volatile.boosts;
        for (const stat of event.stats)
        {
            [v1[stat], v2[stat]] = [v2[stat], v1[stat]];
        }
        return {};
    },
    async* switchIn(pstate: ParserState, event: events.SwitchIn): SubParser
    {
        // TODO: switch ctx
        pstate.state.teams[event.monRef].switchIn(event);
        return {};
    },
    async* takeDamage(pstate: ParserState, event: events.TakeDamage): SubParser
    {
        const mon = pstate.state.teams[event.monRef].active;
        mon.hp.set(event.hp);
        return {};
    },
    async* transform(pstate: ParserState, event: events.Transform): SubParser
    {
        pstate.state.teams[event.source].active.transform(
            pstate.state.teams[event.target].active);
        return {};
    },
    async* trap(pstate: ParserState, event: events.Trap): SubParser
    {
        pstate.state.teams[event.by].active.volatile.trap(
            pstate.state.teams[event.target].active.volatile);
        return {};
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
        return {};
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
        return {};
    },
    async* updateStatusEffect(pstate: ParserState,
        event: events.UpdateStatusEffect): SubParser
    {
        pstate.state.teams[event.monRef].active.volatile[event.effect].tick();
        return {};
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
