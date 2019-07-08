import fetch, { RequestInit } from "node-fetch";
import { client as WSClient } from "websocket";
import { Logger } from "../Logger";
import { MessageListener } from "./dispatcher/MessageListener";
import { parsePSMessage } from "./parser/parsePSMessage";
import { RoomHandler } from "./RoomHandler";

/** Options for login. */
export interface LoginOptions
{
    /** Account username. */
    readonly username: string;
    /** Account password. */
    readonly password?: string;
    /** Server url used for login. */
    readonly loginServer: string;
}

/** Function type for sending responses to a server. */
export type Sender = (...responses: string[]) => void;

/**
 * Creates a RoomHandler for a room that the PSBot has joined.
 * @param room Room name.
 * @param username Username of the PSBot.
 * @param sender The function that will be used for sending responses.
 */
export type HandlerFactory = (room: string, username: string, sender: Sender) =>
    RoomHandler;

/** Manages the connection to a PokemonShowdown server. */
export class PSBot
{
    /** Websocket client. Used for connecting to the server. */
    private readonly client = new WSClient();
    /** Listens to server messages. */
    private readonly listener = new MessageListener();
    /** Tracks current room handlers. */
    private readonly rooms: {[room: string]: RoomHandler} = {};
    /** Dictionary of accepted formats for battle challenges. */
    private readonly formats: {[format: string]: HandlerFactory} = {};
    /** Username of the client. */
    private username?: string;
    /** Callback for when the challstr is received. */
    private challstr: (challstr: string) => Promise<void> = async function() {};
    /** Sends a response to the server. */
    private sender: Sender =
        () => { throw new Error("Sender not initialized"); }
    /** Function to call to resolve the `connect()` promise. */
    private connected: (err?: Error) => void = () => {};

    /**
     * Creates a PSBot.
     * @param logger Used to log debug info.
     */
    constructor(private readonly logger = Logger.stderr)
    {
        this.initClient();
        this.initListeners();
    }

    /**
     * Allows the PSBot to accept battle challenges for the given format.
     * @param format Name of the format to use.
     * @param fn RoomHandler factory function.
     */
    public acceptChallenges(format: string, fn: HandlerFactory): void
    {
        this.formats[format] = fn;
    }

    /** Connects to the server and starts handling messages. */
    public connect(url: string): Promise<void>
    {
        this.client.connect(url);
        return new Promise((res, rej) =>
        {
            this.connected = err =>
            {
                // reset connected callback, since the promise is now resolved
                this.connected = () => {};

                if (!err) res();
                else rej(err);
            };
        });
    }

    /** Sets up this PSBot to login once connected. */
    public login(options: LoginOptions): Promise<void>
    {
        return new Promise((res, rej) =>
        {
            this.challstr = async challstr =>
            {
                // challstr callback consumed, no need to call again
                this.challstr = async function() {};

                const init: RequestInit =
                {
                    method: "POST",
                    headers:
                    {
                        "Content-Type": "application/x-www-form-urlencoded"
                    }
                };

                // get the assertion string used to confirm login
                let assertion: string;

                if (!options.password)
                {
                    // login without password
                    init.body = `act=getassertion&userid=${options.username}` +
                        `&challstr=${challstr}`;
                    const result = await fetch(options.loginServer, init);
                    assertion = await result.text();

                    if (assertion.startsWith(";"))
                    {
                        // login attempt was rejected
                        if (assertion.startsWith(";;"))
                        {
                            // error message was provided
                            rej(new Error(assertion.substr(2)));
                        }
                        else
                        {
                            rej(new Error(
                                    "A password is required for this account"));
                        }
                        return;
                    }
                }
                else
                {
                    // login with password
                    init.body = `act=login&name=${options.username}` +
                        `&pass=${options.password}&challstr=${challstr}`;
                    const result = await fetch(options.loginServer, init);
                    const text = await result.text();
                    // response text returns "]" followed by json
                    const json = JSON.parse(text.substr(1));

                    assertion = json.assertion;
                    if (!json.actionsuccess)
                    {
                        // login attempt was rejected
                        if (assertion.startsWith(";;"))
                        {
                            // error message was provided
                            rej(new Error(assertion.substr(2)));
                        }
                        else rej(new Error("Invalid password"));
                        return;
                    }
                }

                // complete the login
                this.addResponses("",
                    `|/trn ${options.username},0,${assertion}`);
                res();
            };
        });
    }

    /** Sets avatar id. */
    public setAvatar(avatar: number): void
    {
        this.addResponses("", `|/avatar ${avatar}`);
    }

    /** Initializes websocket client. */
    private initClient(): void
    {
        this.client.on("connect", connection =>
        {
            this.logger.debug("Connected");

            this.sender = (...responses: string[]) =>
            {
                for (const response of responses)
                {
                    connection.sendUTF(response);
                    this.logger.debug(`Sent: ${response}`);
                }
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

            this.connected();
        });
        this.client.on("connectFailed", err =>
        {
            this.logger.error(`Failed to connect: ${err}`);
            this.connected(err);
        });
    }

    /** Initializes the parser's message listeners. */
    private initListeners(): void
    {
        // call challstr callback
        this.listener.on("challstr", msg => this.challstr(msg.challstr));

        this.listener.on("init", (msg, room) =>
        {
            if (!this.rooms.hasOwnProperty(room) && msg.type === "battle")
            {
                // joining a new battle
                // room names follow the format battle-<format>-<id>
                const format = room.split("-")[1];
                if (this.formats.hasOwnProperty(format))
                {
                    // lookup registered BattleAgent
                    if (!this.username)
                    {
                        throw new Error("Username not initialized");
                    }
                    const sender = (...responses: string[]) =>
                        this.addResponses(room, ...responses);

                    this.rooms[room] =
                        this.formats[format](room, this.username, sender);
                }
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
                        this.addResponses("", `|/accept ${user}`);
                    }
                    else this.addResponses("", `|/reject ${user}`);
                }
            }
        });

        this.listener.on("updateuser", m => { this.username = m.username; });

        // once a battle is over we can respectfully leave
        this.listener.on("battleprogress", (msg, room) =>
            msg.events.some(e => ["tie", "win"].includes(e.type)) ?
                this.addResponses(room, "|gg", "|/leave") : undefined);

        // cleanup after leaving a room
        this.listener.on("deinit", (m, room) => { delete this.rooms[room]; });

        // delegate battle-related messages to their appropriate PSBattle
        this.listener.on("battleinit", (msg, room) =>
        {
            if (this.rooms.hasOwnProperty(room))
            {
                return this.rooms[room].init(msg);
            }
        });

        this.listener.on("battleprogress", (msg, room) =>
        {
            if (this.rooms.hasOwnProperty(room))
            {
                return this.rooms[room].progress(msg);
            }
        });

        this.listener.on("request", (msg, room) =>
        {
            if (this.rooms.hasOwnProperty(room))
            {
                return this.rooms[room].request(msg);
            }
        });

        this.listener.on("error", (msg, room) =>
        {
            if (this.rooms.hasOwnProperty(room))
            {
                return this.rooms[room].error(msg);
            }
        });
    }

    /**
     * Sends a list of responses to the server.
     * @param room Room to send the response from. Can be empty if no room in
     * particular.
     * @param responses Responses to be sent to the server.
     */
    private addResponses(room: string, ...responses: string[]): void
    {
        this.sender(...responses.map(res => room + res));
    }
}
