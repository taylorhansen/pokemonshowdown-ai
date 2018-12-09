import { BattleInitArgs, BattleProgressArgs } from "../AnyMessageListener";
import { BoostableStatName } from "../battle/state/VolatileStatus";
import { AbilityEvent, ActivateEvent, BattleEvent, BattleUpkeep, BoostEvent,
    CantEvent, Cause, CureStatusEvent, CureTeamEvent, DamageEvent, EndEvent,
    FaintEvent, isEventPrefix, isMajorStatus, isPlayerId, MajorStatus,
    MoveEvent, MustRechargeEvent, PlayerID, PokemonDetails, PokemonID,
    PokemonStatus, PrepareEvent, SetHPEvent, StartEvent, StatusEvent,
    SwitchEvent, TieEvent, WinEvent } from "../messageData";
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
    public async parse(message: string): Promise<void>
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

        while (this.lineN < this.lines.length) await this.parseMessage();
    }

    /**
     * Parses a single message line. After being fully parsed, the `line` field
     * should point to the next unparsed line.
     * @returns A promise that resolves once the listener is executed.
     */
    private async parseMessage(): Promise<void>
    {
        switch (this.line[0])
        {
            // taken from PROTOCOL.md in github.com/Zarel/Pokemon-Showdown

            // room initialization
            case "init": // joined a room
                return this.parseInit();
            case "deinit": // left a room
                return this.parseDeInit();

            // global messages
            case "challstr": // login key
                return this.parseChallstr();
            case "updateuser": // user info changed
                return this.parseUpdateUser();
            case "updatechallenges": // change in incoming/outgoing challenges
                return this.parseUpdateChallenges();

            // battle initialization
            case "player": // initialize battle/player data
                return this.parseBattleInit();

            // battle progress
            case "request": // move/switch request
                return this.parseRequest();
            case "error": // e.g. invalid move/switch choice
                return this.parseError();

            default:
                if (["drag", "move", "switch"].includes(this.line[0]) ||
                    isEventPrefix(this.line[0]))
                {
                    return this.parseBattleProgress();
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
    private parseChallstr(): Promise<void>
    {
        const challstr = this.getRestOfLine();
        this.nextLine();
        return this.handle("challstr", {challstr});
    }

    /**
     * Parses a `deinit` message.
     *
     * Format:
     * @example
     * |deinit
     */
    private parseDeInit(): Promise<void>
    {
        this.nextLine();
        return this.handle("deinit", {});
    }

    /**
     * Parses an `error` message.
     *
     * Format:
     * @example
     * |error|[reason] <description>
     */
    private parseError(): Promise<void>
    {
        const reason = this.getRestOfLine();
        this.nextLine();
        return this.handle("error", {reason});
    }

    /**
     * Parses an `init` message.
     *
     * Format:
     * @example
     * |init|<chat or battle>
     */
    private parseInit(): Promise<void>
    {
        const type = this.line[1];
        this.nextLine();
        if (type === "chat" || type === "battle")
        {
            return this.handle("init", {type});
        }
        // ignore invalid messages
        return Promise.resolve();
    }

    /**
     * Parses a `request` message. The JSON data in the RequestArgs need to have
     * their side pokemon details parsed first.
     *
     * Format:
     * @example
     * |request|<unparsed RequestArgs json>
     */
    private parseRequest(): Promise<void>
    {
        const args = MessageParser.parseJSON(this.getRestOfLine());
        this.nextLine();
        // ignore invalid messages
        if (!args) return Promise.resolve();

        // some info is encoded in a string that needs to be further parsed
        for (const mon of args.side.pokemon)
        {
            // ident, details, and condition fields are the same format as
            //  the data from a |switch| message
            mon.ident = MessageParser.parsePokemonID(mon.ident);
            mon.details = MessageParser.parsePokemonDetails(mon.details);
            mon.condition = MessageParser.parsePokemonStatus(mon.condition);
        }

        return this.handle("request", args);
    }

    /**
     * Parses an `updatechallenges` message.
     *
     * Format:
     * @example
     * |updatechallenges|<UpdateChallengesArgs json>
     */
    private parseUpdateChallenges(): Promise<void>
    {
        const args = MessageParser.parseJSON(this.getRestOfLine());
        this.nextLine();
        // ignore invalid messages
        if (!args) return Promise.resolve();

        // challengeTo may be null, which Parser.handle usually rejects
        args.challengeTo = args.challengeTo || {};
        return this.handle("updatechallenges", args);
    }

    /**
     * Parses an `updateuser` message.
     *
     * Format:
     * @example
     * |updateuser|<our username>|<0 if guest, 1 otherwise>|<avatarId>
     */
    private parseUpdateUser(): Promise<void>
    {
        const line = this.line;
        const username = line[1];
        const isGuest = line[2] ? !MessageParser.parseInt(line[2]) : null;

        this.nextLine();
        return this.handle("updateuser", {username, isGuest});
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
    private parseBattleInit(): Promise<void>
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
        return this.handle("battleinit", args);
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
    private parseBattleProgress(): Promise<void>
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
        // TODO: some messages happen after turn event
        return this.handle("battleprogress", args);
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
            case "-activate": return this.parseActivateEvent();
            case "-boost": case "-unboost": return this.parseBoostEvent();
            case "cant": return this.parseCantEvent();
            case "-curestatus": return this.parseCureStatusEvent();
            case "-cureteam": return this.parseCureTeamEvent();
            case "-damage": case "-heal": return this.parseDamageEvent();
            case "-end": return this.parseEndEvent();
            case "faint": return this.parseFaintEvent();
            case "move": return this.parseMoveEvent();
            case "-mustrecharge": return this.parseMustRechargeEvent();
            case "-prepare": return this.parsePrepareEvent();
            case "-sethp": return this.parseSetHPEvent();
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
     * Format:
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
     * Parses an ActivateEvent.
     *
     * Format:
     * @example
     * |-activate|<PokemonID>|<volatile status>
     *
     * @returns An ActivateEvent, or null if invalid.
     */
    private parseActivateEvent(): ActivateEvent | null
    {
        const line = this.line;
        const id = MessageParser.parsePokemonID(line[1]);
        const volatile = line[2];

        this.nextLine();
        if (!id || !volatile) return null;

        return {type: "activate", id, volatile};
    }

    /**
     * Parses a BoostEvent.
     *
     * Format:
     * @example
     * |<-boost or -unboost>|<PokemonID>|<stat name>|<amount>
     *
     * @returns A BoostEvent, or null if invalid.
     */
    private parseBoostEvent(): BoostEvent | null
    {
        const line = this.line;
        const id = MessageParser.parsePokemonID(line[1]);
        const stat = line[2] as BoostableStatName;
        let amount = MessageParser.parseInt(line[3]);

        this.nextLine();
        if (!id || !stat || !amount) return null;

        if (line[0] === "-unboost") amount = -amount;
        return {type: "boost", id, stat, amount};
    }

    /**
     * Parses a CantEvent.
     *
     * Format:
     * @example
     * |cant|<PokemonID>|<reason>|<move (optional)>
     *
     * @returns A CantEvent, or null if invalid.
     */
    private parseCantEvent(): CantEvent | null
    {
        const line = this.line;
        const id = MessageParser.parsePokemonID(line[1]);
        const reason = line[2];
        const moveName = line[3];

        this.nextLine();
        if (!id || !reason) return null;

        if (!moveName) return {type: "cant", id, reason};
        return {type: "cant", id, reason, moveName};
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
     * Parses an EndEvent.
     *
     * Format:
     * @example
     * |-end|<PokemonID>|<volatile status>
     *
     * @returns An EndEvent, or null if invalid.
     */
    private parseEndEvent(): EndEvent | null
    {
        const line = this.line;
        const id = MessageParser.parsePokemonID(line[1]);
        const volatile = line[2];

        this.nextLine();
        if (!id || !volatile) return null;

        return {type: "end", id, volatile};
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
     * Parses a MustRechargeEvent.
     *
     * Format:
     * @example
     * |-mustrecharge|<PokemonID>
     *
     * @returns A MustRechargeEvent, or null if invalid.
     */
    private parseMustRechargeEvent(): MustRechargeEvent | null
    {
        const line = this.line;
        const id = MessageParser.parsePokemonID(line[1]);

        this.nextLine();
        if (!id) return null;
        return {type: "mustrecharge", id};
    }

    /**
     * Parses a PrepareEvent.
     *
     * Format:
     * @example
     * |-prepare|<user PokemonID>|<move name>|<target PokemonID>
     *
     * @returns A PrepareEvent, or null if invalid.
     */
    private parsePrepareEvent(): PrepareEvent | null
    {
        const line = this.line;
        const id = MessageParser.parsePokemonID(line[1]);
        const moveName = line[2];
        const targetId = MessageParser.parsePokemonID(line[3]);

        this.nextLine();
        if (!id || !moveName || !targetId) return null;

        return {type: "prepare", id, moveName, targetId};
    }

    /**
     * Parses a SetHPEvent.
     *
     * Format:
     * @example
     * |-sethp|<PokemonID 1>|<PokemonStatus 1>|<PokemonID 2>|<PokemonStatus 2>
     *
     * @returns A SetHPEvent, or null if invalid.
     */
    private parseSetHPEvent(): SetHPEvent | null
    {
        const line = this.line;
        this.nextLine();
        const event: SetHPEvent = {type: "sethp", newHPs: []};
        for (let i = 1; i < line.length; i += 2)
        {
            const id = MessageParser.parsePokemonID(line[i]);
            const status = MessageParser.parsePokemonStatus(line[i + 1]);
            if (!id || !status) break;
            event.newHPs.push({id, status});
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
     *
     * @returns A StartEvent, or null if invalid.
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
