import * as tf from "@tensorflow/tfjs";
import {PredictResult} from "../port/ModelPortProtocol";

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
    private readonly inputs: Float32Array[][] = [];
    /** Resolver callbacks for each request within the batch. */
    private readonly callbacks: ((result: PredictResult) => void)[] = [];

    /** Current batch size. */
    public get length(): number {
        return this.callbacks.length;
    }

    /**
     * Creates an empty PredictBatch.
     *
     * @param inputShapes Input shape that the batch must conform to. Should be
     * an array of shapes (excluding the batch dimension) for each input that
     * the model receives.
     */
    public constructor(
        private readonly inputShapes: readonly (readonly number[])[],
    ) {
        for (let i = 0; i < inputShapes.length; ++i) {
            this.inputs[i] = [];
        }
    }

    /**
     * Adds a predict request to the batch.
     *
     * @param inputs Flattened tensor data to use as inputs.
     * @param callback Called when the batch is executed and the corresponding
     * result is extracted.
     */
    public add(
        inputs: Float32Array[],
        callback: (result: PredictResult) => void,
    ): void {
        for (let i = 0; i < inputs.length; ++i) {
            this.inputs[i].push(inputs[i]);
        }
        this.callbacks.push(callback);
    }

    /** Converts input arrays into tensors. */
    public toTensors(): tf.Tensor[] {
        return this.inputShapes.map((shape, i) =>
            tf.stack(this.inputs[i]).reshape([this.length, ...shape]),
        );
    }

    /**
     * After executing the model using the {@link toTensors tensor form} of this
     * batch, use this method to resolve all the corresponding predict requests.
     */
    public async resolve(results: tf.Tensor1D[]): Promise<void> {
        if (this.length !== results.length) {
            throw new Error(
                `Mismatched results length: expected ${this.length}, got ` +
                    `${results.length}`,
            );
        }
        await Promise.all(
            results.map(async (t, i) => {
                this.callbacks[i]({output: (await t.data()) as Float32Array});
                t.dispose();
            }),
        );
    }
}
