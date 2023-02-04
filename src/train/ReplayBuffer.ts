import * as tf from "@tensorflow/tfjs";
import {
    BatchTensorExperience,
    TensorExperience,
} from "../game/experience/tensor";
import {modelInputShapes} from "../model/shapes";
import {intToChoice} from "../psbot/handlers/battle/agent";
import {Rng} from "../util/random";

/** Experience replay buffer, implemented as a circular buffer. */
export class ReplayBuffer {
    // Transpose and stack buffered experiences to make batching easier.
    private readonly states = Array.from(
        modelInputShapes,
        () => new Array<tf.Tensor>(this.maxSize),
    );
    private readonly actions = new Array<tf.Scalar>(this.maxSize);
    private readonly rewards = new Array<tf.Scalar>(this.maxSize);
    private readonly nextStates = Array.from(
        modelInputShapes,
        () => new Array<tf.Tensor>(this.maxSize),
    );
    private readonly choices = new Array<tf.Tensor1D>(this.maxSize);
    private readonly dones = new Array<tf.Scalar>(this.maxSize);

    private start = 0;

    /** Current length of the buffer. */
    public get length(): number {
        return this._length;
    }
    private _length = 0;

    /**
     * Creates a ReplayBuffer.
     *
     * @param maxSize Size of the buffer.
     */
    public constructor(public readonly maxSize: number) {}

    /**
     * Adds a new Experience to the buffer. If full, the oldest one is
     * discarded.
     */
    public add(exp: TensorExperience): void {
        let i: number;
        if (this._length < this.maxSize) {
            i = this._length++;
        } else {
            i = this.start++;
            if (this.start >= this.maxSize) {
                this.start = 0;
            }
        }

        for (let s = 0; s < modelInputShapes.length; ++s) {
            this.states[s][i]?.dispose();
            this.states[s][i] = exp.state[s];
            this.nextStates[s][i]?.dispose();
            this.nextStates[s][i] = exp.nextState[s];
        }
        this.actions[i]?.dispose();
        this.actions[i] = exp.action;
        this.rewards[i]?.dispose();
        this.rewards[i] = exp.reward;
        this.choices[i]?.dispose();
        this.choices[i] = exp.choices;
        this.dones[i]?.dispose();
        this.dones[i] = exp.done;
    }

    /**
     * Samples a batch of experiences from the buffer with replacement.
     *
     * @param size Size of sample.
     * @param random Controlled random.
     */
    public sample(
        size: number,
        random: Rng = Math.random,
    ): BatchTensorExperience {
        if (size > this._length) {
            throw new Error(
                `Requested batch size ${size} is too big for current ` +
                    `ReplayBuffer size ${this._length}`,
            );
        }
        // Knuth's algorithm for sampling without replacement.
        const states = Array.from(
            modelInputShapes,
            () => new Array<tf.Tensor>(size),
        );
        const actions = new Array<tf.Scalar>(size);
        const rewards = new Array<tf.Scalar>(size);
        const nextStates = Array.from(
            modelInputShapes,
            () => new Array<tf.Tensor>(size),
        );
        const choices = new Array<tf.Tensor1D>(size);
        const dones = new Array<tf.Scalar>(size);
        for (let t = 0, m = 0; m < size; ++t) {
            if ((this._length - t) * random() < size - m) {
                for (let s = 0; s < modelInputShapes.length; ++s) {
                    states[s][m] = this.states[s][t];
                    nextStates[s][m] = this.nextStates[s][t];
                }
                actions[m] = this.actions[t];
                rewards[m] = this.rewards[t];
                choices[m] = this.choices[t];
                dones[m] = this.dones[t];
                ++m;
            }
        }
        return tf.tidy(() => ({
            state: modelInputShapes.map((_, s) => tf.stack(states[s])),
            action: tf.stack(actions).as1D(),
            reward: tf.stack(rewards).as1D(),
            nextState: modelInputShapes.map((_, s) => tf.stack(nextStates[s])),
            choices: tf.stack(choices).as2D(size, intToChoice.length),
            done: tf.stack(dones).as1D(),
        }));
    }

    /** Disposes tensors left in the buffer. */
    public dispose(): void {
        tf.dispose(this.states);
        tf.dispose(this.actions);
        tf.dispose(this.rewards);
        tf.dispose(this.nextStates);
    }
}
