import * as readline from "readline";
import { AnyMessageListener } from "../../AnyMessageListener";
import { dex } from "../../data/dex";
import { SelfSwitch } from "../../data/dex-types";
import * as logger from "../../logger";
import { BattleEvent, Cause, MoveEvent, otherId, PlayerID,
    PokemonDetails, PokemonStatus, RequestMove, SwitchEvent } from
    "../../messageData";
import { AI, AIConstructor } from "./ai/AI";
import { Choice } from "./ai/Choice";
import { BattleState, otherSide, Side } from "./state/BattleState";
import { Pokemon } from "./state/Pokemon";
import { SwitchInOptions } from "./state/Team";

/** Holds the reward values for different events. */
const rewards =
{
    faint: -10
};

/**
 * Sends a Choice to the server.
 * @param choice Choice to send.
 * @param rqid Request ID.
 */
export type ChoiceSender = (choice: Choice, rqid?: number) => void;

/** Manages the battle state and the AI. */
export class Battle
{
    /** Decides what the client should do. */
    private readonly ai: AI;
    /** Client's username. */
    private readonly username: string;
    /**
     * True if the AI model should always be saved at the end, or false if that
     * should happen if it wins.
     */
    private readonly saveAlways: boolean;
    /** Used to send the AI's choice to the server. */
    private readonly sender: ChoiceSender;
    /** Manages battle state for AI input. */
    private readonly state: BattleState;
    /**
     * Determines which PlayerID (p1 or p2) corresponds to which Side (us or
     * them).
     */
    private sides: {readonly [ID in PlayerID]: Side};
    /** Current request ID. Updated after every `|request|` message. */
    private rqid?: number;
    /** Whether we're being forced to switch. */
    private forceSwitch = false;
    /** Whether we're using a move that requires a switch choice. */
    private selfSwitch: SelfSwitch = false;
    /** Whether the opponent is using a move that copies volatile status. */
    private themCopyVolatile = false;
    /** Accumulated reward during the current turn. */
    private reward = 0;
    /** Whether the battle is still going. */
    private battling = false;

    /**
     * Creates a Battle object.
     * @param aiType Type of AI to use.
     * @param username Client's username.
     * @param saveAlways True if the AI model should always be saved at the end,
     * or false if that should happen once it wins.
     * @param listener Used to subscribe to server messages.
     * @param sender Used to send the AI's choice to the server.
     * @param state Optional initial battle state.
     */
    constructor(aiType: AIConstructor, username: string, saveAlways: boolean,
        listener: AnyMessageListener, sender: ChoiceSender, state?: BattleState)
    {
        const path = `${__dirname}/../../../models/latest`;
        this.ai = new aiType(BattleState.getArraySize(), path);
        this.username = username;
        this.saveAlways = saveAlways;
        this.sender = sender;
        this.state = state || new BattleState();

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

            // first time: team array not initialized yet
            if (team.size === 0)
            {
                team.size = args.side.pokemon.length;
            }

            // first time setup, initialize each of the client's pokemon
            if (!this.battling)
            {
                this.battling = true;
                for (const data of args.side.pokemon)
                {
                    const details: PokemonDetails = data.details;
                    const status: PokemonStatus = data.condition;

                    const mon = team.reveal(details.species, details.level,
                            details.gender, status.hp, status.hpMax);
                    mon.item = data.item;
                    mon.baseAbility = data.baseAbility;
                    mon.setHP(status.hp, status.hpMax);
                    mon.afflict(status.condition);

                    // set active status
                    if (data.active)
                    {
                        mon.switchIn();
                    }
                    else
                    {
                        mon.switchOut();
                    }

                    for (const moveId of data.moves)
                    {
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
                    active.disableMove(i, moveData[i].disabled);
                }
            }

            // presence of a forceSwitch array indicates that we're being forced
            //  to switch right now
            // TODO: doubles/triples support
            this.forceSwitch = args.forceSwitch !== undefined;

            // update rqid to verify our next choice
            this.rqid = args.rqid;
        });
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
                if (event.volatile === "confusion")
                {
                    this.state.teams[this.getSide(event.id.owner)].active
                        .confuse(event.type === "activate");
                }
                break;
            case "curestatus":
                this.state.teams[this.getSide(event.id.owner)].active.cure();
                break;
            case "cureteam":
                this.state.teams[this.getSide(event.id.owner)].cure();
                break;
            case "damage":
            case "heal":
            {
                const side = this.getSide(event.id.owner);
                const active = this.state.teams[side].active;

                // side "them" uses hp percentages so hpMax would be omitted
                const hpMax = side === "us" ? event.status.hpMax : undefined;
                active.setHP(event.status.hp, hpMax);
                // this should already be covered by the `status` event but just
                //  in case
                active.afflict(event.status.condition);
                break;
            }
            case "faint":
            {
                const side = this.getSide(event.id.owner);
                this.state.teams[side].active.faint();
                this.applyReward(side, rewards.faint);
                break;
            }
            case "move":
                this.handleMove(event);
                break;
            case "start":
            {
                const mon = this.state.teams[this.getSide(event.id.owner)]
                    .active;
                switch (event.volatile)
                {
                    case "confusion":
                        mon.confuse(true);
                        break;
                }
                break;
            }
            case "status":
                this.state.teams[this.getSide(event.id.owner)].active
                    .afflict(event.majorStatus);
                break;
            case "switch":
                this.handleSwitch(event);
                break;
            case "tie":
                this.battling = false;
                if (this.saveAlways)
                {
                    logger.debug(`saving ${this.username}`);
                    this.ai.save();
                }
                break;
            case "win":
                this.battling = false;
                if (this.saveAlways || event.winner === this.username)
                {
                    // we won
                    logger.debug(`saving ${this.username}`);
                    this.ai.save();
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
        let pp: number;
        // locked moves don't consume pp
        if (event.cause && event.cause.type === "lockedmove") pp = 0;
        // pressure ability doubles pp usage
        else if (this.state.teams[otherSide(side)].active.baseAbility ===
            "pressure") pp = 2;
        // but normally use 1 pp
        else pp = 1;
        mon.useMove(moveId, pp);

        const move = dex.moves[moveId];

        // TODO: what if it's interrupted?
        if (move.volatileEffect === "lockedmove")
        {
            mon.lockMove(true);
        }

        const selfSwitch = move.selfSwitch || false;
        if (side === "us")
        {
            this.selfSwitch = selfSwitch;
        }
        else if (side === "them" && selfSwitch === "copyvolatile")
        {
            // remember to copy volatile status data for the opponent's
            //  switchin
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

        // hp is a percentage if on the opponent's team
        const hpMax = side === "us" ? event.status.hpMax : undefined;

        team.switchIn(event.details.species, event.details.level,
                event.details.gender, event.status.hp, hpMax, options);
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
                this.state.teams[side].active.lockMove(false);
                break;
            case "item":
                // reveal item
                this.state.teams[side].active.item = cause.item;
                break;
        }
    }

    /** Asks the AI for what to do next and sends the response. */
    private async askAI(): Promise<void>
    {
        const choices = this.getChoices();
        logger.debug(`choices: [${choices.join(", ")}]`);
        logger.debug(`accumulated award: ${this.reward}`);
        const r = this.reward;
        this.reward = 0;

        const choice = await this.ai.decide(this.state.toArray(), choices, r);
        this.sender(choice, this.rqid);
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
                this.sender(answer as Choice, this.rqid);
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
        for (let i = 0; i < team.pokemon.length; ++i)
        {
            const mon = team.pokemon[i];
            if (!mon.active && !mon.fainted)
            {
                choices.push(`switch ${i + 1}` as Choice);
            }
        }

        if (!this.forceSwitch && !this.selfSwitch)
        {
            // can also possibly make a move, since we're not being forced to
            //  just switch
            const mon = team.active;
            if (mon.isLocked())
            {
                choices.push("move 1");
            }
            else
            {
                for (let i = 0; i < mon.moves.length; ++i)
                {
                    if (mon.canMove(i))
                    {
                        choices.push(`move ${i + 1}` as Choice);
                    }
                }
            }
        }

        return choices;
    }

    /**
     * Rewards one side of the battle.
     * @param side The team that was rewarded for something.
     * @param reward Value of the reward.
     */
    private applyReward(side: Side, reward: number): void
    {
        switch (side)
        {
            case "us":
                this.reward += reward;
                break;
            case "them":
                // punish the other side (us)
                this.reward -= reward;
                break;
        }
    }
}
