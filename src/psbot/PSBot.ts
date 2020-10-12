import fetch, { RequestInit } from "node-fetch";
import { client as WSClient } from "websocket";
import { Logger } from "../Logger";
import { parsePSMessage } from "./parser/parsePSMessage";
import * as psmsg from "./parser/PSMessage";
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
    /** Function to call to resolve the `#connect()` Promise. */
    private connected: (err?: Error) => void = () => {};

    /**
     * Creates a PSBot.
     * @param logger Used to log debug info.
     */
    constructor(private readonly logger = Logger.stderr)
    {
        this.initClient();
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
                    const {room, messages} = parsePSMessage(data.utf8Data,
                        this.logger.addPrefix("Parser: "));
                    // TODO: ensure promises resolve?
                    return this.handleMessages(room, messages);
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

    /** Handles parsed Messages received from the PS serer. */
    private async handleMessages(room: string, messages: psmsg.Any[]):
        Promise<void>
    {
        for (const msg of messages) await this.handleMessage(room, msg);
    }

    /** Handles a parsed Message received from the PS serer. */
    private async handleMessage(room: string, msg: psmsg.Any): Promise<void>
    {
        switch (msg.type)
        {
            case "challstr":
                return this.challstr(msg.challstr);
            case "init":
            {
                // room already initialized
                if (this.rooms.hasOwnProperty(room) ||
                    // or we don't need to bother with a non-battle room
                    msg.roomType !== "battle")
                {
                    break;
                }

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

                break;
            }
            case "updateChallenges":
                for (const user in msg.challengesFrom)
                {
                    // istanbul ignore next: trivial for object key iteration
                    if (!msg.challengesFrom.hasOwnProperty(user)) continue;

                    if (this.formats.hasOwnProperty(msg.challengesFrom[user]))
                    {
                        this.addResponses("", `|/accept ${user}`);
                    }
                    else this.addResponses("", `|/reject ${user}`);
                }
                break;
            case "updateUser":
                this.username = msg.username;
                break;
            case "deinit":
                // cleanup after leaving a room
                delete this.rooms[room];
                break;

            // delegate battle-related messages to their appropriate PSBattle
            case "battleInit":
                if (!this.rooms.hasOwnProperty(room)) break;
                return this.rooms[room].init(msg);
            case "battleProgress":
                if (!this.rooms.hasOwnProperty(room)) break;
                // leave respectfully if the battle ended
                // TODO: make this into a registered callback
                for (const event of msg.events)
                {
                    if (event.type === "tie" || event.type === "win")
                    {
                        this.addResponses(room, "|gg", "|/leave");
                    }
                }
                return this.rooms[room].progress(msg);
            case "request":
                if (!this.rooms.hasOwnProperty(room)) break;
                return this.rooms[room].request(msg);
            case "error":
                if (!this.rooms.hasOwnProperty(room)) break;
                return this.rooms[room].error(msg);
        }
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
