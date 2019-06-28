import { dex, isFutureMove } from "../battle/dex/dex";
import { BoostName, boostNames, Type } from "../battle/dex/dex-util";
import { BattleState } from "../battle/state/BattleState";
import { Pokemon } from "../battle/state/Pokemon";
import { otherSide, Side } from "../battle/state/Side";
import { SwitchInOptions, Team } from "../battle/state/Team";
import { Logger } from "../Logger";
import { AnyBattleEvent, From, SideEndEvent, SideStartEvent } from
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
        .on("ability", event =>
        {
            const active = this.getActive(event.id.owner);
            if (event.from && event.from.type === "ability" &&
                event.from.ability === "Trace" && event.of)
            {
                // trace ability: event.ability contains the Traced ability,
                //  event.of contains pokemon that was traced, event.id contains
                //  the pokemon with Trace
                // initialize baseAbility if not already
                active.ability = "trace";
                this.getActive(event.of.owner).ability =
                    toIdName(event.ability);
            }
            // now that trace has activated, it will be overridden by the
            //  opponent's ability
            active.ability = toIdName(event.ability);
        })
        .on("endability", event =>
        {
            // NOTE: may be replaced with "|-start|PokemonID|Gastro Acid" later
            this.getActive(event.id.owner).volatile.suppressAbility();
        })
        .on("start", event =>
        {
            const active = this.getActive(event.id.owner);

            let ev = event.volatile;
            if (ev.startsWith("move: ")) ev = ev.substr("move: ".length);

            switch (ev)
            {
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
                case "typeadd":
                    // set added type
                    active.addType(event.otherArgs[0].toLowerCase() as Type);
                    break;
                case "typechange":
                {
                    // set types
                    let types: Type[];

                    if (event.otherArgs[0])
                    {
                        types = event.otherArgs[0].split("/")
                            .map(type => type.toLowerCase()) as Type[];

                        // make sure length is 2
                        if (types.length > 2)
                        {
                            this.logger.error(
                                `Too many types given (${types.join(", ")})`);
                            types.splice(2);
                        }
                        else if (types.length === 1) types.push("???");
                    }
                    else types = ["???", "???"];

                    active.changeType(types as [Type, Type]);
                    break;
                }
                case "Ingrain":
                    active.volatile.ingrain = true;
                    break;
                case "Magnet Rise":
                    active.volatile.magnetRise.start();
                    break;
                case "Embargo":
                    active.volatile.embargo.start();
                    break;
                case "Taunt":
                    active.volatile.taunt.start();
                    break;
                case "Substitute":
                    active.volatile.substitute = true;
                    break;
                case "Slow Start":
                    active.volatile.slowStart.start();
                    break;
                default:
                {
                    const moveId = toIdName(ev);
                    // istanbul ignore else: not useful to test
                    if (isFutureMove(moveId))
                    {
                        active.team!.status.startFutureMove(moveId);
                    }
                    else
                    {
                        this.logger.debug(`Ignoring start "${event.volatile}"`);
                    }
                }
            }
        })
        .on("activate", event =>
        {
            if (event.volatile === "confusion")
            {
                this.getActive(event.id.owner).volatile.confusion.tick();
            }
            else if (event.volatile === "Mat Block" ||
                PSEventHandler.isStallSingleTurn(event.volatile))
            {
                // user successfully stalled an attack
                // locked moves get canceled if they don't succeed
                this.getActive(otherPlayerID(event.id.owner)).volatile
                    .lockedMove.end();
            }
            else this.logger.debug(`Ignoring activate "${event.volatile}"`);
        })
        .on("end", event =>
        {
            const team = this.getTeam(event.id.owner);
            const v = team.active.volatile;

            let ev = event.volatile;
            if (ev.startsWith("move: ")) ev = ev.substr("move: ".length);
            const id = toIdName(ev);

            if (ev === "confusion") v.confusion.end();
            else if (ev === "Disable") v.enableMoves();
            else if (ev === "Ingrain") v.ingrain = false;
            else if (ev === "Magnet Rise") v.magnetRise.end();
            else if (ev === "Embargo") v.embargo.end();
            else if (ev === "Taunt") v.taunt.end();
            else if (ev === "Substitute") v.substitute = false;
            else if (ev === "Slow Start") v.slowStart.end();
            else if (isFutureMove(id)) team.status.endFutureMove(id);
            else this.logger.debug(`Ignoring end "${event.volatile}"`);
        })
        .on("boost", event =>
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
            else if (event.reason.startsWith("ability: "))
            {
                // can't move due to an ability
                const ability = toIdName(
                    event.reason.substr("ability: ".length));
                active.ability = ability;

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
        .on("clearallboost", () =>
            (Object.keys(boostNames) as BoostName[]).forEach(stat =>
            {
                this.state.teams.us.active.volatile.boosts[stat] = 0;
                this.state.teams.them.active.volatile.boosts[stat] = 0;
            }))
        .on("clearnegativeboost", () =>
            (Object.keys(boostNames) as BoostName[]).forEach(stat =>
                (["us", "them"] as Side[]).forEach(side =>
                {
                    const boosts =
                        this.state.teams[side].active.volatile.boosts;
                    if (boosts[stat] < 0) boosts[stat] = 0;
                })))
        .on("clearpositiveboost", () =>
            (Object.keys(boostNames) as BoostName[]).forEach(stat =>
                (["us", "them"] as Side[]).forEach(side =>
                {
                    const boosts =
                        this.state.teams[side].active.volatile.boosts;
                    if (boosts[stat] > 0) boosts[stat] = 0;
                })))
        .on("copyboost", event =>
        {
            const source = this.getActive(event.source.owner).volatile.boosts;
            const target = this.getActive(event.target.owner).volatile.boosts;
            for (const stat of Object.keys(boostNames) as BoostName[])
            {
                source[stat] = target[stat];
            }
        })
        .on("curestatus", event => this.getActive(event.id.owner).cure())
        .on("cureteam", event => this.getTeam(event.id.owner).cure())
        .on("damage", event =>
        {
            this.setHP(event.id, event.status);
        })
        .on("detailschange", event =>
        {
            const active = this.getActive(event.id.owner);
            active.setSpecies(event.details.species);

            // set other details just in case
            active.level = event.details.level;
            active.gender = event.details.gender;
            active.hp.set(event.status.hp, event.status.hpMax);
            active.majorStatus = event.status.condition;
        })
        .on("faint", event =>
        {
            this.getActive(event.id.owner).faint();
        })
        .on("fieldend", event =>
        {
            if (event.effect === "move: Gravity")
            {
                this.state.status.gravity = false;
            }
        })
        .on("fieldstart", event =>
        {
            if (event.effect === "move: Gravity")
            {
                this.state.status.gravity = true;
            }
        })
        .on("formechange", event =>
        {
            // TODO: set other details?
            this.getActive(event.id.owner).volatile.overrideSpecies =
                event.details.species;
        })
        .on("invertboost", event =>
        {
            const boosts = this.getActive(event.id.owner).volatile.boosts;
            for (const stat of Object.keys(boostNames) as BoostName[])
            {
                boosts[stat] = -boosts[stat];
            }
        })
        .on("move", event =>
        {
            const moveId = toIdName(event.moveName);
            const mon = this.getActive(event.id.owner);
            mon.useMove(moveId, this.getTargets(moveId, mon),
                // don't consume pp if locked into using the move
                /*nopp*/ event.from && event.from.type === "lockedmove");
        })
        .on("mustrecharge", event =>
        {
            this.getActive(event.id.owner).volatile.mustRecharge = true;
        })
        .on("prepare", event =>
        {
            // moveName should be one of the two-turn moves being
            //  prepared
            this.getActive(event.id.owner).volatile.twoTurn =
                toIdName(event.moveName) as any;
        })
        .on("setboost", event =>
        {
            this.getActive(event.id.owner).volatile.boosts[event.stat] =
                event.amount;
        })
        .on("sethp", event =>
        {
            for (const pair of event.newHPs) this.setHP(pair.id, pair.status);
        })
        .on("sideend", event => this.handleSideCondition(event))
        .on("sidestart", event => this.handleSideCondition(event))
        .on("singleturn", event =>
        {
            const v = this.getActive(event.id.owner).volatile;
            if (PSEventHandler.isStallSingleTurn(event.status)) v.stall(true);
            else if (event.status === "move: Roost") v.roost = true;
        })
        .on("status", event =>
        {
            this.getActive(event.id.owner).majorStatus =
                event.majorStatus;
        })
        .on("swapboost", event =>
        {
            const source = this.getActive(event.source.owner).volatile.boosts;
            const target = this.getActive(event.target.owner).volatile.boosts;
            for (const stat of event.stats)
            {
                [source[stat], target[stat]] = [target[stat], source[stat]];
            }
        })
        .on("switch", event =>
        {
            const team = this.getTeam(event.id.owner);

            // consume pending copyvolatile status flags
            const options: SwitchInOptions =
                {copyVolatile: team.status.selfSwitch === "copyvolatile"};
            team.status.selfSwitch = false;

            team.switchIn(event.details.species, event.details.level,
                event.details.gender, event.status.hp, event.status.hpMax,
                options);
        })
        .on("tie", () => { this._battling = false; })
        .on("win", () => { this._battling = false; })
        .on("turn", () => { this.newTurn = true; })
        .on("unboost", event =>
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
        .on("weather", (event, events, i) =>
        {
            const weather = this.state.status.weather;
            if (event.weatherType === "none") weather.reset();
            else if (event.upkeep) weather.upkeep(event.weatherType);
            else if (event.from && event.from.type === "ability" &&
                event.of)
            {
                weather.set(event.weatherType,
                    this.getActive(event.of.owner), /*ability*/true);
            }
            else
            {
                const lastEvent = events[i - 1];
                if (lastEvent)
                {
                    if (lastEvent.type === "move")
                    {
                        // caused by a move
                        const source = this.getActive(lastEvent.id.owner);
                        weather.set(event.weatherType, source);
                    }
                    else
                    {
                        // if switched in, only an ability would activate, which
                        //  was already handled earlier, so there would be no
                        //  other way to cause the weather effect
                        // istanbul ignore next: should never happen
                        if (lastEvent.type !== "switch")
                        {
                            this.logger.error(
                                "Don't know how weather was caused");
                        }
                    }
                }
                // same as above here
                // istanbul ignore next: should never happen
                else this.logger.error("Don't know how weather was caused");
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
            mon.item.narrow(data.item);
            mon.ability = data.baseAbility;
            mon.majorStatus = status.condition;

            // set active status
            if (data.active) mon.switchIn();
            else mon.switchOut();

            for (const moveId of data.moves) mon.moveset.reveal(moveId);
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
        if (event.type === "ability" && event.from &&
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
        if (event.fatigue) mon.volatile.lockedMove.end();
        // something happened because of an item or ability
        if (event.from)
        {
            const f = event.from;
            if (f.type === "ability") mon.ability = toIdName(f.ability);
            else if (f.type === "item")
            {
                mon.item.narrow(toIdName(f.item));
            }
        }
    }

    /**
     * Sets the HP of a pokemon.
     * @param id Pokemon's ID.
     * @param status New HP/status.
     * @virtual
     */
    protected setHP(id: PokemonID, status: PokemonStatus): void
    {
        const mon = this.getActive(id.owner);
        mon.hp.set(status.hp, status.hpMax);
        // this should already be covered by the `status` event but just in case
        mon.majorStatus = status.condition;
    }

    /** Handles a side end/start event. */
    private handleSideCondition(event: SideEndEvent | SideStartEvent): void
    {
        let condition = event.condition;
        if (condition.startsWith("move: "))
        {
            condition = condition.substr("move: ".length);
        }
        const team = this.getTeam(event.id).status;
        switch (condition)
        {
            case "Spikes":
                if (event.type === "sidestart") ++team.spikes;
                else team.spikes = 0;
                break;
            case "Stealth Rock":
                if (event.type === "sidestart") ++team.stealthRock;
                else team.stealthRock = 0;
                break;
            case "Toxic Spikes":
                if (event.type === "sidestart") ++team.toxicSpikes;
                else team.toxicSpikes = 0;
                break;
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
