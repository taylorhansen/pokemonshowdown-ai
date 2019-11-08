import { isDeepStrictEqual } from "util";
import { dex, isFutureMove } from "../battle/dex/dex";
import { BoostName, boostNames, itemRemovalMoves,
    itemTransferMoves, nonSelfMoveCallers, selfMoveCallers, StatExceptHP,
    targetMoveCallers, Type } from "../battle/dex/dex-util";
import { BattleState } from "../battle/state/BattleState";
import { MoveOptions, Pokemon } from "../battle/state/Pokemon";
import { otherSide, Side } from "../battle/state/Side";
import { SwitchInOptions, Team } from "../battle/state/Team";
import { Logger } from "../Logger";
import { isPlayerID, otherPlayerID, PlayerID, PokemonID, toIdName } from
    "./helpers";
import { AbilityEvent, ActivateEvent, AnyBattleEvent, BoostEvent, CantEvent,
    ClearAllBoostEvent, ClearNegativeBoostEvent, ClearPositiveBoostEvent,
    CopyBoostEvent, CureStatusEvent, CureTeamEvent, DamageEvent,
    DetailsChangeEvent, DragEvent, EndAbilityEvent, EndEvent, EndItemEvent,
    FaintEvent, FieldEndEvent, FieldStartEvent, FormeChangeEvent, HealEvent,
    InvertBoostEvent, ItemEvent, MoveEvent, MustRechargeEvent, PrepareEvent,
    SetBoostEvent, SetHPEvent, SideEndEvent, SideStartEvent, SingleMoveEvent,
    SingleTurnEvent, StartEvent, StatusEvent, SwapBoostEvent, SwitchEvent,
    TieEvent, TransformEvent, TurnEvent, UnboostEvent, UpkeepEvent,
    WeatherEvent, WinEvent } from "./parser/BattleEvent";
import { BattleInitMessage, RequestMessage } from "./parser/Message";

/** Translates BattleEvents to BattleState mutations. */
export class PSEventHandler
{
    /** Whether the battle is still going on. */
    public get battling(): boolean
    {
        return this._battling;
    }
    private _battling = false;

    /** Tracks the currently known state of the battle. */
    protected readonly state: BattleState;
    /** Client's username. */
    protected readonly username: string;
    /** Logger object. */
    protected readonly logger: Logger;
    /** Last |request| message that was processed. */
    protected lastRequest?: Omit<RequestMessage, "type">;
    /**
     * Determines which PlayerID (p1 or p2) corresponds to which Side (us or
     * them).
     */
    private sides?: {readonly [ID in PlayerID]: Side};
    /** Whether a turn message was encountered in the last handleEvents call. */
    private newTurn = false;

    /**
     * Creates a PSEventHandler.
     * @param username Username of the client.
     * @param state State object.
     * @param logger Logger object. Default stdout.
     */
    constructor(username: string, state: BattleState, logger: Logger)
    {
        this.username = username;
        this.state = state;
        this.logger = logger;

    }

    /** Initializes the battle conditions. */
    public initBattle(args: Omit<BattleInitMessage, "type">): void
    {
        this._battling = true;

        // map player id to which side they represent
        const id = args.id;
        if (args.username === this.username)
        {
            this.sides = {[id]: "us", [otherPlayerID(id)]: "them"} as any;
            // we already know our team's size from the initial request
            //  message but not the other team
            this.state.teams.them.size = args.teamSizes[otherPlayerID(id)];
        }
        else
        {
            this.sides = {[id]: "them", [otherPlayerID(id)]: "us"} as any;
            this.state.teams.them.size = args.teamSizes[id];
        }
        this.handleEvents(args.events);
    }

    /**
     * Processes BattleEvents sent from the server to update the internal
     * BattleState.
     */
    public handleEvents(events: readonly AnyBattleEvent[]): void
    {
        // starting a new turn
        if (this.newTurn) this.state.preTurn();

        // this field should only stay true if one of these events contains a
        //  |turn| message
        this.newTurn = false;

        for (let i = 0; i < events.length; ++i)
        {
            const event = events[i];
            this.handleEvent(event, events, i);

        }

        // update per-turn statuses
        if (this.newTurn) this.state.postTurn();
    }

    private handleEvent(event: AnyBattleEvent,
        events: readonly AnyBattleEvent[], i: number): void
    {
        switch (event.type)
        {
            case "-ability": this.handleAbility(event, events, i); break;
            case "-endability": this.handleEndAbility(event, events, i); break;
            case "-start": this.handleStart(event, events, i); break;
            case "-activate": this.handleActivate(event, events, i); break;
            case "-end": this.handleEnd(event, events, i); break;
            case "-boost": this.handleBoost(event, events, i); break;
            case "cant": this.handleCant(event, events, i); break;
            case "-clearallboost":
                this.handleClearAllBoost(event, events, i);
                break;
            case "-clearnegativeboost":
                this.handleClearNegativeBoost(event, events, i);
                break;
            case "-clearpositiveboost":
                this.handleClearPositiveBoost(event, events, i);
                break;
            case "-copyboost": this.handleCopyBoost(event, events, i); break;
            case "-curestatus": this.handleCureStatus(event, events, i); break;
            case "-cureteam": this.handleCureTeam(event, events, i); break;
            case "-damage": case "-heal": case "-sethp":
                this.handleDamage(event, events, i);
                break;
            case "detailschange":
                this.handleDetailsChange(event, events, i);
                break;
            case "drag": case "switch":
                this.handleSwitch(event, events, i);
                break;
            case "faint": this.handleFaint(event, events, i); break;
            case "-fieldend": case "-fieldstart":
                this.handleFieldCondition(event, events, i);
                break;
            case "-formechange":
                this.handleFormeChange(event, events, i);
                break;
            case "-invertboost":
                this.handleInvertBoost(event, events, i);
                break;
            case "-item": this.handleItem(event, events, i); break;
            case "-enditem": this.handleEndItem(event, events, i); break;
            case "move": this.handleMove(event, events, i); break;
            case "-mustrecharge":
                this.handleMustRecharge(event, events, i);
                break;
            case "-prepare": this.handlePrepare(event, events, i); break;
            case "-setboost": this.handleSetBoost(event, events, i); break;
            case "-sideend": case "-sidestart":
                this.handleSideCondition(event, events, i); break;
            case "-singlemove": this.handleSingleMove(event, events, i); break;
            case "-singleturn": this.handleSingleTurn(event, events, i); break;
            case "-status": this.handleStatus(event, events, i); break;
            case "-swapboost": this.handleSwapBoost(event, events, i); break;
            case "tie": case "win":
                this.handleGameOver(event, events, i);
                break;
            case "-transform": this.handleTransform(event, events, i); break;
            case "turn": this.handleTurn(event, events, i); break;
            case "-unboost": this.handleUnboost(event, events, i); break;
            case "upkeep": this.handleUpkeep(event, events, i); break;
            case "-weather": this.handleWeather(event, events, i); break;
        }

        this.handleSuffixes(event);
    }

    /** @virtual */
    protected handleAbility(event: AbilityEvent,
        events: readonly AnyBattleEvent[], i: number): void
    {
        const active = this.getActive(event.id.owner);
        const ability = toIdName(event.ability);
        if (event.from === "ability: Trace" && event.of)
        {
            // trace ability: event.ability contains the Traced ability,
            //  event.of contains pokemon that was traced, event.id contains the
            //  pokemon with Trace

            // first indicate that trace was revealed, then override after
            active.traits.ability.narrow("trace");
            // infer opponent's ability due to trace effect
            this.getActive(event.of.owner).traits.setAbility(ability);
        }

        // override current ability with the new one
        active.traits.setAbility(ability);
    }

    /** @virtual */
    protected handleEndAbility(event: EndAbilityEvent,
        events: readonly AnyBattleEvent[], i: number): void
    {
        // transform event was already taken care of, no need to handle
        //  this message
        // TODO: could this still be used to infer base ability?
        // typically this is never revealed this way in actual cartridge
        //  play, so best to leave it for now to preserve fairness
        if (event.from === "move: Transform") return;

        const active = this.getActive(event.id.owner);
        // infer what the ability was previously
        active.traits.setAbility(toIdName(event.ability));

        // NOTE: may be replaced with "|-start|PokemonID|Gastro Acid" later
        active.volatile.gastroAcid = true;
    }

    /** @virtual */
    protected handleStart(event: StartEvent, events: readonly AnyBattleEvent[],
        i: number): void
    {
        const active = this.getActive(event.id.owner);

        let ev = event.volatile;
        if (ev.startsWith("move: ")) ev = ev.substr("move: ".length);

        switch (ev)
        {
            case "Aqua Ring": active.volatile.aquaRing = true; break;
            case "Attract": active.volatile.attracted = true; break;
            case "Bide": active.volatile.bide.start(); break;
            case "confusion":
                // start confusion status
                active.volatile.confusion.start();
                // stopped using multi-turn locked move due to fatigue
                if (event.fatigue) active.volatile.lockedMove.reset();
                break;
            case "Disable":
                // disable the given move
                active.disableMove(toIdName(event.otherArgs[0]));
                break;
            case "Encore": active.volatile.encore.start(); break;
            case "Focus Energy": active.volatile.focusEnergy = true; break;
            case "Foresight": active.volatile.identified = "foresight"; break;
            case "Ingrain": active.volatile.ingrain = true; break;
            case "Leech Seed": active.volatile.leechSeed = true; break;
            case "Magnet Rise": active.volatile.magnetRise.start(); break;
            case "Miracle Eye":
                active.volatile.identified = "miracleeye";
                break;
            case "Embargo": active.volatile.embargo.start(); break;
            case "Substitute": active.volatile.substitute = true; break;
            case "Slow Start": active.volatile.slowStart.start(); break;
            case "Taunt": active.volatile.taunt.start(); break;
            case "Torment": active.volatile.torment = true; break;
            case "typeadd":
                // set added type
                active.volatile.addedType =
                    event.otherArgs[0].toLowerCase() as Type;
                break;
            case "typechange":
            {
                // set types
                // format: Type1/Type2
                let types: [Type, Type];

                if (event.otherArgs[0])
                {
                    const parsedTypes = event.otherArgs[0].split("/")
                        .map(type => type.toLowerCase()) as Type[];

                    // make sure length is 2
                    if (parsedTypes.length > 2)
                    {
                        this.logger.error("Too many types given " +
                            `(${parsedTypes.join(", ")})`);
                        parsedTypes.splice(2);
                    }
                    else if (parsedTypes.length === 1) parsedTypes.push("???");
                    types = parsedTypes as [Type, Type];
                }
                else types = ["???", "???"];

                active.volatile.overrideTraits.types = types;
                // typechange resets third type
                active.volatile.addedType = "???";
                break;
            }
            case "Uproar":
                if (event.otherArgs[0] === "[upkeep]")
                {
                    active.volatile.uproar.tick();
                }
                else active.volatile.uproar.start();
                break;
            default:
            {
                const moveId = toIdName(ev);
                // istanbul ignore else: not useful to test
                if (isFutureMove(moveId))
                {
                    active.team!.status.futureMoves[moveId]
                        .start(/*restart*/false);
                }
                else
                {
                    this.logger.debug(`Ignoring start '${event.volatile}'`);
                }
            }
        }
    }

    /** @virtual */
    protected handleActivate(event: ActivateEvent,
        events: readonly AnyBattleEvent[], i: number): void
    {
        const ev = event.volatile;
        if (ev === "confusion")
        {
            this.getActive(event.id.owner).volatile.confusion.tick();
        }
        else if (ev === "move: Charge")
        {
            this.getActive(event.id.owner).volatile.charge.start();
        }
        else if (ev === "move: Bide")
        {
            this.getActive(event.id.owner).volatile.bide.tick();
        }
        else if (ev === "move: Mimic")
        {
            const active = this.getActive(event.id.owner);
            const move = toIdName(event.otherArgs[0]);

            const lastEvent = events[i - 1];
            if (!lastEvent || lastEvent.type !== "move" ||
                JSON.stringify(lastEvent.id) !== JSON.stringify(event.id))
            {
                throw new Error("Don't know how Mimic was caused");
            }

            if (lastEvent.moveName === "Mimic") active.mimic(move);
            else if (lastEvent.moveName === "Sketch") active.sketch(move);
            else
            {
                throw new Error(
                    `Unknown Mimic-like move '${lastEvent.moveName}'`);
            }
        }
        else if (ev === "trapped")
        {
            const trapped = this.getActive(event.id.owner).volatile;
            const trapping = this.getActive(otherPlayerID(event.id.owner))
                .volatile;
            trapping.trap(trapped);
        }
        else this.logger.debug(`Ignoring activate '${event.volatile}'`);
    }

    /** @virtual */
    protected handleEnd(event: EndEvent, events: readonly AnyBattleEvent[],
        i: number): void
    {
        const team = this.getTeam(event.id.owner);
        const v = team.active.volatile;

        let ev = event.volatile;
        if (ev.startsWith("move: ")) ev = ev.substr("move: ".length);
        const id = toIdName(ev);

        if (ev === "Attract") v.attracted = false;
        else if (ev === "Bide") v.bide.end();
        else if (ev === "confusion") v.confusion.end();
        else if (ev === "Disable") v.enableMoves();
        else if (ev === "Embargo") v.embargo.end();
        else if (ev === "Encore") v.encore.end();
        else if (ev === "Ingrain") v.ingrain = false;
        else if (ev === "Magnet Rise") v.magnetRise.end();
        else if (ev === "Substitute") v.substitute = false;
        else if (ev === "Slow Start") v.slowStart.end();
        else if (ev === "Taunt") v.taunt.end();
        else if (ev === "Uproar") v.uproar.end();
        else if (isFutureMove(id)) team.status.futureMoves[id].end();
        else this.logger.debug(`Ignoring end '${event.volatile}'`);
    }

    /** @virtual */
    protected handleBoost(event: BoostEvent, events: readonly AnyBattleEvent[],
        i: number): void
    {
        this.getActive(event.id.owner).volatile.boosts[event.stat] +=
            event.amount;
    }

    /** @virtual */
    protected handleCant(event: CantEvent, events: readonly AnyBattleEvent[],
        i: number): void
    {
        const active = this.getActive(event.id.owner);
        if (event.reason === "recharge")
        {
            // successfully completed its recharge turn
            active.volatile.mustRecharge = false;
        }
        else if (event.reason === "slp")
        {
            active.majorStatus.assert("slp").tick(active.ability);
        }
        else if (event.reason.startsWith("ability: "))
        {
            // can't move due to an ability
            const ability = toIdName(
                event.reason.substr("ability: ".length));
            active.traits.setAbility(ability);

            if (ability === "truant")
            {
                active.volatile.activateTruant();
                // truant turn and recharge turn overlap
                active.volatile.mustRecharge = false;
            }
        }

        if (event.moveName)
        {
            // prevented from using a move, which might not have
            //  been revealed before
            active.moveset.reveal(toIdName(event.moveName));
        }

        // reset single-move statuses since this counts as an action
        active.volatile.resetSingleMove();
    }

    /** @virtual */
    protected handleClearAllBoost(event: ClearAllBoostEvent,
        events: readonly AnyBattleEvent[], i: number): void
    {
        for (const stat of Object.keys(boostNames) as BoostName[])
        {
            this.state.teams.us.active.volatile.boosts[stat] = 0;
            this.state.teams.them.active.volatile.boosts[stat] = 0;
        }
    }

    /** @virtual */
    protected handleClearNegativeBoost(event: ClearNegativeBoostEvent,
        events: readonly AnyBattleEvent[], i: number): void
    {
        for (const stat of Object.keys(boostNames) as BoostName[])
        {
            const boosts = this.getActive(event.id.owner).volatile.boosts;
            if (boosts[stat] < 0) boosts[stat] = 0;
        }
    }

    /** @virtual */
    protected handleClearPositiveBoost(event: ClearPositiveBoostEvent,
        events: readonly AnyBattleEvent[], i: number): void
    {
        for (const stat of Object.keys(boostNames) as BoostName[])
        {
            const boosts = this.getActive(event.id.owner).volatile.boosts;
            if (boosts[stat] > 0) boosts[stat] = 0;
        }
    }

    /** @virtual */
    protected handleCopyBoost(event: CopyBoostEvent,
        events: readonly AnyBattleEvent[], i: number): void
    {
        this.getActive(event.source.owner).volatile.copyBoostsFrom(
            this.getActive(event.target.owner).volatile);
    }

    /** @virtual */
    protected handleCureStatus(event: CureStatusEvent,
        events: readonly AnyBattleEvent[], i: number): void
    {
        const active = this.getActive(event.id.owner);
        const status = active.majorStatus;
        status.assert(event.majorStatus);
        if (status.current === "slp" && status.turns === 1)
        {
            // cured in 0 turns, must have early bird ability
            // TODO: move this assertion to BattleState
            active.traits.setAbility("earlybird");
        }
        status.cure();
    }

    /** @virtual */
    protected handleCureTeam(event: CureTeamEvent,
        events: readonly AnyBattleEvent[], i: number): void
    {
        this.getTeam(event.id.owner).cure();
    }

    /**
     * Handles a damage/heal event.
     * @virtual
     */
    protected handleDamage(event: DamageEvent | HealEvent | SetHPEvent,
        events: readonly AnyBattleEvent[], i: number): void
    {
        const active = this.getActive(event.id.owner);
        active.hp.set(event.status.hp, event.status.hpMax);

        // increment toxic turns if taking damage from it
        if (event.from === "psn" && active.majorStatus.current === "tox")
        {
            active.majorStatus.tick();
        }
    }

    /** @virtual */
    protected handleDetailsChange(event: DetailsChangeEvent,
        events: readonly AnyBattleEvent[], i: number): void
    {
        // permanent form change
        const active = this.getActive(event.id.owner);
        active.formChange(event.species, /*perm*/true);

        // set other details just in case
        active.traits.stats.level = event.level;
        active.gender = event.gender;
        active.hp.set(event.hp, event.hpMax);
    }

    /**
     * Handles a drag/switch event.
     * @virtual
     */
    protected handleSwitch(event: DragEvent | SwitchEvent,
        events: readonly AnyBattleEvent[], i: number): void
    {
        const team = this.getTeam(event.id.owner);

        // consume pending copyvolatile status flags
        const options: SwitchInOptions =
            {copyVolatile: team.status.selfSwitch === "copyvolatile"};
        team.status.selfSwitch = false;

        team.switchIn(event.species, event.level, event.gender, event.hp,
            event.hpMax, options);
    }

    /** @virtual */
    protected handleFaint(event: FaintEvent, events: readonly AnyBattleEvent[],
        i: number): void
    {
        this.getActive(event.id.owner).faint();
    }

    /**
     * Handles a field end/start event.
     * @virtual
     */
    protected handleFieldCondition(event: FieldEndEvent | FieldStartEvent,
        events: readonly AnyBattleEvent[], i: number): void
    {
        switch (event.effect)
        {
            case "move: Gravity":
                if (event.type === "-fieldstart")
                {
                    this.state.status.gravity.start();
                }
                else this.state.status.gravity.end();
                break;
            case "move: Trick Room":
                if (event.type === "-fieldstart")
                {
                    this.state.status.trickRoom.start();
                }
                else this.state.status.trickRoom.end();
                break;
        }
    }

    /** @virtual */
    protected handleFormeChange(event: FormeChangeEvent,
        events: readonly AnyBattleEvent[], i: number): void
    {
        if (!dex.pokemon.hasOwnProperty(event.species))
        {
            throw new Error(`Unknown species '${event.species}'`);
        }
        // TODO: set other details?
        this.getActive(event.id.owner).formChange(event.species);
    }

    /** @virtual */
    protected handleInvertBoost(event: InvertBoostEvent,
        events: readonly AnyBattleEvent[], i: number): void
    {
        const boosts = this.getActive(event.id.owner).volatile.boosts;
        for (const stat of Object.keys(boostNames) as BoostName[])
        {
            boosts[stat] = -boosts[stat];
        }
    }

    /** @virtual */
    protected handleItem(event: ItemEvent, events: readonly AnyBattleEvent[],
        i: number): void
    {
        const mon = this.getActive(event.id.owner);

        // item can be gained via a transfer move or recycle
        let gained: boolean | "recycle";
        if (event.from && event.from.startsWith("move: "))
        {
            const move = event.from.substr("move: ".length);
            if (move === "Recycle") gained = "recycle";
            else gained = itemTransferMoves.includes(move);
        }
        else gained = false;

        mon.setItem(toIdName(event.item), gained);
    }

    /** @virtual */
    protected handleEndItem(event: EndItemEvent,
        events: readonly AnyBattleEvent[], i: number): void
    {
        const mon = this.getActive(event.id.owner);

        // handle case where an item-removal or steal-eat move was used
        //  against us, which removes but doesn't consume our item
        let consumed: boolean | string;
        if (event.from === "stealeat" ||
            (event.from && event.from.startsWith("move: ") &&
                itemRemovalMoves.includes(
                    event.from.substr("move: ".length))))
        {
            consumed = false;
        }
        else consumed = toIdName(event.item);

        mon.removeItem(consumed);
    }

    /** @virtual */
    protected handleMove(event: MoveEvent, events: readonly AnyBattleEvent[],
        i: number): void
    {
        const moveId = toIdName(event.moveName);
        const mon = this.getActive(event.id.owner);
        const targets = this.getTargets(moveId, mon);

        const options: MoveOptions = {moveId, targets};

        if (event.miss) options.unsuccessful = "evaded";

        // look ahead at minor events to see if the move failed
        while (events[++i] && events[i].type.startsWith("-"))
        {
            const e = events[i];
            if ((e.type === "-activate" &&
                    (e.volatile === "Mat Block" ||
                        PSEventHandler.isStallSingleTurn(e.volatile))) ||
                ["-immune", "-miss"].includes(e.type))
            {
                // opponent successfully evaded an attack
                options.unsuccessful = "evaded";
            }
            // move failed on its own
            else if (e.type === "-fail") options.unsuccessful = "failed";
        }

        // at this point, events[i] may be the next event
        // if the next event is the effect of a target move caller
        //  (e.g. Me First), we can infer the target's move early
        const nextEvent = events[i];
        if (nextEvent && nextEvent.type === "move" &&
            isDeepStrictEqual(event.id, nextEvent.id) &&
            nextEvent.from && targetMoveCallers.includes(nextEvent.from))
        {
            const copiedMoveId = toIdName(nextEvent.moveName);
            for (const target of targets)
            {
                target.moveset.reveal(copiedMoveId);
            }
        }

        // handle event suffixes
        if (event.from)
        {
            // don't add to moveset if this is called using another move
            if (nonSelfMoveCallers.includes(event.from))
            {
                options.reveal = false;
            }
            // don't consume pp if locked into using the move
            else if (event.from === "lockedmove" ||
                // also reveal but don't consume pp for moves called by
                //  effects that call one of the user's moves (eg sleeptalk)
                selfMoveCallers.includes(event.from))
            {
                options.reveal = "nopp";
            }
        }

        // indicate that the pokemon has used this move
        mon.useMove(options);
    }

    /** @virtual */
    protected handleMustRecharge(event: MustRechargeEvent,
        events: readonly AnyBattleEvent[], i: number): void
    {
            this.getActive(event.id.owner).volatile.mustRecharge = true;
    }

    /** @virtual */
    protected handlePrepare(event: PrepareEvent,
        events: readonly AnyBattleEvent[], i: number): void
    {
        // moveName should be one of the two-turn moves being prepared
        this.getActive(event.id.owner).volatile.twoTurn.start(
                toIdName(event.moveName) as any);
    }

    /** @virtual */
    protected handleSetBoost(event: SetBoostEvent,
        events: readonly AnyBattleEvent[], i: number): void
    {
        this.getActive(event.id.owner).volatile.boosts[event.stat] =
            event.amount;
    }

    /**
     * Handles a side end/start event.
     * @virtual
     */
    protected handleSideCondition(event: SideEndEvent | SideStartEvent,
        events: readonly AnyBattleEvent[], i: number): void
    {
        const ts = this.getTeam(event.id).status;

        let condition = event.condition;
        if (condition.startsWith("move: "))
        {
            condition = condition.substr("move: ".length);
        }
        switch (condition)
        {
            case "Reflect":
            case "Light Screen":
                if (event.type === "-sidestart")
                {
                    const lastEvent = events[i - 1];
                    if (!lastEvent)
                    {
                        this.logger.error(`Don't know how ${condition} was ` +
                            "caused since this is the first event");
                        break;
                    }
                    if (lastEvent.type !== "move")
                    {
                        this.logger.error(`Don't know how ${condition} was ` +
                            "caused since no move caused it");
                        break;
                    }
                    const source = this.getActive(lastEvent.id.owner);
                    if (condition === "Reflect") ts.reflect.start(source);
                    else ts.lightScreen.start(source);
                }
                else
                {
                    if (condition === "Reflect") ts.reflect.reset();
                    else ts.lightScreen.reset();
                }
                break;
            case "Spikes":
                if (event.type === "-sidestart") ++ts.spikes;
                else ts.spikes = 0;
                break;
            case "Stealth Rock":
                if (event.type === "-sidestart") ++ts.stealthRock;
                else ts.stealthRock = 0;
                break;
            case "Tailwind":
                if (event.type === "-sidestart") ts.tailwind.start();
                else ts.tailwind.end();
            case "Toxic Spikes":
                if (event.type === "-sidestart") ++ts.toxicSpikes;
                else ts.toxicSpikes = 0;
                break;
        }
    }

    /** @virtual */
    protected handleSingleMove(event: SingleMoveEvent,
        events: readonly AnyBattleEvent[], i: number): void
    {
        const v = this.getActive(event.id.owner).volatile;
        if (event.move === "Destiny Bond") v.destinyBond = true;
        else if (event.move === "Grudge") v.grudge = true;
    }

    /** @virtual */
    protected handleSingleTurn(event: SingleTurnEvent,
        events: readonly AnyBattleEvent[], i: number): void
    {
        const v = this.getActive(event.id.owner).volatile;
        if (PSEventHandler.isStallSingleTurn(event.status)) v.stall(true);
        else if (event.status === "move: Roost") v.roost = true;
        else if (event.status === "move: Magic Coat") v.magicCoat = true;
    }

    /** @virtual */
    protected handleStatus(event: StatusEvent,
        events: readonly AnyBattleEvent[], i: number): void
    {
        this.getActive(event.id.owner).majorStatus.afflict(
                event.majorStatus);
    }

    /** @virtual */
    protected handleSwapBoost(event: SwapBoostEvent,
        events: readonly AnyBattleEvent[], i: number): void
    {
        const source = this.getActive(event.source.owner).volatile.boosts;
        const target = this.getActive(event.target.owner).volatile.boosts;
        for (const stat of event.stats)
        {
            [source[stat], target[stat]] = [target[stat], source[stat]];
        }
    }

    /** @virtual */
    protected handleGameOver(event: TieEvent | WinEvent,
        events: readonly AnyBattleEvent[], i: number): void
    {
        this._battling = false;
    }

    /** @virtual */
    protected handleTransform(event: TransformEvent,
        events: readonly AnyBattleEvent[], i: number): void
    {
        const source = this.getActive(event.source.owner);
        const target = this.getActive(event.target.owner);

        source.transform(target);

        // use lastRequest to infer more details
        if (!this.lastRequest || !this.lastRequest.active) return;
        // transform reverts after fainting but not after being forced to
        //  choose a switch-in without fainting
        if (this.lastRequest.forceSwitch &&
            this.lastRequest.side.pokemon[0].hp === 0) return;
        // if species don't match, must've been dragged out before we could
        //  infer any other features
        if (this.lastRequest.side.pokemon[0].species !==
            source.species) return;

        source.transformPost(this.lastRequest.active[0].moves,
            this.lastRequest.side.pokemon[0].stats);
    }

    /** @virtual */
    protected handleTurn(event: TurnEvent, events: readonly AnyBattleEvent[],
        i: number): void
    {
        this.newTurn = true;
    }

    /** @virtual */
    protected handleUnboost(event: UnboostEvent,
        events: readonly AnyBattleEvent[], i: number): void
    {
        this.getActive(event.id.owner).volatile.boosts[event.stat] -=
            event.amount;
    }

    /** @virtual */
    protected handleUpkeep(event: UpkeepEvent,
        events: readonly AnyBattleEvent[], i: number): void
    {
        // selfSwitch is the result of a move, which only occurs in the middle
        //  of all the turn's main events (args.events) if the simulator
        //  ignored the fact that a selfSwitch move was used, then it would
        //  emit an upkeep event
        this.state.teams.us.status.selfSwitch = false;
        this.state.teams.them.status.selfSwitch = false;
    }

    /** @virtual */
    protected handleWeather(event: WeatherEvent,
        events: readonly AnyBattleEvent[], i: number): void
    {
        const weather = this.state.status.weather;
        if (event.weatherType === "none") weather.reset();
        else if (event.upkeep)
        {
            if (weather.type === event.weatherType) weather.tick();
            else
            {
                this.logger.error(`Weather is '${weather.type}' but ` +
                    `upkept weather is '${event.weatherType}'`);
            }
        }
        // find out what caused the weather to change
        else if (event.from && event.from.startsWith("ability: ") &&
            event.of)
        {
            // gen<=4: ability-caused weather is infinite
            weather.start(this.getActive(event.of.owner), event.weatherType,
                /*infinite*/true);
        }
        else
        {
            const lastEvent = events[i - 1];
            if (!lastEvent)
            {
                // istanbul ignore next: should never happen
                this.logger.error("Don't know how weather was caused " +
                    "since this is the first event");
                return;
            }

            if (lastEvent.type === "move")
            {
                // caused by a move
                const source = this.getActive(lastEvent.id.owner);
                weather.start(source, event.weatherType);
            }
            else if (lastEvent.type !== "switch")
            {
                // if switched in, only an ability would activate, which was
                //  already handled earlier, so there would be no other way
                //  to cause the weather effect
                // istanbul ignore next: should never happen
                this.logger.error("Don't know how weather was caused " +
                    "since this isn't preceeded by a move or switch");
            }
            else /*istanbul ignore next: ok */ {}
        }
    }

    // istanbul ignore next: unstable, hard to verify
    /** Prints the state to the logger. */
    public printState(): void
    {
        this.logger.debug(`State:\n${this.state.toString()}`);
    }

    /** Processes a `request` message. */
    public handleRequest(args: Omit<RequestMessage, "type">): void
    {
        this.lastRequest = args;

        // a request message is given at the start of the battle, before any
        //  battleinit stuff
        if (this._battling) return;

        // first time: initialize client team data
        const team = this.state.teams.us;
        team.size = args.side.pokemon.length;
        for (const data of args.side.pokemon)
        {
            // initial revealed pokemon can't be null, since we already
            //  set the teamsize
            const mon = team.reveal(data.species, data.level, data.gender,
                    data.hp, data.hpMax)!;
            for (const stat in data.stats)
            {
                // istanbul ignore if
                if (!data.stats.hasOwnProperty(stat)) continue;
                mon.traits.stats[stat as StatExceptHP]
                    .set(data.stats[stat as StatExceptHP]);
            }
            mon.traits.stats.hp.set(data.hpMax);
            mon.setItem(data.item);
            mon.traits.setAbility(data.baseAbility);
            mon.majorStatus.assert(data.condition);

            for (let moveId of data.moves)
            {
                if (moveId.startsWith("hiddenpower") &&
                    moveId.length > "hiddenpower".length)
                {
                    // set hidden power type
                    // format: hiddenpower<type><base power if gen2-5>
                    // TODO: also infer ivs based on type/power
                    mon.hpType.narrow(
                        moveId.substr("hiddenpower".length).replace(/\d+/, ""));
                    moveId = "hiddenpower";
                }
                else if (moveId.startsWith("return") &&
                    moveId.length > "return".length)
                {
                    // calculate happiness value from base power
                    mon.happiness = 2.5 *
                        parseInt(moveId.substr("return".length), 10);
                    moveId = "return";
                }
                else if (moveId.startsWith("frustration") &&
                    moveId.length > "frustration".length)
                {
                    // calculate happiness value from base power
                    mon.happiness = 255 - 2.5 *
                            parseInt(moveId.substr("frustration".length), 10);
                    moveId = "frustration";
                }

                mon.moveset.reveal(moveId);
            }
        }
    }

    /** Handles the `[of]` and `[from]` suffixes of an event. */
    private handleSuffixes(event: AnyBattleEvent): void
    {
        // can't do anything without a [from] suffix
        const f = event.from;
        if (!f) return;

        // these corner cases should already be handled
        if (event.type === "-ability" && event.from === "ability: Trace")
        {
            return;
        }
        if (event.from === "lockedmove") return;

        // look for a PokemonID using the `of` or `id` fields
        // this will be used for handling the `from` field
        let id: PokemonID | undefined;
        if (event.of) id = event.of;
        else if ((event as any).id && isPlayerID((event as any).id.owner))
        {
            id = (event as any).id;
        }

        if (!id) throw new Error("No PokemonID given to handle suffixes with");
        const mon = this.getActive(id.owner);

        // TODO: should all use cases be handled in separate event handlers?
        // if so, this method might not need to exist
        if (f.startsWith("ability: "))
        {
            mon.traits.setAbility(toIdName(f.substr("ability: ".length)));
        }
        else if (f.startsWith("item: "))
        {
            mon.setItem(toIdName(f.substr("item: ".length)));
        }
    }

    /**
     * Checks if a status string from a SingleTurnEvent represents a stalling
     * move.
     * @param status Single turn status.
     * @returns True if it is a stalling status, false otherwise.
     */
    private static isStallSingleTurn(status: string): boolean
    {
        return ["Protect", "move: Protect", "move: Endure"].includes(status);
    }

    /**
     * Gets the active Pokemon targets of a move.
     * @param moveId Move that will be used.
     * @param user Pokemon that used the move.
     */
    protected getTargets(moveId: string, user: Pokemon): Pokemon[]
    {
        const targetType = dex.moves[moveId].target;
        switch (targetType)
        {
            case "adjacentAlly":
                // TODO: support doubles/triples
                return [];
            case "adjacentAllyOrSelf": case "allySide":
            case "allyTeam": case "self":
                return [user];
            case "adjacentFoe": case "all": case "allAdjacent":
            case "allAdjacentFoes": case "any": case "foeSide": case "normal":
            case "randomNormal": case "scripted":
                if (user.team)
                {
                    return [
                        ...(targetType === "all" ? [user] : []),
                        this.getActive(otherSide(user.team.side))
                    ];
                }
                else throw new Error("Move user has no team");
            case "all":
                if (user.team)
                {
                    return [user, this.getActive(otherSide(user.team.side))];
                }
                else throw new Error("Move user has no team");
        }
    }

    // istanbul ignore next: trivial
    /**
     * Gets the active pokemon.
     * @param team Corresponding team. Can be a PlayerID or Side name.
     */
    protected getActive(team: PlayerID | Side): Pokemon
    {
        return this.getTeam(team).active;
    }

    // istanbul ignore next: trivial
    /**
     * Gets a team.
     * @param team Corresponding team id. Can be a PlayerID or Side name.
     */
    protected getTeam(team: PlayerID | Side): Team
    {
        if (isPlayerID(team)) team = this.getSide(team);
        return this.state.teams[team];
    }

    // istanbul ignore next: trivial
    /**
     * Gets a Side name.
     * @param id Corresponding PlayerID.
     */
    protected getSide(id: PlayerID): Side
    {
        if (!this.sides) throw new Error("Sides not initialized");
        return this.sides[id];
    }
}
