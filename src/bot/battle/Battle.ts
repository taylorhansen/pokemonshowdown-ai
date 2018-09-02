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
    private rqid: number | null;
    /** Available choices to make. */
    private choices: Choice[] = [];
    /** Whether we're being forced to switch. */
    private forceSwitch = false;
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
        this.ai = new aiType();
        this.addResponses = addResponses;
        listener
        .on("error", (reason: string) =>
        {
            logger.error(reason);
            logger.debug("nn input failed, asking user for input");
            this.askUser();
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
            // update the client's team

            // update rqid to verify our next choice
            this.rqid = request.rqid;

            // first time: team array not initialized yet
            if (!this.state.getPokemon("us").length)
            {
                this.state.setTeamSize("us", request.side.pokemon.length);
            }

            // update side data
            const pokemon: Pokemon[] = this.state.getPokemon("us");
            const pokemonData: RequestPokemon[] = request.side.pokemon;
            for (let i = 0; i < pokemonData.length; ++i)
            {
                const mon = pokemon[i];
                const data = pokemonData[i];

                const details: PokemonDetails = data.details;
                mon.species = details.species;
                mon.level = details.level;
                mon.gender = details.gender;

                const status: PokemonStatus = data.condition;
                mon.setHP(status.hp, status.hpMax);
                mon.setMajorStatus(status.condition as MajorStatusName);

                mon.item = data.item;
                // must be set after species is set
                mon.baseAbility = data.baseAbility;
            }

            if (request.active)
            {
                // update move data on our active pokemon
                // TODO: support doubles/triples where there are multiple active
                //  pokemon
                const active: Pokemon = this.state.getActive("us");
                const moveData: RequestMove[] = request.active[0].moves;
                for (let i = 0; i < moveData.length; ++i)
                {
                    const move = moveData[i];
                    active.setMove(i, move.id, move.pp, move.maxpp);
                    active.disableMove(i, request.active[0].moves[i].disabled);
                }

                this.choices = [];
            }

            if (request.forceSwitch || request.active)
            {
                this.choices = [];
                // possible choices for switching pokemon
                for (let i = 0; i < pokemon.length; ++i)
                {
                    const mon = pokemon[i];
                    if (mon.fainted || mon.active) continue;

                    this.choices.push(`switch ${i + 1}` as Choice);
                }

                if (!request.forceSwitch && request.active)
                {
                    // can also possibly make a move
                    const moves = request.active[0].moves;
                    for (let i = 0; i < moves.length; ++i)
                    {
                        const move = moves[i];
                        if (move.pp <= 0 || move.disabled) continue;

                        this.choices.push(`move ${i + 1}` as Choice);
                    }
                    this.forceSwitch = false;
                }
                else
                {
                    // if this is just a switch request, then we're being forced
                    //  to switch
                    this.forceSwitch = true;
                }
            }
        })
        .on("switch", (id: PokemonID, details: PokemonDetails,
            status: PokemonStatus) =>
        {
            // TODO: update active status on pokemon
        })
        .on("teamsize", (id: PlayerID, size: number) =>
        {
            // should only initialize if the team is empty
            const side = this.sides[id];
            if (!this.state.getPokemon(side).length)
            {
                this.state.setTeamSize(side, size);
            }
        })
        .on("turn", (turn: number) =>
        {
            logger.debug(`new turn: ${turn}`);
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
        const response = this.ai.decide(this.state.toArray(), this.choices);
        this.choices = [];
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
}
