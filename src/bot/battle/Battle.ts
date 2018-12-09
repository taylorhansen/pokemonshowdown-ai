import * as readline from "readline";
import { inspect } from "util";
import { AnyMessageListener } from "../AnyMessageListener";
import * as logger from "../logger";
import { BattleEvent, Cause, MoveEvent, otherId, PlayerID,
    PokemonDetails, PokemonID, PokemonStatus, RequestMove, SwitchEvent } from
    "../messageData";
import { Choice } from "./Choice";
import { dex } from "./dex/dex";
import { SelfSwitch, Type } from "./dex/dex-types";
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
    /** Whether the opponent is using a move that requires a switch choice. */
    private themSelfSwitch: SelfSwitch = false;
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
        .on("battleprogress", args =>
        {
            logger.debug(`battleprogress:
${inspect(args, {colors: true, depth: null})}`);

            // pre-event processing
            for (const event of args.events)
            {
                if (event.type === "turn")
                {
                    // last turn, a two-turn move status might've been set by an
                    //  event, so remove that first so it doesn't interfere in
                    //  case an event now is supposed to set or interrupt it
                    for (const side of ["us", "them"] as Side[])
                    {
                        this.state.teams[side].active.volatile.twoTurn = "";
                    }
                }
            }

            // event processing
            let newTurn = false;
            for (const event of args.events)
            {
                this.handleEvent(event);
                if (event.type === "turn") newTurn = true;
            }

            if (this.battling)
            {
                logger.debug(`state:\n${this.state.toString()}`);
                if (newTurn || this.selfSwitch || (!this.themSelfSwitch &&
                        this.state.teams.us.active.fainted))
                {
                    return this.askAI();
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
                    active.volatile.disableMove(i, moveData[i].disabled);
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
     * @virtual
     */
    protected handleEvent(event: BattleEvent): void
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
            case "boost":
                this.state.teams[this.getSide(event.id.owner)].active.volatile
                    .boost(event.stat, event.amount);
                break;
            case "cant":
                if (event.reason === "recharge")
                {
                    // successfully completed its recharge turn
                    this.state.teams[this.getSide(event.id.owner)].active
                        .volatile.mustRecharge = false;
                }
                if (event.moveName)
                {
                    const moveId = Battle.parseIDName(event.moveName);
                    // prevented from using a move, which might not have been
                    //  revealed before
                    this.state.teams[this.getSide(event.id.owner)].active
                        .revealMove(moveId);
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
                this.setHP(event.id, event.status);
                break;
            case "faint":
                this.state.teams[this.getSide(event.id.owner)].active.faint();
                break;
            case "move":
                this.handleMove(event);
                break;
            case "mustrecharge":
                this.state.teams[this.getSide(event.id.owner)].active.volatile
                    .mustRecharge = true;
                break;
            case "prepare":
                // moveName should be one of the two-turn moves being prepared
                this.state.teams[this.getSide(event.id.owner)].active
                    .volatile.twoTurn = event.moveName as any;
                break;
            case "sethp":
                for (const pair of event.newHPs)
                {
                    this.setHP(pair.id, pair.status);
                }
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
        const mon = this.state.teams[this.getSide(id.owner)].active;
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
        const side = this.getSide(event.id.owner);
        const mon = this.state.teams[side].active;
        const moveId = Battle.parseIDName(event.moveName);

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
        if (side === "us") this.selfSwitch = selfSwitch;
        else this.themSelfSwitch = selfSwitch;
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

        // possible choices for switching pokemon
        const active = team.active;
        // locked two-turn moves trap the user and keeps them from switching
        if (!active.volatile.lockedMove && !active.volatile.twoTurn &&
            !active.volatile.mustRecharge)
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
