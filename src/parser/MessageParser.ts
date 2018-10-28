import { BattleInitArgs, BattleProgressArgs } from "../AnyMessageListener";
import { AbilityEvent, BattleEvent, BattleUpkeep,
    Cause, CureStatusEvent, CureTeamEvent, DamageEvent, FaintEvent,
    isEventPrefix, isMajorStatus, isPlayerId, MajorStatus,
    MoveEvent, PlayerID, PokemonDetails, PokemonID, PokemonStatus, StartEvent,
    StatusEvent, SwitchEvent, TieEvent, WinEvent } from "../messageData";
import { ShallowNullable } from "../types";
import { Parser } from "./Parser";

/**
 * Parses messages sent from the server. Instead of producing some kind of
 * syntax tree, this parser executes event listeners or callbacks whenever it
 * has successfully parsed a message.
 */
export class MessageParser extends Parser
{
    /** @override */
    public get room(): string
    {
        return this._room;
    }

    /** The current line separated into words. */
    private get line(): string[]
    {
        return this.lines[this.lineN];
    }

    /** Current room we're parsing messages from. */
    private _room: string;
    /** Message split up into lines and words. Words are separated by a `|`. */
    private lines: string[][];
    /** Current line number we're parsing at. */
    private lineN: number;

    /** @override */
    public parse(message: string): void
    {
        // start with parsing the room name if possible
        // format: >roomname
        let pos: number;
        if (message.startsWith(">"))
        {
            pos = message.indexOf("\n", 1);
            if (pos === -1)
            {
                pos = message.length;
            }
            this._room = message.substring(1, pos);
        }
        else
        {
            pos = 0;
            this._room = "";
        }

        this.lines = message
            // omit room name as we get into the actual messages
            .substr(pos)
            // split each message into lines
            .split("\n")
            // split each line into word segments
            .map(line => line
                // since message lines start with a pipe character, omit that
                //  when parsing the words or we'll get an empty string for the
                //  first word of every line
                .substr(1)
                .split("|"));
        this.lineN = 0;

        while (this.lineN < this.lines.length)
        {
            this.parseMessage();
        }
    }

    /**
     * Parses a single message line. After being fully parsed, the `line` field
     * should point to the next unparsed line.
     */
    private parseMessage(): void
    {
        switch (this.line[0])
        {
            // taken from PROTOCOL.md in github.com/Zarel/Pokemon-Showdown

            // room initialization
            case "init": // joined a room
                this.parseInit();
                break;
            case "deinit": // left a room
                this.parseDeInit();
                break;

            // global messages
            case "challstr": // login key
                this.parseChallstr();
                break;
            case "updateuser": // user info changed
                this.parseUpdateUser();
                break;
            case "updatechallenges":
                // change in incoming/outgoing challenges
                this.parseUpdateChallenges();
                break;

            // battle initialization
            case "player": // initialize battle/player data
                this.parseBattleInit();
                break;

            // battle progress
            case "request": // move/switch request
                this.parseRequest();
                break;
            case "error": // e.g. invalid move/switch choice
                this.parseError();
                break;

            default:
                if (["drag", "move", "switch"].includes(this.line[0]) ||
                    isEventPrefix(this.line[0]))
                {
                    this.parseBattleProgress();
                }
                // ignore
                else this.nextLine();
        }
    }

    /** Advances the `line` field to the next line. */
    private nextLine(): void
    {
        ++this.lineN;
    }

    /**
     * Gets all words of the given line strung together.
     * @param index Index at which to start concatenating words.
     * @param lineN Line index used to get the words. Omit to assume the current
     * line.
     */
    private getRestOfLine(index = 1, lineN = this.lineN): string
    {
        return this.lines[lineN].slice(index).join("|");
    }

    /**
     * Parses a `challstr` message.
     *
     * Format:
     * @example
     * |challstr|<challstr>
     */
    private parseChallstr(): void
    {
        const challstr = this.getRestOfLine();

        this.nextLine();
        this.handle("challstr", {challstr});
    }

    /**
     * Parses a `deinit` message.
     *
     * Format:
     * @example
     * |deinit
     */
    private parseDeInit(): void
    {
        this.nextLine();
        this.handle("deinit", {});
    }

    /**
     * Parses an `error` message.
     *
     * Format:
     * @example
     * |error|[reason] <description>
     */
    private parseError(): void
    {
        const reason = this.getRestOfLine();
        this.nextLine();
        this.handle("error", {reason});
    }

    /**
     * Parses an `init` message.
     *
     * Format:
     * @example
     * |init|<chat or battle>
     */
    private parseInit(): void
    {
        const type = this.line[1];
        this.nextLine();
        if (type === "chat" || type === "battle")
        {
            this.handle("init", {type});
        }
    }

    /**
     * Parses a `request` message. The JSON data in the RequestArgs need to have
     * their side pokemon details parsed first.
     *
     * Format:
     * @example
     * |request|<unparsed RequestArgs json>
     */
    private parseRequest(): void
    {
        const args = MessageParser.parseJSON(this.getRestOfLine());
        this.nextLine();
        if (!args) return;

        // some info is encoded in a string that needs to be further parsed
        for (const mon of args.side.pokemon)
        {
            // ident, details, and condition fields are the same format as
            //  the data from a |switch| message
            mon.ident = MessageParser.parsePokemonID(mon.ident);
            mon.details = MessageParser.parsePokemonDetails(mon.details);
            mon.condition = MessageParser.parsePokemonStatus(mon.condition);
        }

        this.handle("request", args);
    }

    /**
     * Parses an `updatechallenges` message.
     *
     * Format:
     * @example
     * |updatechallenges|<UpdateChallengesArgs json>
     */
    private parseUpdateChallenges(): void
    {
        const args = MessageParser.parseJSON(this.getRestOfLine());
        this.nextLine();
        if (!args) return;

        // challengeTo may be null, which Parser.handle usually rejects
        args.challengeTo = args.challengeTo || {};
        this.handle("updatechallenges", args);
    }

    /**
     * Parses an `updateuser` message.
     *
     * Format:
     * @example
     * |updateuser|<our username>|<0 if guest, 1 otherwise>|<avatarId>
     */
    private parseUpdateUser(): void
    {
        const line = this.line;
        const username = line[1];
        const isGuest = line[2] ? !MessageParser.parseInt(line[2]) : null;

        this.nextLine();
        this.handle("updateuser", {username, isGuest});
    }

    /**
     * Parses the initial battle initialization multiline message.
     *
     * Format:
     * @example
     * |player|<our PlayerID>|<our username>|<avatar id>
     * |teamsize|p1|<team size>
     * |teamsize|p2|<team size>
     * |gametype|<game type>
     * |gen|<gen #>
     * <...>
     * |start
     * <initial BattleEvents>
     * |turn|1
     */
    private parseBattleInit(): void
    {
        const args: ShallowNullable<BattleInitArgs> =
        {
            id: null, username: null, teamSizes: null, gameType: null,
            gen: null, events: null
        };
        args.events = [];

        while (this.lineN < this.lines.length)
        {
            const line = this.line;
            switch (line[0])
            {
                case "player":
                    args.id = MessageParser.parsePlayerId(line[1]);
                    args.username = line[2];
                    this.nextLine();
                    break;
                case "teamsize":
                {
                    const id = MessageParser.parsePlayerId(line[1]);
                    const size = MessageParser.parseInt(line[2]);

                    if (!args.teamSizes)
                    {
                        args.teamSizes = {} as BattleInitArgs["teamSizes"];
                    }
                    if (id && size) args.teamSizes[id] = size;
                    this.nextLine();
                    break;
                }
                case "gametype":
                    args.gameType = line[1];
                    this.nextLine();
                    break;
                case "gen":
                    args.gen = MessageParser.parseInt(line[1]);
                    this.nextLine();
                    break;
                default:
                    if (isEventPrefix(line[0]))
                    {
                        // start of initial events
                        args.events.push(...this.parseBattleEvents());
                    }
                    // ignore
                    else this.nextLine();
            }
        }
        this.handle("battleinit", args);
    }

    /**
     * Parses a battle progress multiline message. Composed of multiple main
     * BattleEvents, optionally terminated by end-of-turn BattleUpkeep events.
     *
     * Format:
     * @example
     * <main BattleEvents>
     * |
     * <BattleUpkeep>
     * |turn|<new turn #>
     */
    private parseBattleProgress(): void
    {
        const args: ShallowNullable<BattleProgressArgs> =
            {events: this.parseBattleEvents()};

        if (this.line && this.line[0] === "")
        {
            // empty line between main events and upkeep events
            this.nextLine();
            args.upkeep = this.parseBattleUpkeep();
        }
        if (this.line && this.line[0] === "turn")
        {
            args.turn = MessageParser.parseInt(this.line[1]);
            this.nextLine();
        }
        this.handle("battleprogress", args);
    }

    /**
     * Parses BattleEvent messages until either the end of the message, a blank
     * line, or a `turn` or `upkeep` message is found.
     * @returns An array of parsed BattleEvents.
     */
    private parseBattleEvents(): BattleEvent[]
    {
        const events: BattleEvent[] = [];
        while (this.lineN < this.lines.length && this.line[0] &&
            this.line[0] !== "turn" && this.line[0] !== "upkeep")
        {
            const event = this.parseBattleEvent();
            if (event) events.push(event);
        }
        return events;
    }

    /**
     * Parses a BattleEvent.
     * @returns A BattleEvent, or null if invalid.
     */
    private parseBattleEvent(): BattleEvent | null
    {
        switch (this.line[0])
        {
            case "-ability": return this.parseAbilityEvent();
            case "-curestatus": return this.parseCureStatusEvent();
            case "-cureteam": return this.parseCureTeamEvent();
            case "-damage": case "-heal": return this.parseDamageEvent();
            case "faint": return this.parseFaintEvent();
            case "move": return this.parseMoveEvent();
            case "-start": return this.parseStartEvent();
            case "-status": return this.parseStatusEvent();
            case "switch": case "drag": return this.parseSwitchEvent();
            case "tie": return this.parseTieEvent();
            case "win": return this.parseWinEvent();
            default:
                // ignore
                this.nextLine();
                return null;
        }
    }

    /**
     * Parses an AbilityEvent.
     *
     * Format
     * @example
     * |-ability|<PokemonID>|<ability name>
     *
     * @returns An AbilityEvent, or null if invalid.
     */
    private parseAbilityEvent(): AbilityEvent | null
    {
        const line = this.line;
        const id = MessageParser.parsePokemonID(line[1]);
        const ability = line[2];

        this.nextLine();
        if (!id || !ability) return null;
        return {type: "ability", id, ability};
    }

    /**
     * Parses a CureStatusEvent.
     *
     * Format:
     * @example
     * |-curestatus|<PokemonID>|<cured MajorStatus>
     *
     * @returns A CureStatusEvent, or null if invalid.
     */
    private parseCureStatusEvent(): CureStatusEvent | null
    {
        const line = this.line;
        const id = MessageParser.parsePokemonID(line[1]);
        const majorStatus = MessageParser.parseMajorStatus(line[2]);

        this.nextLine();
        if (!id || !majorStatus) return null;
        return {type: "curestatus", id, majorStatus};
    }

    /**
     * Parses a CureTeamEvent.
     *
     * Format:
     * @example
     * |-cureteam|<PokemonID>
     *
     * @returns A CureTeamEvent, or null if invalid.
     */
    private parseCureTeamEvent(): CureTeamEvent | null
    {
        const id = MessageParser.parsePokemonID(this.line[1]);

        this.nextLine();
        if (!id) return null;
        return {type: "cureteam", id};
    }

    /**
     * Parses a DamageEvent.
     *
     * Format:
     * @example
     * |<-damage or -heal>|<PokemonID>|<new PokemonStatus>
     *
     * // optional message suffixes:
     * |[from] item: <item name>
     *
     * @returns A DamageEvent, or null if invalid.
     */
    private parseDamageEvent(): DamageEvent | null
    {
        const line = this.line;
        const type = line[0].substr(1); // get rid of the dash
        const id = MessageParser.parsePokemonID(line[1]);
        const status = MessageParser.parsePokemonStatus(line[2]);

        this.nextLine();
        if ((type !== "damage" && type !== "heal") || !id || !status)
        {
            return null;
        }

        if (line.length > 3)
        {
            // FOR NOW: ignore errored (null) Causes
            const cause = MessageParser.parseCause(line[3]);
            if (cause) return {type, id, status, cause};
        }

        return {type, id, status};
    }

    /**
     * Parses a FaintEvent.
     *
     * Format:
     * @example
     * |faint|<PokemonID>
     *
     * @returns A FaintEvent, or null if invalid.
     */
    private parseFaintEvent(): FaintEvent | null
    {
        const id = MessageParser.parsePokemonID(this.line[1]);

        this.nextLine();
        if (!id) return null;
        return {type: "faint", id};
    }

    /**
     * Parses a MoveEvent.
     *
     * Format:
     * @example
     * |move|<user PokemonID>|<move name>|<target PokemonID>
     *
     * // Optional message suffixes:
     * |[miss]
     * |[from]<effect name>
     *
     * @returns A MoveEvent, or null if invalid.
     */
    private parseMoveEvent(): MoveEvent | null
    {
        const line = this.line;
        const id = MessageParser.parsePokemonID(line[1]);
        const moveName = line[2];
        const targetId = MessageParser.parsePokemonID(line[3]);

        this.nextLine();
        if (!id || !moveName || !targetId) return null;

        const event: MoveEvent = {type: "move", id, moveName, targetId};

        // parse optional suffixes
        for (let i = 4; i < line.length; ++i)
        {
            const cause = MessageParser.parseCause(line[i]);
            if (cause) event.cause = cause;
        }
        return event;
    }

    /**
     * Parses a StartEvent.
     *
     * Format:
     * @example
     * |-start|<PokemonID>|<volatile>
     *
     * // optional message suffixes:
     * [fatigue]
     */
    private parseStartEvent(): StartEvent | null
    {
        const line = this.line;
        const id = MessageParser.parsePokemonID(line[1]);
        const volatile = line[2];

        this.nextLine();
        if (!id || !volatile) return null;

        if (line.length > 3)
        {
            const cause = MessageParser.parseCause(line[3]);
            if (cause) return {type: "start", id, volatile, cause};
        }
        return {type: "start", id, volatile};
    }

    /**
     * Parses a StatusEvent.
     *
     * Format:
     * @example
     * |-status|<PokemonID>|<new MajorStatus>
     *
     * @returns A StatusEvent, or null if invalid.
     */
    private parseStatusEvent(): StatusEvent | null
    {
        const line = this.line;
        const id = MessageParser.parsePokemonID(line[1]);
        const majorStatus = MessageParser.parseMajorStatus(line[2]);

        this.nextLine();
        if (!id || !majorStatus) return null;
        return {type: "status", id, majorStatus};
    }

    /**
     * Parses a SwitchEvent.
     *
     * Format:
     * @example
     * |<switch or drag>|<replacing PokemonID>|<PokemonDetails>|<PokemonStatus>
     *
     * @returns A SwitchInEvent, or null if invalid.
     */
    private parseSwitchEvent(): SwitchEvent | null
    {
        const line = this.line;
        const id = MessageParser.parsePokemonID(line[1]);
        const details = MessageParser.parsePokemonDetails(line[2]);
        const status = MessageParser.parsePokemonStatus(line[3]);

        this.nextLine();
        if (!id || !details || !status) return null;
        return {type: "switch", id, details, status};
    }

    /**
     * Parses a TieEvent.
     *
     * Format:
     * @example
     * |tie
     *
     * @returns A TieEvent.
     */
    private parseTieEvent(): TieEvent
    {
        this.nextLine();
        return {type: "tie"};
    }

    /**
     * Parses a WinEvent.
     *
     * Format:
     * @example
     * |win|<username>
     *
     * @returns A WinEvent.
     */
    private parseWinEvent(): WinEvent
    {
        const winner = this.getRestOfLine();
        this.nextLine();
        return {type: "win", winner};
    }

    /**
     * Parses a BattleUpkeep.
     *
     * Format:
     * @example
     * <pre upkeep messages>
     * |upkeep
     * <post upkeep messages>
     */
    private parseBattleUpkeep(): BattleUpkeep
    {
        const upkeep: BattleUpkeep = {pre: this.parseBattleEvents(), post: []};
        if (this.line && this.line[0] === "upkeep") this.nextLine();
        upkeep.post = this.parseBattleEvents();
        return upkeep;
    }

    /**
     * Parses an event Cause.
     * @param str String to parse.
     * @returns A Cause, or null if invalid.
     */
    private static parseCause(str: string): Cause | null
    {
        if (str === "[fatigue]") return {type: "fatigue"};
        else if (str.startsWith("[from] item: "))
        {
            return {type: "item", item: str.substr("[from] item: ".length)};
        }
        else if (str === "[from]lockedmove") return {type: "lockedmove"};
        return null;
    }

    /**
     * Parses a PlayerID.
     * @param id String to parse.
     * @returns A valid PlayerID, or null if invalid.
     */
    private static parsePlayerId(id?: string): PlayerID | null
    {
        return isPlayerId(id) ? id : null;
    }

    /**
     * Parses an integer.
     * @param n String to parse.
     * @returns An integer, or null if invalid.
     */
    private static parseInt(n?: string): number | null
    {
        if (n)
        {
            const parsed = parseInt(n, 10);
            return isNaN(parsed) ? null : parsed;
        }
        return null;
    }

    /**
     * Parses a JSON object.
     * @param obj String to parse.
     * @returns An object, or null if invalid.
     */
    private static parseJSON(obj?: string): any
    {
        // any falsy type (empty string, null, etc) is invalid
        return obj ? JSON.parse(obj) : null;
    }

    /**
     * Parses a Pokemon ID in the form `<position>: <name>`. Position is in the
     * format `<owner><pos>`, where owner determines who's side the pokemon is
     * on and pos is its position on that side (applicable in non-single
     * battles). Name is just the Pokemon's nickname.
     * @param id Unparsed pokemon ID.
     * @returns A parsed PokemonID object, or null if invalid.
     */
    private static parsePokemonID(id?: string): PokemonID | null
    {
        if (!id) return null;

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
    private static parsePokemonDetails(details?: string): PokemonDetails | null
    {
        if (!details) return null;

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
    private static parsePokemonStatus(status?: string): PokemonStatus | null
    {
        if (!status) return null;

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
        const condition = MessageParser.parseMajorStatus(
                status.substring(space + 1));
        if (condition === null) return null;
        return { hp, hpMax, condition };
    }

    /**
     * Parses a major status.
     * @param status Unparsed status string.
     * @returns The string if it's a valid MajorStatus, or null otherwise.
     */
    private static parseMajorStatus(status?: string): MajorStatus | null
    {
        return isMajorStatus(status) ? status : null;
    }
}
