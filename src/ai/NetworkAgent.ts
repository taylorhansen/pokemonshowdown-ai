import * as tf from "@tensorflow/tfjs-node";
import { BattleAgent } from "../battle/agent/BattleAgent";
import { Choice, choiceIds, intToChoice } from "../battle/agent/Choice";
import { ReadonlyBattleState } from "../battle/state/BattleState";
import { encodeBattleState, sizeBattleState } from "./encodeBattleState";

/**
 * Turns a tensor-like object into a column vector.
 * @param arr Array to convert.
 * @returns A 2D Tensor representing the column vector.
 */
export function toColumn(arr: number[] | Float32Array): tf.Tensor2D
{
    // TODO: shouldn't the parameters be readonly?
    return tf.tensor2d(arr, [1, arr.length], "float32");
}

/** Neural network interface. */
export class NetworkAgent implements BattleAgent
{
    /**
     * Creates a Network object.
     * @param model Neural network model for making decisions.
     */
    constructor(private readonly model: tf.LayersModel)
    {
        NetworkAgent.verifyModel(model);
    }

    /** @override */
    public async decide(state: ReadonlyBattleState, choices: Choice[]):
        Promise<void>
    {
        if (choices.length === 0) throw new Error("No available choices");

        const prediction = tf.tidy(() =>
        {
            const stateTensor = toColumn(encodeBattleState(state));
            return this.model.predict(stateTensor, {}) as tf.Tensor2D;
        });
        const predictionData = await prediction.data();
        prediction.dispose();

        // find the best choice that is a subset of our possible choices
        choices.sort((a, b) =>
            // sort by rewards in descending order (highest comes first)
            predictionData[choiceIds[b]] - predictionData[choiceIds[a]]);
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
     */
    public static async loadNetwork(url: string): Promise<NetworkAgent>
    {
        return new NetworkAgent(await NetworkAgent.loadModel(url));
    }

    /**
     * Loads a model from disk.
     * @param url URL to the `model.json` created by `LayersModel#save()`, e.g.
     * `file://my-model/model.json`.
     */
    public static async loadModel(url: string): Promise<tf.LayersModel>
    {
        const model = await tf.loadLayersModel(url);
        NetworkAgent.verifyModel(model);
        return model;
    }

    /**
     * Verifies a neural network model to make sure its input and output shapes
     * are acceptable. Throws if invalid.
     */
    private static verifyModel(model: tf.LayersModel): void
    {
        // loaded models must have the correct input/output shape
        if (Array.isArray(model.input))
        {
            throw new Error("Loaded LayersModel should have only one input " +
                `layer but found ${model.input.length}`);
        }
        if (!NetworkAgent.isValidInputShape(model.input.shape))
        {
            throw new Error("Loaded LayersModel has invalid input shape " +
                `(${model.input.shape.join(", ")}). Try to create a new ` +
                `model with an input shape of (, ${sizeBattleState})`);
        }
        if (Array.isArray(model.output))
        {
            throw new Error("Loaded LayersModel should have only one output " +
                `layer but found ${model.output.length}`);
        }
        if (!NetworkAgent.isValidOutputShape(model.output.shape))
        {
            throw new Error("Loaded LayersModel has invalid output shape " +
                `(${model.output.shape.join(", ")}). Try to create a new ` +
                `model with an output shape of (, ${intToChoice.length})`);
        }
    }

    /** Ensures that a network input shape is valid. */
    private static isValidInputShape(shape: Readonly<tf.Shape>): boolean
    {
        return shape.length === 2 && shape[0] === null &&
            shape[1] === sizeBattleState;
    }

    /** Ensures that a network output shape is valid. */
    private static isValidOutputShape(shape: Readonly<tf.Shape>): boolean
    {
        return shape.length === 2 && shape[0] === null &&
            shape[1] === intToChoice.length;
    }
}
