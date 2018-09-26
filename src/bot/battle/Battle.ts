import * as readline from "readline";
import * as logger from "../../logger";
import { otherId, PlayerID, PokemonDetails, PokemonID, PokemonStatus,
    RequestData, RequestMove, RequestPokemon } from "../../parser/MessageData";
import { AnyMessageListener } from "../../parser/MessageListener";
import { AI, AIConstructor } from "./ai/AI";
import { Choice } from "./ai/Choice";
import { BattleState, Side } from "./state/BattleState";
import { MajorStatusName, Pokemon } from "./state/Pokemon";

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
        .on("-curestatus", (id: PokemonID, condition: MajorStatusName) =>
        {
            this.state.getTeam(this.sides[id.owner]).active.setMajorStatus("");
        })
        .on("-cureteam", (id: PokemonID) =>
        {
            for (const mon of this.state.getTeam(this.sides[id.owner]).pokemon)
            {
                mon.setMajorStatus("");
            }
        })
        .on("-damage", (id: PokemonID, status: PokemonStatus) =>
        {
            const side = this.sides[id.owner];
            // side "them" is represented by a percentage so hpMax is omitted
            const hpMax = side === "us" ? status.hpMax : undefined;
            const active = this.state.getTeam(side).active;

            active.setHP(status.hp, hpMax);
            if (!active.fainted)
            {
                // status should be ignored if the pokemon is already fainted
                active.setMajorStatus(status.condition as MajorStatusName);
            }
        })
        .on("-heal", (id: PokemonID, status: PokemonStatus) =>
        {
            // delegate to -damage for now
            listener.getHandler("-damage")(id, status);
        })
        .on("-status", (id: PokemonID, condition: MajorStatusName) =>
        {
            this.state.getTeam(this.sides[id.owner]).active
                .setMajorStatus(condition);
        })
        .on("error", (reason: string) =>
        {
            logger.error(reason);
            logger.debug("nn input failed, asking user for input");
            this.askUser();
        })
        .on("faint", (id: PokemonID) =>
        {
            // active pokemon has fainted
            // TODO: for doubles/triples, do this based on active position also
            const side = this.sides[id.owner];
            this.state.getTeam(side).active.faint();
            this.applyReward(side, rewards.faint);
        })
        .on("move", (id: PokemonID, move: string, effect: string,
            missed: boolean) =>
        {
            const mon = this.state.getTeam(this.sides[id.owner]).active;
            const moveId = move.toLowerCase().replace(/[ -]/g, "");
            // TODO: sometimes a move might use >1 pp
            mon.useMove(moveId, effect);
        })
        .on("player", (id: PlayerID, givenUser: string) =>
        {
            if (givenUser !== username)
            {
                // them
                this.sides = {[id]: "them", [otherId(id)]: "us"} as any;
            }
        })
        .on("request", (request: RequestData) =>
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
                team.size = request.side.pokemon.length;
            }
            const pokemon: Pokemon[] = team.pokemon;
            const pokemonData: RequestPokemon[] = request.side.pokemon;

            if (this.rqid === null)
            {
                // initialize each of the client's pokemon since this is our
                //  first time receiving a request and initializing the rqid
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

            // TODO: don't rely on request to get move info
            if (request.active)
            {
                // update move data on our active pokemon
                // TODO: support doubles/triples where there are multiple active
                //  pokemon
                const active: Pokemon = team.active;
                const moveData: RequestMove[] = request.active[0].moves;
                for (let i = 0; i < moveData.length; ++i)
                {
                    const move = moveData[i];
                    active.disableMove(i, request.active[0].moves[i].disabled);
                }
            }

            // presence of a forceSwitch array indicates that we're being forced
            //  to switch right now
            // TODO: doubles/triples support
            this.forceSwitch = request.forceSwitch !== undefined;

            // update rqid to verify our next choice
            this.rqid = request.rqid;
        })
        .on("switch", (id: PokemonID, details: PokemonDetails,
            status: PokemonStatus) =>
        {
            const side = this.sides[id.owner];
            const team = this.state.getTeam(side);

            // index of the pokemon to switch
            let newActiveIndex = team.find(details.species);
            if (newActiveIndex === -1)
            {
                // no known pokemon found, so this is a new switchin
                // hp is a percentage if on the opponent's team
                const hpMax = side === "us" ? status.hpMax : undefined;
                newActiveIndex = team.newSwitchin(details.species,
                    details.level, details.gender, status.hp, hpMax);
                if (newActiveIndex === -1)
                {
                    logger.error(`team ${side} seems to have more pokemon than \
expected`);
                }
                return;
            }
            team.switchIn(newActiveIndex);
        })
        .on("teamsize", (id: PlayerID, size: number) =>
        {
            // should only initialize if the team is empty
            const side = this.sides[id];
            const team = this.state.getTeam(side);
            if (team.size <= 0)
            {
                team.size = size;
            }
        })
        .on("turn", (turn: number) =>
        {
            logger.debug(`new turn: ${turn}`);
            logger.debug(`state:\n${this.state.toString()}`);
            this.askAI();
        })
        .on("upkeep", () =>
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

        const response = this.ai.decide(this.state.toArray(), choices,
                this.reward);
        this.reward = 0;
        this.addResponses(`|/choose ${response}|${this.rqid}`);
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

        if (!this.forceSwitch)
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
