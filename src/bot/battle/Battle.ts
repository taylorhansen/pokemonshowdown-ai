import { inspect } from "util";
import { RequestMessage } from "../dispatcher/Message";
import { MessageListener } from "../dispatcher/MessageListener";
import * as logger from "../logger";
import { Choice } from "./Choice";
import { EventProcessor } from "./EventProcessor";

/**
 * Sends a Choice to the server.
 * @param choice Choice to send.
 */
export type ChoiceSender = (choice: Choice) => void;

/** Manages the battle state and the AI. */
export abstract class Battle
{
    /**
     * True if the AI model should always be saved at the end, or false if that
     * should happen if it wins.
     */
    public saveAlways = true;
    /** Used to send the AI's choice to the server. */
    private readonly sender: ChoiceSender;
    /** Last |request| message that was processed. */
    private lastRequest: RequestMessage;
    /** Manages the BattleState by processing events. */
    private eventProcessor: EventProcessor;

    /**
     * Creates a Battle object.
     * @param username Client's username.
     * @param listener Used to subscribe to server messages.
     * @param sender Used to send the AI's choice to the server.
     * @param processor Type of EventProcessor to use.
     */
    constructor(username: string, listener: MessageListener,
        sender: ChoiceSender, processor: typeof EventProcessor = EventProcessor)
    {
        this.eventProcessor = new processor(username);
        this.sender = sender;

        listener
        .on("battleinit", args =>
        {
            logger.debug(`battleinit:
${inspect(args, {colors: true, depth: null})}`);

            this.eventProcessor.initBattle(args);
            this.eventProcessor.printState();

            return this.askAI();
        })
        .on("battleprogress", async args =>
        {
            logger.debug(`battleprogress:
${inspect(args, {colors: true, depth: null})}`);

            this.eventProcessor.handleEvents(args.events);
            this.eventProcessor.printState();

            if (this.eventProcessor.battling)
            {
                this.eventProcessor.printState();

                if (!this.lastRequest.wait) await this.askAI();

                if (this.eventProcessor.newTurn)
                {
                    // some statuses need to have their values updated every
                    //  turn in case the next turn doesn't override them
                    this.eventProcessor.updateStatusTurns();
                }
            }
        })
        .on("request", args =>
        {
            logger.debug(`request:
${inspect(args, {colors: true, depth: null})}`);

            this.eventProcessor.handleRequest(args);
            this.lastRequest = args;
        });
    }

    /**
     * Decides what to do next.
     * @param choices The set of possible choices that can be made.
     * @returns A Promise to compute the command to be sent, e.g. `move 1` or
     * `switch 3`.
     */
    protected abstract decide(choices: Choice[]): Promise<Choice>;

    /** Saves AI state to storage. */
    protected abstract save(): Promise<void>;

    /** Asks the AI what to do next and sends the response. */
    private async askAI(): Promise<void>
    {
        const choices = this.getChoices();
        logger.debug(`choices: [${choices.join(", ")}]`);

        const choice = await this.decide(choices);
        this.sender(choice);
    }

    /**
     * Determines what choices can be made.
     * @returns A list of choices that can be made by the AI.
     */
    private getChoices(): Choice[]
    {
        if (this.lastRequest.wait) return [];

        const choices: Choice[] = [];
        if (!this.lastRequest.forceSwitch)
        {
            // not forced to switch so we can move
            if (this.lastRequest.active)
            {
                const moves = this.lastRequest.active[0].moves;
                for (let i = 0; i < moves.length; ++i)
                {
                    if (!moves[i].disabled)
                    {
                        choices.push(`move ${i + 1}` as Choice);
                    }
                }
            }
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

export interface BattleConstructor
{
    new(username: string, listener: MessageListener, sender: ChoiceSender):
        Battle;
}
