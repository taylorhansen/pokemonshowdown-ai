import { inspect } from "util";
import { Logger } from "../../Logger";
import { RequestMessage } from "../dispatcher/Message";
import { MessageListener } from "../dispatcher/MessageListener";
import { Choice } from "./Choice";
import { EventProcessor, EventProcessorConstructor } from "./EventProcessor";

/**
 * Sends a Choice to the server.
 * @param choice Choice to send.
 */
export type ChoiceSender = (choice: Choice) => void;

/** Constructs an abstract Battle type. */
export interface BattleConstructor
{
    new(username: string, listener: MessageListener, sender: ChoiceSender,
        logger: Logger): BattleBase;
}

/**
 * Contains public members from the Battle class. Used for polymorphism without
 * having to supply a template argument.
 */
export abstract class BattleBase {}

/**
 * Manages the entire course of a battle in the client's point of view.
 * @template Processor Type of EventProcessor to use.
 */
export abstract class Battle<Processor extends EventProcessor>
    extends BattleBase
{
    /** Manages the BattleState by processing events. */
    protected readonly processor: Processor;
    /** Logger object. */
    protected readonly logger: Logger;
    /** Last |request| message that was processed. */
    protected lastRequest: RequestMessage;
    /** Available choices from the last decision. */
    protected lastChoices: Choice[] = [];
    /** Used to send the AI's choice to the server. */
    private readonly sender: ChoiceSender;

    /**
     * Creates a Battle object.
     * @param username Client's username.
     * @param listener Used to subscribe to server messages.
     * @param sender Used to send the AI's choice to the server.
     * @param processor Type of EventProcessor to use.
     * @param logger Logger object.
     */
    constructor(username: string, listener: MessageListener,
        sender: ChoiceSender, processor: EventProcessorConstructor<Processor>,
        logger: Logger)
    {
        super();
        this.processor = new processor(username, logger);
        this.sender = sender;
        this.logger = logger;

        listener
        .on("battleinit", args =>
        {
            logger.debug(`battleinit:
${inspect(args, {colors: false, depth: null})}`);

            this.processor.initBattle(args);
            this.processor.printState();

            return this.askAI();
        })
        .on("battleprogress", async args =>
        {
            logger.debug(`battleprogress:
${inspect(args, {colors: false, depth: null})}`);

            // last choice was officially accepted by the server
            this.acceptChoice(this.lastChoices[0]);
            this.processor.postTurn();

            this.processor.handleEvents(args.events);
            this.processor.printState();

            if (this.processor.battling)
            {
                this.processor.printState();
                if (!this.lastRequest.wait) await this.askAI();
            }
        })
        .on("request", args =>
        {
            logger.debug(`request:
${inspect(args, {colors: false, depth: null})}`);

            this.processor.handleRequest(args);
            this.lastRequest = args;
        })
        .on("callback", async args =>
        {
            if (args.name === "trapped")
            {
                // last choice is invalid because we're trapped now
                // avoid repeated callback messages by eliminating all switch
                //  choices
                this.lastChoices = this.lastChoices
                    .filter(c => !c.startsWith("switch"));

                // choices are usually restricted by the request message unless
                //  this was not known before, which means the opposing pokemon
                //  has a trapping ability
                this.processor.trapped();

                // re-sort the choices we have left based on new info
                this.lastChoices = await this.decide(this.lastChoices);
            }
            // first choice was rejected
            else this.lastChoices.shift();

            // retry using second choice
            this.sender(this.lastChoices[0]);
        });
    }

    /**
     * Decides what to do next.
     * @param choices The set of possible choices that can be made.
     * @returns A Promise to sort the given choices in order of preference.
     */
    protected abstract decide(choices: Choice[]): Promise<Choice[]>;

    /**
     * Called when the server has officially accepted the Battle instance's
     * Choice decision.
     * @virtual
     */
    protected acceptChoice(choice: Choice): void
    {
    }

    /** Asks the AI what to do next and sends the response. */
    private async askAI(): Promise<void>
    {
        const choices = this.getChoices();
        this.logger.debug(`choices: [${choices.join(", ")}]`);

        this.lastChoices = await this.decide(choices);
        this.sender(this.lastChoices[0]);
    }

    /**
     * Determines what choices can be made.
     * @returns A list of choices that can be made by the AI.
     */
    private getChoices(): Choice[]
    {
        const choices: Choice[] = [];
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
