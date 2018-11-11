import * as tf from "@tensorflow/tfjs";
import { TensorLike2D } from "@tensorflow/tfjs-core/dist/types";
import "@tensorflow/tfjs-node";
import { AnyMessageListener } from "../AnyMessageListener";
import * as logger from "../logger";
import { BattleEvent, PokemonID, PokemonStatus } from "../messageData";
import { Battle, ChoiceSender } from "./Battle";
import { Choice, choiceIds, intToChoice } from "./Choice";
import { BattleState } from "./state/BattleState";
import { Side } from "./state/Side";

/** Neural network interface. */
export class Network extends Battle
{
    /** Holds the reward values for different events. */
    private static readonly rewards =
    {
        faint: -10,
        damage: (percentDelta: number) => 10 * percentDelta
    };

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
    /** Accumulated reward during the current turn. */
    private reward = 0;

    /**
     * Creates a Network.
     * @param username Client's username.
     * @param listener Used to subscribe to server messages.
     * @param sender Used to send the AI's choice to the server.
     * @param state Optional initial battle state.
     */
    constructor(username: string, listener: AnyMessageListener,
        sender: ChoiceSender)
    {
        super(username, listener, sender);

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
    protected handleEvent(event: BattleEvent): void
    {
        super.handleEvent(event);
        if (event.type === "faint")
        {
            this.applyReward(this.getSide(event.id.owner),
                Network.rewards.faint);
        }
    }

    /** @override */
    protected setHP(id: PokemonID, status: PokemonStatus): void
    {
        // use %delta hp to calc reward
        const side = this.getSide(id.owner);
        const mon = this.state.teams[side].active;
        const percentDelta = (status.hp - mon.hp.current) / mon.hp.max;
        super.setHP(id, status);
        this.applyReward(side, Network.rewards.damage(percentDelta));
    }

    /**
     * Rewards one side of the battle.
     * @param side The team that was rewarded for something.
     * @param reward Value of the reward.
     */
    private applyReward(side: Side, reward: number): void
    {
        // reward one side = punish on the other
        this.reward += reward * (side === "us" ? 1 : -1);
    }

    /** @override */
    protected async decide(choices: Choice[]): Promise<Choice>
    {
        await this.ready;

        const state = this.state.toArray();
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
            logger.debug(`applying reward: ${this.reward}`);
            // apply the Q learning update rule
            const discount = 0.8;
            const nextMaxReward = discount * bestChoice.reward;

            const target = predictionData;
            target[choiceIds[this.lastChoice]] = this.reward + nextMaxReward;

            this.reward = 0;
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
