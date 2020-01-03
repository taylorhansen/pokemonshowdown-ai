import { encodeBattleState } from "../../src/ai/encodeBattleState";
import { BattleAgent } from "../../src/battle/agent/BattleAgent";
import { Choice, choiceIds } from "../../src/battle/agent/Choice";
import { Logger } from "../../src/Logger";
import { BattleInitMessage, BattleProgressMessage } from
    "../../src/psbot/parser/Message";
import { PSBattle } from "../../src/psbot/PSBattle";
import { Sender } from "../../src/psbot/PSBot";
import { PSEventHandler } from "../../src/psbot/PSEventHandler";
import { Experience } from "./Experience";
import { RewardBattleDriver } from "./RewardBattleDriver";

/**
 * PSBattle that emits Experience objects. Must be subclassed to define where
 * the emitted Experience objects go.
 */
export abstract class ExperiencePSBattle extends PSBattle
{
    /** @override */
    protected readonly driver!: RewardBattleDriver;

    /** Tensor data that generated `lastPrediction`. */
    private lastStateData?: number[];
    /** Last action that was handled by the environment. */
    private lastAction?: Choice;
    /** Tensor data that generated `prediction`. */
    private stateData?: number[];

    constructor(username: string, agent: BattleAgent, sender: Sender,
        logger: Logger, driverCtor = RewardBattleDriver,
        eventHandlerCtor?: typeof PSEventHandler)
    {
        super(username, agent, sender, logger, driverCtor, eventHandlerCtor);
    }

    /** Hook for sending Experience objects. */
    protected abstract emitExperience(exp: Experience): Promise<void>;

    /** @override */
    public async init(msg: BattleInitMessage): Promise<void>
    {
        await super.init(msg);

        if (this.shouldRespond())
        {
            // initialize first state vector
            this.stateData = encodeBattleState(this.driver.state);
        }
    }

    /** @override */
    public async progress(msg: BattleProgressMessage): Promise<void>
    {
        // once we're about to make our next Choice, we can now look back on all
        //  the changes that happened and emit an Experience object
        if (this.shouldRespond())
        {
            // update experience fields
            this.lastStateData = this.stateData;
            this.lastAction = this.lastChoices[0];
            const reward = this.driver.consumeReward();
            this.stateData = encodeBattleState(this.driver.state);

            if (this.lastStateData)
            {
                // TODO: also emit after the game ends, with a substantial
                //  negative/positive reward depending on the winner
                await this.emitExperience(
                {
                    state: this.lastStateData,
                    action: choiceIds[this.lastAction],
                    nextState: this.stateData, reward
                });
            }
        }

        return super.progress(msg);
    }
}
