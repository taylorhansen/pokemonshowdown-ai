import * as readline from "readline";
import { AnyMessageListener } from "../../AnyMessageListener";
import { dex } from "../../data/dex";
import { SelfSwitch } from "../../data/dex-types";
import * as logger from "../../logger";
import { otherId, PlayerID, PokemonDetails, PokemonStatus, RequestMove,
    RequestPokemon } from "../../messageData";
import { AI, AIConstructor } from "./ai/AI";
import { Choice } from "./ai/Choice";
import { BattleState, Side } from "./state/BattleState";
import { MajorStatusName, Pokemon } from "./state/Pokemon";
import { SwitchInOptions } from "./state/Team";

const rl = readline.createInterface(process.stdin, process.stdout);

/** Holds the reward values for different events. */
const rewards =
{
    faint: -10
};

/** Manages the battle state and the AI. */
export class Battle
{
    /** Manages battle state and neural network input. */
    private readonly state = new BattleState();
    /** Decides what the client should do. */
    private readonly ai: AI;
    /**
     * Determines which PlayerID (p1 or p2) corresponds to which Side (us or
     * them).
     */
    private sides: {readonly [ID in PlayerID]: Side};
    /** Current request ID. Updated after every `|request|` message. */
    private rqid: number | null = null;
    /** Whether we're being forced to switch. */
    private forceSwitch = false;
    /** Whether we're using a move that requires a switch choice. */
    private selfSwitch: SelfSwitch = false;
    /** Whether the opponent is using a move that copies volatile status. */
    private themCopyVolatile = false;
    /** Accumulated reward during the current turn. */
    private reward = 0;
    /** Used to send response messages to the server. */
    private readonly addResponses: (...responses: string[]) => void;

    /**
     * Creates a Battle object.
     * @param aiType Type of AI to use.
     * @param username Client's username.
     * @param listener Used to subscribe to server messages.
     * @param addResponses Used to send response messages to the server.
     */
    constructor(aiType: AIConstructor, username: string,
        listener: AnyMessageListener,
        addResponses: (...respones: string[]) => void)
    {
        this.ai = new aiType(BattleState.getArraySize());
        this.addResponses = addResponses;
        listener
        .on("-curestatus", args =>
        {
            this.state.getTeam(this.sides[args.id.owner]).active
                .setMajorStatus("");
        })
        .on("-cureteam", args =>
        {
            const team = this.state.getTeam(this.sides[args.id.owner]);
            for (const mon of team.pokemon)
            {
                mon.setMajorStatus("");
            }
        })
        .on("-damage", args =>
        {
            const side = this.sides[args.id.owner];
            // side "them" is represented by a percentage so hpMax is omitted
            const hpMax = side === "us" ? args.status.hpMax : undefined;
            const active = this.state.getTeam(side).active;

            active.setHP(args.status.hp, hpMax);
            if (!active.fainted)
            {
                // status should be ignored if the pokemon is already fainted
                active.setMajorStatus(args.status.condition);
            }
        })
        .on("-heal", args =>
        {
            // delegate to -damage for now
            listener.getHandler("-damage")(args);
        })
        .on("-status", args =>
        {
            this.state.getTeam(this.sides[args.id.owner]).active
                .setMajorStatus(args.condition);
        })
        .on("error", args =>
        {
            logger.error(args.reason);
            logger.debug("nn input failed, asking user for input");
            this.askUser();
        })
        .on("faint", args =>
        {
            // active pokemon has fainted
            // TODO: for doubles/triples, do this based on active position also
            const side = this.sides[args.id.owner];
            this.state.getTeam(side).active.faint();
            this.applyReward(side, rewards.faint);
        })
        .on("move", args =>
        {
            const side = this.sides[args.id.owner];
            const mon = this.state.getTeam(side).active;
            const moveId = args.move.toLowerCase().replace(/[ -]/g, "");

            // TODO: sometimes a move might use >1 pp
            mon.useMove(moveId, args.effect);

            const selfSwitch = dex.moves[moveId].selfSwitch;
            if (side === "us")
            {
                // on the next upkeep message, the game will expect a choice for
                //  a new switchin, since this move forces a switch
                this.selfSwitch = selfSwitch;
            }
            else if (side === "them" && selfSwitch === "copyvolatile")
            {
                // remember to copy volatile status data for the opponent's
                //  switchin
                this.themCopyVolatile = true;
            }
        })
        .on("player", args =>
        {
            if (args.username !== username)
            {
                // them
                this.sides = {[args.id]: "them", [otherId(args.id)]: "us"} as
                    any;
            }
        })
        .on("request", args =>
        {
            // update the client's team data
            // generally, handling all the other types of messages should
            //  reproduce effectively the same team data as would be given to us
            //  by this message type if not more, so this should only be used
            //  for initializing the starting data for the client's team on the
            //  first turn

            const team = this.state.getTeam("us");

            // first time: team array not initialized yet
            if (team.size === 0)
            {
                team.size = args.side.pokemon.length;
            }
            const pokemon: Pokemon[] = team.pokemon;
            const pokemonData: RequestPokemon[] = args.side.pokemon;

            if (this.rqid === null)
            {
                // initialize each of the client's pokemon since this is our
                //  first time receiving a args and initializing the rqid
                for (const data of pokemonData)
                {
                    const details: PokemonDetails = data.details;
                    const status: PokemonStatus = data.condition;

                    const index = team.reveal(details.species, details.level,
                            details.gender, status.hp, status.hpMax);
                    const mon = pokemon[index];
                    mon.item = data.item;
                    mon.baseAbility = data.baseAbility;
                    mon.setHP(status.hp, status.hpMax);
                    mon.setMajorStatus(status.condition as MajorStatusName);

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
                    const move = moveData[i];
                    active.disableMove(i, args.active[0].moves[i].disabled);
                }
            }

            // presence of a forceSwitch array indicates that we're being forced
            //  to switch right now
            // TODO: doubles/triples support
            this.forceSwitch = args.forceSwitch !== undefined;

            // update rqid to verify our next choice
            this.rqid = args.rqid;
        })
        .on("switch", args =>
        {
            const side = this.sides[args.id.owner];
            const team = this.state.getTeam(side);

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

            // index of the pokemon to switch
            let newActiveIndex = team.find(args.details.species);
            if (newActiveIndex === -1)
            {
                // no known pokemon found, so this is a new switchin
                // hp is a percentage if on the opponent's team
                const hpMax = side === "us" ? args.status.hpMax : undefined;
                newActiveIndex = team.newSwitchin(args.details.species,
                        args.details.level, args.details.gender, args.status.hp,
                        hpMax, options);
                if (newActiveIndex === -1)
                {
                    logger.error(`team ${side} seems to have more pokemon than \
expected`);
                }
                return;
            }
            team.switchIn(newActiveIndex, options);
        })
        .on("teamsize", args =>
        {
            // should only initialize if the team is empty
            const side = this.sides[args.id];
            const team = this.state.getTeam(side);
            if (team.size <= 0)
            {
                team.size = args.size;
            }
        })
        .on("turn", args =>
        {
            logger.debug(`new turn: ${args.turn}`);
            logger.debug(`state:\n${this.state.toString()}`);
            this.askAI();
        })
        .on("upkeep", args =>
        {
            // usually, once we get the message that a new turn has started, we
            //  would then ask the neural network for input
            // but if we're being forced to switch (e.g. when a pokemon faints),
            //  the turn message we've been waiting for hasn't been sent yet
            if (this.forceSwitch)
            {
                this.askAI();
            }
        });
    }

    /** Asks the AI for what to do next. */
    private askAI(): void
    {
        const choices = this.getChoices();
        logger.debug(`choices: [${choices.join(", ")}]`);
        logger.debug(`accumulated award: ${this.reward}`);

        this.ai.decide(this.state.toArray(), choices, this.reward)
        .then(choice =>
        {
            this.addResponses(`|/choose ${choice}|${this.rqid}`);
        });

        this.reward = 0;
    }

    /** Asks for and sends user input to the server once it's received. */
    private askUser(): void
    {
        rl.question("ai> ", answer =>
        {
            if (answer)
            {
                logger.debug("received ai input");
                this.addResponses(answer);
            }
            else
            {
                logger.error("no ai input");
            }
        });
    }

    /**
     * Determines what choices can be made.
     * @returns A list of choices that can be made by the AI.
     */
    private getChoices(): Choice[]
    {
        const choices: Choice[] = [];
        const team = this.state.getTeam("us");

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
            const active = team.active;
            for (let i = 0; i < active.moves.length; ++i)
            {
                if (active.canMove(i))
                {
                    choices.push(`move ${i + 1}` as Choice);
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
