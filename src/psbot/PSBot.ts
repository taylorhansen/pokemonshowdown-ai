import fetch, { RequestInit } from "node-fetch";
import { client as WSClient } from "websocket";
import { BattleAgent, BattleAgentCtor } from "../battle/agent/BattleAgent";
import { Choice } from "../battle/agent/Choice";
import { Logger } from "../Logger";
import { MessageListener } from "./dispatcher/MessageListener";
import { parsePSMessage } from "./parser/parsePSMessage";
import { PSBattle } from "./PSBattle";

/** Options for login. */
export interface LoginOptions
{
    /** Account username. */
    username: string;
    /** Account password. */
    password?: string;
    /** Domain to login with. */
    domain: string;
    /** Server id used for login. */
    serverid: string;
}

/** Manages the connection to a PokemonShowdown server. */
export class PSBot
{
    /** Logs data to the user. */
    private readonly logger: Logger;
    /** Websocket client. Used for connecting to the server. */
    private readonly client = new WSClient();
    /** Listens to server messages. */
    private readonly listener = new MessageListener();
    /** Dictionary of accepted formats. */
    private readonly formats: {[format: string]: BattleAgentCtor} = {};
    /** Keeps track of all the battles we're in. */
    private readonly battles: {[room: string]: PSBattle} = {};
    /** Username of the client. */
    private username?: string;
    /** Callback for when the challstr is received. */
    private challstr: (challstr: string) => Promise<void> = async function() {};
    /** Sends a response to the server. */
    private sender: (response: string) => void =
        () => { throw new Error("Sender not initialized"); }
    /** Function to call to resolve the `connect()` promise. */
    private connected: (result: boolean) => void = () => {};

    /**
     * Creates a PSBot.
     * @param logger Logger object to use.
     */
    constructor(logger = Logger.stderr)
    {
        this.logger = logger;
        this.initClient();
        this.initListeners();
    }

    /**
     * Allows the PSBot to accept battle challenges for the given format.
     * @param format Name of the format to use.
     * @param ctor The type of BattleAgent to use for this format.
     */
    public acceptChallenges(format: string, ctor: BattleAgentCtor): void
    {
        this.formats[format] = ctor;
    }

    /**
     * Connects to the server and starts handling messages.
     * @returns A Promise to connect to the server. Resolve to true if
     * successful, otherwise false.
     */
    public connect(url: string): Promise<boolean>
    {
        this.client.connect(url);
        return new Promise(resolve =>
        {
            this.connected = result =>
            {
                // reset connected callback, since the promise is now resolved
                this.connected = () => {};
                resolve(result);
            };
        });
    }

    /** Sets up this PSBot to login once connected. */
    public login(options: LoginOptions): void
    {
        this.challstr = async challstr =>
        {
            // challstr callback consumed, no need to call again
            this.challstr = async function() {};

            // url to make the post request to
            const url = `${options.domain}/~~${options.serverid}/action.php`;

            const init: RequestInit =
            {
                method: "POST",
                headers: {"Content-Type": "application/x-www-form-urlencoded"}
            };

            // used to complete the login
            let assertion: string;

            if (!options.password)
            {
                // login without password
                init.body = `act=getassertion&userid=${options.username}&\
challstr=${challstr}`;
                const res = await fetch(url, init);
                assertion = await res.text();
            }
            else
            {
                // login with password
                init.body = `act=login&name=${options.username}&\
pass=${options.password}&challstr=${challstr}`;
                const res = await fetch(url, init);
                const text = await res.text();
                console.log(`text: ${text}`);
                // response text returns "]" followed by json
                ({assertion} = JSON.parse(text.substr(1)));
            }

            this.sender(`|/trn ${options.username},0,${assertion}`);
        };
    }

    /** Sets avatar id. */
    public setAvatar(avatar: number): void
    {
        this.sender(`|/avatar ${avatar}`);
    }

    /** Initializes websocket client. */
    private initClient(): void
    {
        this.client.on("connect", connection =>
        {
            this.logger.debug("Connected");

            this.sender = (response: string) =>
            {
                connection.sendUTF(response);
                this.logger.debug(`Sent: ${response}`);
            };

            connection.on("error", error =>
                this.logger.error(`Connection error: ${error.toString()}`));
            connection.on("close", (code, reason) =>
                this.logger.debug(`Closing connection (${code}): ${reason}`));
            connection.on("message", data =>
            {
                if (data.type === "utf8" && data.utf8Data)
                {
                    this.logger.debug(`Received:\n${data.utf8Data}`);
                    return parsePSMessage(data.utf8Data, this.listener,
                        this.logger.prefix("Parser: "));
                }
            });

            this.connected(true);
        });
        this.client.on("connectFailed", err =>
        {
            this.logger.error(`Failed to connect: ${err}`);
            this.connected(false);
        });
    }

    /** Initializes the parser's message listeners. */
    private initListeners(): void
    {
        // call challstr callback
        this.listener.on("challstr", msg => this.challstr(msg.challstr));

        this.listener.on("init", (msg, room) =>
        {
            if (!this.battles.hasOwnProperty(room) && msg.type === "battle")
            {
                // joining a new battle
                // room names follow the format battle-<format>-<id>
                const format = room.split("-")[1];
                const agentCtor = this.formats[format];
                if (agentCtor) this.initBattle(new agentCtor(), room);
                else
                {
                    this.logger.error(`Unsupported format ${format}`);
                    this.addResponses(room, "|/leave");
                }
            }
        });

        this.listener.on("updatechallenges", msg =>
        {
            for (const user in msg.challengesFrom)
            {
                if (msg.challengesFrom.hasOwnProperty(user))
                {
                    if (this.formats.hasOwnProperty(msg.challengesFrom[user]))
                    {
                        this.addResponses(null, `|/accept ${user}`);
                    }
                    else this.addResponses(null, `|/reject ${user}`);
                }
            }
        });

        this.listener.on("updateuser", msg =>
        {
            this.username = msg.username;
        });

        // once a battle is over we can respectfully leave
        this.listener.on("battleprogress", (msg, room) =>
            msg.events.forEach(event =>
                ["tie", "win"].includes(event.type) ?
                    this.addResponses(room, "|gg", "|/leave") : undefined));

        // cleanup after leaving a room
        this.listener.on("deinit", (msg, room) =>
        {
            delete this.battles[room];
        });

        // delegate battle-related messages to their appropriate PSBattle
        this.listener.on("battleinit", (msg, room) =>
        {
            if (this.battles.hasOwnProperty(room))
            {
                return this.battles[room].init(msg);
            }
        });

        this.listener.on("battleprogress", (msg, room) =>
        {
            if (this.battles.hasOwnProperty(room))
            {
                return this.battles[room].progress(msg);
            }
        });

        this.listener.on("request", (msg, room) =>
        {
            if (this.battles.hasOwnProperty(room))
            {
                return this.battles[room].request(msg);
            }
        });

        this.listener.on("error", (msg, room) =>
        {
            if (this.battles.hasOwnProperty(room))
            {
                return this.battles[room].error(msg);
            }
        });
    }

    /**
     * Starts a new battle.
     * @param agent BattleAgent to be used.
     */
    private initBattle(agent: BattleAgent, room: string): void
    {
        if (!this.username) throw new Error("Username not initialized");
        const sender = (choice: Choice) =>
            this.addResponses(room, `|/choose ${choice}`);

        this.battles[room] = new PSBattle(this.username, agent, sender,
                this.logger.prefix(`PSBattle(${room}): `));
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
            this.sender(response);
        }
    }
}
