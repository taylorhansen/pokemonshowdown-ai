import * as tf from "@tensorflow/tfjs";
import {intToChoice} from "../../psbot/handlers/battle/agent";
import {PredictResult} from "../port";
import {
    flattenedInputShapes,
    modelInputNames,
    modelInputShapes,
} from "../shapes";

/** State+callback entries for managing batched model predict requests. */
export class PredictBatch {
    /**
     * List of batched input arrays for each of the inputs that the model
     * receives.
     *
     * The outer array corresponds to each of the model's inputs, whereas the
     * inner array corresponds to each individual request that we're batching
     * (corresponds to {@link callbacks}).
     */
    private readonly inputs: Float32Array[][] = modelInputShapes.map(() => []);
    /** Resolver callbacks for each request within the batch. */
    private readonly callbacks: ((result: PredictResult) => void)[] = [];
    /** Corresponding times that the requests were {@link add added}. */
    public get times(): readonly bigint[] {
        return this._times;
    }
    private readonly _times: bigint[] = [];

    /** Current batch size. */
    public get length(): number {
        return this.callbacks.length;
    }

    /**
     * Creates a PredictBatch.
     *
     * @param support Reference to the support of the Q value distribution, of
     * shape `[1, 1, atoms]`. Used for distributional RL if configured.
     */
    public constructor(private readonly support?: tf.Tensor) {}

    /**
     * Adds a predict request to the batch.
     *
     * @param inputs State data to use as inputs.
     * @param callback Called when the batch is executed and the corresponding
     * result is extracted.
     */
    public add(
        inputs: Float32Array[],
        callback: (result: PredictResult) => void,
    ): void {
        if (inputs.length !== this.inputs.length) {
            throw new Error(
                `Expected ${this.inputs.length} inputs but found ` +
                    `${inputs.length}`,
            );
        }
        for (let i = 0; i < inputs.length; ++i) {
            if (inputs[i].length !== flattenedInputShapes[i]) {
                throw new Error(
                    `Model input ${i} (${modelInputNames[i]}) requires ` +
                        `${flattenedInputShapes[i]} elements but got ` +
                        `${inputs[i].length}`,
                );
            }
            this.inputs[i].push(inputs[i]);
        }
        this.callbacks.push(callback);
        this._times.push(process.hrtime.bigint());
    }

    /** Converts input data into tensors. */
    public toTensors(): tf.Tensor[] {
        return this.inputs.map((input, i) => {
            const size = flattenedInputShapes[i];
            const values = new Float32Array(input.length * size);
            for (let j = 0; j < input.length; ++j) {
                values.set(input[j], j * size);
            }
            return tf.tensor(
                values,
                [input.length, ...modelInputShapes[i]],
                "float32",
            );
        });
    }

    /**
     * After executing the model using the {@link toTensors tensor form} of this
     * batch, use this method to resolve all the corresponding predict requests.
     */
    public async resolve(results: tf.Tensor): Promise<void> {
        tf.util.assertShapesMatch(
            this.support
                ? [this.length, intToChoice.length, this.support.size]
                : [this.length, intToChoice.length],
            results.shape,
            "Misshapen predict results:",
        );

        if (this.support) {
            results = tf.tidy(() => tf.sum(tf.mul(results, this.support!), -1));
        }
        const resultData = await results.data<"float32">();
        results.dispose();

        for (let i = 0; i < this.callbacks.length; ++i) {
            this.callbacks[i]({
                output: Float32Array.from(
                    resultData.subarray(
                        i * intToChoice.length,
                        (i + 1) * intToChoice.length,
                    ),
                ),
            });
        }
    }
}
