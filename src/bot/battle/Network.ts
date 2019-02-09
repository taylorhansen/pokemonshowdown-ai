import * as tf from "@tensorflow/tfjs";
import { TensorLike2D } from "@tensorflow/tfjs-core/dist/types";
import "@tensorflow/tfjs-node";
import { MessageListener } from "../dispatcher/MessageListener";
import { PokemonID, PokemonStatus } from "../helpers";
import * as logger from "../logger";
import { Battle, ChoiceSender } from "./Battle";
import { Choice, choiceIds, intToChoice } from "./Choice";
import { EventProcessor } from "./EventProcessor";
import { BattleState } from "./state/BattleState";
import { Side } from "./state/Side";

/** Accumulates a reward value for the Network by listening to events. */
class RewardTracker extends EventProcessor
{
    /** Holds the reward values for different events. */
    private static readonly rewards =
    {
        faint: -10,
        damage: (percentDelta: number) => 10 * percentDelta
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
     */
    constructor(username: string)
    {
        super(username);

        this.listener.on("faint", event =>
        {
            this.applyReward(this.getSide(event.id.owner),
                RewardTracker.rewards.faint);
        });
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

    /**
     * Creates a Network.
     * @param username Client's username.
     * @param listener Used to subscribe to server messages.
     * @param sender Used to send the AI's choice to the server.
     */
    constructor(username: string, listener: MessageListener,
        sender: ChoiceSender)
    {
        super(username, listener, sender, RewardTracker);

        this.inputLength = BattleState.getArraySize();
        this.path = `${__dirname}/../../../models/latest`;

        this.ready = this.load().catch(reason =>
        {
            logger.error(`Error opening model: ${reason}`);
            logger.debug("Constructing new model");
            this.constructModel();
        });
    }

    /** @override */
    protected async decide(choices: Choice[]): Promise<Choice>
    {
        if (choices.length === 0) throw new Error("No available choices!");
        await this.ready;

        const state = this.processor.getStateArray();
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
            logger.debug(`applying reward: ${this.processor.reward}`);
            // apply the Q learning update rule
            const discount = 0.8;
            const nextMaxReward = discount * bestChoice.reward;

            const target = predictionData;
            target[choiceIds[this.lastChoice]] = this.processor.reward +
                nextMaxReward;

            this.processor.resetReward();
            this.ready =
                this.model.fit(this.lastState, Network.toColumn(target));
        }

        this.lastChoice = bestChoice.choice;
        this.lastState = nextState;
        this.lastPrediction = prediction;
        return this.lastChoice;
    }

    /** @override */
    protected async save(): Promise<void>
    {
        await this.ready;
        await this.model.save(`file://${this.path}`);
    }

    /** Loads the most recently saved model. */
    private async load(): Promise<void>
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
     * Ensures that a given network input shape is valid.
     * @param shape Given input shape.
     * @return True if the input shape is valid.
     */
    private isValidInputShape(shape: number[]): boolean
    {
        return shape.length === 2 && shape[0] === null &&
            shape[1] === this.inputLength;
    }
}
