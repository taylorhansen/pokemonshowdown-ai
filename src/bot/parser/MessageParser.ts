import { Logger } from "../../Logger";
import { AbilityEvent, ActivateEvent, AnyBattleEvent, BoostEvent, CantEvent,
    Cause, CureStatusEvent, CureTeamEvent, DamageEvent, EndEvent, FaintEvent,
    isBattleEventPrefix, MoveEvent, MustRechargeEvent, PrepareEvent, SetHPEvent,
    SingleTurnEvent, StartEvent, StatusEvent, SwitchEvent, TieEvent, TurnEvent,
    UpkeepEvent, WinEvent } from "../dispatcher/BattleEvent";
import { BattleInitMessage } from "../dispatcher/Message";
import { BoostableStatName, isMajorStatus, isPlayerId, MajorStatus, PlayerID,
    PokemonDetails, PokemonID, PokemonStatus } from "../helpers";
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

    /** Logger object. */
    private readonly logger: Logger;
    /** Current room we're parsing messages from. */
    private _room: string;
    /** Message split up into lines and words. Words are separated by a `|`. */
    private lines: string[][];
    /** Current word index we're parsing at. */
    private wordN: number;
    /** Current line index we're parsing at. */
    private lineN: number;

    /**
     * Creates a MessageParser.
     * @param logger Logger object.
     */
    constructor(logger: Logger)
    {
        super();
        this.logger = logger;
    }

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
            // since message lines start with a pipe character, omit that
            //  when parsing the words or we'll get an empty string for the
            //  first word of every line
            .map(line => line.substr(1).split("|"));
        this.wordN = 0;
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
        const word = this.nextWord();
        switch (word)
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
                if (["drag", "move", "switch"].includes(word) ||
                    isBattleEventPrefix(word))
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
        this.wordN = 0;
        ++this.lineN;
    }

    /** Gets the current word being parsed. */
    private peekWord(): string
    {
        return this.line[this.wordN];
    }

    /** Gets the current word then advances to the next one. */
    private nextWord(): string
    {
        return this.line[this.wordN++];
    }

    /** Gets the last parsed word. */
    private previousWord(): string
    {
        return this.line[this.wordN - 1];
    }

    /** Backtracks the word index within the current line. */
    private unGetWord(): void
    {
        --this.wordN;
        if (this.wordN < 0) this.wordN = 0;
    }

    /**
     * Checks whether we're out of lines to parse. If this is true, subsequent
     * calls to `peekWord()`, `nextWord()`, `previousWord()`, and `isEol()` may
     * cause an error.
     */
    private isEnd(): boolean
    {
        return this.lineN >= this.lines.length;
    }

    /**
     * Checks whether we're out of words to parse in the current line. If this
     * is true, calls to `peekWord()`, `nextWord()`, and `previousWord()`, may
     * return undefined.
     */
    private isEol(): boolean
    {
        return this.wordN >= this.line.length;
    }

    /**
     * Gets all words of the given line strung together.
     * @param wordN Index at which to start concatenating words.
     * @param lineN Line index used to get the words. Omit to assume the current
     * line.
     */
    private getRestOfLine(wordN = this.wordN, lineN = this.lineN): string
    {
        return this.lines[lineN].slice(wordN).join("|");
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
        return this.dispatch("challstr", {challstr});
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
        return this.dispatch("deinit", {});
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
        return this.dispatch("error", {reason});
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
        const type = this.nextWord();
        this.nextLine();

        // ignore invalid messages
        // TODO: don't ignore, instead print warnings to log from static parsers
        //  and message parsers (must be testable)
        if (type !== "chat" && type !== "battle") return Promise.resolve();
        return this.dispatch("init", {type});
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
        const text = this.getRestOfLine();
        const args = MessageParser.parseJSON(text);
        this.nextLine();

        if (!args)
        {
            this.logger.error(`Invalid request message json ${text}`);
            return Promise.resolve();
        }

        // some info is encoded in a string that needs to be further parsed
        for (const mon of args.side.pokemon)
        {
            // ident, details, and condition fields are the same format as
            //  the data from a |switch| message
            const ident = MessageParser.parsePokemonID(mon.ident,
                /*pos*/ false);
            if (!ident) this.logger.error(`Invalid PokemonID "${mon.ident}"`);
            mon.ident = ident;

            const details = MessageParser.parsePokemonDetails(mon.details);
            if (!details)
            {
                this.logger.error(`Invalid PokemonDetails "${mon.details}"`);
            }
            mon.details = details;

            const condition = MessageParser.parsePokemonStatus(mon.condition);
            if (!condition)
            {
                this.logger.error(`Invalid PokemonStatus "${mon.condition}"`);
            }
            mon.condition = condition;

            if (!ident || !details || !condition) return Promise.resolve();
        }

        return this.dispatch("request", args);
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
        return this.dispatch("updatechallenges", args);
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
        const username = this.nextWord();
        const word = this.nextWord();
        const isGuest = word ? !MessageParser.parseInt(word) : null;
        this.nextLine();

        // ignore invalid messages
        if (!username || !isGuest) return Promise.resolve();
        return this.dispatch("updateuser", {username, isGuest});
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
        let id: PlayerID | undefined;
        let username: string | undefined;
        let teamSizes: {[P in PlayerID]: number} | undefined;
        let gameType: string | undefined;
        let gen: number | undefined;
        const events: AnyBattleEvent[] = [];

        // first prefix word was already parsed
        this.unGetWord();

        while (!this.isEnd())
        {
            const prefix = this.nextWord();
            switch (prefix)
            {
                case "player":
                {
                    const idWord = this.nextWord();
                    const playerId = MessageParser.parsePlayerId(idWord);
                    const playerName = this.nextWord();
                    if (playerId && playerName)
                    {
                        id = playerId;
                        username = playerName;
                    }
                    if (!playerId)
                    {
                        this.logger.error(`Invalid PlayerID ${idWord}`);
                    }
                    if (!playerName) this.logger.error("No player name given");
                    this.nextLine();
                    break;
                }
                case "teamsize":
                {
                    const idWord = this.nextWord();
                    const teamId = MessageParser.parsePlayerId(idWord);
                    const sizeWord = this.nextWord();
                    const teamSize = MessageParser.parseInt(sizeWord);
                    if (!teamSizes)
                    {
                        teamSizes = {} as BattleInitMessage["teamSizes"];
                    }
                    if (teamId && teamSize) teamSizes[teamId] = teamSize;
                    if (!teamId)
                    {
                        this.logger.error(`Invalid PlayerID ${idWord}`);
                    }
                    if (!teamSize)
                    {
                        this.logger.error(`Invalid team size ${sizeWord}`);
                    }
                    this.nextLine();
                    break;
                }
                case "gametype":
                    gameType = this.nextWord();
                    if (!gameType) this.logger.error("No game type given");
                    this.nextLine();
                    break;
                case "gen":
                {
                    const genWord = this.nextWord();
                    const genNum = MessageParser.parseInt(genWord);
                    if (genNum) gen = genNum;
                    else this.logger.error(`Invalid gen num ${genWord}`);
                    this.nextLine();
                    break;
                }
                    // TODO: team preview
                default:
                    if (isBattleEventPrefix(prefix))
                    {
                        // start of initial events
                        events.push(...this.parseBattleEvents());
                    }
                    // ignore
                    else this.nextLine();
            }
        }

        // ignore invalid messages
        if (!id || !username || !teamSizes ||
            (!teamSizes.p1 || !teamSizes.p2) || !gameType || !gen)
        {
            this.logger.debug("Ignoring invalid battleinit message");
            return Promise.resolve();
        }
        return this.dispatch("battleinit",
            {id, username, teamSizes, gameType, gen, events});
    }

    /**
     * Parses a battle progress multiline message. Composed of multiple
     * BattleEvents.
     */
    private parseBattleProgress(): Promise<void>
    {
        return this.dispatch("battleprogress",
            {events: this.parseBattleEvents()});
    }

    /**
     * Parses BattleEvent messages until the end of the message string.
     * @returns An array of parsed BattleEvents.
     */
    private parseBattleEvents(): AnyBattleEvent[]
    {
        // requires prefix to not have been parsed yet
        this.unGetWord();

        const events: AnyBattleEvent[] = [];
        while (!this.isEnd())
        {
            const event = this.parseBattleEvent();
            if (event) events.push(event);
        }
        return events;
    }

    /**
     * Parses a BattleEvent. Each `parseXEvent()` method must assume that the
     * prefix was already parsed and advance to the next line when done parsing.
     * @returns A BattleEvent, or null if invalid.
     */
    private parseBattleEvent(): AnyBattleEvent | null
    {
        switch (this.nextWord())
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
            case "-singleturn": return this.parseSingleTurnEvent();
            case "-start": return this.parseStartEvent();
            case "-status": return this.parseStatusEvent();
            case "switch": case "drag": return this.parseSwitchEvent();
            case "tie": return this.parseTieEvent();
            case "turn": return this.parseTurnEvent();
            case "upkeep": return this.parseUpkeepEvent();
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
        const id = MessageParser.parsePokemonID(this.nextWord());
        const ability = this.nextWord();

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
        const id = MessageParser.parsePokemonID(this.nextWord());
        const volatile = this.nextWord();

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
        const prefix = this.previousWord();
        const id = MessageParser.parsePokemonID(this.nextWord());
        const stat = this.nextWord() as BoostableStatName;
        let amount = MessageParser.parseInt(this.nextWord());

        this.nextLine();
        if (!id || !stat || !amount) return null;

        if (prefix === "-unboost") amount = -amount;
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
        const id = MessageParser.parsePokemonID(this.nextWord());
        const reason = this.nextWord();
        const moveName = this.nextWord();

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
        const id = MessageParser.parsePokemonID(this.nextWord());
        const majorStatus = MessageParser.parseMajorStatus(this.nextWord());

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
        const id = MessageParser.parsePokemonID(this.nextWord());

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
     * @returns A DamageEvent, or null if invalid.
     */
    private parseDamageEvent(): DamageEvent | null
    {
        const id = MessageParser.parsePokemonID(this.nextWord());
        const status = MessageParser.parsePokemonStatus(this.nextWord());
        const cause = this.parseCause();

        this.nextLine();
        if (!id || !status)
        {
            return null;
        }

        if (cause) return {type: "damage", id, status, cause};
        return {type: "damage", id, status};
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
        const id = MessageParser.parsePokemonID(this.nextWord());
        const volatile = this.nextWord();

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
        const id = MessageParser.parsePokemonID(this.nextWord());

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
        const id = MessageParser.parsePokemonID(this.nextWord());
        const moveName = this.nextWord();
        const targetId = MessageParser.parsePokemonID(this.nextWord());

        // parse optional suffixes
        let cause: Cause | null = null;
        while (!cause && !this.isEol()) cause = this.parseCause();

        this.nextLine();
        if (!id || !moveName || !targetId) return null;

        if (cause) return {type: "move", id, moveName, targetId, cause};
        return {type: "move", id, moveName, targetId};
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
        const id = MessageParser.parsePokemonID(this.nextWord());

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
        const id = MessageParser.parsePokemonID(this.nextWord());
        const moveName = this.nextWord();
        const targetId = MessageParser.parsePokemonID(this.nextWord());

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
        const event: SetHPEvent = {type: "sethp", newHPs: []};
        while (!this.isEol())
        {
            const id = MessageParser.parsePokemonID(this.nextWord());
            const status = MessageParser.parsePokemonStatus(this.nextWord());
            if (!id || !status) break;
            event.newHPs.push({id, status});
        }

        this.nextLine();
        return event;
    }

    /**
     * Parses a SingleTurnEvent.
     *
     * Format:
     * @example
     * |-singleturn|<PokemonID>|<status>
     *
     * @returns A SingleTurn, or null if invalid.
     */
    private parseSingleTurnEvent(): SingleTurnEvent | null
    {
        const id = MessageParser.parsePokemonID(this.nextWord());
        const status = this.nextWord();

        this.nextLine();
        if (!id || !status) return null;
        return {type: "singleturn", id, status};
    }

    /**
     * Parses a StartEvent.
     *
     * Format:
     * @example
     * |-start|<PokemonID>|<volatile>|<other args>
     *
     * // optional message suffixes:
     * [fatigue]
     *
     * @returns A StartEvent, or null if invalid.
     */
    private parseStartEvent(): StartEvent | null
    {
        const id = MessageParser.parsePokemonID(this.nextWord());
        const volatile = this.nextWord();

        const otherArgs: string[] = [];
        let cause: Cause | null = null;
        while (!this.isEol())
        {
            const s = this.peekWord();
            if (!cause) cause = this.parseCause();
            if (!cause) otherArgs.push(s);
        }

        this.nextLine();
        if (!id || !volatile) return null;
        if (cause) return {type: "start", id, volatile, otherArgs, cause};
        return {type: "start", id, volatile, otherArgs};
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
        const id = MessageParser.parsePokemonID(this.nextWord());
        const majorStatus = MessageParser.parseMajorStatus(this.nextWord());

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
        const id = MessageParser.parsePokemonID(this.nextWord());
        const details = MessageParser.parsePokemonDetails(this.nextWord());
        const status = MessageParser.parsePokemonStatus(this.nextWord());

        this.nextLine();
        if (!id || !details || !status) return null;
        return {type: "switch", id, details, status};
    }

    /**
     * Parses an UpkeepEvent.
     *
     * Format:
     * @example
     * |upkeep
     *
     * @returns An UpkeepEvent.
     */
    private parseUpkeepEvent(): UpkeepEvent
    {
        this.nextLine();
        return {type: "upkeep"};
    }

    /**
     * Parses a TurnEvent.
     *
     * Format:
     * @example
     * |turn|<new turn number>
     *
     * @returns A TurnEvent, or null if invalid.
     */
    private parseTurnEvent(): TurnEvent | null
    {
        const num = MessageParser.parseInt(this.nextWord());

        this.nextLine();
        if (!num) return null;
        return {type: "turn", num};
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
     * Parses an event Cause.
     * @returns A Cause, or null if invalid.
     */
    private parseCause(): Cause | null
    {
        const str = this.nextWord();
        if (!str) return null;
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
     * @param pos Whether to require pos in format. This should only be false
     * when parsing a `request` message. Default true.
     * @returns A parsed PokemonID object, or null if invalid.
     */
    private static parsePokemonID(id?: string, pos = true): PokemonID | null
    {
        if (!id) return null;

        const owner = id.substring(0, 2);
        if (!isPlayerId(owner)) return null;

        if (pos)
        {
            const result =
            {
                owner, position: id.substring(2, 3), nickname: id.substring(5)
            };
            return result;
        }
        // no pos required, in which case you'd only see "p1: <nickname>"
        return {owner, nickname: id.substring(4)};
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
