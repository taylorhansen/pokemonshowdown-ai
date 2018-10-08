import * as tf from "@tensorflow/tfjs";
import { TensorLike2D } from "@tensorflow/tfjs-core/dist/types";
import "@tensorflow/tfjs-node";
import * as logger from "../../../logger";
import { AI } from "./AI";
import { Choice, choiceIds, intToChoice } from "./Choice";

/** Neural network interface. */
export class Network implements AI
{
    /** Neural network model. */
    private model: tf.Model;
    /** Number of input neurons. */
    private readonly inputLength: number;
    /** Base file name/path for model folder. */
    private readonly path: string;
    /** Last state input tensor. */
    private lastState?: tf.Tensor2D;
    /** Last prediction output tensor. */
    private lastPrediction?: tf.Tensor2D;
    /** Last choice taken by the AI. */
    private lastChoice?: Choice;
    /** Resolves once the Network is ready to be used. */
    private ready: Promise<any>;

    /** Creates a Network. */
    constructor(inputLength: number, path: string)
    {
        this.inputLength = inputLength;
        this.path = path;

        this.ready = this.load().catch(reason =>
        {
            logger.error(`error opening model: ${reason}`);
            logger.debug("Constructing new model");
            this.constructModel();
        });
    }

    /** @override */
    public async decide(state: number[], choices: Choice[], reward: number):
        Promise<Choice>
    {
        await this.ready;

        if (state.length > this.inputLength)
        {
            logger.error(`too many state values ${state.length}, expected \
${this.inputLength}`);
            state.splice(this.inputLength);
        }
        else if (state.length < this.inputLength)
        {
            logger.error(`not enough state values ${state.length}, \
expected ${this.inputLength}`);
            do
            {
                state.push(0);
            }
            while (state.length < this.inputLength);
        }

        const nextState = Network.toColumn(state);
        const prediction = this.model.predict(nextState) as tf.Tensor2D;
        const predictionData = Array.from(await prediction.data());

        logger.debug(`prediction: \
{${predictionData.map((r, i) => `${intToChoice[i]}: ${r}`).join(", ")}}`);

        // find the best choice that is a subset of our possible choices
        // include reward so we can use it for Q learning
        const bestChoice = choices
            .map(c => ({choice: c, reward: predictionData[choiceIds[c]]}))
            .reduce((prev, curr) => prev.reward < curr.reward ? curr : prev);

        if (this.lastState && this.lastPrediction && this.lastChoice)
        {
            logger.debug("applying reward");
            // apply the Q learning update rule
            const discount = 0.8;
            const nextMaxReward = discount * bestChoice.reward;

            const target = predictionData;
            target[choiceIds[this.lastChoice]] = reward + nextMaxReward;

            this.ready =
                this.model.fit(this.lastState, Network.toColumn(target));
        }

        this.lastChoice = bestChoice.choice;
        this.lastState = nextState;
        this.lastPrediction = prediction;
        return this.lastChoice;
    }

    /** @override */
    public async save(): Promise<void>
    {
        await this.ready;
        await this.model.save(`file://${this.path}`);
    }

    /** Loads the most recently saved model. */
    public async load(): Promise<void>
    {
        this.model = await tf.loadModel(`file://${this.path}/model.json`);
        this.compileModel();

        // loaded models must have the correct input/output shape
        const input = this.model.input;
        if (Array.isArray(input) || !this.isValidInputShape(input.shape))
        {
            throw new Error("Invalid input shape");
        }
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

    /** Constructs the neural network model. */
    private constructModel(): void
    {
        // setup all the layers
        const outNeurons = Object.keys(choiceIds).length;

        const dense1 = tf.layers.dense({units: 10, activation: "tanh"});
        const dense2 = tf.layers.dense(
            {units: outNeurons, activation: "linear"});

        const input = tf.input({shape: [this.inputLength]});
        const output = dense2.apply(dense1.apply(input)) as tf.SymbolicTensor;

        this.model = tf.model({inputs: input, outputs: output});
        this.compileModel();
    }

    /** Compiles the current model. */
    private compileModel(): void
    {
        this.model.compile(
            {loss: "meanSquaredError", optimizer: "adam", metrics: ["mae"]});
    }

    /**
     * Ensures that a network input shape is valid.
     * @param shape Given input shape.
     * @return True if the input shape is valid.
     */
    private isValidInputShape(shape: number[]): boolean
    {
        return shape.length === 2 && shape[0] === null &&
            shape[1] === this.inputLength;
    }
}
