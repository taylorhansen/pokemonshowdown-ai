import * as readline from "readline";
import { inspect } from "util";
import { AnyMessageListener, RequestArgs } from "../AnyMessageListener";
import * as logger from "../logger";
import { BattleEvent, Cause, MoveEvent, otherId, PlayerID,
    PokemonDetails, PokemonID, PokemonStatus, RequestMove, SwitchEvent } from
    "../messageData";
import { Choice } from "./Choice";
import { dex } from "./dex/dex";
import { SelfSwitch, Type } from "./dex/dex-types";
import { BattleState } from "./state/BattleState";
import { Pokemon } from "./state/Pokemon";
import { Side } from "./state/Side";
import { SwitchInOptions, Team } from "./state/Team";

/**
 * Sends a Choice to the server.
 * @param choice Choice to send.
 */
export type ChoiceSender = (choice: Choice) => void;

/** Manages the battle state and the AI. */
export abstract class Battle
{
    /**
     * True if the AI model should always be saved at the end, or false if that
     * should happen if it wins.
     */
    public saveAlways = true;
    /** Tracks the currently known state of the battle. */
    protected readonly state = new BattleState();
    /** Client's username. */
    private readonly username: string;
    /** Used to send the AI's choice to the server. */
    private readonly sender: ChoiceSender;
    /**
     * Determines which PlayerID (p1 or p2) corresponds to which Side (us or
     * them).
     */
    private sides: {readonly [ID in PlayerID]: Side};
    /** Whether we're using a move that requires a switch choice. */
    private selfSwitch: SelfSwitch = false;
    /** Whether the opponent is using a move that requires a switch choice. */
    private themSelfSwitch: SelfSwitch = false;
    /** Args object from the last |request| message. */
    private lastRequest: RequestArgs;
    /** Whether the battle is still going. */
    private battling = false;

    /**
     * Creates a Battle object.
     * @param username Client's username.
     * @param listener Used to subscribe to server messages.
     * @param sender Used to send the AI's choice to the server.
     */
    constructor(username: string, listener: AnyMessageListener,
        sender: ChoiceSender)
    {
        this.username = username;
        this.sender = sender;

        listener
        .on("battleinit", args =>
        {
            logger.debug(`battleinit:
${inspect(args, {colors: true, depth: null})}`);

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
            args.events.forEach(event => this.handleEvent(event));

            logger.debug(`state:\n${this.state.toString()}`);
            return this.askAI();
        })
        .on("battleprogress", async args =>
        {
            logger.debug(`battleprogress:
${inspect(args, {colors: true, depth: null})}`);

            // event processing
            const stalling = {p1: false, p2: false};
            let newTurn = false;
            for (const event of args.events)
            {
                this.handleEvent(event);
                if (event.type === "singleturn")
                {
                    if (Battle.isStallSingleTurn(event.status))
                    {
                        stalling[event.id.owner] = true;
                    }
                }
                else if (event.type === "turn") newTurn = true;
            }

            // reset stall counter if the pokemon didn't use a stalling move
            //  this turn
            for (const id of Object.keys(stalling) as PlayerID[])
            {
                if (!stalling[id]) this.getActive(id).volatile.stall(false);
            }

            if (this.battling)
            {
                logger.debug(`state:\n${this.state.toString()}`);

                if (newTurn || this.selfSwitch || (!this.themSelfSwitch &&
                    this.state.teams.us.active.fainted))
                {
                    await this.askAI();
                }

                if (newTurn)
                {
                    // some statuses need to have their values updated every
                    //  turn in case the next turn doesn't override them
                    for (const side of ["us", "them"] as Side[])
                    {
                        this.state.teams[side].active.volatile
                            .updateStatusTurns();
                    }
                }
            }
        })
        .on("error", /* istanbul ignore next: uses stdin */ args =>
        {
            logger.error(args.reason);
            logger.debug("nn input failed, asking user for input");
            this.askUser();
        })
        .on("request", args =>
        {
            logger.debug(`request:
${inspect(args, {colors: true, depth: null})}`);
            // update the client's team data
            // generally, handling all the other types of messages should
            //  reproduce effectively the same team data as would be given to us
            //  by this message type if not more, so this should only be used
            //  for initializing the starting data for the client's team on the
            //  first turn

            const team = this.state.teams.us;

            // first time setup, initialize each of the client's pokemon
            if (!this.battling)
            {
                this.battling = true;

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

                    for (let moveId of data.moves)
                    {
                        if (moveId.startsWith("hiddenpower"))
                        {
                            // set hidden power type
                            // format: hiddenpower<type><base power if gen2-5>
                            mon.hpType = moveId.substr("hiddenpower".length)
                                .replace(/\d+/, "") as Type;
                            moveId = "hiddenpower";
                            // TODO: track this for opponent's pokemon
                        }
                        mon.revealMove(moveId);
                    }
                }
            }
            this.lastRequest = args;
        });
    }

    /**
     * Decides what to do next.
     * @param choices The set of possible choices that can be made.
     * @returns A Promise to compute the command to be sent, e.g. `move 1` or
     * `switch 3`.
     */
    protected abstract decide(choices: Choice[]): Promise<Choice>;

    /** Saves AI state to storage. */
    protected abstract save(): Promise<void>;

    /**
     * Handles a BattleEvent.
     * @param event Event to process.
     * @virtual
     */
    protected handleEvent(event: BattleEvent): void
    {
        switch (event.type)
        {
            case "ability":
                this.getActive(event.id.owner).baseAbility = event.ability;
                break;
            case "activate":
            case "end":
            case "start":
                if (event.volatile === "confusion")
                {
                    // start/upkeep or end confusion status
                    this.getActive(event.id.owner).volatile
                        .confuse(event.type !== "end");
                }
                else if ((event.volatile === "Mat Block" ||
                        Battle.isStallSingleTurn(event.volatile)) &&
                    event.type === "activate")
                {
                    // user successfully stalled an attack from the other side
                    // locked moves get canceled if they don't succeed
                    this.getActive(otherId(event.id.owner)).volatile
                        .lockedMove = false;
                }
                else if (event.volatile === "Disable" && event.type === "start")
                {
                    // disable a move
                    const active = this.getActive(event.id.owner);
                    const moveId = Battle.parseIDName(event.otherArgs[0]);
                    active.disableMove(moveId);
                }
                else if (event.volatile === "move: Disable" &&
                    event.type === "end")
                {
                    // clear disabled status
                    this.getActive(event.id.owner).volatile.enableMoves();
                }
                break;
            case "boost":
                this.getActive(event.id.owner).volatile
                    .boost(event.stat, event.amount);
                break;
            case "cant":
                if (event.reason === "recharge")
                {
                    // successfully completed its recharge turn
                    this.getActive(event.id.owner).volatile.mustRecharge =
                        false;
                }
                if (event.moveName)
                {
                    const moveId = Battle.parseIDName(event.moveName);
                    // prevented from using a move, which might not have been
                    //  revealed before
                    this.getActive(event.id.owner).revealMove(moveId);
                }
                break;
            case "curestatus":
                this.getActive(event.id.owner).majorStatus = "";
                break;
            case "cureteam":
                this.getTeam(event.id.owner).cure();
                break;
            case "damage":
            case "heal":
                this.setHP(event.id, event.status);
                break;
            case "faint":
                this.getActive(event.id.owner).faint();
                break;
            case "move":
                this.handleMove(event);
                break;
            case "mustrecharge":
                this.getActive(event.id.owner).volatile.mustRecharge = true;
                break;
            case "prepare":
                // moveName should be one of the two-turn moves being prepared
                this.getActive(event.id.owner).volatile.twoTurn =
                    event.moveName as any;
                break;
            case "sethp":
                for (const pair of event.newHPs)
                {
                    this.setHP(pair.id, pair.status);
                }
                break;
            case "singleturn":
                // istanbul ignore else: hard to check else case
                if (Battle.isStallSingleTurn(event.status))
                {
                    // user successfully used a stalling move
                    this.getActive(event.id.owner).volatile.stall(true);
                }
                break;
            case "status":
                this.getActive(event.id.owner).majorStatus = event.majorStatus;
                break;
            case "switch":
                this.handleSwitch(event);
                break;
            case "tie":
                this.battling = false;
                if (this.saveAlways)
                {
                    logger.debug(`saving ${this.username}`);
                    this.save();
                }
                break;
            case "turn":
                logger.debug(`new turn: ${event.num}`);
                break;
            case "upkeep":
                // selfSwitch is the result of a move, which only occurs in the
                //  middle of all the turn's main events (args.events)
                // if the simulator ignored the fact that a selfSwitch move was
                //  used, then it would emit an upkeep
                this.selfSwitch = false;
                this.themSelfSwitch = false;
                break;
            case "win":
                this.battling = false;
                if (this.saveAlways || event.winner === this.username)
                {
                    // we won
                    logger.debug(`saving ${this.username}`);
                    this.save();
                }
                break;
            // istanbul ignore next: should never happen
            default:
                logger.error(`Unhandled message type ${event!.type}`);
        }

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

    /**
     * Asks which player id corresponds to which side.
     * @param id Player id.
     * @returns The corresponding Side.
     */
    protected getSide(id: PlayerID): Side
    {
        return this.sides[id];
    }

    /**
     * Gets the team based on a PlayerID.
     * @param id ID of the team.
     * @returns The corresponding Team object.
     */
    private getTeam(id: PlayerID): Team
    {
        return this.state.teams[this.getSide(id)];
    }

    /**
     * Gets the active pokemon on a team.
     * @param id ID of the team.
     * @returns The active pokemon.
     */
    private getActive(id: PlayerID): Pokemon
    {
        return this.getTeam(id).active;
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
     * Converts a display name to an id name.
     * @param name Name to convert.
     * @returns The resulting ID name.
     */
    protected static parseIDName(name: string): string
    {
        return name.toLowerCase().replace(/[ -]/g, "");
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
     * Handles a MoveEvent.
     * @param event Event to process.
     */
    private handleMove(event: MoveEvent): void
    {
        const mon = this.getActive(event.id.owner);
        const moveId = Battle.parseIDName(event.moveName);

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
        const selfSwitch = move.selfSwitch || false;
        if (this.getSide(event.id.owner) === "us") this.selfSwitch = selfSwitch;
        else this.themSelfSwitch = selfSwitch;
    }

    /**
     * Handles a SwitchEvent.
     * @param event Event to process.
     */
    private handleSwitch(event: SwitchEvent): void
    {
        const team = this.getTeam(event.id.owner);

        // consume pending copyvolatile boolean flags
        const options: SwitchInOptions = {};
        if (this.getSide(event.id.owner) === "us")
        {
            options.copyVolatile = this.selfSwitch === "copyvolatile";
            this.selfSwitch = false;
        }
        else
        {
            options.copyVolatile = this.themSelfSwitch === "copyvolatile";
            this.themSelfSwitch = false;
        }

        team.switchIn(event.details.species, event.details.level,
            event.details.gender, event.status.hp, event.status.hpMax, options);
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

    /** Asks the AI what to do next and sends the response. */
    private async askAI(): Promise<void>
    {
        const choices = this.getChoices();
        logger.debug(`choices: [${choices.join(", ")}]`);

        const choice = await this.decide(choices);
        this.sender(choice);
    }

    // istanbul ignore next: uses stdin
    /** Asks for and sends user input to the server once it's received. */
    private askUser(): void
    {
        const rl = readline.createInterface(process.stdin, process.stdout);
        rl.question("ai> ", answer =>
        {
            if (answer)
            {
                logger.debug("received ai input");
                this.sender(answer as Choice);
            }
            else
            {
                logger.error("no ai input");
            }
            rl.close();
        });
    }

    /**
     * Determines what choices can be made.
     * @returns A list of choices that can be made by the AI.
     */
    private getChoices(): Choice[]
    {
        const choices: Choice[] = [];
        const team = this.state.teams.us;
        const active = team.active;

        const trapped: boolean =
            (!!this.lastRequest.active && this.lastRequest.active[0].trapped) ||
            active.volatile.lockedMove ||
            !!active.volatile.twoTurn ||
            active.volatile.mustRecharge;

        // possible choices for switching pokemon
        if (!trapped)
        {
            for (let i = 0; i < team.pokemon.length; ++i)
            {
                const mon = team.pokemon[i];
                if (!mon.active && !mon.fainted)
                {
                    choices.push(`switch ${i + 1}` as Choice);
                }
            }
        }

        if (!active.fainted && !this.selfSwitch)
        {
            // can also possibly make a move, since we're not being forced to
            //  just switch
            if (active.volatile.lockedMove || active.volatile.twoTurn ||
                active.volatile.mustRecharge)
            {
                // multi-turn attacks indicated by these statuses must be
                //  completed before anything else can be done
                choices.push("move 1");
            }
            else
            {
                let cantMove = true;

                // get disabled moves from last |request| message
                const requestDisabled = this.lastRequest.active ?
                    this.lastRequest.active[0].moves.map(m => m.disabled)
                    : [false, false, false, false];

                for (let i = 0; i < active.moves.length; ++i)
                {
                    if (active.canMove(i) && !requestDisabled[i])
                    {
                        choices.push(`move ${i + 1}` as Choice);
                        cantMove = false;
                    }
                }

                // if no other move choice, move slot 1 is replaced with
                //  struggle
                if (cantMove) choices.push("move 1");
            }
        }

        return choices;
    }
}

export interface BattleConstructor
{
    new(username: string, listener: AnyMessageListener, sender: ChoiceSender):
        Battle;
}
