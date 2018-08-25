import { BattleAI } from "./BattleAI";
import { Logger } from "../logger/Logger";
import { RoomType, ChallengesFrom } from "./MessageListener";
import { MessageParser } from "./MessageParser";

/** Handles all bot actions. */
export class Bot
{
    private readonly parser: MessageParser = new MessageParser();
    /** Keeps track of all the battles we're in. */
    private readonly battles: {[room: string]: BattleAI} = {};
    /** Name of the user. */
    private username: string = "";
    /** Used to send response messages to the server. */
    private readonly send: (response: string) => void;

    /** Current room we're receiving messages from. */
    private get room(): string
    {
        return this.parser.room;
    }

    /** Creates a Bot. */
    constructor(send: (response: string) => void)
    {
        this.send = send;
        this.parser.on(null, "init", (type: RoomType) =>
        {
            if (type === "battle")
            {
                // initialize a new battle ai
                if (!this.battles.hasOwnProperty(this.room))
                {
                    // need a copy of the current room so the lambda captures
                    //  that and not just a reference to `this`
                    const room = this.room;
                    const ai = new BattleAI(
                        this.parser.getListener(room),
                        // function for sending responses
                        (...responses: string[]) =>
                            this.addResponses(room, ...responses));
                    this.battles[this.room] = ai;
                }
            }
        }).on("", "updatechallenges", (challengesFrom: ChallengesFrom) =>
        {
            // test team for now
            const useteam = `|/useteam Magikarp||Focus Sash||\
bounce,flail,splash,tackle|Adamant|,252,,,4,252|||||`;
            for (let user in challengesFrom)
            {
                if (challengesFrom.hasOwnProperty(user))
                {
                    // ai only supports gen4ou for now
                    if (challengesFrom[user] === "gen4ou")
                    {
                        // private message room names are the user being
                        //  messaged
                        this.addResponses(null, useteam, `|/accept ${user}`);
                    }
                    else
                    {
                        this.addResponses(null, `|/reject ${user}`);
                    }
                }
            }
        });
    }

    /**
     * Parses a packet of messages and possibly acts upon it.
     * @param unparsedPacket Message data from the server.
     */
    public consumePacket(unparsedPacket: string): void
    {
        this.parser.parse(unparsedPacket);
    }

    /**
     * Sends a list of responses to the server.
     * @param room Room to send the response from. Can be null if it doesn't
     * matter.
     * @param responses Responses to be sent to the server.
     */
    private addResponses(room: string | null, ...responses: string[]): void
    {
        if (room)
        {
            responses = responses.map(response => room + response);
        }
        responses.forEach(response => this.send(response));
        Logger.debug(`sent: ["${responses.join("\", \"")}"]`);
    }
}
