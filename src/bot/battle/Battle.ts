import * as readline from "readline";
import { AnyMessageListener } from "../AnyMessageListener";
import * as logger from "../logger";
import { BattleEvent, Cause, MoveEvent, otherId, PlayerID,
    PokemonDetails, PokemonStatus, RequestMove, SwitchEvent } from
    "../messageData";
import { Choice } from "./Choice";
import { dex } from "./dex/dex";
import { SelfSwitch } from "./dex/dex-types";
import { BattleState } from "./state/BattleState";
import { Pokemon } from "./state/Pokemon";
import { otherSide, Side } from "./state/Side";
import { SwitchInOptions } from "./state/Team";

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
    /** Whether the opponent is using a move that copies volatile status. */
    private themCopyVolatile = false;
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
            console.dir(args, {colors: true, depth: null});

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
            this.askAI();
        })
        .on("battleprogress", args =>
        {
            console.dir(args, {colors: true, depth: null});

            args.events.forEach(event => this.handleEvent(event));
            if (args.upkeep)
            {
                args.upkeep.pre.forEach(event => this.handleEvent(event));
                args.upkeep.post.forEach(event => this.handleEvent(event));
            }
            if (args.turn) logger.debug(`new turn: ${args.turn}`);

            if (this.battling)
            {
                logger.debug(`state:\n${this.state.toString()}`);
                // TODO: don't askAI if waiting for opponent
                this.askAI();
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
                    mon.hp.set(status.hp, status.hpMax);
                    mon.majorStatus = status.condition;

                    // set active status
                    if (data.active) mon.switchIn();
                    else mon.switchOut();

                    for (const moveId of data.moves) mon.revealMove(moveId);
                }
            }

            // TODO: don't rely on args to get move info
            if (args.active)
            {
                // update move data on our active pokemon
                // TODO: support doubles/triples where there are multiple active
                //  pokemon
                const active: Pokemon = team.active;
                const moveData: RequestMove[] = args.active[0].moves;
                for (let i = 0; i < moveData.length; ++i)
                {
                    // FIXME: the "disabled" volatile status and the "disabled"
                    //  property in the request json are not the same thing
                    active.volatile.disableMove(i,
                            moveData[i].disabled || false);
                }
            }
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
     * Asks which player id corresponds to which side.
     * @param id Player id.
     * @returns The corresponding Side.
     */
    protected getSide(id: PlayerID): Side
    {
        return this.sides[id];
    }

    /**
     * Handles a BattleEvent.
     * @param event Event to process.
     */
    private handleEvent(event: BattleEvent): void
    {
        switch (event.type)
        {
            case "ability":
                this.state.teams[this.getSide(event.id.owner)].active
                    .baseAbility = event.ability;
                break;
            case "activate":
            case "end":
            case "start":
                if (event.volatile === "confusion")
                {
                    // start/upkeep or end confustion status
                    this.state.teams[this.getSide(event.id.owner)].active
                        .volatile.confuse(event.type !== "end");
                }
                break;
            case "curestatus":
                this.state.teams[this.getSide(event.id.owner)].active
                    .majorStatus = "";
                break;
            case "cureteam":
                this.state.teams[this.getSide(event.id.owner)].cure();
                break;
            case "damage":
            case "heal":
            {
                const side = this.getSide(event.id.owner);
                const active = this.state.teams[side].active;

                active.hp.set(event.status.hp, event.status.hpMax);
                // this should already be covered by the `status` event but just
                //  in case
                active.majorStatus = event.status.condition;
                break;
            }
            case "faint":
                this.state.teams[this.getSide(event.id.owner)].active.faint();
                break;
            case "move":
                this.handleMove(event);
                break;
            case "status":
                this.state.teams[this.getSide(event.id.owner)].active
                    .majorStatus = event.majorStatus;
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
            case "win":
                this.battling = false;
                if (this.saveAlways || event.winner === this.username)
                {
                    // we won
                    logger.debug(`saving ${this.username}`);
                    this.save();
                }
                break;
            default:
                logger.error(`Unhandled message type ${event!.type}`);
        }
        if (event.cause && event.type !== "tie" && event.type !== "win")
        {
            this.handleCause(this.sides[event.id.owner], event.cause!);
        }
    }

    /**
     * Handles a MoveEvent.
     * @param event Event to process.
     */
    private handleMove(event: MoveEvent): void
    {
        const side = this.getSide(event.id.owner);
        const mon = this.state.teams[side].active;
        const moveId = event.moveName.toLowerCase().replace(/[ -]/g, "");

        // FIXME: a move could be stored as hiddenpower70 but displayed as
        //  hiddenpowerfire
        const pp =
            // locked moves don't consume pp
            (event.cause && event.cause.type === "lockedmove") ? 0
            // pressure ability doubles pp usage if opponent is targeted
            : (this.state.teams[otherSide(side)].active.baseAbility ===
                    "pressure" &&
                event.targetId.owner !== event.id.owner) ? 2
            // but normally use 1 pp
            : 1;
        mon.useMove(moveId, pp);

        const move = dex.moves[moveId];

        // TODO: what if it's interrupted?
        if (move.volatileEffect === "lockedmove")
        {
            mon.volatile.lockedMove = true;
        }

        const selfSwitch = move.selfSwitch || false;
        if (side === "us")
        {
            this.selfSwitch = selfSwitch;
        }
        else if (side === "them" && selfSwitch === "copyvolatile")
        {
            // remember to copy volatile status data for the opponent's switchin
            this.themCopyVolatile = true;
        }
    }

    /**
     * Handles a SwitchEvent.
     * @param event Event to process.
     */
    private handleSwitch(event: SwitchEvent): void
    {
        const side = this.getSide(event.id.owner);
        const team = this.state.teams[side];

        // consume pending copyvolatile boolean flags
        const options: SwitchInOptions = {};
        if (side === "us")
        {
            options.copyVolatile = this.selfSwitch === "copyvolatile";
            this.selfSwitch = false;
        }
        else
        {
            options.copyVolatile = this.themCopyVolatile;
            this.themCopyVolatile = false;
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

        // possible choices for switching pokemon
        const active = team.active;
        if (!active.volatile.lockedMove)
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
            if (active.volatile.lockedMove) choices.push("move 1");
            else
            {
                for (let i = 0; i < active.moves.length; ++i)
                {
                    if (active.canMove(i))
                    {
                        choices.push(`move ${i + 1}` as Choice);
                    }
                }
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
