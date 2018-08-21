import { BattleAI } from "./BattleAI";
import { Packet } from "./Message";
import { MessageParser } from "./MessageParser";

/** Handles all bot actions. */
export class Bot
{
    /** Keeps track of all the battles we're in. */
    private battles: {[room: string]: BattleAI}
    private username: string;

    /** Creates a Bot object. */
    constructor()
    {
        this.battles = {};
        this.username = "";
    }

    /**
     * Consumes a message and possibly acts upon it.
     * @param message Message data from the server.
     * @returns A possible list of response messages to be sent to the server.
     * Can be empty.
     */
    public consume(message: string): string[]
    {
        const packet: Packet = new MessageParser(message).parse();
        // early return: no messages to even process
        if (!packet.messages.length)
        {
            return [];
        }

        if (packet.room)
        {
            // came from a room other than lobby
            const room = packet.room;
            let ai: BattleAI | null;
            if (this.battles.hasOwnProperty(room))
            {
                ai = this.battles[room];
            }
            else
            {
                // could be initializing a new battle
                const msg = packet.messages[0];
                if (msg.prefix === "init" && msg.type === "battle")
                {
                    ai = new BattleAI();
                    this.battles[room] = ai;
                }
                else
                {
                    ai = null;
                }
            }

            if (ai)
            {
                ai.consume(packet.messages);
            }
        }
        else
        {
            // came from lobby or global
            // if updateuser, set username
        }
        return [];
    }

    /**
     * Gets the prefix of a message which is surrounded by `|` symbols. The last
     * character can optionally have a newline at the end.
     * @param message Message to search.
     * @param index Index to start searching from. Should point to the initial
     * pipe character.
     * @returns The message prefix, or null if the pipe character was missing.
     */
    private static getPrefix(message: string, index = 0): string | null
    {
        if (message.charAt(index) !== "|")
        {
            // no pipe at beginning
            return null;
        }

        // build up the prefix substring
        let result = "";
        while (++index < message.length)
        {
            const c = message.charAt(index);
            if (c === "|" || c === "\n")
            {
                return result;
            }
            else
            {
                result += c;
            }
        }
        return result;
    }
}
