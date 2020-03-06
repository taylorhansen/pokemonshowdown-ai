import { choiceIds } from "../../../../src/battle/agent/Choice";
import { Logger } from "../../../../src/Logger";
import { BattleInitMessage, BattleProgressMessage } from
    "../../../../src/psbot/parser/Message";
import { PSBattle } from "../../../../src/psbot/PSBattle";
import { Sender } from "../../../../src/psbot/PSBot";
import { PSEventHandler } from "../../../../src/psbot/PSEventHandler";
import { Experience } from "../helpers/Experience";
import { ExperienceNetwork } from "../helpers/ExperienceNetwork";
import { RewardBattleDriver } from "../helpers/RewardBattleDriver";

/**
 * PSBattle that emits Experience objects. Should be subclassed to define where
 * the emitted Experience objects should go.
 */
export class ExperiencePSBattle extends PSBattle
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

    /**
     * Hook for logging Experience objects. This method owns the given
     * Experience, so it must be properly disposed once it's done being used.
     * @virtual
     */
    protected async emitExperience(exp: Experience): Promise<void>
    {
        exp.state.dispose();
        exp.logits.dispose();
    }

    /** @override */
    public async init(msg: BattleInitMessage): Promise<void>
    {
        await super.init(msg);

        // the rewards from the init turn don't matter since it's not a result
        //  of our actions
        // TODO: team preview?
        this.driver.consumeReward();
    }

    /** @override */
    public async progress(msg: BattleProgressMessage): Promise<void>
    {
        // store the last prediction that was made, which will be handled by the
        //  environment
        const {lastState, lastLogits, lastValue} = this.agent;
        let valueData: number | undefined;
        if (this.shouldRespond() && lastState && lastLogits && lastValue)
        {
            // ExperienceNetwork tensor fields not set to null will be disposed
            //  on the next response
            this.agent.lastState = null;
            this.agent.lastLogits = null;
            valueData = await lastValue.array();
        }
        const lastAction = choiceIds[this.lastChoices[0]];

        // handle the action and observe the reward from the state transition
        await super.progress(msg);
        const reward = this.driver.consumeReward();

        // once the game ends, make sure to dispose any leftover tensors from
        //  the ExperienceNetwork
        if (!this.eventHandler.battling) this.agent.cleanup();

        // after observing the reward, we can now emit an Experience
        if (this.shouldRespond() && lastState && lastLogits &&
            valueData !== undefined)
        {
            return this.emitExperience(
            {
                state: lastState, logits: lastLogits, value: valueData,
                action: lastAction, reward
            });
        }
    }
}
