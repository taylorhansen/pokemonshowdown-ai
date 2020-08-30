import * as dex from "../battle/dex/dex";
import { itemRemovalMoves, itemTransferMoves, Type } from
    "../battle/dex/dex-util";
import * as events from "../battle/driver/BattleEvent";
import { otherSide, Side } from "../battle/state/Side";
import { Logger } from "../Logger";
import { isPlayerID, otherPlayerID, PlayerID, PokemonID, toIdName } from
    "./helpers";
import { Iter, iter } from "./parser/Iter";
import * as psevent from "./parser/PSBattleEvent";
import * as psmsg from "./parser/PSMessage";
import { Result } from "./parser/types";

/** Result from parsing BattleEvents into DriverEvents. */
export type PSResult = Result<events.Any[], psevent.Any>;

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
    protected lastRequest?: psmsg.Request;
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
    public handleRequest(args: psmsg.Request): events.Any[]
    {
        this.lastRequest = args;

        // a request message is given at the start of the battle, before any
        //  other, which is all we need to initialize our side of the battle
        //  state before handling battleinit messages
        if (this._battling) return [];

        // first time: initialize client team data
        // copy pokemon array so we can modify it
        const team: events.DriverInitPokemon[] = [...args.side.pokemon];

        // preprocess move names, which are encoded with additional features
        for (let i = 0; i < team.length; ++i)
        {
            // copy pokemon obj and moves so we can modify them
            const mon = {...team[i], species: toIdName(team[i].species)};
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
    public initBattle(args: psmsg.BattleInit): events.Any[]
    {
        this._battling = true;

        let sizeEvent: events.InitOtherTeamSize;

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
    public handleEvents(psEvents: readonly psevent.Any[]): events.Any[]
    {
        const result: events.Any[] = [];

        // starting a new turn
        if (this.newTurn) result.push({type: "preTurn"});

        // this field should only stay true if one of these events contains a
        //  |turn| message
        this.newTurn = false;

        // TODO: remove now-unneeded Iter logic
        let it = iter(psEvents);
        while (!it.done)
        {
            const battleEvent = it.get();
            it = it.next();
            const {result: driverEvents, remaining} =
                this.handleEvent(battleEvent, it);
            result.push(...driverEvents);
            it = remaining;
        }

        // TODO: factor out into a separate method to allow multiple
        //  handleEvents() calls but only one Trace check
        // if an activateAbility is found, but an activateAbility with Trace is
        //  found after, move the Trace events so they happen before the ability
        //  (of course, make sure the abilities/monRefs match)
        // this is due to a weird behavior in PS with gen4 battles, not sure if
        //  it's also the case on cartridge
        const abilityEvents: {i: number, event: events.ActivateAbility}[] = [];
        for (let i = 0; i < result.length; ++i)
        {
            const event = result[i];
            if (event.type !== "activateAbility") continue;
            if (event.ability !== "trace")
            {
                // track the ability events that happen before the next trace
                abilityEvents.push({i, event});
                continue;
            }
            // see if trace was activated and caused an ability event
            //  that copies the opponent's ability (while also revealing it)
            // trace handling should emit
            const nextEvent = result[i + 1];
            if (!nextEvent || nextEvent.type !== "activateAbility" ||
                nextEvent.monRef !== event.monRef)
            {
                continue;
            }
            const nextEvent2 = result[i + 2];
            if (!nextEvent2 || nextEvent2.type !== "activateAbility" ||
                nextEvent2.monRef === event.monRef ||
                nextEvent2.ability !== nextEvent.ability)
            {
                continue;
            }

            const tracedAbility = nextEvent.ability;
            // search past ability events for a match for the traced
            //  mon
            for (let j = 0; j < abilityEvents.length; ++j)
            {
                const data = abilityEvents[j];
                const abilityEvent = abilityEvents[j].event;
                if (abilityEvent.monRef !== event.monRef ||
                    abilityEvent.ability !== tracedAbility)
                {
                    continue;
                }

                // move the ability event + nextEvent/nextEvent2
                result.splice(data.i, 0, ...result.splice(i, 3));
                // move i to the end of this section of events
                // the 2 here accounts for nextEvent/nextEvent2
                i += 2;

                // all the other ability events that happened
                //  before are guaranteed to not be related to
                //  Trace
                abilityEvents.splice(0, j + 1);
                break;
            }
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
    private handleEvent(event: psevent.Any, it: Iter<psevent.Any>): PSResult
    {
        const suffixEvents = this.handleSuffixes(event);
        const {result: battleEvents, remaining} = this.delegateEvent(event, it);

        return {result: [...suffixEvents, ...battleEvents], remaining};
    }

    /** Translates a BattleEvent without parsing suffixes. */
    private delegateEvent(event: psevent.Any, it: Iter<psevent.Any>): PSResult
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
            case "-crit": return this.handleCrit(event, it);
            case "-curestatus": return this.handleCureStatus(event, it);
            case "-cureteam": return this.handleCureTeam(event, it);
            case "-damage": case "-heal": case "-sethp":
                return this.handleDamage(event, it);
            case "detailschange": return this.handleDetailsChange(event, it);
            case "-fail": return this.handleFail(event, it);
            case "faint": return this.handleFaint(event, it);
            case "-fieldend": case "-fieldstart":
                return this.handleFieldEffect(event, it);
            case "-formechange": return this.handleFormeChange(event, it);
            case "-hitcount": return this.handleHitCount(event, it);
            case "-immune": return this.handleImmune(event, it);
            case "-invertboost": return this.handleInvertBoost(event, it);
            case "-item": return this.handleItem(event, it);
            case "-enditem": return this.handleEndItem(event, it);
            case "-miss": return this.handleMiss(event, it);
            case "-mustrecharge": return this.handleMustRecharge(event, it);
            case "-notarget": return this.handleNoTarget(event, it);
            case "-prepare": return this.handlePrepare(event, it);
            case "-resisted": return this.handleResisted(event, it);
            case "-setboost": return this.handleSetBoost(event, it);
            case "-sideend": case "-sidestart":
                return this.handleSideCondition(event, it);
            case "-singlemove": return this.handleSingleMove(event, it);
            case "-singleturn": return this.handleSingleTurn(event, it);
            case "-status": return this.handleStatus(event, it);
            case "-supereffective": return this.handleSuperEffective(event, it);
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
    protected handleCant(event: psevent.Cant, it: Iter<psevent.Any>): PSResult
    {
        const monRef = this.getSide(event.id.owner);
        let move: string | undefined;

        if (event.moveName)
        {
            // prevented from using a move, which might not have been revealed
            //  before
            move = toIdName(event.moveName);
        }

        let result: events.Any[];
        if (event.reason === "imprison" || event.reason === "recharge" ||
            event.reason === "slp")
        {
            result =
            [{
                type: "inactive", monRef, reason: event.reason,
                ...(move && {move})
            }];
        }
        else if (event.reason.startsWith("ability: "))
        {
            // can't move due to an ability
            const ability = toIdName(
                event.reason.substr("ability: ".length));
            result =
            [
                {
                    type: "inactive", monRef,
                    // add in truant reason if applicable
                    ...(ability === "truant" && {reason: "truant"}),
                    ...(move && {move})
                },
                {type: "activateAbility", monRef, ability}
            ];
        }
        else result = [{type: "inactive", monRef, ...(move && {move})}];

        return {result, remaining: it};
    }

    /** @virtual */
    protected handleMove(event: psevent.Move, it: Iter<psevent.Any>): PSResult
    {
        const monRef = this.getSide(event.id.owner);
        const move = toIdName(event.moveName);

        // indicate that the pokemon has used this move
        return {result: [{type: "useMove", monRef, move}], remaining: it};
    }

    /** @virtual */
    protected handleSwitch(event: psevent.Drag | psevent.Switch,
        it: Iter<psevent.Any>): PSResult
    {
        return {
            result:
            [
                (({id, species, level, gender, hp, hpMax}) =>
                ({
                    type: "switchIn", monRef: this.getSide(id.owner),
                    species: toIdName(species), level, gender, hp, hpMax
                } as const))(event)
            ],
            remaining: it
        };
    }

    /** @virtual */
    protected handleAbility(event: psevent.Ability, it: Iter<psevent.Any>):
        PSResult
    {
        const monRef = this.getSide(event.id.owner);
        const ability = toIdName(event.ability);

        const abilityEvent: events.ActivateAbility =
            {type: "activateAbility", monRef, ability};

        return {
            result: event.from === "ability: Trace" && event.of ?
                [
                    // trace ability: event.ability contains the Traced ability,
                    //  event.of contains pokemon that was traced, event.id
                    //  contains the pokemon that's Tracing the ability
                    {type: "activateAbility", monRef, ability: "trace"},
                    abilityEvent,
                    {
                        type: "activateAbility",
                        monRef: this.getSide(event.of.owner), ability
                    }
                ]
                : [abilityEvent],
            remaining: it
        };
    }

    /** @virtual */
    protected handleEndAbility(event: psevent.EndAbility,
        it: Iter<psevent.Any>): PSResult
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
        return {
            result:
            [
                // TODO: does cartridge also reveal ability?
                // when can this status be overwritten by an ability change?
                {type: "activateAbility", monRef, ability},
                {
                    type: "activateStatusEffect", monRef,
                    effect: "suppressAbility", start: true
                }
            ],
            remaining: it
        };
    }

    /** @virtual */
    protected handleStart(event: psevent.Start, it: Iter<psevent.Any>): PSResult
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
            const effect =
                event.volatile.startsWith("perish") ? "perish" : "stockpile";
            const amount = parseInt(event.volatile.substr(effect.length), 10);
            return {
                result: [{type: "countStatusEffect", monRef, effect, amount}],
                remaining: it
            };
        }
        // trivial, handle using factored-out method
        return this.handleTrivialStatus(event, it);
    }

    /** @virtual */
    protected handleActivate(event: psevent.Activate, it: Iter<psevent.Any>):
        PSResult
    {
        const monRef = this.getSide(event.id.owner);
        switch (event.volatile)
        {
            case "move: Bide":
                return {
                    result:
                    [{
                        type: "updateStatusEffect", monRef, effect: "bide"
                    }],
                    remaining: it
                };
            case "move: Charge":
                return {
                    result:
                    [{
                        type: "activateStatusEffect", monRef, effect: "charge",
                        start: true
                    }],
                    remaining: it
                };
            case "confusion":
                return {
                    result:
                    [{
                        type: "updateStatusEffect", monRef,
                        effect: event.volatile
                    }],
                    remaining: it
                };
            case "Endure": case "Protect":
            case "move: Endure": case "move: Protect":
                return {
                    result:
                    [{
                        type: "stall", monRef,
                        ...(event.volatile.endsWith("Endure") && {endure: true})
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
    protected handleEnd(event: psevent.End, it: Iter<psevent.Any>): PSResult
    {
        if (event.volatile === "Stockpile")
        {
            // end stockpile stacks
            return {
                result:
                [{
                    type: "countStatusEffect",
                    monRef: this.getSide(event.id.owner), effect: "stockpile",
                    amount: 0
                }],
                remaining: it
            };
        }
        return this.handleTrivialStatus(event, it);
    }

    /** @virtual */
    protected handleBoost(event: psevent.Boost, it: Iter<psevent.Any>): PSResult
    {
        return {
            result:
            [{
                type: "countStatusEffect", monRef: this.getSide(event.id.owner),
                effect: event.stat, amount: event.amount, add: true
            }],
            remaining: it
        };
    }

    /** @virtual */
    protected handleClearAllBoost(event: psevent.ClearAllBoost,
        it: Iter<psevent.Any>): PSResult
    {
        return {result: [{type: "clearAllBoosts"}], remaining: it};
    }

    /** @virtual */
    protected handleClearNegativeBoost(event: psevent.ClearNegativeBoost,
        it: Iter<psevent.Any>): PSResult
    {
        const monRef = this.getSide(event.id.owner);
        return {result: [{type: "clearNegativeBoosts", monRef}], remaining: it};
    }

    /** @virtual */
    protected handleClearPositiveBoost(event: psevent.ClearPositiveBoost,
        it: Iter<psevent.Any>): PSResult
    {
        const monRef = this.getSide(event.id.owner);
        return {result: [{type: "clearPositiveBoosts", monRef}], remaining: it};
    }

    /** @virtual */
    protected handleCopyBoost(event: psevent.CopyBoost, it: Iter<psevent.Any>):
        PSResult
    {
        const from = this.getSide(event.target.owner);
        const to = this.getSide(event.source.owner);
        return {result: [{type: "copyBoosts", from, to}], remaining: it};
    }

    /** @virtual */
    protected handleCrit(event: psevent.Crit, it: Iter<psevent.Any>):
        PSResult
    {
        const monRef = this.getSide(event.id.owner);
        return {result: [{type: "crit", monRef}], remaining: it};
    }

    /** @virtual */
    protected handleCureStatus(event: psevent.CureStatus,
        it: Iter<psevent.Any>): PSResult
    {
        const monRef = this.getSide(event.id.owner);
        return {
            result:
            [{
                type: "activateStatusEffect", monRef, effect: event.majorStatus,
                start: false
            }],
            remaining: it
        };
    }

    /** @virtual */
    protected handleCureTeam(event: psevent.CureTeam, it: Iter<psevent.Any>):
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
    protected handleDamage(event: psevent.Damage | psevent.Heal | psevent.SetHP,
        it: Iter<psevent.Any>): PSResult
    {
        const monRef = this.getSide(event.id.owner);
        const newHP = [event.status.hp, event.status.hpMax] as const;

        const damageEvent: events.TakeDamage =
            {type: "takeDamage", monRef, newHP, tox: event.from === "psn"};

        // TODO: wish
        if (event.from === "move: Healing Wish")
        {
            return {
                result:
                [
                    {
                        type: "activateTeamEffect", teamRef: monRef,
                        effect: "healingWish", start: false
                    },
                    damageEvent
                ],
                remaining: it
            };
        }
        if (event.from === "move: Lunar Dance")
        {
            return {
                result:
                [
                    {
                        type: "activateTeamEffect", teamRef: monRef,
                        effect: "lunarDance", start: false
                    },
                    damageEvent, {type: "restoreMoves", monRef}
                ],
                remaining: it
            };
        }
        return {result: [damageEvent], remaining: it};
    }

    /** @virtual */
    protected handleDetailsChange(event: psevent.DetailsChange,
        it: Iter<psevent.Any>): PSResult
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
    protected handleFail(event: psevent.Fail, it: Iter<psevent.Any>): PSResult
    {
        return {
            result: [{type: "fail", monRef: this.getSide(event.id.owner)}],
            remaining: it
        };
    }

    /** @virtual */
    protected handleFaint(event: psevent.Faint, it: Iter<psevent.Any>): PSResult
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
    protected handleFieldEffect(event: psevent.FieldEnd | psevent.FieldStart,
        it: Iter<psevent.Any>): PSResult
    {
        switch (event.effect)
        {
            case "move: Gravity":
                return {
                    result:
                    [{
                        type: "activateFieldEffect", effect: "gravity",
                        start: event.type === "-fieldstart"
                    }],
                    remaining: it
                };
            case "move: Trick Room":
                return {
                    result:
                    [{
                        type: "activateFieldEffect", effect: "trickRoom",
                        start: event.type === "-fieldstart"
                    }],
                    remaining: it
                };
            default: return {result: [], remaining: it};
        }
    }

    /** @virtual */
    protected handleFormeChange(event: psevent.FormeChange,
        it: Iter<psevent.Any>): PSResult
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
    protected handleHitCount(event: psevent.HitCount, it: Iter<psevent.Any>):
        PSResult
    {
        const monRef = this.getSide(event.id.owner);
        return {
            result: [{type: "hitCount", monRef, count: event.count}],
            remaining: it
        };
    }

    /** @virtual */
    protected handleImmune(event: psevent.Immune, it: Iter<psevent.Any>):
        PSResult
    {
        return {
            result: [{type: "immune", monRef: this.getSide(event.id.owner)}],
            remaining: it
        };
    }

    /** @virtual */
    protected handleInvertBoost(event: psevent.InvertBoost,
        it: Iter<psevent.Any>): PSResult
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
    protected handleItem(event: psevent.Item, it: Iter<psevent.Any>): PSResult
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
    protected handleEndItem(event: psevent.EndItem, it: Iter<psevent.Any>):
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
    protected handleMiss(event: psevent.Miss, it: Iter<psevent.Any>): PSResult
    {
        return {
            result:
                [{type: "miss", monRef: this.getSide(event.targetId.owner)}],
            remaining: it
        };
    }

    /** @virtual */
    protected handleMustRecharge(event: psevent.MustRecharge,
        it: Iter<psevent.Any>): PSResult
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
    protected handleNoTarget(event: psevent.NoTarget, it: Iter<psevent.Any>):
        PSResult
    {
        return {
            result: [{type: "noTarget", monRef: this.getSide(event.id.owner)}],
            remaining: it
        };
    }

    /** @virtual */
    protected handlePrepare(event: psevent.Prepare, it: Iter<psevent.Any>):
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
                type: "activateStatusEffect",
                monRef: this.getSide(event.id.owner), effect: move, start: true
            }],
            remaining: it
        };
    }

    /** @virtual */
    protected handleResisted(event: psevent.Resisted, it: Iter<psevent.Any>):
        PSResult
    {
        return {
            result: [{type: "resisted", monRef: this.getSide(event.id.owner)}],
            remaining: it
        };
    }

    /** @virtual */
    protected handleSetBoost(event: psevent.SetBoost, it: Iter<psevent.Any>):
        PSResult
    {
        return {
            result:
            [
                (({id, stat, amount}) =>
                ({
                    type: "countStatusEffect",
                    monRef: this.getSide(id.owner), effect: stat, amount
                } as const))(event)
            ],
            remaining: it
        };
    }

    /**
     * Handles a side end/start event.
     * @virtual
     */
    protected handleSideCondition(event: psevent.SideEnd | psevent.SideStart,
        it: Iter<psevent.Any>): PSResult
    {
        const teamRef = this.getSide(event.id);
        let effect: events.TeamEffectType;

        let psCondition = event.condition;
        if (psCondition.startsWith("move: "))
        {
            psCondition = psCondition.substr("move: ".length);
        }
        switch (psCondition)
        {
            case "Light Screen":
            case "Reflect":
                effect = psCondition === "Reflect" ?
                        "reflect" : "lightScreen";
                break;
            case "Lucky Chant": effect = "luckyChant"; break;
            case "Mist": effect = "mist"; break;
            case "Safeguard": effect = "safeguard"; break;
            case "Spikes": effect = "spikes"; break;
            case "Stealth Rock": effect = "stealthRock"; break;
            case "Tailwind": effect = "tailwind"; break;
            case "Toxic Spikes": effect = "toxicSpikes"; break;
            default: return {result: [], remaining: it};
        }

        return {
            result:
            [{
                type: "activateTeamEffect", teamRef, effect,
                start: event.type === "-sidestart"
            }],
            remaining: it
        };
    }

    /** @virtual */
    protected handleSingleMove(event: psevent.SingleMove,
        it: Iter<psevent.Any>): PSResult
    {
        let effect: events.SingleMoveEffect | undefined;
        if (event.move === "Destiny Bond") effect = "destinyBond";
        else if (event.move === "Grudge") effect = "grudge";
        else if (event.move === "Rage") effect = "rage";
        else return {result: [], remaining: it};

        const monRef = this.getSide(event.id.owner);
        return {
            result:
                [{type: "activateStatusEffect", monRef, effect, start: true}],
            remaining: it
        };
    }

    /** @virtual */
    protected handleSingleTurn(event: psevent.SingleTurn,
        it: Iter<psevent.Any>): PSResult
    {
        let effect: events.SingleTurnEffect;
        switch (event.status.startsWith("move: ") ?
            event.status.substr("move: ".length) : event.status)
        {
            case "Endure": effect = "endure"; break;
            case "Magic Coat": effect = "magicCoat"; break;
            case "Protect": effect = "protect"; break;
            case "Roost": effect = "roost"; break;
            case "Snatch": effect = "snatch"; break;
            default: return {result: [], remaining: it};
        }

        const monRef = this.getSide(event.id.owner);
        return {
            result:
                [{type: "activateStatusEffect", monRef, effect, start: true}],
            remaining: it
        };
    }

    /** @virtual */
    protected handleStatus(event: psevent.Status, it: Iter<psevent.Any>):
        PSResult
    {
        const monRef = this.getSide(event.id.owner);
        return {
            result:
            [{
                type: "activateStatusEffect", monRef, effect: event.majorStatus,
                start: true
            }],
            remaining: it
        };
    }

    /** @virtual */
    protected handleSuperEffective(event: psevent.SuperEffective,
        it: Iter<psevent.Any>): PSResult
    {
        const monRef = this.getSide(event.id.owner);
        return {result: [{type: "superEffective", monRef}], remaining: it};
    }

    /** @virtual */
    protected handleSwapBoost(event: psevent.SwapBoost, it: Iter<psevent.Any>):
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
    protected handleGameOver(event: psevent.Tie | psevent.Win,
        it: Iter<psevent.Any>): PSResult
    {
        this._battling = false;

        let winner: Side | undefined;
        if (event.type === "win")
        {
            winner = event.winner === this.username ? "us" : "them";
        }

        return {
            result: [{type: "gameOver", ...(winner && {winner})}],
            remaining: it
        };
    }

    /** @virtual */
    protected handleTransform(event: psevent.Transform, it: Iter<psevent.Any>):
        PSResult
    {
        const source = this.getSide(event.source.owner);
        const target = this.getSide(event.target.owner);

        let transformPost: events.TransformPost | undefined;

        // use lastRequest to infer more details
        if (this.lastRequest && this.lastRequest.active &&
            // transform reverts after fainting but not after being forced to
            //  choose a switch-in without fainting
            (!this.lastRequest.forceSwitch ||
                this.lastRequest.side.pokemon[0].hp > 0) &&
            // could've been dragged out immediately after transforming
            // TODO: let BattleDriver decide this by just supplying it the
            //  request moves for each halt
            this.lastRequest.side.pokemon[0].nickname === event.source.nickname)
        {
            transformPost =
            {
                type: "transformPost", monRef: source,
                moves: this.lastRequest.active[0].moves
            };
        }

        return {
            result:
            [
                {type: "transform", source, target},
                ...(transformPost ? [transformPost] : [])
            ],
            remaining: it
        };
    }

    /** @virtual */
    protected handleTurn(event: psevent.Turn, it: Iter<psevent.Any>): PSResult
    {
        this.newTurn = true;
        return {result: [], remaining: it};
    }

    /** @virtual */
    protected handleUnboost(event: psevent.Unboost, it: Iter<psevent.Any>):
        PSResult
    {
        return {
            result:
            [{
                type: "countStatusEffect", monRef: this.getSide(event.id.owner),
                effect: event.stat, amount: -event.amount, add: true
            }],
            remaining: it
        };
    }

    /** @virtual */
    protected handleUpkeep(event: psevent.Upkeep, it: Iter<psevent.Any>):
        PSResult
    {
        // selfSwitch is the result of a move, which only occurs in the middle
        //  of all the turn's main events (args.events)
        // if the simulator ignored the fact that a selfSwitch move was used,
        //  then it would emit an upkeep event
        return {result: [{type: "clearSelfSwitch"}], remaining: it};
    }

    /** @virtual */
    protected handleWeather(event: psevent.Weather, it: Iter<psevent.Any>):
        PSResult
    {
        let result: events.Any[];

        if (event.weatherType === "none") result = [{type: "resetWeather"}];
        else if (event.upkeep)
        {
            result = [{type: "updateFieldEffect", effect: event.weatherType}];
        }
        else
        {
            result =
            [{
                type: "activateFieldEffect", effect: event.weatherType,
                start: true
            }];
        }

        return {result, remaining: it};
    }

    /** Handles the `[of]` and `[from]` suffixes of an event. */
    private handleSuffixes(event: psevent.Any): [] | [events.Any]
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
    private handleTrivialStatus(event: psevent.End | psevent.Start,
        it: Iter<psevent.Any>): PSResult
    {
        const monRef = this.getSide(event.id.owner);
        const start = event.type === "-start";

        let effect: events.StatusEffectType | undefined;

        let ev = event.volatile;
        if (ev.startsWith("move: ")) ev = ev.substr("move: ".length);

        let driverEvents: events.Any[] | undefined;
        switch (ev)
        {
            case "Aqua Ring": effect = "aquaRing"; break;
            case "Attract": effect = "attract"; break;
            case "Bide": effect = "bide"; break;
            case "confusion":
            {
                const confEvent =
                {
                    type: "activateStatusEffect", monRef, start,
                    effect: "confusion"
                } as const;
                if (event.fatigue)
                {
                    driverEvents = [{type: "fatigue", monRef}, confEvent];
                }
                else driverEvents = [confEvent];
                break;
            }
            case "Curse": effect = "curse"; break;
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
            case "Embargo": effect = "embargo"; break;
            case "Encore": effect = "encore"; break;
            case "Focus Energy": effect = "focusEnergy"; break;
            case "Foresight": effect = "foresight"; break;
            case "Heal Block": effect = "healBlock"; break;
            case "Imprison": effect = "imprison"; break;
            case "Ingrain": effect = "ingrain"; break;
            case "Leech Seed": effect = "leechSeed"; break;
            case "Magnet Rise": effect = "magnetRise"; break;
            case "Miracle Eye": effect = "miracleEye"; break;
            case "Mud Sport": effect = "mudSport"; break;
            case "Nightmare": effect = "nightmare"; break;
            case "Power Trick": effect = "powerTrick"; break;
            case "Slow Start": effect = "slowStart"; break;
            case "Substitute": effect = "substitute"; break;
            case "Taunt": effect = "taunt"; break;
            case "Torment": effect = "torment"; break;
            case "Uproar":
                if (event.type === "-start" &&
                    event.otherArgs[0] === "[upkeep]")
                {
                    driverEvents =
                    [{
                        type: "updateStatusEffect", monRef, effect: "uproar"
                    }];
                }
                else effect = "uproar";
                break;
            case "Water Sport": effect = "waterSport"; break;
            case "Yawn": effect = "yawn"; break;
            default:
            {
                const move = toIdName(ev);
                // istanbul ignore else: not useful to test
                if (dex.isFutureMove(move)) effect = move;
                else
                {
                    this.logger.debug(
                        `Ignoring trivial status '${event.volatile}'`);
                }
            }
        }

        if (!driverEvents)
        {
            if (!effect) driverEvents = [];
            else
            {
                driverEvents =
                    [{type: "activateStatusEffect", monRef, effect, start}];
            }
        }
        return {result: driverEvents, remaining: it};
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
