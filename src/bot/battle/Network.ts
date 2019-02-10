import * as tf from "@tensorflow/tfjs";
import { TensorLike2D } from "@tensorflow/tfjs-core/dist/types";
import "@tensorflow/tfjs-node";
import { modelPath } from "../../config";
import { Logger } from "../../Logger";
import { MessageListener } from "../dispatcher/MessageListener";
import { PokemonID, PokemonStatus } from "../helpers";
import { Battle, ChoiceSender } from "./Battle";
import { Choice, choiceIds, intToChoice } from "./Choice";
import { EventProcessor } from "./EventProcessor";
import { BattleState } from "./state/BattleState";
import { Side } from "./state/Side";

/** Preprocessed network decision evaluation data. */
export interface Decision
{
    /** State in which the action was taken. */
    state: number[];
    /** Action that was taken. */
    choice: Choice;
    /** Q-value resulting from the action. */
    reward: number;
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

/** Accumulates a reward value for the Network by listening to events. */
class RewardTracker extends EventProcessor
{
    /** Holds the reward values for different events. */
    private static readonly rewards =
    {
        faint: -10,
        damage: (percentDelta: number) => 10 * percentDelta,
        turn: -0.1
    };

    /** Accumulated reward during the current turn. */
    public get reward(): number
    {
        return this._reward;
    }
    private _reward = 0;

    /**
     * Creates a RewardTracker object.
     * @param username Username of the client.
     * @param logger Logger object.
     */
    constructor(username: string, logger: Logger)
    {
        super(username, logger);

        this.listener
        .on("faint", event =>
        {
            this.applyReward(this.getSide(event.id.owner),
                RewardTracker.rewards.faint);
        })
        .on("turn", () => this.applyReward("us", RewardTracker.rewards.turn));
    }

    /** Resets accumulated reward. */
    public resetReward(): void
    {
        this._reward = 0;
    }

    /** @override */
    protected setHP(id: PokemonID, status: PokemonStatus): void
    {
        // use %delta hp to calc reward
        const side = this.getSide(id.owner);
        const mon = this.state.teams[side].active;
        const percentDelta = (status.hp - mon.hp.current) / mon.hp.max;
        super.setHP(id, status);
        this.applyReward(side, RewardTracker.rewards.damage(percentDelta));
    }

    /**
     * Rewards one side of the battle.
     * @param side The team that was rewarded for something.
     * @param reward Value of the reward.
     */
    private applyReward(side: Side, reward: number): void
    {
        // reward one side = punish on the other
        this._reward += reward * (side === "us" ? 1 : -1);
    }
}

/** Neural network interface. */
export class Network extends Battle<RewardTracker>
{
    /** Number of input neurons. */
    protected static readonly inputLength = BattleState.getArraySize();

    /**
     * Decision object generated from the last `decide()` call. Will be
     * undefined until that method is called from the Battle superclass.
     */
    public get decision(): Readonly<Decision> | undefined
    {
        return this._decision;
    }
    /** `decision` backing field. */
    private _decision?: Decision;

    /** Resolves once the Network model is ready to be used. */
    protected ready: Promise<any>;
    /** Neural network model. */
    private model: tf.Model;
    /** Last state input array. */
    private lastState?: number[];
    /** Last choice taken by the AI. */
    private lastChoice?: Choice;

    /**
     * Creates a Network.
     * @param username Client's username.
     * @param listener Used to subscribe to server messages.
     * @param sender Used to send the AI's choice to the server.
     * @param logger Logger object.
     */
    constructor(username: string, listener: MessageListener,
        sender: ChoiceSender, logger: Logger)
    {
        super(username, listener, sender, RewardTracker, logger);
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
        }
        return model;
    }

    /** Constructs a default model. */
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
        try
        {
            this.setModel(await tf.loadModel(`file://${path}/model.json`));
        }
        catch (e)
        {
            this.logger.error(`error opening model: ${e}`);
            this.logger.debug("constructing default model");
            this.setModel(Network.createModel());
        }
    }

    /** @override */
    protected async decide(choices: Choice[]): Promise<Choice>
    {
        if (choices.length === 0) throw new Error("No available choices!");
        await this.ready;

        const state = this.processor.getStateArray();
        if (state.length > Network.inputLength)
        {
            this.logger.error(`too many state values ${state.length}, expected \
${Network.inputLength}`);
            state.splice(Network.inputLength);
        }
        else if (state.length < Network.inputLength)
        {
            this.logger.error(`not enough state values ${state.length}, \
expected ${Network.inputLength}`);
            do state.push(0); while (state.length < Network.inputLength);
        }

        const nextState = toColumn(state);
        const prediction = this.model.predict(nextState) as tf.Tensor2D;
        const predictionData = Array.from(await prediction.data());

        this.logger.debug(`prediction: \
{${predictionData.map((r, i) => `${intToChoice[i]}: ${r}`).join(", ")}}`);

        // find the best choice that is a subset of our possible choices
        // include reward so we can use it for Q learning
        const bestChoice = choices
            .map(c => ({choice: c, reward: predictionData[choiceIds[c]]}))
            .reduce((prev, curr) => prev.reward < curr.reward ? curr : prev);

        if (this.lastState && this.lastChoice)
        {
            this.logger.debug(`applying reward: ${this.processor.reward}`);
            // apply the Q learning update rule
            // this makes the connection between present and future rewards by
            //  combining the network's perceived reward from its current state
            //  with the reward it gained from its last state
            // distant rewards should matter less so they don't outweight the
            //  immediate gain by too much
            const discount = 0.8;
            const nextMaxReward = discount * bestChoice.reward;

            // this Decision object can be picked up by the caller for mass
            //  learning later
            this._decision =
            {
                state: this.lastState, choice: this.lastChoice,
                reward: this.processor.reward + nextMaxReward
            };

            this.logger.debug(`accumulated reward: ${this.processor.reward}`);
            this.logger.debug(`combined Q-value: ${this._decision.reward}`);
        }
        this.processor.resetReward();

        this.lastChoice = bestChoice.choice;
        this.lastState = state;
        return this.lastChoice;
    }
}

/** Network that loads the default `modelPath` from config. */
export class DefaultNetwork extends Network
{
    /**
     * Creates a DefaultNetwork.
     * @param username Client's username.
     * @param listener Used to subscribe to server messages.
     * @param sender Used to send the AI's choice to the server.
     * @param logger Logger object. Default stdout.
     */
    constructor(username: string, listener: MessageListener,
        sender: ChoiceSender, logger = Logger.stdout)
    {
        super(username, listener, sender, logger);
        this.ready = this.load(modelPath);
    }
}
