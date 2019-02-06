import { AnyBattleEvent, Cause, MoveEvent, SwitchEvent } from
    "../dispatcher/BattleEvent";
import { BattleEventListener } from "../dispatcher/BattleEventListener";
import { BattleInitMessage, RequestMessage } from "../dispatcher/Message";
import { isPlayerId, otherId, PlayerID, PokemonDetails, PokemonID,
    PokemonStatus } from "../helpers";
import * as logger from "../logger";
import { dex } from "./dex/dex";
import { Type } from "./dex/dex-types";
import { BattleState } from "./state/BattleState";
import { Pokemon } from "./state/Pokemon";
import { Side } from "./state/Side";
import { SwitchInOptions, Team } from "./state/Team";

export interface EventProcessorConstructor<T extends EventProcessor>
{
    new(username: string): T;
}

/** Modifies the BattleState by listening to game events. */
export class EventProcessor
{
    /** Whether a turn message was encountered in the last handleEvents call. */
    public get newTurn(): boolean
    {
        return this._newTurn;
    }
    private _newTurn = false;

    /** Whether the battle is still going on. */
    public get battling(): boolean
    {
        return this._battling;
    }
    private _battling = false;

    /** Tracks the currently known state of the battle. */
    protected readonly state = new BattleState();
    /** Manages callbacks related to BattleEvents. */
    protected readonly listener = new BattleEventListener();
    /** Client's username. */
    protected readonly username: string;
    /**
     * Determines which PlayerID (p1 or p2) corresponds to which Side (us or
     * them).
     */
    private sides: {readonly [ID in PlayerID]: Side};

    /**
     * Creates an EventProcessor object.
     * @param username Username of the client.
     */
    constructor(username: string)
    {
        this.username = username;

        this.listener
        .on("ability", event =>
        {
            this.getActive(event.id.owner).baseAbility = event.ability;
        })
        .on("start", event =>
        {
            if (event.volatile === "confusion")
            {
                // start/upkeep or end confusion status
                this.getActive(event.id.owner).volatile.confuse(true);
            }
            else if (event.volatile === "Disable")
            {
                // disable a move
                const active = this.getActive(event.id.owner);
                const moveId = EventProcessor.parseIDName(event.otherArgs[0]);
                active.disableMove(moveId);
            }
        })
        .on("activate", event =>
        {
            if (event.volatile === "confusion")
            {
                this.getActive(event.id.owner).volatile.confuse(true);
            }
            else if (event.volatile === "Mat Block" ||
                EventProcessor.isStallSingleTurn(event.volatile))
            {
                // user successfully stalled an attack
                // locked moves get canceled if they don't succeed
                this.getActive(otherId(event.id.owner)).volatile
                    .lockedMove = false;
            }
        })
        .on("end", event =>
        {
            if (event.volatile === "confusion")
            {
                this.getActive(event.id.owner).volatile.confuse(false);
            }
            else
            {
                // istanbul ignore else: hard to reproduce and check
                if (event.volatile === "move: Disable")
                {
                    // clear disabled status
                    this.getActive(event.id.owner).volatile.enableMoves();
                }
            }
        })
        .on("boost", event =>
        {
            this.getActive(event.id.owner).volatile
                .boost(event.stat, event.amount);
        })
        .on("cant", event =>
        {
            if (event.reason === "recharge")
            {
                // successfully completed its recharge turn
                this.getActive(event.id.owner).volatile.mustRecharge =
                    false;
            }
            if (event.moveName)
            {
                const moveId =
                    EventProcessor.parseIDName(event.moveName);
                // prevented from using a move, which might not have
                //  been revealed before
                this.getActive(event.id.owner).revealMove(moveId);
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
        .on("singleturn", event =>
        {
            // istanbul ignore else: hard to check else case
            if (EventProcessor.isStallSingleTurn(event.status))
            {
                // user successfully used a stalling move
                this.getActive(event.id.owner).volatile.stall(true);
            }
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
            this._newTurn = true;
        })
        .on("upkeep", () =>
        {
            // selfSwitch is the result of a move, which only occurs in
            //  the middle of all the turn's main events (args.events)
            // if the simulator ignored the fact that a selfSwitch move
            //  was used, then it would emit an upkeep
            this.state.teams.us.status.selfSwitch = false;
            this.state.teams.them.status.selfSwitch = false;
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
        logger.debug(`state:\n${this.state.toString()}`);
    }

    /**
     * Updates VolatileStatus turn counters. Must be called at the end of the
     * turn, after a Choice has been sent to the server.
     */
    public updateStatusTurns(): void
    {
        this.state.teams.us.active.volatile.updateStatusTurns();
        this.state.teams.them.active.volatile.updateStatusTurns();
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
            mon.baseAbility = data.baseAbility;
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
        for (let i = 0; i < events.length; ++i)
        {
            const event = events[i];

            // requires "as any" to get past the guarantee that the Message's
            //  type should match its properties
            this.listener.dispatch(event.type as any, event, events, i);

            // handle message suffixes
            // these message types don't have an id field, so there's not enough
            //  information to process any Causes
            // and anyways, they shouldn't have any meaningful ones on them
            if (event.cause && event.type !== "sethp" && event.type !== "tie" &&
                event.type !== "turn" && event.type !== "upkeep" &&
                event.type !== "win")
            {
                this.handleCause(this.getSide(event.id.owner), event.cause!);
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

    /**
     * Handles an event Cause.
     * @param side Side that it takes place.
     * @param cause Cause object.
     */
    private handleCause(side: Side, cause: Cause): void
    {
        switch (cause.type)
        {
            case "fatigue":
                // no longer locked into a move
                this.state.teams[side].active.volatile.lockedMove = false;
                break;
            case "item":
                // reveal item
                this.state.teams[side].active.item = cause.item;
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
        const moveId = EventProcessor.parseIDName(event.moveName);

        // struggle is only used when there are no moves left
        if (moveId === "struggle") return;

        const pp =
            // locked moves don't consume pp
            (event.cause && event.cause.type === "lockedmove") ? 0
            // pressure ability doubles pp usage if opponent is targeted
            : (this.getActive(otherId(event.id.owner)).baseAbility ===
                    "pressure" && event.targetId.owner !== event.id.owner) ? 2
            // but normally use 1 pp
            : 1;
        mon.useMove(moveId, pp);

        const move = dex.moves[moveId];

        // TODO: what if it's interrupted?
        if (move.volatileEffect === "lockedmove")
        {
            mon.volatile.lockedMove = true;
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