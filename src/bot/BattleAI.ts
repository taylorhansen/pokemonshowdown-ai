import { Logger } from "../logger/Logger";
import { Prefix, Message } from "./Message";

/** Differentiates between the AI and the opponent. */
export type Owner = "us" | "them";
/**
 * Listens for a certain message type.
 * @param message Message parameter.
 * @returns Response messages to be sent to the server.
 */
export type MessageListener = (message: Message) => string[];

/**
 * Controls the AI's actions during a battle.
 *
 * Info that the AI needs to make an informed decision:
 * * Known aspects of the opponent's team.
 * * All aspects of the AI's team.
*/
export class BattleAI
{
    /**
     * Holds the two player ids and tells which one symbolizes the AI or the
     * opponent.
     */
    private readonly players: {[id: string]: Owner};
    private readonly teams: {[owner: string]: null[]};
    private readonly listeners: {[prefix: string]: MessageListener[]}

    /** Creates a BattleAI object. */
    constructor()
    {
        this.players = {};
        this.teams = {};
        this.listeners = {};
        this.onMessage("request", message =>
        {
            // fill in team info (how exactly?)
            Logger.debug("request!");
            return [];
        });
        this.onMessage("switch", message =>
        {
            // TODO: automatically determine message type?
            // switch out active pokemon and what we know about them
            Logger.debug("switch!");
            return [];
        });
    }

    /**
     * Consumes an array of Messages and possibly acts upon them.
     * @param messages Messages to be processed.
     * @returns Response messages to be sent to the server.
     */
    public consume(messages: Message[]): string[]
    {
        const concat = (arr1: string[], arr2: string[]) => arr1.concat(arr2);
        return messages.map(
                message => (this.listeners[message.prefix] || [])
                    .map(listener => listener(message)).reduce(concat))
            .reduce(concat);
    }

    /**
     * Sets info about which player id represents the AI and the opponent.
     * @param id Identifier for the player.
     * @param owner: Indicates who owns this id.
     */
    public setPlayer(id: string, owner: Owner): void
    {
        this.players[id] = owner;
    }

    /**
     * Initializes the team size.
     * @param id Identifier for the player.
     * @param size Size of the player's team.
     */
    public setTeamSize(id: string, size: number): void
    {
        this.teams[this.players[id]] = ([] as null[]).fill(null, 0, size);
    }

    /**
     * Adds a listener for a certain type of message from the server.
     * @param prefix Message prefix to listen for.
     * @param func Function to call when the prefix is found.
     */
    private onMessage(prefix: Prefix, func: MessageListener): void
    {
        if (this.listeners.hasOwnProperty(prefix))
        {
            this.listeners[prefix].push(func);
        }
        else
        {
            this.listeners[prefix] = [func];
        }
    }
}
