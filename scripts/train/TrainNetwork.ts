import { Network } from "../../src/ai/Network";
import { Choice, choiceIds } from "../../src/battle/agent/Choice";
import { Experience } from "./Experience";

/** Modified `Network` for reinforcement learning. */
export class TrainNetwork extends Network
{
    /** Tensor data that generated `lastPrediction`. */
    private lastStateData?: number[];
    /** Tensor data that generated `prediction`. */
    private stateData?: number[];

    /**
     * Creates an Experience object for training the model.
     * @param action Action taken in last state.
     * @param reward Reward gained from last the action.
     * @param nextAction Best action to take in the next state.
     */
    public getExperience(action: Choice, reward: number, nextAction: Choice):
        Experience
    {
        if (!this.lastStateData || !this.stateData)
        {
            throw new Error("Network must send two choices before a Decision " +
                "object can be created");
        }

        return {
            state: this.lastStateData, action: choiceIds[action], reward,
            nextState: this.stateData, nextAction: choiceIds[nextAction]
        };
    }

    /** @override */
    protected async getPrediction(stateData: number[]): Promise<number[]>
    {
        this.lastStateData = this.stateData;
        this.stateData = stateData;
        return super.getPrediction(stateData);
    }
}
