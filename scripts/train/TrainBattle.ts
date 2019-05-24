import { BattleAgent } from "../../src/battle/agent/BattleAgent";
import { Choice } from "../../src/battle/agent/Choice";
import { Logger } from "../../src/Logger";
import { ChoiceSender, PSBattle } from "../../src/psbot/PSBattle";
import { TrainEventHandler } from "./TrainEventHandler";

/**
 * Battle handler for a PokemonShowdown sim, modified for reinforcement
 * learning.
 */
export class TrainBattle extends PSBattle
{
    /** Gets the last choice that was sent. */
    public get lastChoice(): Choice
    {
        return this.lastChoices[0];
    }

    /** @override */
    protected eventHandler!: TrainEventHandler;

    constructor(username: string, agent: BattleAgent, sender: ChoiceSender,
        logger: Logger, eventHandlerCtor = TrainEventHandler)
    {
        super(username, agent, sender, logger, eventHandlerCtor);
    }

    /** Gets the reward value then resets the counter. */
    public getReward(): number
    {
        return this.eventHandler.getReward();
    }
}
