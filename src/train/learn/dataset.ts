import * as tf from "@tensorflow/tfjs";
import {encodedStateToTensors} from "../../psbot/handlers/battle/ai/networkAgent";
import {TrainingExample} from "../play/experience/TrainingExample";
import {TrainingExampleDecoderPool} from "../tfrecord/decoder";

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

/**
 * Wraps a set of `.tfrecord` files as a TensorFlow
 * {@link tf.data.Dataset Dataset}, parsing each file in parallel and shuffling
 * according to the prefetch buffer.
 *
 * @param examplePaths Array of paths to the `.tfrecord` files holding the
 * TrainingExamples. Fed into the `decoderPool` in order.
 * @param decoderPool Object used to read `.tfrecord` files.
 * @param batchSize TrainingExample batch size.
 * @param prefetch Amount to buffer for prefetching/shuffling.
 * @returns A TensorFlow Dataset that contains batched TrainingExample
 * objects.
 */
export function createTrainingDataset(
    examplePaths: readonly string[],
    decoderPool: TrainingExampleDecoderPool,
    batchSize: number,
    prefetch: number,
): tf.data.Dataset<BatchedExample> {
    return (
        tf.data
            .generator<TensorExample>(
                // Note: This still works with async generators even though the
                // typings don't explicitly support it.
                async function* () {
                    const gen = decoderPool.decode(
                        examplePaths,
                        prefetch /*highWaterMark*/,
                    );
                    for await (const example of gen) {
                        yield exampleToTensor(example);
                    }
                } as unknown as () => Generator<TensorExample>,
            )
            .prefetch(prefetch)
            .shuffle(prefetch)
            // After the batch operation, each entry will contain stacked
            // tensors according to the batch size.
            .batch(batchSize) as tf.data.Dataset<BatchedExample>
    );
}
