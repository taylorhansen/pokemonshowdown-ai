import * as tf from "@tensorflow/tfjs";
import {BufferConfig} from "../../../config/types";
import {encodedStateToTensors} from "../../../psbot/handlers/battle/ai/networkAgent";
import {Experience} from "../../game/experience";

/**
 * {@link Experience} with values converted to {@link tf.Tensor tensors}.
 */
export type TensorExp = {
    [T in keyof Experience]: Experience[T] extends number | boolean
        ? tf.Scalar
        : Experience[T] extends Float32Array
        ? tf.Tensor1D
        : Experience[T] extends Float32Array[]
        ? {[index: number]: tf.Tensor}
        : never;
};

/**
 * Batched {@link Experience} stacked {@link tf.Tensor tensors}.
 *
 * Essentially a list of {@link TensorExp}s but with values converted to
 * stacked tensors.
 */
export type BatchedExp = {
    [T in keyof Experience]: Experience[T] extends number | boolean
        ? tf.Tensor1D
        : Experience[T] extends Float32Array
        ? tf.Tensor2D
        : Experience[T] extends Float32Array[]
        ? {[index: number]: tf.Tensor2D}
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
    gen: AsyncGenerator<Experience>,
    config: BufferConfig,
    seed?: string,
): tf.data.Dataset<BatchedExp> {
    return tf.data
        .generator<TensorExp>(
            // Note: This still works with async generators even though the
            // typings don't explicitly support it.
            async function* () {
                for await (const exp of gen) {
                    yield experienceToTensor(exp);
                }
            } as unknown as () => Generator<TensorExp>,
        )
        .shuffle(config.shuffle, seed)
        .batch(config.batch)
        .prefetch(config.prefetch) as tf.data.Dataset<BatchedExp>;
}

/** Converts Experience fields to tensors suitable for batching. */
function experienceToTensor(exp: Experience): TensorExp {
    return {
        // Convert array into an object with integer keys in order to prevent
        // the array itself from being batched, just the contained tensors.
        state: {...encodedStateToTensors(exp.state)},
        action: tf.scalar(exp.action, "int32"),
        reward: tf.scalar(exp.reward, "float32"),
        nextState: {...encodedStateToTensors(exp.nextState)},
        done: tf.scalar(exp.done, "bool"),
    };
}
