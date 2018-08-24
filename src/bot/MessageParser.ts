import { PokemonID, PokemonDetails, PokemonStatus } from "./Pokemon";

/** Prefix for a message that tells of the message's type. */
export type Prefix = "init" | "updateuser" | "challstr" | "updatechallenges" |
    "request" | "turn" | "switch";

/**
 * Listens for any type of message and delegates it to one of its specific
 * listeners.
 */
export class AnyMessageListener
{
    /** Registered message listeners for each type of Prefix. */
    private readonly listeners: {readonly [P in Prefix]: MessageListener<P>};

    /** Creates an AnyMessageListener. */
    constructor()
    {
        this.listeners =
        {
            "init": new MessageListener<"init">(),
            "updateuser": new MessageListener<"updateuser">(),
            "challstr": new MessageListener<"challstr">(),
            "updatechallenges": new MessageListener<"updatechallenges">(),
            "request": new MessageListener<"request">(),
            "turn": new MessageListener<"turn">(),
            "switch": new MessageListener<"switch">()
        };
    }

    /**
     * Adds a MessageHandler for a certain message Prefix.
     * @template P Prefix type.
     * @param prefix Message prefix indicating its type.
     * @param handler Function to be called using data from the message.
     * @returns `this` to allow chaining.
     */
    public on<P extends Prefix>(prefix: P, handler: MessageHandler<P>):
        AnyMessageListener
    {
        // need to assert the function type since addHandler is displayed as a
        //  union of all possible MessageHandlers
        (this.listeners[prefix].addHandler as
            (handler: MessageHandler<P>) => void)(handler);
        return this;
    }

    /**
     * Gets the main handler for the given message type.
     * @template P Prefix type.
     * @param prefix Message prefix indicating its type.
     * @returns A function that calls all registered handlers for this message
     * type.
     */
    public getHandler<P extends Prefix>(prefix: P): MessageHandler<P>
    {
        return this.listeners[prefix].handle as MessageHandler<P>;
    }
}

/**
 * Listens for a certain type of message.
 * @template P Describes the message's type.
 */
export class MessageListener<P extends Prefix>
{
    /**
     * Calls all registered handlers with the arguments for this type of
     * message.
     */
    public readonly handle = ((...args: any[]) =>
        // apply the arguments of this main handler to all the sub-handlers
        this.handlers.forEach(handler =>
            (handler as (...args: any[]) => void)(...args))
    ) as MessageHandler<P>;
    /** Array of registered message handlers. */
    private readonly handlers: MessageHandler<P>[] = [];

    /**
     * Adds another message handler.
     * @param handler Function to be called.
     */
    public addHandler(handler: MessageHandler<P>): void
    {
        this.handlers.push(handler);
    }
}

/**
 * Function type for handling certain message types.
 * @template P Describes the message's type.
 */
export type MessageHandler<P extends Prefix> =
    P extends "init" ? InitHandler
    : P extends "updateuser" ? UpdateUserHandler
    : P extends "challstr" ? ChallStrHandler
    : P extends "updatechallenges" ? UpdateChallengesHandler
    : P extends "request" ? RequestHandler
    : P extends "turn" ? TurnHandler
    : P extends "switch" ? SwitchHandler
    : () => void;

/** Types of server rooms. */
export type RoomType = "chat" | "battle";

/**
 * Maps users challenging the client to the battle format they're being
 * challenged to.
 */
export type ChallengesFrom = {[user: string]: string}

/**
 * Handles an `init` message.
 * @param type Type of room we're joining.
 */
export type InitHandler = (type: RoomType) => void;
/**
 * Handles an `updateuser` message.
 * @param username New username.
 * @param isGuest Whether this is a guest account.
 */
export type UpdateUserHandler = (username: string, isGuest: boolean) => void;
/**
 * Handles a `challstr` message.
 * @param challstr String used to verify account login.
 */
export type ChallStrHandler = (challstr: string) => void;
/**
 * Handles an `updatechallenges` message.
 * @param challengesFrom Challenges from others to the client.
 */
export type UpdateChallengesHandler = (challengesFrom: ChallengesFrom) => void;
/**
 * Handles a `request` message.
 * @param team Some of the client's team info.
 */
export type RequestHandler = (team: object) => void;
/**
 * Handles a `turn` message.
 * @param turn Current turn number.
 */
export type TurnHandler = (turn: number) => void;
/**
 * Handles a `switch` message.
 * @param id ID of the pokemon being switched in.
 * @param details Some details on species, level, etc.
 * @param status HP and any status conditions.
 */
export type SwitchHandler = (id: PokemonID, details: PokemonDetails,
    status: PokemonStatus) => void;

/**
 * Parses messages sent from the server. Instead of producing some kind of
 * syntax tree, this parser executes event listeners or callbacks whenever it
 * has successfully parsed a message.
 */
export class MessageParser
{
    /** Registered message listeners. */
    private readonly messageListeners: {[room: string]: AnyMessageListener} =
        {};
    /** Listener for unfamiliar rooms. */
    private readonly newRoomListener = new AnyMessageListener();
    /** Message or Packet being parsed. */
    private message: string;
    /** Position within the string. */
    private pos: number;
    /** Current room we're parsing messages from. */
    private _room: string;

    /** Current room we're parsing messages from. */
    public get room(): string
    {
        return this._room;
    }

    /**
     * Adds a MessageHandler for a certain message Prefix from a certain room.
     * @template P Prefix type.
     * @param room The room the message should originate from. Empty string
     * means lobby or global, while `null` means an unfamiliar room.
     * @param prefix Message prefix indicating its type.
     * @param handler Function to be called using data from the message.
     * @returns `this` to allow chaining.
     */
    public on<P extends Prefix>(room: string | null, prefix: P,
        handler: MessageHandler<P>): MessageParser
    {
        (room !== null ? this.getListener(room) : this.newRoomListener)
            .on(prefix, handler);
        return this;
    }

    /**
     * Gets a message listener for the given room. If the room is unfamiliar,
     * then a new listener is created and returned.
     * @param room The room this message originates from. Empty string means
     * lobby or global.
     * @returns A message listener for the given room.
     */
    public getListener(room: string): AnyMessageListener
    {
        if (!this.messageListeners.hasOwnProperty(room))
        {
            this.messageListeners[room] = new AnyMessageListener();
        }
        return this.messageListeners[room];
    }

    /**
     * Parses the message sent from the server. This is split into lines and
     * parsed separately as little sub-messages.
     * @param message Unparsed message or packet of messages.
     */
    public parse(message: string)
    {
        this.message = message;

        // start with parsing the room name if possible
        // format: >roomname
        if (this.message.startsWith(">"))
        {
            this.pos = this.message.indexOf("\n", 1);
            if (this.pos !== -1)
            {
                this._room = this.message.substring(1, this.pos);
            }
            else
            {
                this._room = "";
            }
        }
        else
        {
            this.pos = 0;
            this._room = "";
        }

        // parse all messages on each line
        while (this.pos >= 0 && this.pos < this.message.length)
        {
            this.parseMessage();

            // advance to the next line
            this.pos = this.message.indexOf("\n", this.pos);
            if (this.pos !== -1)
            {
                // need to skip over that newline
                ++this.pos;
            }
        }
    }

    /**
     * Gets a MessageHandler for the current room and given message prefix. If
     * the room name is unfamiliar, then the new room listener is used.
     * @template P Prefix type.
     * @param prefix Message prefix indicating its type.
     * @returns The appropriate function to call for this message prefix.
     */
    private getHandler<P extends Prefix>(prefix: P):
        MessageHandler<P>
    {
        if (this.messageListeners.hasOwnProperty(this._room))
        {
            return this.messageListeners[this._room].getHandler(prefix);
        }
        return this.newRoomListener.getHandler(prefix);
    }

    /**
     * Parses a single message line.
     */
    private parseMessage(): void
    {
        const prefix = this.getWord();
        if (prefix)
        {
            switch (prefix)
            {
                // taken from PROTOCOL.md in github.com/Zarel/Pokemon-Showdown

                // room initialization
                case "init": // joined a room
                    // format: |init|<chat or battle>
                    const word = this.getWord();
                    if (word === "chat" || word === "battle")
                    {
                        this.getHandler("init")(word);
                    }
                    break;
                case "title":
                case "users":
                    break;

                // room messages
                case "":
                case "html":
                case "uhtml":
                case "uhtmlchange":
                case "join": case "j": case "J":
                case "leave": case "l": case "L":
                case "chat": case "c": case "C":
                case ":":
                case "c:":
                case "battle": case "b": case "B":
                    break;

                // global messages
                case "popup":
                case "pm":
                case "usercount":
                case "nametaken":
                    break;

                case "challstr": // login key
                    // format: |challstr|<id>|<really long challstr>
                    this.getHandler("challstr")(this.getRestOfLine());
                    break;
                case "updateuser": // user info changed
                    // format: |updateuser|<username>|<0 if guest, 1 otherwise>|
                    //  <avatar id>
                    this.getHandler("updateuser")(this.getWord() || "",
                        !parseInt(this.getWord() || "0"));
                    break;
                case "formats":
                case "updatesearch":
                    break;
                case "updatechallenges":
                    // change in incoming/outgoing challenges
                    // format: |updatechallenges|<json>
                    // json contains challengesFrom and challengeTo
                    const challenges = JSON.parse(this.getRestOfLine());
                    this.getHandler("updatechallenges")(
                        challenges["challengesFrom"]);
                    break;
                case "queryresponse":

                // battle initialization
                case "player":
                case "gametype":
                case "gen":
                case "tier":
                case "rated":
                case "rule":
                case "clearpoke":
                case "poke":
                case "teampreview":
                case "start":
                    break;

                // battle progress
                case "request": // move/switch request
                    // format: |request|<json>
                    // json contains active and side pokemon info
                    const unparsedTeam = this.getRestOfLine().trim();
                    // at the start of a battle, a |request| message is sent but
                    //  without any json, so we need to account for that
                    if (unparsedTeam.length)
                    {
                        this.getHandler("request")(JSON.parse(unparsedTeam));
                    }
                    break;
                case "inactive":
                case "inactiveoff":
                    break;
                case "turn": // update turn counter
                    // format: |turn|<turn number>
                    this.getHandler("turn")(parseInt(this.getRestOfLine()));
                    break;
                case "win":
                case "tie":
                    break;

                // major actions
                case "move": // a pokemon performed a move
                    break;
                case "switch": // a pokemon was voluntarily switched
                case "drag": // involuntarily switched, really doesn't matter
                    // format: |<switch or drag>|<pokemon>|<details>|<status>
                    // pokemon contains active position and nickname
                    // details contains species, gender, etc.
                    // status contains hp (value or %), status, etc.

                    const pokemon = this.getWord();
                    let pokemonId: PokemonID | null;
                    if (!pokemon || !(pokemonId = this.parsePokemonID(pokemon)))
                    {
                        break;
                    }

                    const unparsedDetails = this.getWord();
                    let details: PokemonDetails | null;
                    if (!unparsedDetails ||
                        !(details = this.parsePokemonDetails(unparsedDetails)))
                    {
                        break;
                    }

                    const unparsedStatus = this.getWord();
                    let status: PokemonStatus | null;
                    if (!unparsedStatus ||
                        !(status = this.parsePokemonStatus(unparsedStatus)))
                    {
                        break;
                    }

                    this.getHandler("switch")(pokemonId, details, status);
                    break;
                case "detailschange":
                case "-formechange":
                case "replace":
                case "swap":
                case "cant":
                case "faint":
                    break;

                // minor actions
                case "-fail":
                case "-damage":
                case "-heal":
                case "-status":
                case "-curestatus":
                case "-cureteam":
                case "-boost":
                case "-unboost":
                case "-weather":
                case "-fieldstart":
                case "-fieldend":
                case "-sidestart":
                case "-sideend":
                case "-crit":
                case "-supereffective":
                case "-resisted":
                case "-immune":
                case "-item":
                case "-enditem":
                case "-ability":
                case "-endability":
                case "-transform":
                case "-mega":
                case "-activate":
                case "-hint":
                case "-center":
                case "-message":
                    break;
            }
        }
    }

    /**
     * Parses a Pokemon ID in the form `<position>: <name>`. Position is in the
     * format `<owner><pos>`, where owner determines who's side the pokemon is
     * on and pos is its position on that side (applicable in non-single
     * battles). Name is just the Pokemon's nickname.
     * @param id 
     */
    private parsePokemonID(id: string): PokemonID | null
    {
        const i = id.indexOf(": ");
        if (i !== -1)
        {
            const owner = id.substring(0, i - 1);
            const position = id.substring(i - 1, i);
            const nickname = id.substring(i + 2);
            return { owner: owner, position: position, nickname: nickname };
        }
        else
        {
            return null;
        }
    }

    private parsePokemonDetails(details: string): PokemonDetails | null
    {
        const words = details.split(", ");
        if (words.length > 0)
        {
            const species = words[0];
            let shiny: boolean;
            let gender: string | null;
            let level: number;
            let i = 1;

            if (words[i] === "shiny")
            {
                shiny = true;
                ++i;
            }
            else
            {
                shiny = false;
            }

            if (words[i] === "M" || details[i] === "F")
            {
                gender = words[i];
                ++i;
            }
            else
            {
                gender = null;
            }

            // level is always 100 unless otherwise indicated
            level = words[i] && words[i].startsWith("L") ?
                parseInt(words[i].substring(1)) : 100;

            return { species: species, shiny: shiny, gender: gender,
                level: level };
        }
        return null;
    }

    private parsePokemonStatus(status: string): PokemonStatus | null
    {
        const slash = status.indexOf("/");
        if (slash === -1) return null;
        let space = status.indexOf(" ", slash);
        // status condition can be omitted, in which case it'll end up as an
        //  empty string
        if (space === -1) space = status.length;

        const hp = parseInt(status.substring(0, slash));
        const hpMax = parseInt(status.substring(slash + 1, space));
        const condition = status.substring(space + 1);
        return { hp: hp, hpMax: hpMax, condition: condition };
    }

    /**
     * Gets the next phrase which is surrounded by `|` symbols. The last
     * character can optionally have a newline at the end. `pos` should be
     * pointed to the first `|` and will end up on the next `|` or newline, or
     * the end of the string if it encountered the end of the string.
     * @returns The next word in a message, or null if the pipe character was
     * missing.
     */
    private getWord(): string | null
    {
        if (this.message.charAt(this.pos) !== "|")
        {
            // no pipe at beginning
            return null;
        }

        // build up the prefix substring
        let result = "";
        while (++this.pos < this.message.length)
        {
            const c = this.message.charAt(this.pos);
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

    /**
     * Advances `pos` to the end of the line and returns a substring from the
     * original to the new position.
     * @returns The rest of the line from `pos` forward.
     */
    private getRestOfLine(): string
    {
        // this.pos always points to the next pipe so we want to omit that
        const start = this.pos + 1;
        this.pos = this.message.indexOf("\n", start);
        if (this.pos === -1)
        {
            // must be the last line of the message, so there's no terminating
            //  newline
            this.pos = this.message.length;
        }
        return this.message.substring(start, this.pos);
    }
}
