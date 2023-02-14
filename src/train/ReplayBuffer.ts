import * as tf from "@tensorflow/tfjs";
import {Experience} from "../game/experience";
import {BatchTensorExperience} from "../game/experience/tensor";
import {flattenedInputShapes, modelInputShapes} from "../model/shapes";
import {intToChoice} from "../psbot/handlers/battle/agent";
import {Rng} from "../util/random";

/** Experience replay buffer, implemented as a circular buffer. */
export class ReplayBuffer {
    // Transpose and stack buffered experiences to make batching easier.
    private readonly states = Array.from(
        modelInputShapes,
        () => new Array<Float32Array>(this.maxSize),
    ) as readonly Float32Array[][];
    private readonly actions = new Int32Array(this.maxSize);
    private readonly rewards = new Float32Array(this.maxSize);
    private readonly nextStates = Array.from(
        modelInputShapes,
        () => new Array<Float32Array>(this.maxSize),
    ) as readonly Float32Array[][];
    private readonly choices = new Array<Uint8Array>(this.maxSize);
    private readonly dones = new Float32Array(this.maxSize);

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
    public add(exp: Experience): void {
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
            this.states[s][i] = exp.state[s];
            this.nextStates[s][i] = exp.nextState[s];
        }
        this.actions[i] = exp.action;
        this.rewards[i] = exp.reward;
        this.choices[i] = exp.choices;
        this.dones[i] = Number(exp.done);
    }

    /**
     * Samples a batch of experiences from the buffer without replacement. The
     * buffer is unchanged afterwards.
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
        const states = flattenedInputShapes.map(
            n => new Float32Array(size * n),
        );
        const actions = new Int32Array(size);
        const rewards = new Float32Array(size);
        const nextStates = flattenedInputShapes.map(
            n => new Float32Array(size * n),
        );
        const choices = new Uint8Array(size * intToChoice.length);
        const dones = new Float32Array(size);
        for (let t = 0, m = 0; m < size; ++t) {
            if ((this._length - t) * random() < size - m) {
                for (let s = 0; s < flattenedInputShapes.length; ++s) {
                    const flatShape = flattenedInputShapes[s];
                    states[s].set(this.states[s][t], m * flatShape);
                    nextStates[s].set(this.nextStates[s][t], m * flatShape);
                }
                actions[m] = this.actions[t];
                rewards[m] = this.rewards[t];
                choices.set(this.choices[t], m * intToChoice.length);
                dones[m] = this.dones[t];
                ++m;
            }
        }
        return tf.tidy(() => ({
            state: modelInputShapes.map((shape, i) =>
                tf.tensor(states[i], [size, ...shape], "float32"),
            ),
            action: tf.tensor1d(actions, "int32"),
            reward: tf.tensor1d(rewards, "float32"),
            nextState: modelInputShapes.map((shape, i) =>
                tf.tensor(nextStates[i], [size, ...shape], "float32"),
            ),
            choices: tf.tensor2d(choices, [size, intToChoice.length], "bool"),
            done: tf.tensor1d(dones, "float32"),
        }));
    }
}
