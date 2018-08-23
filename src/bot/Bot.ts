import { BattleAI } from "./BattleAI";
import { Message, Packet } from "./Message";
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
     * Parses a packet of messages and possibly acts upon it.
     * @param unparsedPacket Message data from the server.
     * @returns A possible list of response messages to be sent to the server.
     * Can be empty.
     */
    public consumePacket(unparsedPacket: string): string[]
    {
        const packet: Packet = new MessageParser(unparsedPacket).parse();
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
            return this.consume(packet.messages);
        }
        return [];
    }

    /**
     * Consumes messages from lobby or global.
     * @param messages Messages to be processed.
     * @returns Response messages to be sent to the server.
     */
    private consume(messages: Message[]): string[]
    {
        return messages.map(message =>
        {
            switch (message.prefix)
            {
                case "updatechallenges":
                    return this.updateChallenges(message.challengesFrom);
                default:
                    return [];
            }
        }).reduce((arr1, arr2) => arr1.concat(arr2), []);
    }

    /**
     * Responds to challenges from others.
     * @param challengesFrom Map of user challenging the AI and the format it's
     * being challenged to.
     * @returns Response messages to be sent to the server.
     */
    private updateChallenges(challengesFrom: {[user: string]: string}): string[]
    {
        // test team for now
        const useteam = `|/useteam Magikarp||Focus Sash||\
bounce,flail,splash,tackle|Adamant|,252,,,4,252|||||`;
        const result: string[] = [useteam];
        for (let user in challengesFrom)
        {
            if (challengesFrom.hasOwnProperty(user))
            {
                if (challengesFrom[user] === "gen4ou")
                {
                    result.push(`|/accept ${user}`);
                }
                else
                {
                    result.push(`|/reject ${user}`);
                }
            }
        }
        // if there is an item, it'd be the |/useteam command, which is
        //  unnecessary if there are no incoming challenges
        return result.length === 1 ? [] : result;
    }
}
