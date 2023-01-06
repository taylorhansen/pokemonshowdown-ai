import * as tf from "@tensorflow/tfjs";
import {BufferConfig} from "../../../config/types";
import {encodedStateToTensors} from "../../../psbot/handlers/battle/ai/networkAgent";
import {TrainingExample} from "../../game/experience";

/**
 * {@link TrainingExample} with values converted to {@link tf.Tensor tensors}.
 */
export type TensorExample = {
    [T in keyof TrainingExample]: TrainingExample[T] extends number
        ? tf.Scalar
        : TrainingExample[T] extends Float32Array
        ? tf.Tensor1D
        : TrainingExample[T] extends Float32Array[]
        ? {[index: number]: tf.Tensor}
        : never;
};

/**
 * Batched {@link TrainingExample} stacked {@link tf.Tensor tensors}.
 *
 * Essentially a list of {@link TensorExample}s but with values converted to
 * stacked tensors.
 */
export type BatchedExample = {
    [T in keyof TrainingExample]: TrainingExample[T] extends number
        ? tf.Tensor1D
        : TrainingExample[T] extends Float32Array
        ? tf.Tensor2D
        : TrainingExample[T] extends Float32Array[]
        ? {[index: number]: tf.Tensor}
        : never;
};

/**
 * Creates a TensorFlow Dataset from an experience stream for use in training.
 *
 * @param gen Generator for experience objects.
 * @param config Config for buffering and batching.
 * @param seed Optional seed for shuffling.
 */
export function datasetFromRollout(
    gen: AsyncGenerator<TrainingExample>,
    config: BufferConfig,
    seed?: string,
): tf.data.Dataset<BatchedExample> {
    return tf.data
        .generator<TensorExample>(
            // Note: This still works with async generators even though the
            // typings don't explicitly support it.
            async function* () {
                for await (const example of gen) {
                    yield exampleToTensor(example);
                }
            } as unknown as () => Generator<TensorExample>,
        )
        .shuffle(config.shuffle, seed)
        .batch(config.batch)
        .prefetch(config.prefetch) as tf.data.Dataset<BatchedExample>;
}

/** Converts TrainingExample fields to tensors suitable for batching. */
function exampleToTensor(example: TrainingExample): TensorExample {
    return {
        // Convert array into an object with integer keys in order to prevent
        // the array itself from being batched, just the contained tensors.
        state: {...encodedStateToTensors(example.state)},
        action: tf.scalar(example.action, "int32"),
        returns: tf.scalar(example.returns, "float32"),
    };
}
