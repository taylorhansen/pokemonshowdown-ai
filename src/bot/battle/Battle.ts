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
export abstract class BattleBase
{
    /**
     * Decides what to do next.
     * @param choices The set of possible choices that can be made.
     * @returns A Promise to compute the Choice to be sent, e.g. `move 1` or
     * `switch 3`.
     */
    protected abstract decide(choices: Choice[]): Promise<Choice>;
}

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

            this.processor.handleEvents(args.events);
            this.processor.printState();

            if (this.processor.battling)
            {
                this.processor.printState();
                if (!this.lastRequest.wait) await this.askAI();
                this.processor.postAction();
            }
        })
        .on("request", args =>
        {
            logger.debug(`request:
${inspect(args, {colors: false, depth: null})}`);

            this.processor.handleRequest(args);
            this.lastRequest = args;
        });
    }

    /** Asks the AI what to do next and sends the response. */
    private async askAI(): Promise<void>
    {
        const choices = this.getChoices();
        this.logger.debug(`choices: [${choices.join(", ")}]`);

        const choice = await this.decide(choices);
        this.sender(choice);
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
