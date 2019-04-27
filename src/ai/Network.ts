import * as tf from "@tensorflow/tfjs";
import { TensorLike2D } from "@tensorflow/tfjs-core/dist/types";
import "@tensorflow/tfjs-node";
import { BattleAgent } from "../battle/agent/BattleAgent";
import { Choice, choiceIds, intToChoice } from "../battle/agent/Choice";
import { BattleState } from "../battle/state/BattleState";
import { Pokemon } from "../battle/state/Pokemon";
import { modelPath } from "../config";
import { Logger } from "../Logger";
import { RewardTracker } from "./RewardTracker";

/** Preprocessed network decision evaluation data. */
export interface Decision
{
    /** State in which the action was taken. */
    state: number[];
    /** Expected Q-values for each Choice id. */
    target: number[];
}

/**
 * Turns a tensor-like object into a column vector.
 * @param arr Array to convert.
 * @returns A 2D Tensor representing the column vector.
 */
export function toColumn(arr: TensorLike2D): tf.Tensor2D
{
    return tf.tensor2d(arr, [1, arr.length], "float32");
}

/** Holds the reward values for different events. */
enum Reward { faint = -10, turn = -0.1 }

/** Neural network interface. */
export class Network implements BattleAgent
{
    /** Number of input neurons. */
    private static readonly inputLength = BattleState.getArraySize();

    /**
     * Decision object generated from the last `decide()` call. Will be
     * undefined until that method is called from the Battle superclass.
     */
    public get decision(): Readonly<Decision> | undefined
    {
        return this._decision;
    }
    private _decision?: Decision;

    /** Used for logging info. */
    protected readonly logger: Logger;
    /** Resolves once the Network model is ready to be used. */
    protected ready: Promise<any>;
    /** Neural network model. */
    private model: tf.Model;
    /** Last state input array. */
    private lastStateData?: number[];
    /** Last choice taken by the AI. */
    private lastChoice?: Choice;
    /** Tracks the reward value between decisions. */
    private reward = new RewardTracker();

    /**
     * Creates a Network object.
     * @param logger Used for logging info.
     */
    constructor(logger: Logger)
    {
        this.logger = logger;
    }

    /** @override */
    public acceptChoice(choice: Choice): void
    {
        this.lastChoice = choice;
    }

    /** @override */
    public async decide(state: BattleState, choices: Choice[]):
        Promise<Choice[]>
    {
        if (choices.length === 0) throw new Error("No available choices!");
        await this.ready;

        const stateData = this.getStateData(state);
        const stateTensor = toColumn(stateData);
        const prediction = this.model.predict(stateTensor) as tf.Tensor2D;
        const predictionData = await prediction.data();

        this.logger.debug(`prediction: {${
            Array.prototype.map.call(predictionData, (r: number, i: number) =>
                    `${intToChoice[i]}: ${r}`).join(", ")}}`);

        // find the best choice that is a subset of our possible choices
        // include reward so we can use it for Q learning
        const sortedChoices = choices.sort((a, b) =>
                // sort by rewards in descending order (highest comes first)
                predictionData[choiceIds[b]] - predictionData[choiceIds[a]]);

        if (this.lastStateData && this.lastChoice)
        {
            this.logger.debug(`applying reward: ${this.reward.value}`);
            // apply the Q learning update rule
            // this makes the connection between present and future rewards by
            //  combining the network's predicted reward from its current state
            //  with the reward it just gained from its last state

            // distant rewards should matter less so they don't outweight the
            //  immediate gain by too much
            const discount = 0.8;

            const target = Array.from(predictionData);
            // for now: calculate q-value for only the best choice
            const id = choiceIds[sortedChoices[0]];
            target[id] = this.reward.value + discount * predictionData[id];

            // this Decision object can be picked up by the caller for mass
            //  learning later
            this._decision = {state: this.lastStateData, target};

            this.logger.debug(`combined Q-value: ${target[id]}`);
        }
        this.reward.reset();

        this.lastStateData = stateData;
        return sortedChoices;
    }

    /** @override */
    public onFaint(mon: Pokemon): void
    {
        if (!mon.team) return;
        this.reward.apply(mon.team.side, Reward.faint);
    }

    /** @override */
    public onTurn(): void
    {
        this.reward.apply("us", Reward.turn);
    }

    /**
     * Loads a model from disk, or constructs the default one if it can't be
     * found or the model's input or output shape don't match what's required.
     * @param path Path to the model's folder created by `Model.save()`.
     * @param logger Logger object. Default stdout.
     */
    public static async loadModel(path: string, logger = Logger.stdout):
        Promise<tf.Model>
    {
        let model: tf.Model;
        try
        {
            model = await tf.loadModel(`file://${path}/model.json`);
            Network.verifyModel(model);
        }
        catch (e)
        {
            logger.error(`error opening model: ${e}`);
            logger.debug("constructing default model");
            model = Network.createModel();
            Network.verifyModel(model);
        }
        return model;
    }

    /** Constructs a valid default model for a Network object. */
    public static createModel(): tf.Model
    {
        // setup all the layers
        const outNeurons = Object.keys(choiceIds).length;

        const dense1 = tf.layers.dense({units: 10, activation: "tanh"});
        const dense2 = tf.layers.dense(
            {units: outNeurons, activation: "linear"});

        const input = tf.input({shape: [Network.inputLength]});
        const output = dense2.apply(dense1.apply(input)) as tf.SymbolicTensor;

        return tf.model({inputs: input, outputs: output});
    }

    /**
     * Verifies a neural network model. Throws an error if invalid.
     * @param model Model to verify.
     */
    private static verifyModel(model: tf.Model): void
    {
        // loaded models must have the correct input/output shape
        const input = model.input;
        if (Array.isArray(input) || !Network.isValidInputShape(input.shape))
        {
            throw new Error("Invalid input shape");
        }
    }

    /**
     * Ensures that a network input shape is valid.
     * @param shape Given input shape.
     * @return True if the input shape is valid.
     */
    private static isValidInputShape(shape: number[]): boolean
    {
        return shape.length === 2 && shape[0] === null &&
            shape[1] === Network.inputLength;
    }

    /**
     * Sets the neural network model. If the model's input and output shapes
     * do not match what is required, then an Error will be thrown.
     * @param model Model to be used.
     */
    public setModel(model: tf.Model): void
    {
        Network.verifyModel(model);
        this.model = model;
    }

    /**
     * Saves AI state to storage.
     * @param path Base file name/path for model folder.
     */
    public async save(path: string): Promise<void>
    {
        await this.ready;
        await this.model.save(`file://${path}`);
    }

    /**
     * Loads a model from disk.
     * @param path Path to the folder created by `Model.save()`.
     */
    public async load(path: string): Promise<void>
    {
        this.model = await Network.loadModel(path, this.logger);
    }

    /** Gets the neural network input from the BattleState. */
    private getStateData(state: BattleState): number[]
    {
        const data = state.toArray();
        if (data.length > Network.inputLength)
        {
            this.logger.error(`Too many state values ${data.length}, expected \
${Network.inputLength}`);
            data.splice(Network.inputLength);
        }
        else if (data.length < Network.inputLength)
        {
            this.logger.error(`Not enough state values ${data.length}, \
expected ${Network.inputLength}`);
            do data.push(0); while (data.length < Network.inputLength);
        }

        return data;
    }
}

/** Network that loads the default `modelPath` from config. */
export class DefaultNetwork extends Network
{
    /**
     * Creates a DefaultNetwork.
     * @param logger Logger object. Default stdout.
     */
    constructor(logger = Logger.stdout)
    {
        super(logger);
        this.ready = this.load(modelPath);
    }
}
