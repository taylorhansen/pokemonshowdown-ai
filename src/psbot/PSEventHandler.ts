import * as dex from "../battle/dex/dex";
import { itemRemovalMoves, itemTransferMoves, moveCallers, Type } from
    "../battle/dex/dex-util";
import { ActivateAbility, AnyDriverEvent, DriverInitPokemon, Inactive,
    InitOtherTeamSize, SideConditionType, SingleMoveStatus, SingleTurnStatus,
    StatusEffectType, TakeDamage } from "../battle/driver/DriverEvent";
import { otherSide, Side } from "../battle/state/Side";
import { Logger } from "../Logger";
import { isPlayerID, otherPlayerID, PlayerID, PokemonID, toIdName } from
    "./helpers";
import { AbilityEvent, ActivateEvent, AnyBattleEvent, BoostEvent, CantEvent,
    ClearAllBoostEvent, ClearNegativeBoostEvent, ClearPositiveBoostEvent,
    CopyBoostEvent, CureStatusEvent, CureTeamEvent, DamageEvent,
    DetailsChangeEvent, DragEvent, EndAbilityEvent, EndEvent, EndItemEvent,
    FailEvent, FaintEvent, FieldEndEvent, FieldStartEvent, FormeChangeEvent,
    HealEvent, ImmuneEvent, InvertBoostEvent, isMinorBattleEventType,
    ItemEvent, MissEvent, MoveEvent, MustRechargeEvent, PrepareEvent,
    SetBoostEvent, SetHPEvent, SideEndEvent, SideStartEvent, SingleMoveEvent,
    SingleTurnEvent, StartEvent, StatusEvent, SwapBoostEvent, SwitchEvent,
    TieEvent, TransformEvent, TurnEvent, UnboostEvent, UpkeepEvent,
    WeatherEvent, WinEvent } from "./parser/BattleEvent";
import { Iter, iter } from "./parser/Iter";
import { BattleInitMessage, RequestMessage } from "./parser/Message";
import { Result } from "./parser/types";

/** Result from parsing BattleEvents into DriverEvents. */
export type PSResult = Result<AnyDriverEvent[], AnyBattleEvent>;

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
        //  other, which is all we need to initialize our side of the battle
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

        let it = iter(events);
        while (!it.done)
        {
            const battleEvent = it.get();
            it = it.next();
            const {result: driverEvents, remaining} =
                this.handleEvent(battleEvent, it);
            result.push(...driverEvents);
            it = remaining;
        }

        // ending the current turn
        if (this.newTurn) result.push({type: "postTurn"});

        return result;
    }

    /**
     * Translates a PS server BattleEvent into DriverEvents to update the battle
     * state. This method also handles suffixes.
     * @param event Event to translate.
     * @param it Points to the next BattleEvent.
     * @returns The translated DriverEvent and the remaining input Iter.
     */
    private handleEvent(event: AnyBattleEvent, it: Iter<AnyBattleEvent>):
        PSResult
    {
        const suffixEvents = this.handleSuffixes(event);
        const {result: driverEvents, remaining} = this.delegateEvent(event, it);

        if (suffixEvents.length === 1)
        {
            // suffixes from events can reveal how they were caused
            // e.g. life orb recoil would emit a RevealItem event with a
            //  TakeDamage event in its consequences field
            return {
                result:
                [{
                    ...suffixEvents[0],
                    consequences:
                    [
                        ...(suffixEvents[0].consequences ?? []), ...driverEvents
                    ]
                }],
                remaining
            };
        }
        return {result: driverEvents, remaining};
    }

    /** Translates a BattleEvent without parsing suffixes. */
    private delegateEvent(event: AnyBattleEvent, it: Iter<AnyBattleEvent>):
        PSResult
    {
        switch (event.type)
        {
            // major events
            case "cant": return this.handleCant(event, it);
            case "move": return this.handleMove(event, it);
            // while drag is a minor event, it's handled the same as switch
            case "drag": case "switch": return this.handleSwitch(event, it);

            // minor events
            case "-ability": return this.handleAbility(event, it);
            case "-endability": return this.handleEndAbility(event, it);
            case "-start": return this.handleStart(event, it);
            case "-activate": return this.handleActivate(event, it);
            case "-end": return this.handleEnd(event, it);
            case "-boost": return this.handleBoost(event, it);
            case "-clearallboost": return this.handleClearAllBoost(event, it);
            case "-clearnegativeboost":
                return this.handleClearNegativeBoost(event, it);
            case "-clearpositiveboost":
                return this.handleClearPositiveBoost(event, it);
            case "-copyboost": return this.handleCopyBoost(event, it);
            case "-curestatus": return this.handleCureStatus(event, it);
            case "-cureteam": return this.handleCureTeam(event, it);
            case "-damage": case "-heal": case "-sethp":
                return this.handleDamage(event, it);
            case "detailschange": return this.handleDetailsChange(event, it);
            case "-fail": return this.handleFail(event, it);
            case "faint": return this.handleFaint(event, it);
            case "-fieldend": case "-fieldstart":
                return this.handleFieldCondition(event, it);
            case "-formechange": return this.handleFormeChange(event, it);
            case "-immune": return this.handleImmune(event, it);
            case "-invertboost": return this.handleInvertBoost(event, it);
            case "-item": return this.handleItem(event, it);
            case "-enditem": return this.handleEndItem(event, it);
            case "-miss": return this.handleMiss(event, it);
            case "-mustrecharge": return this.handleMustRecharge(event, it);
            case "-prepare": return this.handlePrepare(event, it);
            case "-setboost": return this.handleSetBoost(event, it);
            case "-sideend": case "-sidestart":
                return this.handleSideCondition(event, it);
            case "-singlemove": return this.handleSingleMove(event, it);
            case "-singleturn": return this.handleSingleTurn(event, it);
            case "-status": return this.handleStatus(event, it);
            case "-swapboost": return this.handleSwapBoost(event, it);
            case "tie": case "win": return this.handleGameOver(event, it);
            case "-transform": return this.handleTransform(event, it);
            case "turn": return this.handleTurn(event, it);
            case "-unboost": return this.handleUnboost(event, it);
            case "upkeep": return this.handleUpkeep(event, it);
            case "-weather": return this.handleWeather(event, it);
            default: return {result: [], remaining: it};
        }
    }

    /** @virtual */
    protected handleCant(event: CantEvent, it: Iter<AnyBattleEvent>): PSResult
    {
        const {result: consequences, remaining} = this.handleMinorEvents(it);

        const monRef = this.getSide(event.id.owner);
        let move: string | undefined;

        if (event.moveName)
        {
            // prevented from using a move, which might not have been revealed
            //  before
            move = toIdName(event.moveName);
        }

        const addons: {move?: string, consequences?: AnyDriverEvent[]} =
        {
            ...(move && {move}),
            ...(consequences.length > 0 ? {consequences} : {})
        } as const;

        let inactive: Inactive;
        if (event.reason === "imprison" || event.reason === "recharge" ||
            event.reason === "slp")
        {
            inactive =
                {type: "inactive", monRef, reason: event.reason, ...addons};
        }
        else if (event.reason.startsWith("ability: "))
        {
            // can't move due to an ability
            const ability = toIdName(
                event.reason.substr("ability: ".length));
            inactive =
            {
                type: "inactive", monRef,
                // add in truant reason if applicable
                ...(ability === "truant" && {reason: "truant"}),
                ...addons,
                consequences:
                [
                    {type: "activateAbility", monRef, ability},
                    ...(addons.consequences ?? [])
                ]
            };
        }
        else inactive = {type: "inactive", monRef, ...addons};

        return {result: [inactive], remaining};
    }

    /** @virtual */
    protected handleMove(event: MoveEvent, it: Iter<AnyBattleEvent>): PSResult
    {
        const {result: consequences, remaining} = this.handleMinorEvents(it);

        const monRef = this.getSide(event.id.owner);
        const move = toIdName(event.moveName);
        const targets = this.getTargets(move, monRef);

        // indicate that the pokemon has used this move
        return {
            result:
            [{
                type: "useMove", monRef, move, targets,
                ...(consequences.length > 0 ? {consequences} : {})
            }],
            remaining
        };
    }

    /** @virtual */
    protected handleSwitch(event: DragEvent | SwitchEvent,
        it: Iter<AnyBattleEvent>): PSResult
    {
        const {result: consequences, remaining} = this.handleMinorEvents(it);

        // if an activateAbility is found, but an activateAbility with trace is
        //  found after, reject the first event
        // this is due to a weird behavior in PS with gen4 battles, not sure if
        //  it's also the case on cartridge (if it is, file an issue on PS)
        const abilityEvents: {i: number, event: ActivateAbility}[] = [];
        for (let i = 0; i < consequences.length; ++i)
        {
            const consequence = consequences[i];
            if (consequence.type !== "activateAbility") continue;

            // trace ability being activated
            if (consequence.ability === "trace")
            {
                // extract the traced ability from consequences
                let tracedAbility: string | undefined;
                if (consequence.consequences)
                {
                    const abilityEvent = consequence.consequences[0];
                    if (abilityEvent.type === "activateAbility" &&
                        abilityEvent.monRef === consequence.monRef)
                    {
                        tracedAbility = abilityEvent.ability;
                    }
                }

                if (tracedAbility)
                {
                    // search past ability events for a match for the traced one
                    for (let j = 0; j < abilityEvents.length; ++j)
                    {
                        const data = abilityEvents[j];
                        const abilityEvent = abilityEvents[j].event;
                        if (abilityEvent.monRef === consequence.monRef &&
                            abilityEvent.ability === tracedAbility)
                        {
                            // reject the ability event
                            abilityEvents.splice(j--, 1);
                            consequences.splice(data.i, 1);
                            // removing an element we already iterated over, so
                            //  adjust i so we don't skip over the next element
                            --i;
                        }
                    }
                }
            }
            else abilityEvents.push({i, event: consequence});
        }

        return {
            result:
            [
                (({id, species, level, gender, hp, hpMax}) =>
                ({
                    type: "switchIn", monRef: this.getSide(id.owner), species,
                    level, gender, hp, hpMax,
                    ...(consequences.length > 0 ? {consequences} : {})
                } as const))(event)
            ],
            remaining
        };
    }

    /** Collects minor BattleEvent translations to attach to a major one. */
    private handleMinorEvents(it: Iter<AnyBattleEvent>): PSResult
    {
        const result: AnyDriverEvent[] = [];
        while (!it.done)
        {
            const event = it.get();
            if (isMinorBattleEventType(event.type) ||
                // called moves are also technically minor events since they're
                //  not caused by turn order but by other move events
                (event.type === "move" && event.from &&
                moveCallers.includes(toIdName(event.from))))
            {
                it = it.next();
                const {result: driverEvents, remaining} =
                    this.handleEvent(event, it);
                result.push(...driverEvents);
                it = remaining;
            }
            else break;
        }
        return {result, remaining: it};
    }

    /** @virtual */
    protected handleAbility(event: AbilityEvent, it: Iter<AnyBattleEvent>):
        PSResult
    {
        const monRef = this.getSide(event.id.owner);
        const ability = toIdName(event.ability);

        const abilityEvent: ActivateAbility =
            {type: "activateAbility", monRef, ability};

        return {
            result: event.from === "ability: Trace" && event.of ?
                [{
                    // trace ability: event.ability contains the Traced ability,
                    //  event.of contains pokemon that was traced, event.id
                    //  contains the pokemon that's Tracing the ability
                    type: "activateAbility", monRef, ability: "trace",
                    consequences:
                    [
                        abilityEvent,
                        {
                            type: "activateAbility",
                            monRef: this.getSide(event.of.owner), ability
                        }
                    ]
                }]
                : [abilityEvent],
            remaining: it
        };
    }

    /** @virtual */
    protected handleEndAbility(event: EndAbilityEvent,
        it: Iter<AnyBattleEvent>): PSResult
    {
        // transform event was already taken care of, no need to handle
        //  this message
        // TODO: could this still be used to infer base ability?
        // typically this is never revealed this way in actual cartridge
        //  play, so best to leave it for now to preserve fairness
        if (event.from === "move: Transform")
        {
            return {result: [], remaining: it};
        }

        // NOTE: may be replaced with "|-start|<PokemonID>|Gastro Acid" later

        const monRef = this.getSide(event.id.owner);
        const ability = toIdName(event.ability);
        return {result: [{type: "gastroAcid", monRef, ability}], remaining: it};
    }

    /** @virtual */
    protected handleStart(event: StartEvent, it: Iter<AnyBattleEvent>): PSResult
    {
        if (event.volatile === "typeadd")
        {
            // set added type
            const monRef = this.getSide(event.id.owner);
            const thirdType = event.otherArgs[0].toLowerCase() as Type;
            return {
                result: [{type: "setThirdType", monRef, thirdType}],
                remaining: it
            };
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
            return {
                result: [{type: "changeType", monRef, newTypes}],
                remaining: it
            };
        }
        if (event.volatile.startsWith("perish") ||
            event.volatile.startsWith("stockpile"))
        {
            // update countable status effects
            const monRef = this.getSide(event.id.owner);
            const status =
                event.volatile.startsWith("perish") ? "perish" : "stockpile";
            const turns = parseInt(event.volatile.substr(status.length), 10);
            return {
                result: [{type: "countStatusEffect", monRef, status, turns}],
                remaining: it
            };
        }
        // trivial, handle using factored-out method
        return this.handleTrivialStatus(event, it);
    }

    /** @virtual */
    protected handleActivate(event: ActivateEvent, it: Iter<AnyBattleEvent>):
        PSResult
    {
        const monRef = this.getSide(event.id.owner);
        switch (event.volatile)
        {
            case "move: Bide":
                return {
                    result:
                    [{
                        type: "updateStatusEffect", monRef, status: "bide"
                    }],
                    remaining: it
                };
            case "move: Charge":
                return {
                    result:
                    [{
                        type: "activateStatusEffect", monRef, status: "charge",
                        start: true
                    }],
                    remaining: it
                };
            case "confusion":
                return {
                    result:
                    [{
                        type: "updateStatusEffect", monRef,
                        status: event.volatile
                    }],
                    remaining: it
                };
            case "move: Endure": case "move: Protect":
                return {
                    result:
                    [{
                        type: "stall", monRef,
                        ...(event.volatile === "move: Endure" && {endure: true})
                    }],
                    remaining: it
                };
            case "move: Feint":
                return {result: [{type: "feint", monRef}], remaining: it};
            case "move: Grudge":
                return {
                    result:
                    [{
                        type: "modifyPP", monRef,
                        move: toIdName(event.otherArgs[0]), amount: "deplete"
                    }],
                    remaining: it
                };
            case "move: Lock-On":
            case "move: Mind Reader":
            {
                const target = event.of ?
                    this.getSide(event.of.owner) : otherSide(monRef);
                return {
                    result: [{type: "lockOn", monRef, target}], remaining: it
                };
            }
            case "move: Mimic":
            {
                const move = toIdName(event.otherArgs[0]);

                // use the last (move) event to see whether this is actually
                //  Sketch or Mimic
                const lastIt = it.prev().prev();
                const lastEvent = lastIt.get();
                if (lastIt.done || lastEvent.type !== "move" ||
                    JSON.stringify(lastEvent.id) !==
                        JSON.stringify(event.id))
                {
                    throw new Error("Don't know how Mimic was caused");
                }

                if (lastEvent.moveName === "Mimic")
                {
                    return {
                        result: [{type: "mimic", monRef, move}], remaining: it
                    };
                }
                if (lastEvent.moveName === "Sketch")
                {
                    return {
                        result: [{type: "sketch", monRef, move}], remaining: it
                    };
                }
                throw new Error(
                    `Unknown Mimic-like move '${lastEvent.moveName}'`);
            }
            case "move: Spite":
                return {
                    result:
                    [{
                        type: "modifyPP", monRef,
                        move: toIdName(event.otherArgs[0]),
                        amount: -parseInt(event.otherArgs[1], 10)
                    }],
                    remaining: it
                };
            case "trapped":
                return {
                    result:
                    [{
                        type: "trap", target: monRef, by: otherSide(monRef)
                    }],
                    remaining: it
                };
            default:
                this.logger.debug(`Ignoring activate '${event.volatile}'`);
                return {result: [], remaining: it};
        }
    }

    /** @virtual */
    protected handleEnd(event: EndEvent, it: Iter<AnyBattleEvent>): PSResult
    {
        if (event.volatile === "Stockpile")
        {
            // end stockpile stacks
            return {
                result:
                [{
                    type: "countStatusEffect",
                    monRef: this.getSide(event.id.owner), status: "stockpile",
                    turns: 0
                }],
                remaining: it
            };
        }
        return this.handleTrivialStatus(event, it);
    }

    /** @virtual */
    protected handleBoost(event: BoostEvent, it: Iter<AnyBattleEvent>): PSResult
    {
        return {
            result:
            [{
                type: "boost", monRef: this.getSide(event.id.owner),
                stat: event.stat, amount: event.amount
            }],
            remaining: it
        };
    }

    /** @virtual */
    protected handleClearAllBoost(event: ClearAllBoostEvent,
        it: Iter<AnyBattleEvent>): PSResult
    {
        return {result: [{type: "clearAllBoosts"}], remaining: it};
    }

    /** @virtual */
    protected handleClearNegativeBoost(event: ClearNegativeBoostEvent,
        it: Iter<AnyBattleEvent>): PSResult
    {
        const monRef = this.getSide(event.id.owner);
        return {result: [{type: "clearNegativeBoosts", monRef}], remaining: it};
    }

    /** @virtual */
    protected handleClearPositiveBoost(event: ClearPositiveBoostEvent,
        it: Iter<AnyBattleEvent>): PSResult
    {
        const monRef = this.getSide(event.id.owner);
        return {result: [{type: "clearPositiveBoosts", monRef}], remaining: it};
    }

    /** @virtual */
    protected handleCopyBoost(event: CopyBoostEvent, it: Iter<AnyBattleEvent>):
        PSResult
    {
        const from = this.getSide(event.target.owner);
        const to = this.getSide(event.source.owner);
        return {result: [{type: "copyBoosts", from, to}], remaining: it};
    }

    /** @virtual */
    protected handleCureStatus(event: CureStatusEvent,
        it: Iter<AnyBattleEvent>): PSResult
    {
        const monRef = this.getSide(event.id.owner);
        return {
            result: [{type: "cureStatus", monRef, status: event.majorStatus}],
            remaining: it
        };
    }

    /** @virtual */
    protected handleCureTeam(event: CureTeamEvent, it: Iter<AnyBattleEvent>):
        PSResult
    {
        return {
            result: [{type: "cureTeam", teamRef: this.getSide(event.id.owner)}],
            remaining: it
        };
    }

    /**
     * Handles a damage/heal/sethp event.
     * @virtual
     */
    protected handleDamage(event: DamageEvent | HealEvent | SetHPEvent,
        it: Iter<AnyBattleEvent>): PSResult
    {
        const monRef = this.getSide(event.id.owner);
        const newHP = [event.status.hp, event.status.hpMax] as const;

        const damageEvent: TakeDamage =
            {type: "takeDamage", monRef, newHP, tox: event.from === "psn"};

        // TODO: wish
        if (event.from === "move: Healing Wish")
        {
            return {
                result:
                [{
                    type: "activateSideCondition", teamRef: monRef,
                    condition: "healingWish", start: false,
                    consequences: [damageEvent]
                }],
                remaining: it
            };
        }
        if (event.from === "move: Lunar Dance")
        {
            return {
                result:
                [{
                    type: "activateSideCondition", teamRef: monRef,
                    condition: "lunarDance", start: false,
                    consequences: [damageEvent, {type: "restoreMoves", monRef}]
                }],
                remaining: it
            };
        }
        return {result: [damageEvent], remaining: it};
    }

    /** @virtual */
    protected handleDetailsChange(event: DetailsChangeEvent,
        it: Iter<AnyBattleEvent>): PSResult
    {
        return {
            result:
            [
                (({id, species, level, gender, hp, hpMax}) =>
                ({
                    type: "formChange", monRef: this.getSide(id.owner), species,
                    level, gender, hp, hpMax, perm: true
                } as const))(event)
            ],
            remaining: it
        };
    }

    /** @virtual */
    protected handleFail(event: FailEvent, it: Iter<AnyBattleEvent>): PSResult
    {
        return {
            result: [{type: "fail", monRef: this.getSide(event.id.owner)}],
            remaining: it
        };
    }

    /** @virtual */
    protected handleFaint(event: FaintEvent, it: Iter<AnyBattleEvent>): PSResult
    {
        return {
            result: [{type: "faint", monRef: this.getSide(event.id.owner)}],
            remaining: it
        };
    }

    /**
     * Handles a field end/start event.
     * @virtual
     */
    protected handleFieldCondition(event: FieldEndEvent | FieldStartEvent,
        it: Iter<AnyBattleEvent>): PSResult
    {
        switch (event.effect)
        {
            case "move: Gravity":
                return {
                    result:
                    [{
                        type: "activateFieldCondition", condition: "gravity",
                        start: event.type === "-fieldstart"
                    }],
                    remaining: it
                };
            case "move: Trick Room":
                return {
                    result:
                    [{
                        type: "activateFieldCondition", condition: "trickRoom",
                        start: event.type === "-fieldstart"
                    }],
                    remaining: it
                };
            default: return {result: [], remaining: it};
        }
    }

    /** @virtual */
    protected handleFormeChange(event: FormeChangeEvent,
        it: Iter<AnyBattleEvent>): PSResult
    {
        return {
            result:
            [
                (({id, species, level, gender, hp, hpMax}) =>
                ({
                    type: "formChange", monRef: this.getSide(id.owner), species,
                    level, gender, hp, hpMax, perm: false
                } as const))(event)
            ],
            remaining: it
        };
    }

    /** @virtual */
    protected handleImmune(event: ImmuneEvent, it: Iter<AnyBattleEvent>):
        PSResult
    {
        return {
            result: [{type: "immune", monRef: this.getSide(event.id.owner)}],
            remaining: it
        };
    }

    /** @virtual */
    protected handleInvertBoost(event: InvertBoostEvent,
        it: Iter<AnyBattleEvent>): PSResult
    {
        return {
            result:
            [{
                type: "invertBoosts", monRef: this.getSide(event.id.owner)
            }],
            remaining: it
        };
    }

    /** @virtual */
    protected handleItem(event: ItemEvent, it: Iter<AnyBattleEvent>): PSResult
    {
        const monRef = this.getSide(event.id.owner);
        const item = toIdName(event.item);

        // item can be gained via a transfer move or recycle
        let gained: boolean | "recycle";
        if (event.from && event.from.startsWith("move: "))
        {
            const move = toIdName(event.from.substr("move: ".length));
            if (move === "recycle") gained = "recycle";
            else gained = itemTransferMoves.includes(move);
        }
        else gained = false;

        return {
            result: [{type: "revealItem", monRef, item, gained}], remaining: it
        };
    }

    /** @virtual */
    protected handleEndItem(event: EndItemEvent, it: Iter<AnyBattleEvent>):
        PSResult
    {
        const monRef = this.getSide(event.id.owner);

        // handle case where an item-removal or steal-eat move was used
        //  against us, which removes but doesn't consume our item
        let consumed: boolean | string;
        if (event.from === "stealeat" ||
            (event.from && event.from.startsWith("move: ") &&
                itemRemovalMoves.includes(
                    toIdName(event.from.substr("move: ".length)))))
        {
            consumed = false;
        }
        // in most other cases we can assume that the item can be brought
        //  back using Recycle
        else consumed = toIdName(event.item);

        return {
            result: [{type: "removeItem", monRef, consumed}], remaining: it
        };
    }

    /** @virtual */
    protected handleMiss(event: MissEvent, it: Iter<AnyBattleEvent>): PSResult
    {
        return {
            result:
            [{
                type: "miss", monRef: this.getSide(event.id.owner),
                target: this.getSide(event.targetId.owner)
            }],
            remaining: it
        };
    }

    /** @virtual */
    protected handleMustRecharge(event: MustRechargeEvent,
        it: Iter<AnyBattleEvent>): PSResult
    {
        return {
            result:
            [{
                type: "mustRecharge", monRef: this.getSide(event.id.owner)
            }],
            remaining: it
        };
    }

    /** @virtual */
    protected handlePrepare(event: PrepareEvent, it: Iter<AnyBattleEvent>):
        PSResult
    {
        const move = toIdName(event.moveName);
        if (!dex.isTwoTurnMove(move))
        {
            throw new Error(`'${move}' is not a two-turn move`);
        }
        return {
            result:
            [{
                type: "prepareMove", monRef: this.getSide(event.id.owner), move
            }],
            remaining: it
        };
    }

    /** @virtual */
    protected handleSetBoost(event: SetBoostEvent, it: Iter<AnyBattleEvent>):
        PSResult
    {
        return {
            result:
            [
                (({id, stat, amount}) =>
                ({
                    type: "setBoost", monRef: this.getSide(id.owner), stat,
                    amount
                } as const))(event)
            ],
            remaining: it
        };
    }

    /**
     * Handles a side end/start event.
     * @virtual
     */
    protected handleSideCondition(event: SideEndEvent | SideStartEvent,
        it: Iter<AnyBattleEvent>): PSResult
    {
        const teamRef = this.getSide(event.id);
        let condition: SideConditionType;

        let psCondition = event.condition;
        if (psCondition.startsWith("move: "))
        {
            psCondition = psCondition.substr("move: ".length);
        }
        switch (psCondition)
        {
            case "Light Screen":
            case "Reflect":
                condition = psCondition === "Reflect" ?
                        "reflect" : "lightScreen";
                break;
            case "Lucky Chant": condition = "luckyChant"; break;
            case "Mist": condition = "mist"; break;
            case "Spikes": condition = "spikes"; break;
            case "Stealth Rock": condition = "stealthRock"; break;
            case "Tailwind": condition = "tailwind"; break;
            case "Toxic Spikes": condition = "toxicSpikes"; break;
            default: return {result: [], remaining: it};
        }

        return {
            result:
            [{
                type: "activateSideCondition", teamRef, condition,
                start: event.type === "-sidestart"
            }],
            remaining: it
        };
    }

    /** @virtual */
    protected handleSingleMove(event: SingleMoveEvent,
        it: Iter<AnyBattleEvent>): PSResult
    {
        let status: SingleMoveStatus | undefined;
        if (event.move === "Destiny Bond") status = "destinyBond";
        else if (event.move === "Grudge") status = "grudge";
        else if (event.move === "Rage") status = "rage";
        else return {result: [], remaining: it};

        const monRef = this.getSide(event.id.owner);
        return {
            result: [{type: "setSingleMoveStatus", monRef, status}],
            remaining: it
        };
    }

    /** @virtual */
    protected handleSingleTurn(event: SingleTurnEvent,
        it: Iter<AnyBattleEvent>): PSResult
    {
        let status: SingleTurnStatus | undefined;
        if (event.status === "move: Roost") status = "roost";
        else if (event.status === "move: Magic Coat") status = "magicCoat";
        else if (event.status === "Snatch") status = "snatch";

        if (!status) return {result: [], remaining: it};

        const monRef = this.getSide(event.id.owner);
        return {
            result: [{type: "setSingleTurnStatus", monRef, status}],
            remaining: it
        };
    }

    /** @virtual */
    protected handleStatus(event: StatusEvent, it: Iter<AnyBattleEvent>):
        PSResult
    {
        const monRef = this.getSide(event.id.owner);
        return {
            result:
            [{
                type: "afflictStatus", monRef, status: event.majorStatus
            }],
            remaining: it
        };
    }

    /** @virtual */
    protected handleSwapBoost(event: SwapBoostEvent, it: Iter<AnyBattleEvent>):
        PSResult
    {
        const monRef1 = this.getSide(event.source.owner);
        const monRef2 = this.getSide(event.target.owner);
        return {
            result:
            [{
                type: "swapBoosts", monRef1, monRef2, stats: event.stats
            }],
            remaining: it
        };
    }

    /** @virtual */
    protected handleGameOver(event: TieEvent | WinEvent,
        it: Iter<AnyBattleEvent>): PSResult
    {
        this._battling = false;
        return {result: [], remaining: it};
    }

    /** @virtual */
    protected handleTransform(event: TransformEvent, it: Iter<AnyBattleEvent>):
        PSResult
    {
        const source = this.getSide(event.source.owner);
        const target = this.getSide(event.target.owner);

        let consequences: AnyDriverEvent[] | undefined;

        // use lastRequest to infer more details
        if (this.lastRequest && this.lastRequest.active &&
            // transform reverts after fainting but not after being forced to
            //  choose a switch-in without fainting
            (!this.lastRequest.forceSwitch ||
                this.lastRequest.side.pokemon[0].hp > 0) &&
            // could've been dragged out (e.g. by roar)
            // TODO: if duplicate nicknames are allowed, figure out a better way
            //  to check for this
            this.lastRequest.side.pokemon[0].nickname === event.source.nickname)
        {
            consequences =
            [{
                type: "transformPost", monRef: source,
                moves: this.lastRequest.active[0].moves
            }];
        }

        return {
            result:
            [{
                type: "transform", source, target,
                ...(consequences && {consequences})
            }],
            remaining: it
        };
    }

    /** @virtual */
    protected handleTurn(event: TurnEvent, it: Iter<AnyBattleEvent>): PSResult
    {
        this.newTurn = true;
        return {result: [], remaining: it};
    }

    /** @virtual */
    protected handleUnboost(event: UnboostEvent, it: Iter<AnyBattleEvent>):
        PSResult
    {
        return {
            result:
            [{
                type: "unboost", monRef: this.getSide(event.id.owner),
                stat: event.stat, amount: event.amount
            }],
            remaining: it
        };
    }

    /** @virtual */
    protected handleUpkeep(event: UpkeepEvent, it: Iter<AnyBattleEvent>):
        PSResult
    {
        // selfSwitch is the result of a move, which only occurs in the middle
        //  of all the turn's main events (args.events)
        // if the simulator ignored the fact that a selfSwitch move was used,
        //  then it would emit an upkeep event
        return {result: [{type: "clearSelfSwitch"}], remaining: it};
    }

    /** @virtual */
    protected handleWeather(event: WeatherEvent, it: Iter<AnyBattleEvent>):
        PSResult
    {
        let events: AnyDriverEvent[];

        if (event.weatherType === "none") events = [{type: "resetWeather"}];
        else if (event.upkeep)
        {
            events = [{type: "tickWeather", weatherType: event.weatherType}];
        }
        else events = [{type: "setWeather", weatherType: event.weatherType}];

        return {result: events, remaining: it};
    }

    /** Handles the `[of]` and `[from]` suffixes of an event. */
    private handleSuffixes(event: AnyBattleEvent): [] | [AnyDriverEvent]
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
            // removeItem events are usually emitted when a berry's effects are
            //  used, so this helps us to not conflict with that
            if (dex.berries.hasOwnProperty(item)) return [];
            return [{type: "revealItem", monRef, item, gained: false}];
        }
        // nothing relevant to emit
        return [];
    }

    /** Handles the shared statuses in end/start events. */
    private handleTrivialStatus(event: EndEvent | StartEvent,
        it: Iter<AnyBattleEvent>): PSResult
    {
        const monRef = this.getSide(event.id.owner);
        const start = event.type === "-start";

        let status: StatusEffectType | undefined;

        let ev = event.volatile;
        if (ev.startsWith("move: ")) ev = ev.substr("move: ".length);

        let driverEvents: AnyDriverEvent[] | undefined;
        switch (ev)
        {
            case "Aqua Ring": status = "aquaRing"; break;
            case "Attract": status = "attract"; break;
            case "Bide": status = "bide"; break;
            case "confusion":
            {
                const confEvent =
                {
                    type: "activateStatusEffect", monRef, start,
                    status: "confusion"
                } as const;
                if (event.fatigue)
                {
                    driverEvents = [{
                        type: "fatigue", monRef, consequences: [confEvent]
                    }];
                }
                else driverEvents = [confEvent];
                break;
            }
            case "Curse": status = "curse"; break;
            case "Disable":
                if (event.type === "-start")
                {
                    // disable the given move
                    driverEvents =
                    [{
                        type: "disableMove", monRef,
                        move: toIdName(event.otherArgs[0])
                    }];
                }
                // re-enable disabled moves
                else driverEvents = [{type: "reenableMoves", monRef}];
                break;
            case "Embargo": status = "embargo"; break;
            case "Encore": status = "encore"; break;
            case "Focus Energy": status = "focusEnergy"; break;
            case "Foresight": status = "foresight"; break;
            case "Heal Block": status = "healBlock"; break;
            case "Imprison": status = "imprison"; break;
            case "Ingrain": status = "ingrain"; break;
            case "Leech Seed": status = "leechSeed"; break;
            case "Magnet Rise": status = "magnetRise"; break;
            case "Miracle Eye": status = "miracleEye"; break;
            case "Mud Sport": status = "mudSport"; break;
            case "Nightmare": status = "nightmare"; break;
            case "Power Trick": status = "powerTrick"; break;
            case "Slow Start": status = "slowStart"; break;
            case "Substitute": status = "substitute"; break;
            case "Taunt": status = "taunt"; break;
            case "Torment": status = "torment"; break;
            case "Uproar":
                if (event.type === "-start" &&
                    event.otherArgs[0] === "[upkeep]")
                {
                    driverEvents =
                    [{
                        type: "updateStatusEffect", monRef, status: "uproar"
                    }];
                }
                else status = "uproar";
                break;
            case "Water Sport": status = "waterSport"; break;
            case "Yawn": status = "yawn"; break;
            default:
            {
                const move = toIdName(ev);
                // istanbul ignore else: not useful to test
                if (dex.isFutureMove(move))
                {
                    driverEvents =
                    [{
                        type: "activateFutureMove", monRef, move, start
                    }];
                }
                else
                {
                    this.logger.debug(
                        `Ignoring trivial status '${event.volatile}'`);
                }
            }
        }

        if (!driverEvents)
        {
            if (!status) driverEvents = [];
            else
            {
                driverEvents =
                    [{type: "activateStatusEffect", monRef, status, start}];
            }
        }
        return {result: driverEvents, remaining: it};
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
