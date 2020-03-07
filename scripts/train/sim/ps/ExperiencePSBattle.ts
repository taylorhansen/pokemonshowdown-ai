import * as tf from "@tensorflow/tfjs-node";
import { choiceIds } from "../../../../src/battle/agent/Choice";
import { Logger } from "../../../../src/Logger";
import { BattleInitMessage, BattleProgressMessage } from
    "../../../../src/psbot/parser/Message";
import { PSBattle } from "../../../../src/psbot/PSBattle";
import { Sender } from "../../../../src/psbot/PSBot";
import { PSEventHandler } from "../../../../src/psbot/PSEventHandler";
import { Experience } from "../helpers/Experience";
import { ExperienceAgent } from "../helpers/experienceNetworkAgent";
import { RewardBattleDriver } from "../helpers/RewardBattleDriver";
import { NetworkData } from "../../../../src/ai/networkAgent";

/**
 * PSBattle that emits Experience objects. Should be subclassed to define where
 * the emitted Experience objects should go.
 */
export class ExperiencePSBattle extends PSBattle
{
    /** @override */
    protected readonly driver!: RewardBattleDriver;
    /** @override */
    protected readonly agent!: ExperienceAgent;
    /**
     * Stores the neural network's input and output tensors after the last
     * prediction.
     */
    private networkData: NetworkData | null = null;

    constructor(username: string, agent: ExperienceAgent, sender: Sender,
        logger: Logger, driverCtor = RewardBattleDriver,
        eventHandlerCtor?: typeof PSEventHandler)
    {
        super(username, async (state, choices) =>
            {
                tf.dispose(this.networkData ?? []);
                this.networkData = await agent(state, choices);
            }, sender, logger, driverCtor, eventHandlerCtor);
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
        if (this.shouldRespond() && this.networkData)
        {
            // consume current network data
            const {state, logits, value} = this.networkData;
            this.networkData = null;
            const stateVector = state.squeeze().as1D();
            state.dispose();
            const valueData = await value.array();
            value.dispose();
            const lastAction = choiceIds[this.lastChoices[0]];

            // observe the state transition and the reward gained from it
            await super.progress(msg);
            const reward = this.driver.consumeReward();

            // compile everything into an Experience
            return this.emitExperience(
            {
                state: stateVector, logits, value: valueData,
                action: lastAction, reward
            });
        }
        else
        {
            // just observe the state transition
            // multiple transitions can occur if the opponent has to make more
            //  than one decision (fainting, self-switch moves, etc)
            await super.progress(msg);
            // once the game ends, make sure to dispose any leftover tensors
            //  from the very last prediction
            if (!this.eventHandler.battling) tf.dispose(this.networkData ?? []);
        }
    }
}
