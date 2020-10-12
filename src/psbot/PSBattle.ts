import { inspect } from "util";
import { BattleAgent } from "../battle/agent/BattleAgent";
import { HaltReason } from "../battle/parser/BattleEvent";
import { BattleParser, BattleParserFunc, SenderResult } from
    "../battle/parser/BattleParser";
import * as parsers from "../battle/parser/parsers";
import { ReadonlyBattleState } from "../battle/state/BattleState";
import { Logger } from "../Logger";
import * as psmsg from "./parser/PSMessage";
import { Sender } from "./PSBot";
import { PSEventHandler } from "./PSEventHandler";
import { RoomHandler } from "./RoomHandler";

/** Translates server messages to PSEventHandler calls. */
export class PSBattle implements RoomHandler
{
    /** Internal battle state. */
    public get state(): ReadonlyBattleState
    {
        if (!this._state) throw new Error("State not yet initialized");
        return this._state;
    }
    private _state: ReadonlyBattleState | null = null;

    /** BattleEvent parser. */
    protected readonly parser: BattleParser;
    /** Manages the BattleState by processing events. */
    protected readonly eventHandler: PSEventHandler;
    /** Pending Request message to process into an UpdateMoves event. */
    protected lastRequest: psmsg.Request | null = null;

    /**
     * If the last unhandled `|error|` message indicated an unavailable
     * choice, this field describes the type of rejected Choice, and the next
     * message should be a `|request|` to reveal new info.
     */
    private unavailableChoice: "move" | "switch" | null = null;

    /** Used for controlling the BattleParser's ChoiceSender Promise. */
    private parserSendCallback: null | ((result?: SenderResult) => void) = null;

    /** Promise for the parser to finish handling a `halt` event. */
    private haltPromise: Promise<any> | null = null;

    /**
     * Creates a PSBattle.
     * @param username Client's username.
     * @param agent Makes the decisions for this battle.
     * @param sender Used to send messages to the server.
     * @param logger Logger object.
     * @param parserFunc The type of BattleParser to use.
     * @param eventHandlerCtor The type of PSEventHandler to use.
     */
    constructor(protected readonly username: string, agent: BattleAgent,
        private readonly sender: Sender, protected readonly logger: Logger,
        parserFunc: BattleParserFunc = parsers.gen4,
        eventHandlerCtor = PSEventHandler)
    {
        this.parser = parserFunc(
        {
            agent, logger: logger.addPrefix("BattleParser: "),
            sender: choice =>
                new Promise<SenderResult>(res =>
                {
                    this.parserSendCallback = res;
                    this.sender(`|/choose ${choice}`);
                })
                .finally(() => this.parserSendCallback = null)
        });
        // first iteration should give us the BattleState
        this.parser.next()
            .then(({value}) => this._state = value as ReadonlyBattleState);

        this.eventHandler = new eventHandlerCtor(this.username,
            logger.addPrefix("PSEventHandler: "));
    }

    /** @override */
    public async init(msg: psmsg.BattleInit): Promise<void>
    {
        const events = this.eventHandler.initBattle(msg);
        this.logger.debug("Init:\n" +
            inspect(events, {colors: false, depth: null}));
        for (const event of events) await this.parser.next(event);

        // possibly send a response
        return this.haltParser();
    }

    /** @override */
    public async progress(msg: psmsg.BattleProgress): Promise<void>
    {
        // indicate that the last choice was accepted
        this.parserSendCallback?.();
        if (this.haltPromise) await this.haltPromise;

        const events = this.eventHandler.handleEvents(msg.events);
        this.logger.debug("Progress:\n" +
            inspect(events, {colors: false, depth: null}));
        for (const event of events) await this.parser.next(event);

        // possibly send a response
        return this.haltParser();
    }

    /** @override */
    public async request(msg: psmsg.Request): Promise<void>
    {
        const lastRequest = this.lastRequest;
        this.lastRequest = msg;
        if (this.unavailableChoice)
        {
            // new info may be revealed
            if (this.unavailableChoice === "switch" &&
                !lastRequest?.active?.[0].trapped &&
                msg.active?.[0].trapped)
            {
                this.parserSendCallback?.("trapped");
            }
            else if (this.unavailableChoice === "move" && msg.active)
            {
                this.parserSendCallback?.("disabled");
            }
            else this.parserSendCallback?.(true);

            this.unavailableChoice = null;
            return;
        }

        const events = this.eventHandler.handleRequest(msg);
        if (events.length <= 0) return;
        this.logger.debug("Request:\n" +
            inspect(events, {colors: false, depth: null}));
        for (const event of events) await this.parser.next(event);
    }

    /** @override */
    public async error(msg: psmsg.Error): Promise<void>
    {
        if (msg.reason.startsWith("[Unavailable choice] Can't "))
        {
            // rejected last choice based on unknown info
            // wait for another (guaranteed) request message before proceeding
            const s = msg.reason.substr("[Unavailable choice] Can't ".length);
            // TODO: does this distinction matter?
            if (s.startsWith("move")) this.unavailableChoice = "move";
            else if (s.startsWith("switch")) this.unavailableChoice = "switch";
        }
        else if (msg.reason.startsWith("[Invalid choice]"))
        {
            // rejected last choice based on known info
            this.parserSendCallback?.(true);
        }
    }

    /**
     * Indicates to the BattleParser that the stream of BattleEvents has
     * temporarily halted, awaiting a response from the user or opponent based
     * on `#lastRequest`.
     */
    private async haltParser(): Promise<void>
    {
        // consume lastRequest
        const lastRequest = this.lastRequest;
        this.lastRequest = null;

        // already terminated
        if (!this.eventHandler.battling) return;

        // should never happen
        if (this.haltPromise) throw new Error("Already halted");

        // function that emits the halt event
        const halt = (reason: HaltReason) =>
            this.haltPromise = this.parser.next({type: "halt", reason})
                .finally(() => this.haltPromise = null);

        // set haltPromise field to parser.next(halt)
        // on next accept(), await it then reset it

        // waiting for opponent
        if (lastRequest?.wait) halt("wait");
        // being forced to switch
        else if (lastRequest?.forceSwitch) halt("switch");
        // making a normal move/switch selection
        else
        {
            if (lastRequest)
            {
                // see if we're locked into a multi-turn/recharge move
                const active = lastRequest.active?.[0];
                if (active?.trapped && active.moves.length === 1 &&
                    active.moves[0].pp == null && active.moves[0].maxpp == null)
                {
                    halt("wait");
                    return this.sender("|/choose move 1");
                }

                const event = this.eventHandler.updateMoves(lastRequest);
                this.logger.debug("Update moves:\n" +
                    inspect(event, {colors: false, depth: null}));
                if (event) await this.parser.next(event);
            }
            halt("decide");
        }
    }
}
