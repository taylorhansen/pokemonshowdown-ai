import { isMajorStatus, MajorStatusName } from "../bot/battle/state/Pokemon";
import { PokemonDetails, PokemonID, PokemonStatus, RequestData } from
    "../parser/MessageData";
import { AnyMessageListener, MessageHandler, Prefix } from "./MessageListener";

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
            if (this.pos === -1)
            {
                this.pos = this.message.length;
            }
            this._room = this.message.substring(1, this.pos);
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
                {
                    // format: |init|<chat or battle>
                    const word = this.getWord();
                    if (word === "chat" || word === "battle")
                    {
                        this.getHandler("init")(word);
                    }
                    break;
                }
                /*case "title":
                case "users":
                    break;*/

                // room messages
                /*case "":
                case "html":
                case "uhtml":
                case "uhtmlchange":
                case "join": case "j": case "J":
                case "leave": case "l": case "L":
                case "chat": case "c": case "C":
                case ":":
                case "c:":
                case "battle": case "b": case "B":
                    break;*/

                // global messages
                /*case "popup":
                case "pm":
                case "usercount":
                case "nametaken":
                    break;*/
                case "challstr": // login key
                {
                    // format: |challstr|<id>|<really long challstr>
                    this.getHandler("challstr")(this.getRestOfLine());
                    break;
                }
                case "updateuser": // user info changed
                {
                    // format: |updateuser|<username>|<0 if guest, 1 otherwise>|
                    //  <avatar id>
                    const username = this.getWord();
                    if (!username) break;
                    const unparsedGuest = this.getWord();
                    if (!unparsedGuest) break;
                    const isGuest = !parseInt(unparsedGuest, 10);
                    this.getHandler("updateuser")(username, isGuest);
                    break;
                }
                /*case "formats":
                case "updatesearch":
                    break;*/
                case "updatechallenges":
                {
                    // change in incoming/outgoing challenges
                    // format: |updatechallenges|<json>
                    // json contains challengesFrom and challengeTo
                    const challenges = JSON.parse(this.getRestOfLine());
                    this.getHandler("updatechallenges")(
                        challenges.challengesFrom);
                    break;
                }
                /*case "queryresponse":
                    break;*/

                // battle initialization
                case "player": // initialize player data
                    // TODO: put blocks in switch cases that have variables to
                    //  prevent name conflicts such as in this case
                {
                    // format: |player|<id>|<username>|<avatarId>
                    // id should be p1 or p2, username is a string, and avatarId
                    //  is an integer
                    const id = this.getWord();
                    if (!id || (id !== "p1" && id !== "p2")) break;
                    const username = this.getWord();
                    if (!username) break;
                    const unparsedAvatar = this.getWord();
                    if (!unparsedAvatar) break;
                    const avatarId = parseInt(unparsedAvatar, 10);
                    this.getHandler("player")(id, username, avatarId);
                    break;
                }
                case "teamsize": // initialize the size of a player's team
                {
                    // format: |teamsize|<player>|<size>
                    // player should be p1 or p2
                    const playerId = this.getWord();
                    if (playerId && (playerId === "p1" || playerId === "p2"))
                    {
                        const unparsedSize = this.getWord();
                        if (unparsedSize)
                        {
                            this.getHandler("teamsize")(playerId,
                                parseInt(unparsedSize, 10));
                        }
                    }
                    break;
                }
                /*case "gametype":
                case "gen":
                case "tier":
                case "rated":
                case "rule":
                case "clearpoke":
                case "poke":
                case "teampreview":
                case "start":
                    break;*/

                // battle progress
                case "request": // move/switch request
                {
                    // format: |request|<json>
                    // json contains active and side pokemon info
                    const unparsedTeam = this.getRestOfLine().trim();
                    // at the start of a battle, a |request| message is sent but
                    //  without any json, so we need to account for that
                    if (unparsedTeam.length)
                    {
                        const parsedTeam = JSON.parse(unparsedTeam);
                        for (const mon of parsedTeam.side.pokemon)
                        {
                            // ident, details, and condition fields are the same
                            //  as the data from a |switch| message
                            mon.ident = MessageParser.parsePokemonID(mon.ident);
                            mon.details = MessageParser.parsePokemonDetails(
                                mon.details);
                            mon.condition = MessageParser.parsePokemonStatus(
                                mon.condition);
                        }
                        this.getHandler("request")(parsedTeam);
                    }
                    break;
                }
                /*case "inactive":
                case "inactiveoff":
                    break;*/
                case "turn": // update turn counter
                {
                    // format: |turn|<turn number>
                    this.getHandler("turn")(parseInt(this.getRestOfLine(), 10));
                    break;
                }
                /*case "win":
                case "tie":
                    break;*/
                case "error": // e.g. invalid move/switch choice
                {
                    // format: |error|[reason] description
                    this.getHandler("error")(this.getRestOfLine());
                    break;
                }
                // major actions
                /*case "move": // a pokemon performed a move (TODO)
                    break;*/
                case "switch": // a pokemon was voluntarily switched
                case "drag": // involuntarily switched, really doesn't matter
                {
                    // format: |<switch or drag>|<pokemon id>|<details>|<status>
                    // pokemon contains active position and nickname
                    // details contains species, gender, etc.
                    // status contains hp (value or %), status, etc.

                    const pokemonId =
                        MessageParser.parsePokemonID(this.getWord());
                    if (!pokemonId)
                    {
                        break;
                    }

                    const details =
                        MessageParser.parsePokemonDetails(this.getWord());
                    if (!details)
                    {
                        break;
                    }

                    const status =
                        MessageParser.parsePokemonStatus(this.getWord());
                    if (!status)
                    {
                        break;
                    }

                    this.getHandler("switch")(pokemonId, details, status);
                    break;
                }
                /*case "detailschange":
                case "-formechange":
                case "replace":
                case "swap":
                case "cant":*/
                case "faint": // a pokemon has fainted
                {
                    // format: |faint|<pokemon id>

                    const pokemonId =
                        MessageParser.parsePokemonID(this.getWord());
                    if (!pokemonId)
                    {
                        break;
                    }

                    this.getHandler("faint")(pokemonId);
                    break;
                }
                case "upkeep":
                    this.getHandler("upkeep")();
                    break;

                // minor actions
                /*case "-fail":
                    break;*/
                case "-damage":
                case "-heal":
                {
                    const pokemonId =
                        MessageParser.parsePokemonID(this.getWord());
                    if (!pokemonId)
                    {
                        break;
                    }

                    const status =
                        MessageParser.parsePokemonStatus(this.getWord());
                    if (!status)
                    {
                        break;
                    }

                    this.getHandler(prefix)(pokemonId, status);
                    break;
                }
                case "-status":
                {
                    const pokemonId =
                        MessageParser.parsePokemonID(this.getWord());
                    if (!pokemonId)
                    {
                        break;
                    }

                    const condition =
                        MessageParser.parseCondition(this.getWord());
                    if (!condition)
                    {
                        break;
                    }

                    this.getHandler(prefix)(pokemonId, condition);
                    break;
                }
                case "-curestatus":
                {
                    const pokemonId =
                        MessageParser.parsePokemonID(this.getWord());
                    if (!pokemonId)
                    {
                        break;
                    }

                    const condition =
                        MessageParser.parseCondition(this.getWord());
                    if (!condition)
                    {
                        break;
                    }

                    this.getHandler(prefix)(pokemonId, condition);
                    break;
                }
                case "-cureteam":
                {
                    const pokemonId =
                        MessageParser.parsePokemonID(this.getWord());
                    if (!pokemonId)
                    {
                        break;
                    }

                    this.getHandler(prefix)(pokemonId);
                    break;
                }
                /*case "-boost":
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
                    break;*/
            }
        }
    }

    /**
     * Parses a Pokemon ID in the form `<position>: <name>`. Position is in the
     * format `<owner><pos>`, where owner determines who's side the pokemon is
     * on and pos is its position on that side (applicable in non-single
     * battles). Name is just the Pokemon's nickname.
     * @param id Unparsed pokemon ID.
     * @returns A parsed PokemonID object, or null if invalid.
     */
    private static parsePokemonID(id: string | null): PokemonID | null
    {
        if (id === null) return null;

        const i = id.indexOf(": ");
        if (i === -1) return null;

        const owner = id.substring(0, i - 1);
        if (owner !== "p1" && owner !== "p2") return null;
        const position = id.substring(i - 1, i);
        const nickname = id.substring(i + 2);
        return { owner, position, nickname };
    }

    /**
     * Parses a Pokemon's details in the form
     * `<species>, shiny, <gender>, L<level>`, where all but the species name is
     * optional. If gender is omitted then it's genderless, and if level is
     * omitted then it's assumed to be level 100.
     * @param details Unparsed pokemon details.
     * @returns A parsed PokemonDetails object, or null if invalid.
     */
    private static parsePokemonDetails(details: string | null):
        PokemonDetails | null
    {
        if (details === null) return null;

        // filter out empty strings
        const words = details.split(", ").filter(word => word.length > 0);
        if (words.length === 0)
        {
            return null;
        }

        const species = words[0];
        let shiny = false;
        let gender: string | null = null;
        let level = 100;
        for (let i = 1; i < words.length; ++i)
        {
            const word = words[i];
            /* istanbul ignore else */
            if (word === "shiny") shiny = true;
            else if (word === "M" || word === "F") gender = word;
            else if (word.startsWith("L"))
            {
                level = parseInt(word.substring(1), 10);
            }
        }

        return { species, shiny, gender, level };
    }

    /**
     * Parses a pokemon's status in the form `<hp>/<hpMax> <status>`. HP is
     * mandatory but can be displayed as a percentage, and status condition is
     * optional.
     * @param status Unparsed pokemon status.
     * @returns A parsed PokemonStatus object, or null if empty.
     */
    private static parsePokemonStatus(status: string | null):
        PokemonStatus | null
    {
        if (status === null) return null;

        if (status === "0 fnt")
        {
            // fainted pokemon
            return {hp: 0, hpMax: 0, condition: ""};
        }

        const slash = status.indexOf("/");
        if (slash === -1) return null;
        let space = status.indexOf(" ", slash);
        // status condition can be omitted, in which case it'll end up as an
        //  empty string
        if (space === -1) space = status.length;

        const hp = parseInt(status.substring(0, slash), 10);
        const hpMax = parseInt(status.substring(slash + 1, space), 10);
        const condition = MessageParser.parseCondition(
                status.substring(space + 1));
        if (condition === null) return null;
        return { hp, hpMax, condition };
    }

    /**
     * Parses a status condition.
     * @param condition Unparsed status condition string.
     * @returns The string if it's a valid MajorStatusName, or null otherwise.
     */
    private static parseCondition(condition: string | null):
        MajorStatusName | null
    {
        return (condition === null || !isMajorStatus(condition)) ?
                null : condition;
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
