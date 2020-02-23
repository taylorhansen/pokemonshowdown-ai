import { choiceIds } from "../../src/battle/agent/Choice";
import { Logger } from "../../src/Logger";
import { BattleInitMessage, BattleProgressMessage } from
    "../../src/psbot/parser/Message";
import { PSBattle } from "../../src/psbot/PSBattle";
import { Sender } from "../../src/psbot/PSBot";
import { PSEventHandler } from "../../src/psbot/PSEventHandler";
import { Experience } from "./Experience";
import { ExperienceNetwork } from "./ExperienceNetwork";
import { RewardBattleDriver } from "./RewardBattleDriver";

/**
 * PSBattle that emits Experience objects. Must be subclassed to define where
 * the emitted Experience objects go.
 */
export abstract class ExperiencePSBattle extends PSBattle
{
    /** @override */
    protected readonly driver!: RewardBattleDriver;
    /** @override */
    protected readonly agent!: ExperienceNetwork;

    constructor(username: string, agent: ExperienceNetwork, sender: Sender,
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

        // the rewards from the init turn don't matter since it's not a result
        //  of our actions
        this.driver.consumeReward();
    }

    /** @override */
    public async progress(msg: BattleProgressMessage): Promise<void>
    {
        // once we're about to make our next Choice, we can now look back on all
        //  the changes that happened and emit an Experience object
        if (this.shouldRespond()) await this.collectExperience();

        await super.progress(msg);

        // once the game ends, make sure to emit a terminal Experience and
        //  dispose any leftover tensors from the ExperienceNetwork
        if (!this.eventHandler.battling)
        {
            await this.collectExperience();
            this.agent.cleanup();
        }
    }

    /**
     * Emits an Experience object from collected rewards and prediction tensors.
     */
    private async collectExperience(): Promise<void>
    {
        const state = this.agent.lastState;
        const logits = this.agent.lastLogits;
        const value = this.agent.lastValue;
        const action = choiceIds[this.lastChoices[0]];
        const reward = this.driver.consumeReward();

        if (state && logits && value)
        {
            // indicate that these fields shouldn't be disposed later
            this.agent.lastState = null;
            this.agent.lastLogits = null;

            return this.emitExperience(
            {
                state, logits, value: await value.array(), action, reward
            });
        }
    }
}
