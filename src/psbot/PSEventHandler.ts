import { dex, isFutureMove } from "../battle/dex/dex";
import { BoostName, boostNames, StatExceptHP, Type } from
    "../battle/dex/dex-util";
import { BattleState } from "../battle/state/BattleState";
import { Pokemon } from "../battle/state/Pokemon";
import { otherSide, Side } from "../battle/state/Side";
import { SwitchInOptions, Team } from "../battle/state/Team";
import { Logger } from "../Logger";
import { AnyBattleEvent, DamageEvent, DragEvent, FieldEndEvent, FieldStartEvent,
    HealEvent, SetHPEvent, SideEndEvent, SideStartEvent, SwitchEvent } from
    "./dispatcher/BattleEvent";
import { BattleEventListener } from "./dispatcher/BattleEventListener";
import { BattleInitMessage, RequestMessage } from "./dispatcher/Message";
import { isPlayerID, otherPlayerID, PlayerID, PokemonDetails, PokemonID,
    PokemonStatus, toIdName } from "./helpers";

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
    /** Manages callbacks related to BattleEvents. */
    protected readonly listener = new BattleEventListener();
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

        this.listener
        .on("-ability", event =>
        {
            const active = this.getActive(event.id.owner);
            const ability = toIdName(event.ability);
            if (event.from && event.from.type === "ability" &&
                event.from.ability === "Trace" && event.of)
            {
                // trace ability: event.ability contains the Traced ability,
                //  event.of contains pokemon that was traced, event.id contains
                //  the pokemon with Trace

                // first indicate that trace was revealed, then override after
                active.traits.ability.narrow("trace");
                // infer opponent's ability due to trace effect
                this.getActive(event.of.owner).traits.setAbility(ability);
            }

            // override current ability with the new one
            active.traits.setAbility(ability);
        })
        .on("-endability", event =>
        {
            // transform event was already taken care of, no need to handle
            //  this message
            // TODO: could this still be used to infer base ability?
            // typically this is never revealed this way in actual cartridge
            //  play, so best to leave it for now to preserve fairness
            if (event.from && event.from.type === "move" &&
                event.from.move === "Transform")
            {
                return;
            }

            const active = this.getActive(event.id.owner);
            // infer what the ability was previously
            active.traits.setAbility(toIdName(event.ability));

            // NOTE: may be replaced with "|-start|PokemonID|Gastro Acid" later
            active.volatile.gastroAcid = true;
        })
        .on("-start", event =>
        {
            const active = this.getActive(event.id.owner);

            let ev = event.volatile;
            if (ev.startsWith("move: ")) ev = ev.substr("move: ".length);

            switch (ev)
            {
                case "Aqua Ring":
                    active.volatile.aquaRing = true;
                    break;
                case "Attract":
                    active.volatile.attracted = true;
                    break;
                case "Bide":
                    active.volatile.bide.start();
                    break;
                case "confusion":
                    // start confusion status
                    active.volatile.confusion.start();
                    break;
                case "Disable":
                {
                    // disable a move
                    const moveId = toIdName(event.otherArgs[0]);
                    active.disableMove(moveId);
                    break;
                }
                case "Encore":
                    active.volatile.encore.start();
                    break;
                case "Focus Energy":
                    active.volatile.focusEnergy = true;
                    break;
                case "Foresight":
                    active.volatile.identified = "foresight";
                    break;
                case "Ingrain":
                    active.volatile.ingrain = true;
                    break;
                case "Leech Seed":
                    active.volatile.leechSeed = true;
                    break;
                case "Magnet Rise":
                    active.volatile.magnetRise.start();
                    break;
                case "Miracle Eye":
                    active.volatile.identified = "miracleeye";
                    break;
                case "Embargo":
                    active.volatile.embargo.start();
                    break;
                case "Substitute":
                    active.volatile.substitute = true;
                    break;
                case "Slow Start":
                    active.volatile.slowStart.start();
                    break;
                case "Taunt":
                    active.volatile.taunt.start();
                    break;
                case "Torment":
                    active.volatile.torment = true;
                    break;
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
                        else if (parsedTypes.length === 1)
                        {
                            parsedTypes.push("???");
                        }
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
        })
        .on("-activate", (event, events, i) =>
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
            else this.logger.debug(`Ignoring activate '${event.volatile}'`);
        })
        .on("-end", event =>
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
        })
        .on("-boost", event =>
        {
            this.getActive(event.id.owner).volatile.boosts[event.stat] +=
                event.amount;
        })
        .on("cant", event =>
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
        })
        .on("-clearallboost", () =>
            (Object.keys(boostNames) as BoostName[]).forEach(stat =>
            {
                this.state.teams.us.active.volatile.boosts[stat] = 0;
                this.state.teams.them.active.volatile.boosts[stat] = 0;
            }))
        .on("-clearnegativeboost", () =>
            (Object.keys(boostNames) as BoostName[]).forEach(stat =>
                (["us", "them"] as Side[]).forEach(side =>
                {
                    const boosts =
                        this.state.teams[side].active.volatile.boosts;
                    if (boosts[stat] < 0) boosts[stat] = 0;
                })))
        .on("-clearpositiveboost", () =>
            (Object.keys(boostNames) as BoostName[]).forEach(stat =>
                (["us", "them"] as Side[]).forEach(side =>
                {
                    const boosts =
                        this.state.teams[side].active.volatile.boosts;
                    if (boosts[stat] > 0) boosts[stat] = 0;
                })))
        .on("-copyboost", event =>
            this.getActive(event.source.owner).volatile.copyBoostsFrom(
                this.getActive(event.target.owner).volatile))
        .on("-curestatus", event =>
        {
            const active = this.getActive(event.id.owner);
            const status = active.majorStatus;
            status.assert(event.majorStatus);
            if (status.current === "slp" && status.turns === 1)
            {
                // cured in 0 turns, must have early bird ability
                active.traits.setAbility("earlybird");
            }
            status.cure();
        })
        .on("-cureteam", event => this.getTeam(event.id.owner).cure())
        .on("-damage", event => this.handleDamage(event))
        .on("detailschange", event =>
        {
            // permanent form change
            const active = this.getActive(event.id.owner);
            active.formChange(event.details.species, /*perm*/true);

            // set other details just in case
            active.traits.stats.level = event.details.level;
            active.gender = event.details.gender;
            active.hp.set(event.status.hp, event.status.hpMax);
        })
        .on("drag", event => this.handleSwitch(event))
        .on("faint", event => { this.getActive(event.id.owner).faint(); })
        .on("-fieldend", event => this.handleFieldCondition(event))
        .on("-fieldstart", event => this.handleFieldCondition(event))
        .on("-formechange", event =>
        {
            if (!dex.pokemon.hasOwnProperty(event.details.species))
            {
                throw new Error(`Unknown species '${event.details.species}'`);
            }
            // TODO: set other details?
            this.getActive(event.id.owner).formChange(event.details.species);
        })
        .on("-heal", event => this.handleDamage(event))
        .on("-invertboost", event =>
        {
            const boosts = this.getActive(event.id.owner).volatile.boosts;
            for (const stat of Object.keys(boostNames) as BoostName[])
            {
                boosts[stat] = -boosts[stat];
            }
        })
        .on("-item", event =>
        {
            const mon = this.getActive(event.id.owner);
            mon.setItem(toIdName(event.item),
                // see if the item was just gained
                !!event.from && event.from.type === "move" &&
                ["Thief", "Covet", "Trick", "Switcheroo", "Recycle"]
                    .includes(event.from.move));
        })
        .on("-enditem", event =>
        {
            const mon = this.getActive(event.id.owner);

            // handle causes
            let consumed: string | undefined;
            if (!event.from || event.from.type !== "move" ||
                // knockoff and transfer moves don't consume items but rather
                //  disable or remove them
                !["Knock Off", "Thief", "Covet", "Trick", "Switcheroo"]
                    .includes(event.from.move))
            {
                // other causes are exempt
                consumed = toIdName(event.item);
            }

            mon.removeItem(consumed);
        })
        .on("move", (event, events, i) =>
        {
            const moveId = toIdName(event.moveName);
            const mon = this.getActive(event.id.owner);
            const targets = this.getTargets(moveId, mon);

            let unsuccessful: "failed" | "evaded" | undefined;
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
            }

            // don't consume pp if locked into using the move
            const nopp = event.from && event.from.type === "lockedmove";

            mon.useMove({moveId, targets, unsuccessful, nopp});
        })
        .on("-mustrecharge", event =>
        {
            this.getActive(event.id.owner).volatile.mustRecharge = true;
        })
        .on("-prepare", event =>
        {
            // moveName should be one of the two-turn moves being
            //  prepared
            this.getActive(event.id.owner).volatile.twoTurn.start(
                    toIdName(event.moveName) as any);
        })
        .on("-setboost", event =>
        {
            this.getActive(event.id.owner).volatile.boosts[event.stat] =
                event.amount;
        })
        .on("-sethp", event => this.handleDamage(event))
        .on("-sideend", (event, events, i) =>
            this.handleSideCondition(event, events, i))
        .on("-sidestart", (event, events, i) =>
            this.handleSideCondition(event, events, i))
        .on("-singleturn", event =>
        {
            const v = this.getActive(event.id.owner).volatile;
            if (PSEventHandler.isStallSingleTurn(event.status)) v.stall(true);
            else if (event.status === "move: Roost") v.roost = true;
        })
        .on("-status", event =>
        {
            this.getActive(event.id.owner).majorStatus.afflict(
                    event.majorStatus);
        })
        .on("-swapboost", event =>
        {
            const source = this.getActive(event.source.owner).volatile.boosts;
            const target = this.getActive(event.target.owner).volatile.boosts;
            for (const stat of event.stats)
            {
                [source[stat], target[stat]] = [target[stat], source[stat]];
            }
        })
        .on("switch", event => this.handleSwitch(event))
        .on("tie", () => { this._battling = false; })
        .on("win", () => { this._battling = false; })
        .on("-transform", event =>
        {
            const source = this.getActive(event.source.owner);
            const target = this.getActive(event.target.owner);

            source.transform(target);

            // use lastRequest to infer more details
            if (!this.lastRequest || !this.lastRequest.active) return;
            // transform reverts after fainting but not after being forced to
            //  choose a switch-in without fainting
            if (this.lastRequest.forceSwitch &&
                this.lastRequest.side.pokemon[0].condition.hp === 0) return;
            // if species don't match, must've been dragged out before we could
            //  infer any other features
            if (this.lastRequest.side.pokemon[0].details.species !==
                source.species) return;

            source.transformPost(this.lastRequest.active[0].moves,
                this.lastRequest.side.pokemon[0].stats);
        })
        .on("turn", () => { this.newTurn = true; })
        .on("-unboost", event =>
        {
            this.getActive(event.id.owner).volatile.boosts[event.stat] -=
                event.amount;
        })
        .on("upkeep", () =>
        {
            // selfSwitch is the result of a move, which only occurs in
            //  the middle of all the turn's main events (args.events)
            // if the simulator ignored the fact that a selfSwitch move
            //  was used, then it would emit an upkeep event
            this.state.teams.us.status.selfSwitch = false;
            this.state.teams.them.status.selfSwitch = false;
        })
        .on("-weather", (event, events, i) =>
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
            else if (event.from && event.from.type === "ability" &&
                event.of)
            {
                // gen<=4: ability-caused weather is infinite
                weather.start(this.getActive(event.of.owner),
                    event.weatherType, /*infinite*/true);
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
        });
    }

    // istanbul ignore next: unstable, hard to verify
    /** Prints the state to the logger. */
    public printState(): void
    {
        this.logger.debug(`State:\n${this.state.toString()}`);
    }

    /** Processes a `request` message. */
    public handleRequest(args: RequestMessage): void
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
            const details: PokemonDetails = data.details;
            const status: PokemonStatus = data.condition;

            // initial revealed pokemon can't be null, since we already
            //  set the teamsize
            const mon = team.reveal(details.species, details.level,
                    details.gender, status.hp, status.hpMax)!;
            for (const stat in data.stats)
            {
                // istanbul ignore if
                if (!data.stats.hasOwnProperty(stat)) continue;
                mon.traits.stats[stat as StatExceptHP]
                    .set(data.stats[stat as StatExceptHP]);
            }
            mon.traits.stats.hp.set(status.hpMax);
            mon.setItem(data.item);
            mon.traits.setAbility(data.baseAbility);
            mon.majorStatus.assert(status.condition);

            // set active status
            if (data.active) mon.switchIn();
            else mon.switchOut();

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

    /** Initializes the battle conditions. */
    public initBattle(args: BattleInitMessage): void
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

            // requires "as any" to get past the guarantee that the Message's
            //  type should match its properties
            this.listener.dispatch(event.type as any, event, events, i);

            this.handleSuffixes(event);
        }

        // update per-turn statuses
        if (this.newTurn) this.state.postTurn();
    }

    private handleSuffixes(event: AnyBattleEvent): void
    {
        // these corner cases should already be handled
        if (event.type === "-ability" && event.from &&
            event.from.type === "ability" &&
            event.from.ability === "Trace" && event.of)
        {
            return;
        }
        if (event.from && event.from.type === "lockedmove") return;

        let id: PokemonID | undefined;
        if (event.of) id = event.of;
        // TODO: find a better way to handle suffixes that reveal info
        // if no [of] suffix, try find a PokemonID from the event
        else if ((event as any).id &&
            ["p1", "p2"].includes((event as any).id.owner))
        {
            id = (event as any).id;
        }
        if (!id)
        {
            if (event.fatigue || event.from)
            {
                throw new Error("No PokemonID given to handle suffixes with");
            }
            return;
        }
        const mon = this.getActive(id.owner);

        // stopped using multi-turn locked move due to fatigue
        if (event.fatigue) mon.volatile.lockedMove.reset();
        // something happened because of an item or ability
        if (event.from)
        {
            const f = event.from;
            if (f.type === "ability")
            {
                mon.traits.setAbility(toIdName(f.ability));
            }
            else if (f.type === "item") mon.setItem(toIdName(f.item));
        }
    }

    /** Handles a damage/heal event. */
    private handleDamage(event: DamageEvent | HealEvent | SetHPEvent): void
    {
        const active = this.getActive(event.id.owner);
        active.hp.set(event.status.hp, event.status.hpMax);

        // increment toxic turns if taking damage from it
        if (event.from && event.from.type === "psn" &&
            active.majorStatus.current === "tox")
        {
            active.majorStatus.tick();
        }
    }

    /** Handles a side end/start event. */
    private handleSideCondition(event: SideEndEvent | SideStartEvent,
        events: AnyBattleEvent[], i: number): void
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

    /** Handles a field end/start event. */
    private handleFieldCondition(event: FieldEndEvent | FieldStartEvent): void
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

    /** Handles a drag/switch event. */
    private handleSwitch(event: DragEvent | SwitchEvent): void
    {
        const team = this.getTeam(event.id.owner);

        // consume pending copyvolatile status flags
        const options: SwitchInOptions =
            {copyVolatile: team.status.selfSwitch === "copyvolatile"};
        team.status.selfSwitch = false;

        team.switchIn(event.details.species, event.details.level,
            event.details.gender, event.status.hp, event.status.hpMax, options);
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
