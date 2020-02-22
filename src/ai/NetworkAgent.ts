import * as tf from "@tensorflow/tfjs-node";
import { BattleAgent } from "../battle/agent/BattleAgent";
import { Choice, choiceIds, intToChoice } from "../battle/agent/Choice";
import { ReadonlyBattleState } from "../battle/state/BattleState";
import { encodeBattleState, sizeBattleState } from "./encodeBattleState";
import { weightedShuffle } from "./helpers";

/** NetworkAgent policy type. */
export type PolicyType = "deterministic" | "stochastic";

/** BattleAgent that interfaces with a neural network. */
export class NetworkAgent implements BattleAgent
{
    /**
     * Creates a NetworkAgent.
     * @param model Neural network for making decisions.
     * @param policy Action selection method after getting decision data.
     * `deterministic` - Choose the action deterministically with the highest
     * probability.
     * `stochastic` - Choose the action semi-randomly based on a discrete
     * probability distribution derived from the decision data.
     */
    constructor(public readonly model: tf.LayersModel,
        public readonly policy: PolicyType)
    {
        NetworkAgent.verifyModel(model);
    }

    /** @override */
    public async decide(state: ReadonlyBattleState, choices: Choice[]):
        Promise<void>
    {
        if (choices.length === 0) throw new Error("No available choices");

        const logits = this.getLogits(encodeBattleState(state));
        const logitsData = await logits.array();
        logits.dispose();
        await this.runPolicy(logitsData, choices);
    }

    /**
     * Gets the prediction from the network.
     * @virtual
     */
    protected getLogits(state: number[]): tf.Tensor1D
    {
        return tf.tidy(() =>
        {
            const stateTensor = tf.tensor2d([state]);
            // TODO: log state-value
            const [logits] = this.model.predict(stateTensor) as tf.Tensor[];
            return tf.squeeze(logits).as1D();
        });
    }

    /** Runs the policy to sort the Choices array. */
    private async runPolicy(logits: readonly number[], choices: Choice[]):
        Promise<void>
    {
        switch (this.policy)
        {
            case "deterministic":
                choices.sort((a, b) =>
                    logits[choiceIds[b]] - logits[choiceIds[a]]);
                break;
            case "stochastic":
            {
                const filteredLogits = choices.map(c => logits[choiceIds[c]]);
                const weights = tf.tidy(() =>
                    tf.softmax(filteredLogits).as1D());
                weightedShuffle(await weights.array(), choices);
                break;
            }
            default:
                // istanbul ignore next: should never happen
                throw new Error(`Unknown policy type ${this.policy}`);
        }
    }

    /**
     * Verifies a neural network model to make sure its input and output shapes
     * are acceptable for constructing a NetworkAgent with. Throws if invalid.
     */
    public static verifyModel(model: tf.LayersModel): void
    {
        // loaded models must have the correct input/output shape
        if (Array.isArray(model.input))
        {
            throw new Error("Loaded LayersModel should have only one input " +
                `layer but found ${model.input.length}`);
        }
        if (!NetworkAgent.isValidInput(model.input))
        {
            throw new Error("Loaded LayersModel has invalid input shape " +
                `(${model.input.shape.join(", ")}). Try to create a new ` +
                `model with an input shape of (, ${sizeBattleState})`);
        }
        if (!Array.isArray(model.output) || model.output.length !== 2)
        {
            const length = Array.isArray(model.output) ?
                model.output.length : 1;
            throw new Error("Loaded LayersModel should have two output " +
                `layers but found ${length}`);
        }
        if (!NetworkAgent.isValidOutput(model.output))
        {
            const shapeStr =
                `[${model.output.map(t => `(${t.shape.join(", ")})`)}]`;
            throw new Error("Loaded LayersModel has invalid output shapes " +
                `(${shapeStr}). Try to create a new model with the correct ` +
                `shapes: [(, ${intToChoice.length}), (, 1)]`);
        }
    }

    /** Ensures that a network input shape is valid. */
    private static isValidInput(input: tf.SymbolicTensor): boolean
    {
        const shape = input.shape;
        return shape.length === 2 && shape[0] === null &&
            shape[1] === sizeBattleState;
    }

    /** Ensures that a network output shape is valid. */
    private static isValidOutput(output: tf.SymbolicTensor[]): boolean
    {
        if (output.length !== 2) return false;
        const actionShape = output[0].shape;
        const valueShape = output[1].shape;
        // actionShape should be [null, intToChoice.length]
        return actionShape.length === 2 && actionShape[0] === null &&
            actionShape[1] === intToChoice.length &&
            // valueShape should be [null, 1]
            valueShape.length === 2 && valueShape[0] === null &&
                valueShape[1] === 1;
    }
}
