import { dex } from "../battle/dex/dex";
import { Type } from "../battle/dex/dex-types";
import { BattleState } from "../battle/state/BattleState";
import { Pokemon } from "../battle/state/Pokemon";
import { Side } from "../battle/state/Side";
import { SwitchInOptions, Team } from "../battle/state/Team";
import { Logger } from "../Logger";
import { AnyBattleEvent, Cause, MoveEvent, SideEndEvent, SideStartEvent,
    SwitchEvent } from "./dispatcher/BattleEvent";
import { BattleEventListener } from "./dispatcher/BattleEventListener";
import { BattleInitMessage, RequestMessage } from "./dispatcher/Message";
import { isPlayerId, otherId, PlayerID, PokemonDetails, PokemonID,
    PokemonStatus } from "./helpers";

/** Modifies the BattleState by listening to game events. */
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
    private sides: {readonly [ID in PlayerID]: Side};
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
            if (event.cause && event.cause.type === "ability" &&
                event.cause.ability === "Trace")
            {
                // trace ability: event.ability contains traced ability,
                //  event.cause.of contains pokemon that was traced,
                // initialize baseAbility if not already
                active.ability = "Trace";
                this.getActive(event.cause.of!.owner).ability = event.ability;
            }

            active.ability = event.ability;
        })
        .on("endability", event =>
        {
            // NOTE: may be replaced with "|-start|PokemonID|Gastro Acid" later
            this.getActive(event.id.owner).volatile.suppressAbility();
        })
        .on("start", event =>
        {
            const active = this.getActive(event.id.owner);
            switch (event.volatile)
            {
                case "confusion":
                    // start confusion status
                    active.volatile.confuse(true);
                    break;
                case "Disable":
                {
                    // disable a move
                    const moveId =
                        PSEventHandler.parseIDName(event.otherArgs[0]);
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
                case "move: Ingrain":
                    active.volatile.ingrain = true;
                    break;
                case "Magnet Rise":
                    active.volatile.magnetRise = true;
                    break;
                case "Embargo":
                    active.volatile.embargo = true;
                    break;
                default:
                    this.logger.debug(`Ignoring start "${event.volatile}"`);
            }
        })
        .on("activate", event =>
        {
            if (event.volatile === "confusion")
            {
                this.getActive(event.id.owner).volatile.confuse(true);
            }
            else if (event.volatile === "Mat Block" ||
                PSEventHandler.isStallSingleTurn(event.volatile))
            {
                // user successfully stalled an attack
                // locked moves get canceled if they don't succeed
                this.getActive(otherId(event.id.owner)).volatile
                    .lockedMove = false;
            }
            else this.logger.debug(`Ignoring activate "${event.volatile}"`);
        })
        .on("end", event =>
        {
            const v = this.getActive(event.id.owner).volatile;
            if (event.volatile === "confusion") v.confuse(false);
            else if (event.volatile === "move: Disable") v.enableMoves();
            else if (event.volatile === "move: Ingrain") v.ingrain = false;
            else if (event.volatile === "Magnet Rise") v.magnetRise = false;
            else if (event.volatile === "Embargo") v.embargo = false;
            else this.logger.debug(`Ignoring end "${event.volatile}"`);
        })
        .on("boost", event =>
        {
            this.getActive(event.id.owner).volatile
                .boost(event.stat, event.amount);
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
                const ability = event.reason.substr("ability: ".length);
                active.ability = ability;

                if (ability === "Truant")
                {
                    active.volatile.activateTruant();
                    // truant turn and recharge turn overlap
                    active.volatile.mustRecharge = false;
                }
            }

            if (event.moveName)
            {
                const moveId = PSEventHandler.parseIDName(event.moveName);
                // prevented from using a move, which might not have
                //  been revealed before
                active.revealMove(moveId);
            }
        })
        .on("curestatus", event =>
        {
            this.getActive(event.id.owner).majorStatus = "";
        })
        .on("cureteam", event =>
        {
            this.getTeam(event.id.owner).cure();
        })
        .on("damage", event =>
        {
            this.setHP(event.id, event.status);
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
        .on("move", event =>
        {
            this.handleMove(event);
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
                event.moveName as any;
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
        .on("switch", event =>
        {
            this.handleSwitch(event);
        })
        .on("tie", () =>
        {
            this._battling = false;
        })
        .on("win", () =>
        {
            this._battling = false;
        })
        .on("turn", () =>
        {
            this.newTurn = true;

            if (this.state.agent && this.state.agent.onTurn)
            {
                this.state.agent.onTurn();
            }
        })
        .on("upkeep", () =>
        {
            // selfSwitch is the result of a move, which only occurs in
            //  the middle of all the turn's main events (args.events)
            // if the simulator ignored the fact that a selfSwitch move
            //  was used, then it would emit an upkeep
            this.state.teams.us.status.selfSwitch = false;
            this.state.teams.them.status.selfSwitch = false;
        })
        .on("weather", (event, events, i) =>
        {
            const weather = this.state.status.weather;
            if (event.weatherType === "none") weather.reset();
            else if (event.upkeep) weather.upkeep(event.weatherType);
            else if (event.cause && event.cause.type === "ability" &&
                event.cause.of)
            {
                weather.set(event.weatherType,
                    this.getActive(event.cause.of.owner), /*ability*/true);
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
    /** Gets the state data in array form. */
    public getStateArray(): number[]
    {
        return this.state.toArray();
    }

    // istanbul ignore next: unstable, hard to verify
    /** Prints the state to the logger. */
    public printState(): void
    {
        this.logger.debug(`state:\n${this.state.toString()}`);
    }

    /** Called after a Choice has been sent to the server. */
    public postTurn(): void
    {
        // cleanup actions after a new turn
        if (!this.newTurn) return;
        for (const team of [this.state.teams.us, this.state.teams.them])
        {
            team.status.postTurn();
            team.active.volatile.postTurn();
        }
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
            mon.item = data.item;
            mon.ability = data.baseAbility;
            mon.majorStatus = status.condition;

            // set active status
            if (data.active) mon.switchIn();
            else mon.switchOut();

            for (const moveId of data.moves) mon.revealMove(moveId);
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
            this.sides = {[id]: "us", [otherId(id)]: "them"} as any;
            // we already know our team's size from the initial request
            //  message but not the other team
            this.state.teams.them.size = args.teamSizes[otherId(id)];
        }
        else
        {
            this.sides = {[id]: "them", [otherId(id)]: "us"} as any;
            this.state.teams.them.size = args.teamSizes[id];
        }
        this.handleEvents(args.events);
    }

    /**
     * Processes BattleEvents sent from the server to update the internal
     * BattleState.
     */
    public handleEvents(events: AnyBattleEvent[]): void
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

            // this corner case should be handled in the AbilityEvent handler
            if (event.type === "ability" && event.cause &&
                event.cause.type === "ability" &&
                event.cause.ability === "Trace")
            {
                continue;
            }

            // handle message suffixes
            // some messages don't have an id field, which should default to
            //  undefined here
            if (event.cause)
            {
                this.handleCause(event.cause!, (event as any).id);
            }
        }
    }

    /**
     * Called when the current active pokemon is trapped by an unknown ability.
     */
    public trapped(): void
    {
        const us = this.state.teams.us.active;
        const them = this.state.teams.them.active;

        // opposing pokemon can have only one of these abilities here
        const abilities: string[] = [];

        // arena trap traps grounded pokemon
        if (us.isGrounded) abilities.push("arenatrap");

        // magnet pull traps steel types
        if (us.types.includes("steel")) abilities.push("magnetpull");

        // shadow tag traps all pokemon who don't have it
        if (us.ability !== "shadowtag") abilities.push("shadowtag");

        // istanbul ignore else: not useful to test for this
        if (abilities.length > 0) them.narrowAbilities(abilities);
        else this.logger.error("Can't figure out why we're trapped");
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

    /**
     * Handles an event Cause.
     * @param cause Cause object.
     * @param id Last mentioned id.
     */
    private handleCause(cause: Cause, id?: PokemonID): void
    {
        // should already be handled by other handlers
        if (cause.type === "lockedmove") return;

        let mon: Pokemon | undefined;
        // some Causes have an of field which disambiguates where the Cause came
        //  from
        if (cause.of) mon = this.getActive(cause.of.owner);
        // otherwise, the most recently mentioned id should do
        else if (id) mon = this.getActive(id.owner);
        else throw new Error("handleCause not given PokemonID");

        switch (cause.type)
        {
            case "ability":
                // specify owner of the ability
                mon.ability = cause.ability;
                break;
            case "fatigue":
                // no longer locked into a move
                mon.volatile.lockedMove = false;
                break;
            case "item":
                // reveal item
                mon.item = cause.item;
                break;
        }
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
     * Handles a MoveEvent.
     * @param event Event to process.
     */
    private handleMove(event: MoveEvent): void
    {
        const mon = this.getActive(event.id.owner);
        const moveId = PSEventHandler.parseIDName(event.moveName);

        // struggle is only used when there are no moves left
        if (moveId === "struggle") return;

        const pp =
            // locked moves don't consume pp
            (event.cause && event.cause.type === "lockedmove") ? 0
            // pressure ability doubles pp usage if opponent is targeted
            : (this.getActive(otherId(event.id.owner)).ability ===
                    "pressure" && event.targetId.owner !== event.id.owner) ? 2
            // but normally use 1 pp
            : 1;
        mon.useMove(moveId, pp);

        const move = dex.moves[moveId];

        // set the lockedmove status
        // however, events that come after this that interrupt the move could
        //  cancel the effect
        if (move.volatileEffect === "lockedmove")
        {
            mon.volatile.lockedMove = true;
        }

        if (move.sideCondition === "wish")
        {
            this.getTeam(event.id.owner).status.wish();
        }

        // set selfswitch flag
        this.getTeam(event.id.owner).status.selfSwitch =
            move.selfSwitch || false;
    }

    /**
     * Handles a SwitchEvent.
     * @param event Event to process.
     */
    private handleSwitch(event: SwitchEvent): void
    {
        const team = this.getTeam(event.id.owner);

        // consume pending copyvolatile status flags
        const options: SwitchInOptions = {};
        options.copyVolatile = team.status.selfSwitch === "copyvolatile";
        team.status.selfSwitch = false;

        team.switchIn(event.details.species, event.details.level,
            event.details.gender, event.status.hp, event.status.hpMax, options);
    }

    // istanbul ignore next: trivial
    /**
     * Converts a display name to an id name.
     * @param name Name to convert.
     * @returns The resulting ID name.
     */
    protected static parseIDName(name: string): string
    {
        return name.toLowerCase().replace(/[ -]/g, "");
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
        if (isPlayerId(team)) team = this.getSide(team);
        return this.state.teams[team];
    }

    // istanbul ignore next: trivial
    /**
     * Gets a Side name.
     * @param id Corresponding PlayerID.
     */
    protected getSide(id: PlayerID): Side
    {
        return this.sides[id];
    }
}
