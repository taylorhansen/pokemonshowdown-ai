import { isDeepStrictEqual } from "util";
import { dex, isFutureMove } from "../battle/dex/dex";
import { itemRemovalMoves, itemTransferMoves, nonSelfMoveCallers,
    selfMoveCallers, targetMoveCallers, Type } from "../battle/dex/dex-util";
import { AnyDriverEvent, DriverInitPokemon, InitOtherTeamSize, SingleMoveStatus,
    SingleTurnStatus, StatusEffectType } from "../battle/driver/DriverEvent";
import { otherSide, Side } from "../battle/state/Side";
import { Logger } from "../Logger";
import { isPlayerID, otherPlayerID, PlayerID, PokemonID, toIdName } from
    "./helpers";
import { AbilityEvent, ActivateEvent, AnyBattleEvent, BoostEvent, CantEvent,
    ClearAllBoostEvent, ClearNegativeBoostEvent, ClearPositiveBoostEvent,
    CopyBoostEvent, CureStatusEvent, CureTeamEvent, DamageEvent,
    DetailsChangeEvent, DragEvent, EndAbilityEvent, EndEvent, EndItemEvent,
    FaintEvent, FieldEndEvent, FieldStartEvent, FormeChangeEvent, HealEvent,
    InvertBoostEvent, ItemEvent, MoveEvent, MustRechargeEvent, SetBoostEvent,
    SetHPEvent, SideEndEvent, SideStartEvent, SingleMoveEvent, SingleTurnEvent,
    StartEvent, StatusEvent, SwapBoostEvent, SwitchEvent, TieEvent,
    TransformEvent, TurnEvent, UnboostEvent, UpkeepEvent, WeatherEvent,
    WinEvent } from "./parser/BattleEvent";
import { BattleInitMessage, RequestMessage } from "./parser/Message";

/** Translates BattleEvents from the PS server into DriverEvents. */
export class PSEventHandler
{
    /** Whether the battle is still going on. */
    public get battling(): boolean { return this._battling; }
    private _battling = false;

    /** Client's username. */
    protected readonly username: string;
    /** Logger object. */
    protected readonly logger: Logger;
    /** Last |request| message that was processed. */
    protected lastRequest?: RequestMessage;
    /**
     * Determines which PlayerID (p1 or p2) corresponds to which Side (us or
     * them).
     */
    private sides?: {readonly [ID in PlayerID]: Side};
    /** Whether a TurnEvent was encountered in the last handleEvents call. */
    private newTurn = false;

    /**
     * Creates a PSEventHandler.
     * @param username Username of the client.
     * @param logger Logger object.
     */
    constructor(username: string, logger: Logger)
    {
        this.username = username;
        this.logger = logger;
    }

    /** Processes a `request` message. */
    public handleRequest(args: RequestMessage): AnyDriverEvent[]
    {
        this.lastRequest = args;

        // a request message is given at the start of the battle, before any
        //  0ther, which is all we need to initialize our side of the battle
        //  state before handling battleinit messages
        if (this._battling) return [];

        // first time: initialize client team data
        // copy pokemon array so we can modify it
        const team: DriverInitPokemon[] = [...args.side.pokemon];

        // preprocess move names, which are encoded with additional features
        for (let i = 0; i < team.length; ++i)
        {
            // copy pokemon obj and moves so we can modify them
            const mon = {...team[i]};
            team[i] = mon;

            const moves = [...team[i].moves];
            mon.moves = moves;

            for (let j = 0; j < moves.length; ++j)
            {
                if (moves[j].startsWith("hiddenpower") &&
                    moves[j].length > "hiddenpower".length)
                {
                    // set hidden power type
                    // format: hiddenpower<type><base power if gen2-5>
                    mon.hpType = moves[j].substr("hiddenpower".length)
                        .replace(/\d+/, "") as Type;
                    moves[j] = "hiddenpower";
                }
                else if (moves[j].startsWith("return") &&
                    moves[j].length > "return".length)
                {
                    // calculate happiness value from base power
                    mon.happiness = 2.5 *
                        parseInt(moves[j].substr("return".length), 10);
                    moves[j] = "return";
                }
                else if (moves[j].startsWith("frustration") &&
                    moves[j].length > "frustration".length)
                {
                    // calculate happiness value from base power
                    mon.happiness = 255 - 2.5 *
                            parseInt(moves[j].substr("frustration".length), 10);
                    moves[j] = "frustration";
                }
            }
        }

        return [{type: "initTeam", team}];
    }

    /** Initializes the battle conditions. */
    public initBattle(args: BattleInitMessage): AnyDriverEvent[]
    {
        this._battling = true;

        let sizeEvent: InitOtherTeamSize;

        // map player id to which side they represent
        const id = args.id;
        if (args.username === this.username)
        {
            this.sides = {[id]: "us", [otherPlayerID(id)]: "them"} as any;
            // we already know our team's size from the initial request
            //  message but not the other team
            sizeEvent =
            {
                type: "initOtherTeamSize",
                size: args.teamSizes[otherPlayerID(id)]
            };
        }
        else
        {
            this.sides = {[id]: "them", [otherPlayerID(id)]: "us"} as any;
            sizeEvent = {type: "initOtherTeamSize", size: args.teamSizes[id]};
        }

        const result = this.handleEvents(args.events);
        // put the team size initializer at the beginning
        result.unshift(sizeEvent);
        return result;
    }

    /**
     * Translates PS server BattleEvents into DriverEvents to update the battle
     * state.
     */
    public handleEvents(events: readonly AnyBattleEvent[]): AnyDriverEvent[]
    {
        const result: AnyDriverEvent[] = [];

        // starting a new turn
        if (this.newTurn) result.push({type: "preTurn"});

        // this field should only stay true if one of these events contains a
        //  |turn| message
        this.newTurn = false;

        for (let i = 0; i < events.length; ++i)
        {
            // TODO: suffixes should be handled directly after each event
            result.push(...this.handleEvent(events[i], events, i));
            result.push(...this.handleSuffixes(events[i]));
        }

        // ending the current turn
        if (this.newTurn) result.push({type: "postTurn"});

        return result;
    }

    /**
     * Translates a PS server BattleEvent into DriverEvents to update the battle
     * state.
     */
    private handleEvent(event: AnyBattleEvent,
        events: readonly AnyBattleEvent[], i: number): AnyDriverEvent[]
    {
        switch (event.type)
        {
            case "-ability": return this.handleAbility(event, events, i);
            case "-endability": return this.handleEndAbility(event, events, i);
            case "-start": return this.handleStart(event, events, i);
            case "-activate": return this.handleActivate(event, events, i);
            case "-end": return this.handleEnd(event, events, i);
            case "-boost": return this.handleBoost(event, events, i);
            case "cant": return this.handleCant(event, events, i);
            case "-clearallboost":
                return this.handleClearAllBoost(event, events, i);
            case "-clearnegativeboost":
                return this.handleClearNegativeBoost(event, events, i);
            case "-clearpositiveboost":
                return this.handleClearPositiveBoost(event, events, i);
            case "-copyboost": return this.handleCopyBoost(event, events, i);
            case "-curestatus": return this.handleCureStatus(event, events, i);
            case "-cureteam": return this.handleCureTeam(event, events, i);
            case "-damage": case "-heal": case "-sethp":
                return this.handleDamage(event, events, i);
            case "detailschange":
                return this.handleDetailsChange(event, events, i);
            case "drag": case "switch":
                return this.handleSwitch(event, events, i);
            case "faint": return this.handleFaint(event, events, i);
            case "-fieldend": case "-fieldstart":
                return this.handleFieldCondition(event, events, i);
            case "-formechange":
                return this.handleFormeChange(event, events, i);
            case "-invertboost":
                return this.handleInvertBoost(event, events, i);
            case "-item": return this.handleItem(event, events, i);
            case "-enditem": return this.handleEndItem(event, events, i);
            case "move": return this.handleMove(event, events, i);
            case "-mustrecharge":
                return this.handleMustRecharge(event, events, i);
            case "-setboost": return this.handleSetBoost(event, events, i);
            case "-sideend": case "-sidestart":
                return this.handleSideCondition(event, events, i);
            case "-singlemove": return this.handleSingleMove(event, events, i);
            case "-singleturn": return this.handleSingleTurn(event, events, i);
            case "-status": return this.handleStatus(event, events, i);
            case "-swapboost": return this.handleSwapBoost(event, events, i);
            case "tie": case "win":
                return this.handleGameOver(event, events, i);
            case "-transform": return this.handleTransform(event, events, i);
            case "turn": return this.handleTurn(event, events, i);
            case "-unboost": return this.handleUnboost(event, events, i);
            case "upkeep": return this.handleUpkeep(event, events, i);
            case "-weather": return this.handleWeather(event, events, i);
            default: return [];
        }
    }

    /** @virtual */
    protected handleAbility(event: AbilityEvent,
        events: readonly AnyBattleEvent[], i: number): AnyDriverEvent[]
    {
        const monRef = this.getSide(event.id.owner);
        const ability = toIdName(event.ability);

        if (event.from === "ability: Trace" && event.of)
        {
            // trace ability: event.ability contains the Traced ability,
            //  event.of contains pokemon that was traced, event.id contains
            //  the pokemon using its Trace ability
            const traced = this.getSide(event.of.owner);
            return [{type: "activateAbility", monRef, ability, traced}];
        }

        return [{type: "activateAbility", monRef, ability}];
    }

    /** @virtual */
    protected handleEndAbility(event: EndAbilityEvent,
        events: readonly AnyBattleEvent[], i: number): AnyDriverEvent[]
    {
        // transform event was already taken care of, no need to handle
        //  this message
        // TODO: could this still be used to infer base ability?
        // typically this is never revealed this way in actual cartridge
        //  play, so best to leave it for now to preserve fairness
        if (event.from === "move: Transform") return [];

        // NOTE: may be replaced with "|-start|<PokemonID>|Gastro Acid" later

        const monRef = this.getSide(event.id.owner);
        const ability = toIdName(event.ability);
        return [{type: "gastroAcid", monRef, ability}];
    }

    /** @virtual */
    protected handleStart(event: StartEvent, events: readonly AnyBattleEvent[],
        i: number): AnyDriverEvent[]
    {
        if (event.volatile === "typeadd")
        {
            // set added type
            const monRef = this.getSide(event.id.owner);
            const thirdType = event.otherArgs[0].toLowerCase() as Type;
            return [{type: "setThirdType", monRef, thirdType}];
        }
        if (event.volatile === "typechange")
        {
            // set types
            // format: Type1/Type2
            let newTypes: [Type, Type];

            if (event.otherArgs[0])
            {
                const parsedTypes = event.otherArgs[0].split("/")
                    .map(type => type.toLowerCase()) as Type[];

                // make sure length is 2
                if (parsedTypes.length > 2)
                {
                    // TODO: throw
                    this.logger.error("Too many types given " +
                        `(${parsedTypes.join(", ")})`);
                    parsedTypes.splice(2);
                }
                else if (parsedTypes.length === 1)
                {
                    parsedTypes.push("???");
                }
                newTypes = parsedTypes as [Type, Type];
            }
            else newTypes = ["???", "???"];

            const monRef = this.getSide(event.id.owner);
            return [{type: "changeType", monRef, newTypes}];
        }
        if (event.volatile.startsWith("perish") ||
            event.volatile.startsWith("stockpile"))
        {
            // update countable status effects
            const monRef = this.getSide(event.id.owner);
            const status =
                event.volatile.startsWith("perish") ? "perish" : "stockpile";
            const turns = parseInt(event.volatile.substr(status.length), 10);
            return [{type: "countStatusEffect", monRef, status, turns}];
        }
        // trivial, handle using factored-out method
        return this.handleTrivialStatus(event);
    }

    /** @virtual */
    protected handleActivate(event: ActivateEvent,
        events: readonly AnyBattleEvent[], i: number): AnyDriverEvent[]
    {
        const monRef = this.getSide(event.id.owner);
        switch (event.volatile)
        {
            case "move: Bide":
                return [{type: "updateStatusEffect", monRef, status: "bide"}];
            case "move: Charge":
                return [
                    {
                        type: "activateStatusEffect", monRef, status: "charge",
                        start: true
                    }
                ];
            case "confusion":
                return [
                    {
                        type: "updateStatusEffect", monRef,
                        status: event.volatile
                    }
                ];
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
                    return [{type: "mimic", monRef, move}];
                }
                if (lastEvent.moveName === "Sketch")
                {
                    return [{type: "sketch", monRef, move}];
                }
                throw new Error(
                    `Unknown Mimic-like move '${lastEvent.moveName}'`);
            }
            case "trapped":
                return [{type: "trap", target: monRef, by: otherSide(monRef)}];
            default:
                this.logger.debug(`Ignoring activate '${event.volatile}'`);
                return [];
        }
    }

    /** @virtual */
    protected handleEnd(event: EndEvent, events: readonly AnyBattleEvent[],
        i: number): AnyDriverEvent[]
    {
        if (event.volatile === "Stockpile")
        {
            // end stockpile stacks
            return [{
                type: "countStatusEffect", monRef: this.getSide(event.id.owner),
                status: "stockpile", turns: 0
            }];
        }
        return this.handleTrivialStatus(event);
    }

    /** @virtual */
    protected handleBoost(event: BoostEvent, events: readonly AnyBattleEvent[],
        i: number): AnyDriverEvent[]
    {
        return [
            {
                type: "boost", monRef: this.getSide(event.id.owner),
                stat: event.stat, amount: event.amount
            }
        ];
    }

    /** @virtual */
    protected handleCant(event: CantEvent, events: readonly AnyBattleEvent[],
        i: number): AnyDriverEvent[]
    {
        const result: AnyDriverEvent[] = [];
        const monRef = this.getSide(event.id.owner);

        if (event.reason === "recharge" || event.reason === "slp")
        {
            // the pokemon successfully completed its recharge or sleep turn
            result.push({type: "inactive", monRef, reason: event.reason});
        }
        else if (event.reason.startsWith("ability: "))
        {
            // can't move due to an ability
            const ability = toIdName(
                event.reason.substr("ability: ".length));

            result.push(
                {type: "activateAbility", monRef, ability},
                // if truant, ability must be inferred before the event
                {
                    type: "inactive", monRef,
                    // add in truant reason if applicable
                    ...(ability === "truant" && {reason: "truant"})
                });
        }
        else result.push({type: "inactive", monRef});

        if (event.moveName)
        {
            // prevented from using a move, which might not have
            //  been revealed before
            const move = toIdName(event.moveName);
            result.push({type: "revealMove", monRef, move});
        }

        return result;
    }

    /** @virtual */
    protected handleClearAllBoost(event: ClearAllBoostEvent,
        events: readonly AnyBattleEvent[], i: number): AnyDriverEvent[]
    {
        return [{type: "clearAllBoosts"}];
    }

    /** @virtual */
    protected handleClearNegativeBoost(event: ClearNegativeBoostEvent,
        events: readonly AnyBattleEvent[], i: number): AnyDriverEvent[]
    {
        const monRef = this.getSide(event.id.owner);
        return [{type: "clearNegativeBoosts", monRef}];
    }

    /** @virtual */
    protected handleClearPositiveBoost(event: ClearPositiveBoostEvent,
        events: readonly AnyBattleEvent[], i: number): AnyDriverEvent[]
    {
        const monRef = this.getSide(event.id.owner);
        return [{type: "clearPositiveBoosts", monRef}];
    }

    /** @virtual */
    protected handleCopyBoost(event: CopyBoostEvent,
        events: readonly AnyBattleEvent[], i: number): AnyDriverEvent[]
    {
        const from = this.getSide(event.target.owner);
        const to = this.getSide(event.source.owner);
        return [{type: "copyBoosts", from, to}];
    }

    /** @virtual */
    protected handleCureStatus(event: CureStatusEvent,
        events: readonly AnyBattleEvent[], i: number): AnyDriverEvent[]
    {
        const monRef = this.getSide(event.id.owner);
        return [{type: "cureStatus", monRef, status: event.majorStatus}];
    }

    /** @virtual */
    protected handleCureTeam(event: CureTeamEvent,
        events: readonly AnyBattleEvent[], i: number): AnyDriverEvent[]
    {
        return [{type: "cureTeam", teamRef: this.getSide(event.id.owner)}];
    }

    /**
     * Handles a damage/heal event.
     * @virtual
     */
    protected handleDamage(event: DamageEvent | HealEvent | SetHPEvent,
        events: readonly AnyBattleEvent[], i: number): AnyDriverEvent[]
    {
        const monRef = this.getSide(event.id.owner);
        const newHP = [event.status.hp, event.status.hpMax] as const;
        return [{type: "takeDamage", monRef, newHP, tox: event.from === "psn"}];
    }

    /** @virtual */
    protected handleDetailsChange(event: DetailsChangeEvent,
        events: readonly AnyBattleEvent[], i: number): AnyDriverEvent[]
    {
        return [
            (({id, species, level, gender, hp, hpMax}) =>
            ({
                type: "formChange", monRef: this.getSide(id.owner), species,
                level, gender, hp, hpMax, perm: true
            } as const))(event)
        ];
    }

    /**
     * Handles a drag/switch event.
     * @virtual
     */
    protected handleSwitch(event: DragEvent | SwitchEvent,
        events: readonly AnyBattleEvent[], i: number): AnyDriverEvent[]
    {
        return [
            (({id, species, level, gender, hp, hpMax}) =>
            ({
                type: "switchIn", monRef: this.getSide(id.owner), species,
                level, gender, hp, hpMax
            } as const))(event)
        ];
    }

    /** @virtual */
    protected handleFaint(event: FaintEvent, events: readonly AnyBattleEvent[],
        i: number): AnyDriverEvent[]
    {
        return [{type: "faint", monRef: this.getSide(event.id.owner)}];
    }

    /**
     * Handles a field end/start event.
     * @virtual
     */
    protected handleFieldCondition(event: FieldEndEvent | FieldStartEvent,
        events: readonly AnyBattleEvent[], i: number): AnyDriverEvent[]
    {
        switch (event.effect)
        {
            case "move: Gravity":
                return [
                    {
                        type: "activateFieldCondition", condition: "gravity",
                        start: event.type === "-fieldstart"
                    }
                ];
            case "move: Trick Room":
                return [
                    {
                        type: "activateFieldCondition", condition: "trickRoom",
                        start: event.type === "-fieldstart"
                    }
                ];
            default: return [];
        }
    }

    /** @virtual */
    protected handleFormeChange(event: FormeChangeEvent,
        events: readonly AnyBattleEvent[], i: number): AnyDriverEvent[]
    {
        return [
            (({id, species, level, gender, hp, hpMax}) =>
            ({
                type: "formChange", monRef: this.getSide(id.owner), species,
                level, gender, hp, hpMax, perm: false
            } as const))(event)
        ];
    }

    /** @virtual */
    protected handleInvertBoost(event: InvertBoostEvent,
        events: readonly AnyBattleEvent[], i: number): AnyDriverEvent[]
    {
        return [{type: "invertBoosts", monRef: this.getSide(event.id.owner)}];
    }

    /** @virtual */
    protected handleItem(event: ItemEvent, events: readonly AnyBattleEvent[],
        i: number): AnyDriverEvent[]
    {
        const monRef = this.getSide(event.id.owner);
        const item = toIdName(event.item);

        // item can be gained via a transfer move or recycle
        let gained: boolean | "recycle";
        if (event.from && event.from.startsWith("move: "))
        {
            const move = event.from.substr("move: ".length);
            if (move === "Recycle") gained = "recycle";
            else gained = itemTransferMoves.includes(move);
        }
        else gained = false;

        return [{type: "revealItem", monRef, item, gained}];
    }

    /** @virtual */
    protected handleEndItem(event: EndItemEvent,
        events: readonly AnyBattleEvent[], i: number): AnyDriverEvent[]
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

        return [{type: "removeItem", monRef, consumed}];
    }

    /** @virtual */
    protected handleMove(event: MoveEvent, events: readonly AnyBattleEvent[],
        i: number): AnyDriverEvent[]
    {
        const result: AnyDriverEvent[] = [];

        const monRef = this.getSide(event.id.owner);
        const moveId = toIdName(event.moveName);
        const targets = this.getTargets(moveId, monRef);

        let unsuccessful: "failed" | "evaded"| undefined;
        let reveal: boolean | "nopp" | undefined;
        let prepare: boolean | undefined;

        if (event.miss) unsuccessful = "evaded";

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
                unsuccessful = "evaded";
            }
            // move failed on its own
            else if (e.type === "-fail") unsuccessful = "failed";
            else if (e.type === "-prepare") prepare = true;
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
                result.push(
                    {type: "revealMove", monRef: target, move: copiedMoveId});
            }
        }

        // handle event suffixes
        if (event.from)
        {
            // don't add to moveset if this is called using another move
            if (nonSelfMoveCallers.includes(event.from))
            {
                reveal = false;
            }
            // don't consume pp if locked into using the move
            else if (event.from === "lockedmove" ||
                // also reveal but don't consume pp for moves called by
                //  effects that call one of the user's moves (eg sleeptalk)
                selfMoveCallers.includes(event.from))
            {
                reveal = "nopp";
            }
        }

        // indicate that the pokemon has used this move
        result.push(
        {
            type: "useMove", monRef, moveId, targets,
            // only add the keys if not undefined
            ...(unsuccessful !== undefined && {unsuccessful}),
            ...(reveal !== undefined && {reveal}),
            ...(prepare !== undefined && {prepare})
        });
        return result;
    }

    /** @virtual */
    protected handleMustRecharge(event: MustRechargeEvent,
        events: readonly AnyBattleEvent[], i: number): AnyDriverEvent[]
    {
        return [{type: "mustRecharge", monRef: this.getSide(event.id.owner)}];
    }

    /** @virtual */
    protected handleSetBoost(event: SetBoostEvent,
        events: readonly AnyBattleEvent[], i: number): AnyDriverEvent[]
    {
        return [
            (({id, stat, amount}) =>
            ({
                type: "setBoost", monRef: this.getSide(id.owner), stat, amount
            } as const))(event)
        ];
    }

    /**
     * Handles a side end/start event.
     * @virtual
     */
    protected handleSideCondition(event: SideEndEvent | SideStartEvent,
        events: readonly AnyBattleEvent[], i: number): AnyDriverEvent[]
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
                        throw new Error(`Don't know how ${condition} was ` +
                            "caused since this is the first event");
                    }
                    if (lastEvent.type !== "move")
                    {
                        throw new Error(`Don't know how ${condition} was ` +
                            "caused since no move caused it");
                    }

                    const monRef = this.getSide(lastEvent.id.owner);
                    return [
                        {
                            type: "activateSideCondition", teamRef, start: true,
                            monRef,
                            condition: condition === "Reflect" ?
                                "reflect" : "lightScreen"
                        }
                    ];
                }
                return [
                    {
                        type: "activateSideCondition", teamRef, start: false,
                        condition: condition === "Reflect" ?
                            "reflect" : "lightScreen"
                    }
                ];
            case "Spikes":
                return [
                    {
                        type: "activateSideCondition", teamRef,
                        condition: "spikes", start: event.type === "-sidestart"
                    }
                ];
            case "Stealth Rock":
                return [
                    {
                        type: "activateSideCondition", teamRef,
                        condition: "stealthRock",
                        start: event.type === "-sidestart"
                    }
                ];
            case "Tailwind":
                return [
                    {
                        type: "activateSideCondition", teamRef,
                        condition: "tailwind",
                        start: event.type === "-sidestart"
                    }
                ];
            case "Toxic Spikes":
                return [
                    {
                        type: "activateSideCondition", teamRef,
                        condition: "toxicSpikes",
                        start: event.type === "-sidestart"
                    }
                ];
        }
        return [];
    }

    /** @virtual */
    protected handleSingleMove(event: SingleMoveEvent,
        events: readonly AnyBattleEvent[], i: number): AnyDriverEvent[]
    {
        let status: SingleMoveStatus | undefined;
        if (event.move === "Destiny Bond") status = "destinyBond";
        else if (event.move === "Grudge") status = "grudge";

        if (!status) return [];

        const monRef = this.getSide(event.id.owner);
        return [{type: "setSingleMoveStatus", monRef, status}];
    }

    /** @virtual */
    protected handleSingleTurn(event: SingleTurnEvent,
        events: readonly AnyBattleEvent[], i: number): AnyDriverEvent[]
    {
        let status: SingleTurnStatus | undefined;
        if (PSEventHandler.isStallSingleTurn(event.status)) status = "stall";
        else if (event.status === "move: Roost") status = "roost";
        else if (event.status === "move: Magic Coat") status = "magicCoat";

        if (!status) return [];

        const monRef = this.getSide(event.id.owner);
        return [{type: "setSingleTurnStatus", monRef, status}];
    }

    /** @virtual */
    protected handleStatus(event: StatusEvent,
        events: readonly AnyBattleEvent[], i: number): AnyDriverEvent[]
    {
        const monRef = this.getSide(event.id.owner);
        return [{type: "afflictStatus", monRef, status: event.majorStatus}];
    }

    /** @virtual */
    protected handleSwapBoost(event: SwapBoostEvent,
        events: readonly AnyBattleEvent[], i: number): AnyDriverEvent[]
    {
        const monRef1 = this.getSide(event.source.owner);
        const monRef2 = this.getSide(event.target.owner);
        return [{type: "swapBoosts", monRef1, monRef2, stats: event.stats}];
    }

    /** @virtual */
    protected handleGameOver(event: TieEvent | WinEvent,
        events: readonly AnyBattleEvent[], i: number): AnyDriverEvent[]
    {
        this._battling = false;
        return [];
    }

    /** @virtual */
    protected handleTransform(event: TransformEvent,
        events: readonly AnyBattleEvent[], i: number): AnyDriverEvent[]
    {
        const source = this.getSide(event.source.owner);
        const target = this.getSide(event.target.owner);

        const result: AnyDriverEvent[] = [{type: "transform", source, target}];

        // use lastRequest to infer more details
        if (!this.lastRequest || !this.lastRequest.active) return result;
        // transform reverts after fainting but not after being forced to
        //  choose a switch-in without fainting
        if (this.lastRequest.forceSwitch &&
            this.lastRequest.side.pokemon[0].hp === 0) return result;
        // if species don't match, must've been dragged out before we could
        //  infer any other features
        // TODO: workaround not having access to state object
        // this could be done if a hook was added at the end of #handleEvents(),
        //  which can be disabled if something happens that would force a
        //  discarding of transformPost data
        /*if (this.lastRequest.side.pokemon[0].details.species !==
            source.species) return result;*/

        result.push(
            {
                type: "transformPost", monRef: source,
                moves: this.lastRequest.active[0].moves,
                stats: this.lastRequest.side.pokemon[0].stats
            });
        return result;
    }

    /** @virtual */
    protected handleTurn(event: TurnEvent, events: readonly AnyBattleEvent[],
        i: number): AnyDriverEvent[]
    {
        this.newTurn = true;
        return [];
    }

    /** @virtual */
    protected handleUnboost(event: UnboostEvent,
        events: readonly AnyBattleEvent[], i: number): AnyDriverEvent[]
    {
        return [
            {
                type: "unboost", monRef: this.getSide(event.id.owner),
                stat: event.stat, amount: event.amount
            }
        ];
    }

    /** @virtual */
    protected handleUpkeep(event: UpkeepEvent,
        events: readonly AnyBattleEvent[], i: number): AnyDriverEvent[]
    {
        // selfSwitch is the result of a move, which only occurs in the middle
        //  of all the turn's main events (args.events)
        // if the simulator ignored the fact that a selfSwitch move was used,
        //  then it would emit an upkeep event
        return [{type: "clearSelfSwitch"}];
    }

    /** @virtual */
    protected handleWeather(event: WeatherEvent,
        events: readonly AnyBattleEvent[], i: number): AnyDriverEvent[]
    {
        if (event.weatherType === "none") return [{type: "resetWeather"}];
        else if (event.upkeep)
        {
            return [{type: "tickWeather", weatherType: event.weatherType}];
        }
        // find out what caused the weather to change
        else if (event.from && event.from.startsWith("ability: ") &&
            event.of)
        {
            return [
                {
                    type: "setWeather", monRef: this.getSide(event.of.owner),
                    weatherType: event.weatherType, cause: "ability"
                }
            ];
        }
        else
        {
            const lastEvent = events[i - 1];
            if (!lastEvent)
            {
                throw new Error("Don't know how weather was caused " +
                    "since this is the first event");
            }

            if (lastEvent.type === "move")
            {
                // caused by a move
                return [
                    {
                        type: "setWeather",
                        monRef: this.getSide(lastEvent.id.owner),
                        weatherType: event.weatherType, cause: "move"
                    }
                ];
            }
            if (lastEvent.type !== "switch")
            {
                // if switched in, only an ability would activate, which was
                //  already handled earlier, so there would be no other way
                //  to cause the weather effect
                throw new Error("Don't know how weather was caused " +
                    "since this isn't preceeded by a move or switch");
            }
            throw new Error("Switched in but expected a weather ability to " +
                "activate");
        }
    }

    /** Handles the `[of]` and `[from]` suffixes of an event. */
    private handleSuffixes(event: AnyBattleEvent): AnyDriverEvent[]
    {
        // can't do anything without a [from] suffix
        const f = event.from;
        if (!f) return [];

        // these corner cases should already be handled
        if (event.type === "-ability" && event.from === "ability: Trace")
        {
            return [];
        }
        if (event.from === "lockedmove") return [];

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
            const ability = toIdName(f.substr("ability: ".length));
            return [{type: "activateAbility", monRef, ability}];
        }
        if (f.startsWith("item: "))
        {
            const item = toIdName(f.substr("item: ".length));
            return [{type: "revealItem", monRef, item, gained: false}];
        }
        // nothing relevant to emit
        return [];
    }

    /** Handles the shared statuses in end/start events. */
    private handleTrivialStatus(event: EndEvent | StartEvent): AnyDriverEvent[]
    {
        const monRef = this.getSide(event.id.owner);
        const start = event.type === "-start";

        let status: StatusEffectType | undefined;

        let ev = event.volatile;
        if (ev.startsWith("move: ")) ev = ev.substr("move: ".length);

        switch (ev)
        {
            case "Aqua Ring": status = "aquaRing"; break;
            case "Attract": status = "attract"; break;
            case "Bide": status = "bide"; break;
            case "confusion":
                return [
                    // start confusion status
                    {
                        type: "activateStatusEffect", monRef, start,
                        status: "confusion"
                    },
                    // stopped using multi-turn locked move due to fatigue
                    ...(event.fatigue ?
                        [{type: "fatigue", monRef} as const] : [])
                ];
            case "Curse": status = "curse"; break;
            case "Disable":
                if (event.type === "-end")
                {
                    // re-enable disabled moves
                    return [{type: "reenableMoves", monRef}];
                }
                // disable the given move
                return [
                    {
                        type: "disableMove", monRef,
                        move: toIdName(event.otherArgs[0])
                    }
                ];
            case "Embargo": status = "embargo"; break;
            case "Encore": status = "encore"; break;
            case "Focus Energy": status = "focusEnergy"; break;
            case "Foresight": status = "foresight"; break;
            case "Ingrain": status = "ingrain"; break;
            case "Heal Block": status = "healBlock"; break;
            case "Leech Seed": status = "leechSeed"; break;
            case "Magnet Rise": status = "magnetRise"; break;
            case "Miracle Eye": status = "miracleEye"; break;
            case "Mud Sport": status = "mudSport"; break;
            case "Nightmare": status = "nightmare"; break;
            case "Power Trick": status = "powerTrick"; break;
            case "Substitute": status = "substitute"; break;
            case "Slow Start": status = "slowStart"; break;
            case "Taunt": status = "taunt"; break;
            case "Torment": status = "torment"; break;
            case "Uproar":
                if (event.type === "-start" &&
                    event.otherArgs[0] === "[upkeep]")
                {
                    return [
                        {type: "updateStatusEffect", monRef, status: "uproar"}
                    ];
                }
                status = "uproar"; break;
            default:
            {
                const move = toIdName(ev);
                // istanbul ignore else: not useful to test
                if (isFutureMove(move))
                {
                    return [
                        {type: "activateFutureMove", monRef, move, start}
                    ];
                }
                else
                {
                    this.logger.debug(
                        `Ignoring trivial status '${event.volatile}'`);
                    return [];
                }
            }
        }

        if (!status) return [];
        return [{type: "activateStatusEffect", monRef, status, start}];
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
