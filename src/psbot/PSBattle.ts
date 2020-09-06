import { inspect } from "util";
import { BattleAgent } from "../battle/agent/BattleAgent";
import { BattleDriver } from "../battle/driver/BattleDriver";
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
    public get state(): ReadonlyBattleState { return this.driver.state; }

    /** Battle state driver. */
    protected readonly driver: BattleDriver;
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

    /**
     * Creates a PSBattle.
     * @param username Client's username.
     * @param agent Makes the decisions for this battle.
     * @param sender Used to send messages to the server.
     * @param logger Logger object.
     * @param driverCtor The type of BattleDriver to use.
     * @param eventHandlerCtor The type of PSEventHandler to use.
     */
    constructor(protected readonly username: string, agent: BattleAgent,
        private readonly sender: Sender, protected readonly logger: Logger,
        driverCtor = BattleDriver, eventHandlerCtor = PSEventHandler)
    {
        this.driver = new driverCtor(agent, c => this.sender(`|/choose ${c}`),
            logger.addPrefix("BattleDriver: "));
        this.eventHandler = new eventHandlerCtor(this.username,
            logger.addPrefix("PSEventHandler: "));
    }

    /** @override */
    public async init(msg: psmsg.BattleInit): Promise<void>
    {
        const events = this.eventHandler.initBattle(msg);
        this.logger.debug("Init:\n" +
            inspect(events, {colors: false, depth: null}));
        this.driver.handle(...events);

        // possibly send a response
        return this.haltDriver();
    }

    /** @override */
    public async progress(msg: psmsg.BattleProgress): Promise<void>
    {
        // indicate that the last choice was accepted
        this.driver.accept();

        const events = this.eventHandler.handleEvents(msg.events);
        this.logger.debug("Progress:\n" +
            inspect(events, {colors: false, depth: null}));
        this.driver.handle(...events);

        // possibly send a response
        return this.haltDriver();
    }

    /** @override */
    public async request(msg: psmsg.Request): Promise<void>
    {
        if (this.unavailableChoice)
        {
            // new info may be revealed

            if (this.unavailableChoice === "switch" &&
                !this.lastRequest?.active?.[0].trapped &&
                msg.active?.[0].trapped)
            {
                await this.driver.reject("trapped");
            }
            else if (this.unavailableChoice === "move" && msg.active)
            {
                await this.driver.reject("disabled");
            }
            else await this.driver.reject();

            this.unavailableChoice = null;
        }
        this.lastRequest = msg;

        const events = this.eventHandler.handleRequest(msg);
        if (events.length <= 0) return;
        this.logger.debug("Request:\n" +
            inspect(events, {colors: false, depth: null}));
        this.driver.handle(...events);
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
            return this.driver.reject();
        }
    }

    /**
     * Indicates to the BattleDriver that the stream of DriverEvents has
     * temporarily ended, possibly awaiting a response from the user.
     */
    private haltDriver(): Promise<void>
    {
        const command =
            !this.eventHandler.battling || this.lastRequest?.wait ? "wait"
            : this.lastRequest?.forceSwitch ? "switch"
            : "decide";

        // consume lastRequest
        if (command === "decide" && this.lastRequest)
        {
            const event = this.eventHandler.updateMoves(this.lastRequest);
            if (event) this.driver.handle(event);
        }
        this.lastRequest = null;

        // now we can halt
        return this.driver.halt(command);
    }
}
