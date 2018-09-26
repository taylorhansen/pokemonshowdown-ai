import * as tf from "@tensorflow/tfjs";
import { TensorLike2D } from "@tensorflow/tfjs-core/dist/types";
import * as logger from "../../../logger";
import { AI } from "./AI";
import { Choice, choiceIds, intToChoice } from "./Choice";

/** Neural network interface. */
export class Network implements AI
{
    /** Neural network model. */
    private readonly model = tf.sequential();
    /** Number of input neurons. */
    private readonly inputLength: number;
    /** Last state input tensor. */
    private lastState?: tf.Tensor2D;
    /** Last prediction output tensor. */
    private lastPrediction?: tf.Tensor2D;
    /** Last choice taken by the AI. */
    private lastChoice?: Choice;

    /** Creates a Network. */
    constructor(inputLength: number)
    {
        this.inputLength = inputLength;

        // setup all the layers
        const outNeurons = Object.keys(choiceIds).length;
        this.model.add(tf.layers.inputLayer({inputShape: [this.inputLength]}));
        this.model.add(tf.layers.dense(
        {
            units: outNeurons, activation: "linear"
        }));
        this.model.compile(
        {
            loss: "meanSquaredError", optimizer: "adam", metrics: ["mae"]
        });
    }

    /** @override */
    public decide(state: number[], choices: Choice[], reward?: number): Choice
    {
        if (state.length > this.inputLength)
        {
            logger.error(`too many state values ${state.length}, expected \
${this.inputLength}`);
            state.splice(this.inputLength);
        }
        else if (state.length < this.inputLength)
        {
            logger.error(`not enough state values ${state.length}, expected \
${this.inputLength}`);
            do
            {
                state.push(0);
            }
            while (state.length < this.inputLength);
        }

        const nextState = Network.toColumn(state);
        const prediction = this.model.predict(nextState) as tf.Tensor2D;

        if (reward && this.lastState && this.lastPrediction && this.lastChoice)
        {
            // apply the Q learning update rule

            const discount = 0.8;
            const nextMaxReward = discount * Math.max(...prediction.dataSync());

            const target = this.lastPrediction.dataSync();
            target[choiceIds[this.lastChoice]] = reward + nextMaxReward;

            this.model.fit(this.lastState, Network.toColumn(target));
        }

        this.lastState = nextState;
        this.lastPrediction = prediction;

        // find the best choice that is a subset of our choices parameter
        // TODO: make this async
        const data = Array.from(prediction.dataSync());
        logger.debug(`prediction: \
[${data.map((r, i) => `${intToChoice[i]}: ${r}`)}]`);
        this.lastChoice = choices.reduce((prev, curr) =>
            data[choiceIds[prev]] < data[choiceIds[curr]] ? curr : prev);
        return this.lastChoice;
    }

    /**
     * Turns a tensor-like object into a column vector.
     * @param arr Array to convert.
     * @returns A 2D Tensor representing the column vector.
     */
    private static toColumn(arr: TensorLike2D): tf.Tensor2D
    {
        return tf.tensor2d(arr, [1, arr.length], "float32");
    }
}
