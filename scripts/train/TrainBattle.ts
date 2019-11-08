import { Choice } from "../../src/battle/agent/Choice";
import { Logger } from "../../src/Logger";
import { ErrorMessage, RequestMessage } from "../../src/psbot/parser/Message";
import { PSBattle } from "../../src/psbot/PSBattle";
import { Sender } from "../../src/psbot/PSBot";
import { Experience } from "./Experience";
import { TrainEventHandler } from "./TrainEventHandler";
import { TrainNetwork } from "./TrainNetwork";

/**
 * Battle handler for a PokemonShowdown sim, modified for reinforcement
 * learning. This PSBattle subclass keeps an array of Experience objects made
 * after every decision to be used for learning later.
 */
export class TrainBattle extends PSBattle
{
    /** Buffer of Experience objects. */
    public get experiences(): readonly Experience[]
    {
        return this._experiences;
    }
    private readonly _experiences: Experience[] = [];

    /** @override */
    protected readonly agent!: TrainNetwork;
    /** @override */
    public readonly eventHandler!: TrainEventHandler;

    /** Last choice that was handled by the environment. */
    private lastChoice?: Choice;
    /**
     * Next choice that was accepted and is about to be handled by the
     * environment.
     */
    private nextChoice?: Choice;

    constructor(username: string, agent: TrainNetwork, sender: Sender,
        logger: Logger, eventHandlerCtor = TrainEventHandler)
    {
        super(username, agent, sender, logger, eventHandlerCtor);
    }

    /** @override */
    public request(msg: RequestMessage): Promise<void>
    {
        // make sure that we definitely sent a response in the last
        //  battleprogress message and that it was accepted
        if (!this.unavailableChoice && this.shouldRespond())
        {
            this.lastChoice = this.nextChoice;
            this.nextChoice = this.lastChoices[0];
            if (this.lastChoice && this.nextChoice)
            {
                // build Experience replay buffer
                this._experiences.push(this.agent.getExperience(this.lastChoice,
                        this.eventHandler.getReward(), this.nextChoice));
            }
        }

        return super.request(msg);
    }

    /** @override */
    public async error(msg: ErrorMessage): Promise<void>
    {
        await super.error(msg);

        // if new info is being revealed, the current state is invalid, so don't
        //  use that state for creating Experience objects
        if (this.unavailableChoice) this.agent.updateLast = false;
    }

    /** Gets the reward value then resets the counter. */
    public getReward(): number
    {
        return this.eventHandler.getReward();
    }
}
