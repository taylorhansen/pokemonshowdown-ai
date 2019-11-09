import { isDeepStrictEqual } from "util";
import { dex, isFutureMove } from "../battle/dex/dex";
import { itemRemovalMoves, itemTransferMoves, nonSelfMoveCallers,
    selfMoveCallers, targetMoveCallers, Type } from "../battle/dex/dex-util";
import { BattleDriver, DriverMoveOptions, SingleMoveStatus, SingleTurnStatus }
    from "../battle/driver/BattleDriver";
import { otherSide, Side } from "../battle/state/Side";
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
    public get battling(): boolean { return this._battling; }
    private _battling = false;

    /** Tracks the currently known state of the battle. */
    protected readonly driver: BattleDriver;
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
     * @param driver State driver object.
     * @param logger Logger object.
     */
    constructor(username: string, driver: BattleDriver, logger: Logger)
    {
        this.username = username;
        this.driver = driver;
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
            this.driver.initOtherTeamSize(args.teamSizes[otherPlayerID(id)]);
        }
        else
        {
            this.sides = {[id]: "them", [otherPlayerID(id)]: "us"} as any;
            this.driver.initOtherTeamSize(args.teamSizes[id]);
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
        if (this.newTurn) this.driver.preTurn();

        // this field should only stay true if one of these events contains a
        //  |turn| message
        this.newTurn = false;

        for (let i = 0; i < events.length; ++i)
        {
            this.handleEvent(events[i], events, i);
        }

        // update per-turn statuses
        if (this.newTurn) this.driver.postTurn();
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
        const monRef = this.getSide(event.id.owner);
        const ability = toIdName(event.ability);

        let traced: Side | undefined;
        if (event.from === "ability: Trace" && event.of)
        {
            // trace ability: event.ability contains the Traced ability,
            //  event.of contains pokemon that was traced, event.id contains
            //  the pokemon using its Trace ability
            traced = this.getSide(event.of.owner);
        }

        this.driver.activateAbility(monRef, ability, traced);
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

        // NOTE: may be replaced with "|-start|<PokemonID>|Gastro Acid" later

        this.driver.gastroAcid(this.getSide(event.id.owner),
            toIdName(event.ability));
    }

    /** @virtual */
    protected handleStart(event: StartEvent, events: readonly AnyBattleEvent[],
        i: number): void
    {
        if (event.volatile === "typeadd")
        {
            // set added type
           this. driver.setThirdType(this.getSide(event.id.owner),
                event.otherArgs[0].toLowerCase() as Type);
        }
        else if (event.volatile === "typechange")
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
                else if (parsedTypes.length === 1)
                {
                    parsedTypes.push("???");
                }
                types = parsedTypes as [Type, Type];
            }
            else types = ["???", "???"];

            this.driver.changeType(this.getSide(event.id.owner), types);
        }
        // trivial, handle using factored-out method
        else this.handleTrivialStatus(event);
    }

    /** @virtual */
    protected handleActivate(event: ActivateEvent,
        events: readonly AnyBattleEvent[], i: number): void
    {
        const monRef = this.getSide(event.id.owner);
        switch (event.volatile)
        {
            case "move: Bide":
                this.driver.updateStatusEffect(monRef, "bide");
                break;
            case "move: Charge":
                this.driver.activateStatusEffect(monRef, "charge",
                    /*start*/true);
                break;
            case "confusion":
                this.driver.updateStatusEffect(monRef, "confusion");
                break;
            case "move: Mimic":
            {
                const move = toIdName(event.otherArgs[0]);

                // use the last (move) event to see whether this is actually
                //  Sketch or Mimic
                const lastEvent = events[i - 1];
                if (!lastEvent || lastEvent.type !== "move" ||
                    JSON.stringify(lastEvent.id) !==
                        JSON.stringify(event.id))
                {
                    throw new Error("Don't know how Mimic was caused");
                }

                if (lastEvent.moveName === "Mimic")
                {
                    this.driver.mimic(monRef, move);
                }
                else if (lastEvent.moveName === "Sketch")
                {
                    this.driver.sketch(monRef, move);
                }
                else
                {
                    throw new Error(
                        `Unknown Mimic-like move '${lastEvent.moveName}'`);
                }
                break;
            }
            case "trapped":
                this.driver.trap(monRef, otherSide(monRef));
                break;
            default:
                this.logger.debug(`Ignoring activate '${event.volatile}'`);
        }
    }

    /** @virtual */
    protected handleEnd(event: EndEvent, events: readonly AnyBattleEvent[],
        i: number): void
    {
        this.handleTrivialStatus(event);
    }

    /** @virtual */
    protected handleBoost(event: BoostEvent, events: readonly AnyBattleEvent[],
        i: number): void
    {
        this.driver.boost(this.getSide(event.id.owner), event.stat,
            event.amount);
    }

    /** @virtual */
    protected handleCant(event: CantEvent, events: readonly AnyBattleEvent[],
        i: number): void
    {
        const monRef = this.getSide(event.id.owner);

        if (event.reason === "recharge")
        {
            // the pokemon successfully completed its recharge turn
            this.driver.inactive(monRef, "recharge");
        }
        else if (event.reason === "slp") this.driver.inactive(monRef, "slp");
        else if (event.reason.startsWith("ability: "))
        {
            // can't move due to an ability
            const ability = toIdName(
                event.reason.substr("ability: ".length));
            this.driver.activateAbility(monRef, ability);

            if (ability === "truant") this.driver.inactive(monRef, "truant");
        }

        if (event.moveName)
        {
            // prevented from using a move, which might not have
            //  been revealed before
            this.driver.revealMove(monRef, toIdName(event.moveName));
        }

        // now consumed the pokemon's action for this turn
        this.driver.consumeAction(monRef);
    }

    /** @virtual */
    protected handleClearAllBoost(event: ClearAllBoostEvent,
        events: readonly AnyBattleEvent[], i: number): void
    {
        this.driver.clearAllBoosts();
    }

    /** @virtual */
    protected handleClearNegativeBoost(event: ClearNegativeBoostEvent,
        events: readonly AnyBattleEvent[], i: number): void
    {
        this.driver.clearNegativeBoosts(this.getSide(event.id.owner));
    }

    /** @virtual */
    protected handleClearPositiveBoost(event: ClearPositiveBoostEvent,
        events: readonly AnyBattleEvent[], i: number): void
    {
        this.driver.clearPositiveBoosts(this.getSide(event.id.owner));
    }

    /** @virtual */
    protected handleCopyBoost(event: CopyBoostEvent,
        events: readonly AnyBattleEvent[], i: number): void
    {
        this.driver.copyBoosts(/*from*/this.getSide(event.target.owner),
            /*to*/this.getSide(event.source.owner));
    }

    /** @virtual */
    protected handleCureStatus(event: CureStatusEvent,
        events: readonly AnyBattleEvent[], i: number): void
    {
        this.driver.cureStatus(this.getSide(event.id.owner), event.majorStatus);
    }

    /** @virtual */
    protected handleCureTeam(event: CureTeamEvent,
        events: readonly AnyBattleEvent[], i: number): void
    {
        this.driver.cureTeam(this.getSide(event.id.owner));
    }

    /**
     * Handles a damage/heal event.
     * @virtual
     */
    protected handleDamage(event: DamageEvent | HealEvent | SetHPEvent,
        events: readonly AnyBattleEvent[], i: number): void
    {
        this.driver.takeDamage(this.getSide(event.id.owner),
            [event.status.hp, event.status.hpMax], /*tox*/event.from === "psn");
    }

    /** @virtual */
    protected handleDetailsChange(event: DetailsChangeEvent,
        events: readonly AnyBattleEvent[], i: number): void
    {
        this.driver.formChange(this.getSide(event.id.owner), event,
            /*perm*/true);
    }

    /**
     * Handles a drag/switch event.
     * @virtual
     */
    protected handleSwitch(event: DragEvent | SwitchEvent,
        events: readonly AnyBattleEvent[], i: number): void
    {
        this.driver.switchIn(this.getSide(event.id.owner), event);
    }

    /** @virtual */
    protected handleFaint(event: FaintEvent, events: readonly AnyBattleEvent[],
        i: number): void
    {
        this.driver.faint(this.getSide(event.id.owner));
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
                this.driver.activateFieldCondition("gravity",
                    /*start*/event.type === "-fieldstart");
                break;
            case "move: Trick Room":
                this.driver.activateFieldCondition("trickRoom",
                    /*start*/event.type === "-fieldstart");
                break;
        }
    }

    /** @virtual */
    protected handleFormeChange(event: FormeChangeEvent,
        events: readonly AnyBattleEvent[], i: number): void
    {
        this.driver.formChange(this.getSide(event.id.owner), event,
            /*perm*/false);
    }

    /** @virtual */
    protected handleInvertBoost(event: InvertBoostEvent,
        events: readonly AnyBattleEvent[], i: number): void
    {
        this.driver.invertBoosts(this.getSide(event.id.owner));
    }

    /** @virtual */
    protected handleItem(event: ItemEvent, events: readonly AnyBattleEvent[],
        i: number): void
    {
        const monRef = this.getSide(event.id.owner);

        // item can be gained via a transfer move or recycle
        let gained: boolean | "recycle";
        if (event.from && event.from.startsWith("move: "))
        {
            const move = event.from.substr("move: ".length);
            if (move === "Recycle") gained = "recycle";
            else gained = itemTransferMoves.includes(move);
        }
        else gained = false;

        this.driver.revealItem(monRef, toIdName(event.item), gained);
    }

    /** @virtual */
    protected handleEndItem(event: EndItemEvent,
        events: readonly AnyBattleEvent[], i: number): void
    {
        const monRef = this.getSide(event.id.owner);

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
        // in most other cases we can assume that the item can be brought
        //  back using Recycle
        else consumed = toIdName(event.item);

        this.driver.removeItem(monRef, consumed);
    }

    /** @virtual */
    protected handleMove(event: MoveEvent, events: readonly AnyBattleEvent[],
        i: number): void
    {
        const monRef = this.getSide(event.id.owner);
        const moveId = toIdName(event.moveName);
        const targets = this.getTargets(moveId, monRef);

        const options: DriverMoveOptions = {moveId, targets};

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
                this.driver.revealMove(target, copiedMoveId);
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
        this.driver.useMove(monRef, options);
    }

    /** @virtual */
    protected handleMustRecharge(event: MustRechargeEvent,
        events: readonly AnyBattleEvent[], i: number): void
    {
        this.driver.mustRecharge(this.getSide(event.id.owner));
    }

    /** @virtual */
    protected handlePrepare(event: PrepareEvent,
        events: readonly AnyBattleEvent[], i: number): void
    {
        // moveName should be one of the two-turn moves being prepared
        this.driver.prepareMove(this.getSide(event.id.owner),
            toIdName(event.moveName) as any);
    }

    /** @virtual */
    protected handleSetBoost(event: SetBoostEvent,
        events: readonly AnyBattleEvent[], i: number): void
    {
        this.driver.setBoost(this.getSide(event.id.owner), event.stat,
            event.amount);
    }

    /**
     * Handles a side end/start event.
     * @virtual
     */
    protected handleSideCondition(event: SideEndEvent | SideStartEvent,
        events: readonly AnyBattleEvent[], i: number): void
    {
        const teamRef = this.getSide(event.id);

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

                    const monRef = this.getSide(lastEvent.id.owner);

                    this.driver.activateSideCondition(teamRef,
                        condition === "Reflect" ? "reflect" : "lightScreen",
                        /*start*/true, monRef);
                }
                else
                {
                    this.driver.activateSideCondition(teamRef,
                        condition === "Reflect" ? "reflect" : "lightScreen",
                        /*start*/false);
                }
                break;
            case "Spikes":
                this.driver.activateSideCondition(teamRef, "spikes",
                    /*start*/event.type === "-sidestart");
                break;
            case "Stealth Rock":
                this.driver.activateSideCondition(teamRef, "stealthRock",
                    /*start*/event.type === "-sidestart");
                break;
            case "Tailwind":
                this.driver.activateSideCondition(teamRef, "tailwind",
                    /*start*/event.type === "-sidestart");
                break;
            case "Toxic Spikes":
                this.driver.activateSideCondition(teamRef, "toxicSpikes",
                    /*start*/event.type === "-sidestart");
                break;
        }
    }

    /** @virtual */
    protected handleSingleMove(event: SingleMoveEvent,
        events: readonly AnyBattleEvent[], i: number): void
    {
        let status: SingleMoveStatus | undefined;
        if (event.move === "Destiny Bond") status = "destinyBond";
        else if (event.move === "Grudge") status = "grudge";

        if (status)
        {
            this.driver.setSingleMoveStatus(this.getSide(event.id.owner),
                status);
        }
    }

    /** @virtual */
    protected handleSingleTurn(event: SingleTurnEvent,
        events: readonly AnyBattleEvent[], i: number): void
    {
        let status: SingleTurnStatus | undefined;
        if (PSEventHandler.isStallSingleTurn(event.status))
        {
            status = "stall";
        }
        else if (event.status === "move: Roost") status = "roost";
        else if (event.status === "move: Magic Coat") status = "magicCoat";

        if (status)
        {
            this.driver.setSingleTurnStatus(this.getSide(event.id.owner),
                status);
        }
    }

    /** @virtual */
    protected handleStatus(event: StatusEvent,
        events: readonly AnyBattleEvent[], i: number): void
    {
        this.driver.afflictStatus(this.getSide(event.id.owner),
            event.majorStatus);
    }

    /** @virtual */
    protected handleSwapBoost(event: SwapBoostEvent,
        events: readonly AnyBattleEvent[], i: number): void
    {
        this.driver.swapBoosts(this.getSide(event.source.owner),
            this.getSide(event.target.owner), event.stats);
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
        const sourceRef = this.getSide(event.source.owner);
        const targetRef = this.getSide(event.target.owner);

        this.driver.transform(sourceRef, targetRef);

        // use lastRequest to infer more details
        if (!this.lastRequest || !this.lastRequest.active) return;
        // transform reverts after fainting but not after being forced to
        //  choose a switch-in without fainting
        if (this.lastRequest.forceSwitch &&
            this.lastRequest.side.pokemon[0].hp === 0) return;
        // if species don't match, must've been dragged out before we could
        //  infer any other features
        // TODO: workaround not having access to state object
        /*if (this.lastRequest.side.pokemon[0].details.species !==
            source.species) return;*/

        this.driver.transformPost(sourceRef, this.lastRequest.active[0].moves,
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
        this.driver.unboost(this.getSide(event.id.owner),
            event.stat, event.amount);
    }

    /** @virtual */
    protected handleUpkeep(event: UpkeepEvent,
        events: readonly AnyBattleEvent[], i: number): void
    {
        // selfSwitch is the result of a move, which only occurs in the middle
        //  of all the turn's main events (args.events)
        // if the simulator ignored the fact that a selfSwitch move was used,
        //  then it would emit an upkeep event
        this.driver.clearSelfSwitch();
    }

    /** @virtual */
    protected handleWeather(event: WeatherEvent,
        events: readonly AnyBattleEvent[], i: number): void
    {
        if (event.weatherType === "none") this.driver.resetWeather();
        else if (event.upkeep) this.driver.tickWeather(event.weatherType);
        // find out what caused the weather to change
        else if (event.from && event.from.startsWith("ability: ") &&
            event.of)
        {
            this.driver.setWeather(this.getSide(event.of.owner),
                event.weatherType, "ability");
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
                this.driver.setWeather(this.getSide(lastEvent.id.owner),
                    event.weatherType, "move");
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
        this.logger.debug(`State:\n${this.driver.getStateString()}`);
    }

    /** Processes a `request` message. */
    public handleRequest(args: Omit<RequestMessage, "type">): void
    {
        this.lastRequest = args;

        // a request message is given at the start of the battle, before any
        //  battleinit stuff, which is all we need to initialize our side of the
        //  battle state
        if (this._battling) return;

        // first time: initialize client team data
        this.driver.init(args.side.pokemon,
            // fix move encodings that can help infer other features
            function moveCb(mon, moveId)
            {
                if (moveId.startsWith("hiddenpower") &&
                    moveId.length > "hiddenpower".length)
                {
                    // set hidden power type
                    // format: hiddenpower<type><base power if gen2-5>
                    // TODO: also infer ivs based on type/power
                    mon.hpType.narrow(
                        moveId.substr("hiddenpower".length).replace(/\d+/, ""));
                    return "hiddenpower";
                }
                if (moveId.startsWith("return") &&
                    moveId.length > "return".length)
                {
                    // calculate happiness value from base power
                    mon.happiness = 2.5 *
                        parseInt(moveId.substr("return".length), 10);
                    return "return";
                }
                if (moveId.startsWith("frustration") &&
                    moveId.length > "frustration".length)
                {
                    // calculate happiness value from base power
                    mon.happiness = 255 - 2.5 *
                            parseInt(moveId.substr("frustration".length), 10);
                    return "frustration";
                }

                return moveId;
            });
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
        const monRef = this.getSide(id.owner);

        // TODO: should all use cases be handled in separate event handlers?
        // if so, this method might not need to exist
        if (f.startsWith("ability: "))
        {
            this.driver.activateAbility(monRef,
                toIdName(f.substr("ability: ".length)));
        }
        else if (f.startsWith("item: "))
        {
            this.driver.revealItem(monRef, toIdName(f.substr("item: ".length)));
        }
    }

    /** Handles an end/start event. */
    private handleTrivialStatus(event: EndEvent | StartEvent): void
    {
        const monRef = this.getSide(event.id.owner);
        const start = event.type === "-start";

        let ev = event.volatile;
        if (ev.startsWith("move: ")) ev = ev.substr("move: ".length);

        switch (ev)
        {
            case "Aqua Ring":
                this.driver.activateStatusEffect(monRef, "aquaRing", start);
                break;
            case "Attract":
                this.driver.activateStatusEffect(monRef, "attract", start);
                break;
            case "Bide":
                this.driver.activateStatusEffect(monRef, "bide", start);
                break;
            case "confusion":
                // start confusion status
                this.driver.activateStatusEffect(monRef, "confusion", start);
                // stopped using multi-turn locked move due to fatigue
                if (event.fatigue) this.driver.fatigue(monRef);
                break;
            case "Disable":
                if (event.type === "-start")
                {
                    // disable the given move
                    this.driver.disableMove(monRef,
                        toIdName(event.otherArgs[0]));
                }
                // re-enable the move
                else this.driver.enableMoves(monRef);
                break;
            case "Encore":
                this.driver.activateStatusEffect(monRef, "encore", start);
                break;
            case "Focus Energy":
                this.driver.activateStatusEffect(monRef, "focusEnergy", start);
                break;
            case "Foresight":
                this.driver.activateStatusEffect(monRef, "foresight", start);
                break;
            case "Ingrain":
                this.driver.activateStatusEffect(monRef, "ingrain", start);
                break;
            case "Leech Seed":
                this.driver.activateStatusEffect(monRef, "leechSeed", start);
                break;
            case "Magnet Rise":
                this.driver.activateStatusEffect(monRef, "magnetRise", start);
                break;
            case "Miracle Eye":
                this.driver.activateStatusEffect(monRef, "miracleEye", start);
                break;
            case "Embargo":
                this.driver.activateStatusEffect(monRef, "embargo", start);
                break;
            case "Substitute":
                this.driver.activateStatusEffect(monRef, "substitute", start);
                break;
            case "Slow Start":
                this.driver.activateStatusEffect(monRef, "slowStart", start);
                break;
            case "Taunt":
                this.driver.activateStatusEffect(monRef, "taunt", start);
                break;
            case "Torment":
                this.driver.activateStatusEffect(monRef, "torment", start);
                break;
            case "Uproar":
                if (event.type === "-start" &&
                    event.otherArgs[0] === "[upkeep]")
                {
                    this.driver.updateStatusEffect(monRef, "uproar");
                }
                else this.driver.activateStatusEffect(monRef, "uproar", start);
                break;
            default:
            {
                const moveId = toIdName(ev);
                // istanbul ignore else: not useful to test
                if (isFutureMove(moveId))
                {
                    this.driver.activateFutureMove(monRef, moveId,
                        /*start*/true);
                }
                else
                {
                    this.logger.debug(
                        `Ignoring trivial status '${event.volatile}'`);
                }
            }
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

    // TODO: move this to BattleDriver (static?) or dex?
    /**
     * Gets the active Pokemon targets of a move.
     * @param moveId Move that will be used.
     * @param user Reference to the Pokemon that's using the move.
     * @returns A list of Pokemon references indicating the move's targets.
     */
    protected getTargets(moveId: string, user: Side): Side[]
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
            case "all":
                return [user, otherSide(user)];
            case "adjacentFoe": case "allAdjacent": case "allAdjacentFoes":
            case "any": case "foeSide": case "normal": case "randomNormal":
            case "scripted":
                return [otherSide(user)];
        }
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
