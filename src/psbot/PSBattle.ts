import { inspect } from "util";
import { BattleAgent } from "../battle/agent/BattleAgent";
import { Choice } from "../battle/agent/Choice";
import { BattleState } from "../battle/state/BattleState";
import { Logger } from "../Logger";
import { BattleInitMessage, BattleProgressMessage, ErrorMessage,
    RequestMessage } from "./dispatcher/Message";
import { Sender } from "./PSBot";
import { PSEventHandler } from "./PSEventHandler";
import { RoomHandler } from "./RoomHandler";

/** Translates server messages to PSEventHandler calls. */
export class PSBattle implements RoomHandler
{
    /** State object. */
    protected readonly state: BattleState;
    /** Manages the BattleState by processing events. */
    protected readonly eventHandler: PSEventHandler;
    /** Last |request| message that was processed. */
    protected lastRequest?: RequestMessage;
    /** Available choices from the last decision. */
    protected lastChoices: Choice[] = [];

    /**
     * Whether the last unhandled `|error|` message indicated an unavailable
     * choice. The next message should be a `|request|` to reveal new info if
     * this is true.
     */
    protected get unavailableChoice(): boolean
    {
        return this._unavailableChoice;
    }
    private _unavailableChoice = false;

    /**
     * Creates a PSBattle.
     * @param username Client's username.
     * @param agent Makes the decisions for this battle.
     * @param sender Used to send messages to the server.
     * @param logger Logger object.
     * @param eventHandlerCtor The type of PSEventHandler to use.
     */
    constructor(protected readonly username: string,
        protected readonly agent: BattleAgent,
        private readonly sender: Sender,
        protected readonly logger: Logger, eventHandlerCtor = PSEventHandler)
    {
        this.state = new BattleState();
        this.eventHandler = new eventHandlerCtor(this.username, this.state,
                logger.prefix("PSEventHandler: "));
    }

    /** @override */
    public init(msg: BattleInitMessage): Promise<void>
    {
        this.logger.debug(`battleinit:\n${
            inspect(msg, {colors: false, depth: null})}`);

        this.eventHandler.initBattle(msg);
        this.eventHandler.printState();

        return this.askAgent();
    }

    /** @override */
    public async progress(msg: BattleProgressMessage): Promise<void>
    {
        this.logger.debug(`battleprogress:\n${
            inspect(msg, {colors: false, depth: null})}`);

        this.eventHandler.handleEvents(msg.events);
        this.eventHandler.printState();

        // possibly send a response
        if (this.shouldRespond()) return this.askAgent();
    }

    /** Whether this object should ask its BattleAgent to respond. */
    protected shouldRespond(): boolean
    {
        return this.eventHandler.battling && !!this.lastRequest &&
            !this.lastRequest.wait;
    }

    /** @override */
    public async request(msg: RequestMessage): Promise<void>
    {
        this.logger.debug(`request:\n${
            inspect(msg, {colors: false, depth: null})}`);

        if (this._unavailableChoice)
        {
            // new info is being revealed
            this._unavailableChoice = false;

            if (this.lastRequest && this.lastRequest.active &&
                !this.lastRequest.active[0].trapped && msg.active &&
                msg.active[0].trapped)
            {
                // active pokemon is now known to be trapped
                this.lastChoices = this.lastChoices
                    .filter(c => !c.startsWith("switch"));

                // since this was previously unknown, the opposing pokemon must
                //  have a trapping ability
                this.state.teams.us.active.trapped(
                    this.state.teams.them.active);
            }
            // don't know what happened so just eliminate the last choice
            else this.lastChoices.shift();

            // re-sort remaining choices based on new info
            this.lastChoices = await this.agent.decide(this.state,
                    this.lastChoices);

            this.sender(`|/choose ${this.lastChoices[0]}`);
        }

        this.eventHandler.handleRequest(msg);
        this.lastRequest = msg;
    }

    /** @override */
    public async error(msg: ErrorMessage): Promise<void>
    {
        if (msg.reason.startsWith("[Unavailable choice]"))
        {
            // rejected last choice based on unknown info
            // wait for another (guaranteed) request message before proceeding
            this._unavailableChoice = true;
        }
        else if (msg.reason.startsWith("[Invalid choice]"))
        {
            // rejected last choice based on known info
            this.lastChoices.shift();
            this.sender(`|/choose ${this.lastChoices[0]}`);
        }
    }

    /** Asks the BattleAgent what to do next and sends the response. */
    private async askAgent(): Promise<void>
    {
        const choices = this.getChoices();
        this.logger.debug(`Choices: [${choices.join(", ")}]`);

        this.lastChoices = await this.agent.decide(this.state, choices);
        this.sender(`|/choose ${this.lastChoices[0]}`);
    }

    /**
     * Determines what choices can be made.
     * @returns A list of choices that can be made by the AI.
     */
    private getChoices(): Choice[]
    {
        if (!this.lastRequest) throw new Error("No previous request message");

        const choices: Choice[] = [];

        // move choices
        if (!this.lastRequest.forceSwitch && this.lastRequest.active)
        {
            // not forced to switch so we can move
            const moves = this.lastRequest.active[0].moves;
            let struggle = true;
            for (let i = 0; i < moves.length; ++i)
            {
                if (!moves[i].disabled)
                {
                    choices.push(`move ${i + 1}` as Choice);
                    struggle = false;
                }
            }
            // allow struggle choice if no other move option
            if (struggle) choices.push("move 1");
        }

        // switch choices
        if (!this.lastRequest.active || !this.lastRequest.active[0].trapped)
        {
            // not trapped so we can switch
            const mons = this.lastRequest.side.pokemon;
            for (let i = 0; i < mons.length; ++i)
            {
                if (mons[i].condition.hp !== 0 && !mons[i].active)
                {
                    choices.push(`switch ${i + 1}` as Choice);
                }
            }
        }

        return choices;
    }
}
