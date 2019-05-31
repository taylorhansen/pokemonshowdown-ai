import * as tf from "@tensorflow/tfjs-node";
import { BattleAgent } from "../battle/agent/BattleAgent";
import { Choice, choiceIds, intToChoice } from "../battle/agent/Choice";
import { BattleState } from "../battle/state/BattleState";
import { Logger } from "../Logger";
import { encodeBattleState, sizeBattleState } from "./encodeBattleState";

/**
 * Turns a tensor-like object into a column vector.
 * @param arr Array to convert.
 * @returns A 2D Tensor representing the column vector.
 */
export function toColumn(arr: number[] | Float32Array): tf.Tensor2D
{
    return tf.tensor2d(arr, [1, arr.length], "float32");
}

/** Neural network interface. */
export class Network implements BattleAgent
{
    /** Used for logging info. */
    protected readonly logger: Logger;
    /** Predicts which Choice to make. */
    private readonly model: tf.LayersModel;

    /**
     * Creates a Network object.
     * @param logger Used for logging info.
     */
    constructor(model: tf.LayersModel, logger: Logger)
    {
        Network.verifyModel(model);
        this.model = model;
        this.logger = logger;
    }

    /** @override */
    public async decide(state: BattleState, choices: Choice[]):
        Promise<Choice[]>
    {
        if (choices.length === 0) throw new Error("No available choices");

        const predictionData = await this.getPrediction(
            this.getStateData(state));

        this.logger.debug(`Prediction: {${
            predictionData.map((q: number, i: number) =>
                `${intToChoice[i]}: ${q}`).join(", ")}}`);

        // find the best choice that is a subset of our possible choices
        // include reward so we can use it for Q learning
        const sortedChoices = choices.sort((a, b) =>
                // sort by rewards in descending order (highest comes first)
                predictionData[choiceIds[b]] - predictionData[choiceIds[a]]);

        return sortedChoices;
    }

    /**
     * Gets the Q value prediction from the model based on the current state.
     * @virtual
     */
    protected async getPrediction(stateData: number[]): Promise<number[]>
    {
        const stateTensor = toColumn(stateData);
        const prediction = this.model.predict(stateTensor, {}) as tf.Tensor2D;
        stateTensor.dispose();
        const predictionData = await prediction.data();
        prediction.dispose();
        return Array.from(predictionData);
    }

    /**
     * Saves neural network data to disk.
     * @param url Base URL for model folder, e.g. `file://my-model`.
     */
    public async save(url: string): Promise<void>
    {
        await this.model.save(url);
    }

    /**
     * Loads a layers model from disk and uses it to initialize a Network agent.
     * @param url URL to the `model.json` created by `LayersModel#save()`, e.g.
     * `file://my-model/model.json`.
     * @param logger Logger object. Default stderr.
     */
    public static async loadNetwork(url: string, logger = Logger.stderr):
        Promise<BattleAgent>
    {
        return new Network(await Network.loadModel(url), logger);
    }

    /**
     * Loads a model from disk.
     * @param url URL to the `model.json` created by `LayersModel#save()`, e.g.
     * `file://my-model/model.json`.
     */
    public static async loadModel(url: string): Promise<tf.LayersModel>
    {
        const model = await tf.loadLayersModel(url);
        Network.verifyModel(model);
        return model;
    }

    /**
     * Verifies a neural network model to make sure its input and output shape
     * are acceptable. Throws if invalid.
     */
    private static verifyModel(model: tf.LayersModel): void
    {
        // loaded models must have the correct input/output shape
        if (Array.isArray(model.input) ||
            !Network.isValidInputShape(model.input.shape))
        {
            throw new Error(`Loaded LayersModel has invalid input shape. Try \
to create a new model with an input shape of (null, ${sizeBattleState})`);
        }
        if (Array.isArray(model.output) ||
            !Network.isValidOutputShape(model.output.shape))
        {
            throw new Error(`Loaded LayersModel has invalid output shape. Try \
to create a new model with an output shape of (null, ${intToChoice.length})`);
        }
    }

    /** Ensures that a network input shape is valid. */
    private static isValidInputShape(shape: (number | null)[]): boolean
    {
        return shape.length === 2 && shape[0] === null &&
            shape[1] === sizeBattleState;
    }

    /** Ensures that a network output shape is valid. */
    private static isValidOutputShape(shape: (number | null)[]): boolean
    {
        return shape.length === 2 && shape[0] === null &&
            shape[1] === intToChoice.length;
    }

    /** Gets the neural network input from the BattleState. */
    private getStateData(state: BattleState): number[]
    {
        const data = encodeBattleState(state);
        if (data.length > sizeBattleState)
        {
            this.logger.error(`Too many state values ${data.length}, expected \
${sizeBattleState}`);
            data.splice(sizeBattleState);
        }
        else if (data.length < sizeBattleState)
        {
            this.logger.error(`Not enough state values ${data.length}, \
expected ${sizeBattleState}`);
            do data.push(0); while (data.length < sizeBattleState);
        }

        return data;
    }
}
