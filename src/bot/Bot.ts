import { Logger } from "../Logger";
import { BattleBase, BattleConstructor } from "./battle/Battle";
import { Choice } from "./battle/Choice";
import { Parser } from "./parser/Parser";

/** Sender function type. */
export type Sender = (response: string) => void;

/** Handles all bot actions. */
export class Bot
{
    /** Used to send response messages to the server. */
    private readonly send: Sender;
    /** Logger object. */
    private readonly logger: Logger;
    /** Supported formats and the object constructors to handle them. */
    private readonly formats:
        {[format: string]: BattleConstructor | undefined} = {};
    /** Keeps track of all the battles we're in. */
    private readonly battles: {[room: string]: BattleBase} = {};
    /** Name of the user. */
    private username = "";

    /**
     * Creates a Bot.
     * @param parser Parses messages from the server.
     * @param send Sends responses to the server.
     * @param logger Logger object.
     */
    constructor(parser: Parser, send: Sender, logger: Logger)
    {
        this.send = send;
        this.logger = logger;

        parser.on(null, "init", args =>
        {
            if (args.type === "battle" &&
                !this.battles.hasOwnProperty(parser.room))
            {
                // joining a new battle
                // room names follow the format battle-<format>-<id>
                const format = parser.room.split("-")[1];
                const battleCtor = this.formats[format];
                if (battleCtor) this.initBattle(parser, battleCtor);
                else
                {
                    this.logger.error(`Unsupported format ${format}`);
                    this.addResponses(parser.room, "|/leave");
                }
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
     * @param parser Parser being used.
     * @param battleCtor AI to be used.
     */
    private initBattle(parser: Parser, battleCtor: BattleConstructor): void
    {
        const room = parser.room;
        let rqid: number; // request id used for validation
        const sender = (choice: Choice) =>
            this.addResponses(room, `|/choose ${choice}|${rqid}`);
        const listener = parser.getListener(room);

        const battle = new battleCtor(this.username, listener, sender,
            this.logger);
        this.battles[room] = battle;

        // once the battle's over we can respectfully leave
        listener.on("battleprogress", args => args.events
            .forEach(event =>
                // once the game ends, be a little sportsmanlike
                ["tie", "win"].includes(event.type) ?
                    this.addResponses(room, "|gg", "|/leave") : undefined))
        .on("deinit", () =>
        {
            parser.removeListener(room);
            delete this.battles[room];
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
    public addFormat(format: string, battleCtor: BattleConstructor): void
    {
        this.formats[format] = battleCtor;
    }

    /**
     * Sends a list of responses to the server.
     * @param room Room to send the response from. Can be null if it doesn't
     * matter.
     * @param responses Responses to be sent to the server.
     */
    private addResponses(room: string | null, ...responses: string[]): void
    {
        for (let response of responses)
        {
            if (room) response = room + response;
            this.send(response);
        }
    }
}
