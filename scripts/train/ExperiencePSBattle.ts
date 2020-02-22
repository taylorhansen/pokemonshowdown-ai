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
        if (this.shouldRespond())
        {
            const state = this.agent.lastState;
            const logits = this.agent.lastLogits;
            const value = this.agent.lastValue;
            const action = choiceIds[this.lastChoices[0]];
            const reward = this.driver.consumeReward();

            if (state && logits && value)
            {
                await this.emitExperience(
                {
                    state, logits, value: await value.array(), action, reward
                });

                // indicate that these fields shouldn't be disposed
                this.agent.lastState = null;
                this.agent.lastLogits = null;
            }
        }

        await super.progress(msg);

        // once the game ends, make sure to dispose any leftover tensors from
        //  the ExperienceNetwork
        // TODO: emit a terminal experience after the game ends, with a large
        //  reward depending on the winner
        if (!this.eventHandler.battling)
        {
            this.agent.lastState?.dispose();
            this.agent.lastLogits?.dispose();
            this.agent.lastValue?.dispose();
        }
    }
}
