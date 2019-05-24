import { Network } from "../../src/ai/Network";
import { Choice, choiceIds } from "../../src/battle/agent/Choice";
import { Decision } from "./Decision";

/** Modified `Network` for reinforcement learning. */
export class TrainNetwork extends Network
{
    /** Tensor data that generated `lastPrediction`. */
    private lastStateData?: number[];
    /** Tensor data that generated `prediction`. */
    private stateData?: number[];
    /** Tensor data from the last prediction from the Network. */
    private lastPrediction?: number[];
    /** Tensor data from the Network's prediction that's about to be handled. */
    private prediction?: number[];

    /**
     * Creates a Decision object for training the model.
     *
     * This uses the Bellman equation to create a Q-learning update rult:
     * `Q(s,a) <- Q(s,a) + lr*(R(s,a) + gamma*max_Q'(s',a') - Q(s,a))`, where
     * `Q(s,a)` is the model, `lr` is the learning rate, `gamma` is the discount
     * factor, and `max_Q'(s',a')` is the maximum predicted award given the next
     * state `s'` and the best perceived action `a'`. A discount rate (`gamma`)
     * is needed here to scale down the Q-value so that future rewards don't
     * outweight the immediate gain by too much.
     *
     * This can be implemented with a neural network by replacing `lr` with the
     * network's optimizer and setting its target value at index `a` (with
     * input `s`) to `R(s,a) + gamma*max_Q'(s',a')`.
     *
     * @param lastChoice The last choice (`a`) that was handled by the
     * environment.
     * @param choice Best perceived action (`a'`) that was accepted and about
     * to be taken by the environment.
     * @param reward Reward (`R(s,a)`) gained from last the action.
     * @param gamma Discount factor.
     */
    public getDecision(lastChoice: Choice, choice: Choice,
        reward: number, gamma: number): Decision
    {
        if (!this.lastStateData || !this.stateData || !this.lastPrediction ||
            !this.prediction)
        {
            throw new Error("Network must send two choices before a Decision " +
                "object can be created");
        }

        // here, this.lastStateData represents s, this.lastPrediction
        //  represents Q(s,a) and this.prediction represents Q'(s',a')
        this.logger.debug(`Applying reward: ${reward}`);

        const target = Array.from(this.lastPrediction);
        const id = choiceIds[lastChoice];
        target[id] = reward + gamma * this.prediction[choiceIds[choice]];

        this.logger.debug(`Combined target Q-value: ${target[id]}`);

        return {state: this.lastStateData, target};
    }

    /** @override */
    protected async getPrediction(stateData: number[]): Promise<number[]>
    {
        const data = await super.getPrediction(stateData);
        this.lastStateData = this.stateData;
        this.stateData = stateData;
        this.lastPrediction = this.prediction;
        this.prediction = data;
        return data;
    }
}
