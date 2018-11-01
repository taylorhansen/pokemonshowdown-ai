import { Choice } from "./battle/ai/Choice";
import { Network } from "./battle/ai/Network";
import { Battle } from "./battle/Battle";
import * as logger from "./logger";
import { Parser } from "./parser/Parser";

/** Handles all bot actions. */
export class Bot
{
    /** Supported formats and the object constructors to handle them. */
    private readonly formats: {[format: string]: typeof Battle | undefined} =
        {};

    /** Parses server messages. */
    private readonly parser: Parser;
    /** Keeps track of all the battles we're in. */
    private readonly battles: {[room: string]: Battle} = {};
    /** Name of the user. */
    private username: string = "";
    /** Used to send response messages to the server. */
    private readonly send: (response: string) => void;

    /** Current room we're receiving messages from. */
    private get room(): string
    {
        return this.parser.room;
    }

    /**
     * Creates a Bot.
     * @param parser Parses messages from the server.
     * @param send Sends responses to the server.
     */
    constructor(parser: Parser, send: (response: string) => void)
    {
        this.parser = parser;
        this.send = send;
        this.parser
        .on(null, "init", args =>
        {
            if (args.type === "battle" &&
                !this.battles.hasOwnProperty(this.room))
            {
                // joining a new battle
                // room names follow the format battle-<format>-<id>
                const format = this.room.split("-")[1];
                const battleCtor = this.formats[format];
                if (battleCtor) this.initBattle(this.room, battleCtor);
                else logger.error(`Unsupported format ${format}`);
            }
        })
        .on("", "updatechallenges", args =>
        {
            for (const user in args.challengesFrom)
            {
                if (args.challengesFrom.hasOwnProperty(user))
                {
                    if (this.formats.hasOwnProperty(args.challengesFrom[user]))
                    {
                        this.addResponses(null, `|/accept ${user}`);
                    }
                    else
                    {
                        this.addResponses(null, `|/reject ${user}`);
                    }
                }
            }
        })
        .on("", "updateuser", args =>
        {
            this.username = args.username;
        });
    }

    /**
     * Starts a new battle.
     * @param room Room that the battle is starting in.
     * @param battleCtor AI to be used.
     */
    private initBattle(room: string, battleCtor: typeof Battle): void
    {
        let rqid: number; // request id used for validation
        function sender(choice: Choice): void
        {
            this.addResponses(room, `|/choose ${choice}|${rqid}`);
        }
        const listener = this.parser.getListener(room);

        const battle = new battleCtor(Network, this.username,
            /*saveAlways*/ true, listener, sender);
        this.battles[this.room] = battle;

        // once the battle's over we can respectfully leave
        listener.on("battleprogress", args => args.events
            // look through all events
            .concat(args.upkeep ? args.upkeep.pre.concat(args.upkeep.post) : [])
            .forEach(event =>
                // once the game ends, be a little sportsmanlike
                ["tie", "win"].includes(event.type) ?
                    this.addResponses(room, "|gg", "|/leave") : undefined))
        .on("deinit", () =>
        {
            this.parser.removeListener(room);
            delete this.battles[this.room];
        })
        .on("request", args =>
        {
            // update rqid to verify our choice
            if (args.rqid) rqid = args.rqid;
        });
    }

    /**
     * Adds a supported battle format.
     * @param format Format id name.
     * @param battleCtor AI to be used for this format.
     */
    public addFormat(format: string, battleCtor: typeof Battle): void
    {
        this.formats[format] = battleCtor;
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
        if (room) responses = responses.map(response => room + response);
        responses.forEach(this.send);
        logger.debug(`sent: ["${responses.join("\", \"")}"]`);
    }
}
