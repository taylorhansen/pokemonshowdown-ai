import * as tf from "@tensorflow/tfjs";
import {AugmentedExperience} from "../play/experience/AugmentedExperience";
import {AExpDecoderPool} from "../tfrecord/decoder";

/**
 * {@link AugmentedExperience} with numbers/arrays replaced with
 * {@link tf.Tensor tensors}.
 */
export type TensorAExp = {
    [T in keyof AugmentedExperience]: AugmentedExperience[T] extends number
        ? tf.Scalar
        : AugmentedExperience[T] extends Float32Array
        ? tf.Tensor1D
        : never;
};

/**
 * Batched {@link AugmentedExperience} stacked {@link tf.Tensor tensors}.
 *
 * Essentially a list of {@link TensorAExp TensorAExps} but with each
 * corresponding field turned into a stacked tensor.
 */
export type BatchedAExp = {
    [T in keyof AugmentedExperience]: AugmentedExperience[T] extends number
        ? tf.Tensor1D
        : AugmentedExperience[T] extends Float32Array
        ? tf.Tensor2D
        : never;
};

/** Converts AugmentedExperience fields to tensors. */
function aexpToTensor(aexp: AugmentedExperience): TensorAExp {
    return {
        probs: tf.tensor1d(aexp.probs, "float32"),
        value: tf.scalar(aexp.value, "float32"),
        state: tf.tensor1d(aexp.state, "float32"),
        action: tf.scalar(aexp.action, "int32"),
        returns: tf.scalar(aexp.returns, "float32"),
        advantage: tf.scalar(aexp.advantage, "float32"),
    };
}

/**
 * Wraps a set of `.tfrecord` files as a TensorFlow
 * {@link tf.data.Dataset Dataset}, parsing each file in parallel and shuffling
 * according to the prefetch buffer.
 *
 * @param aexpPaths Array of paths to the `.tfrecord` files holding the
 * AugmentedExperiences.
 * @param numThreads Max number of files to read in parallel.
 * @param batchSize AugmentedExperience batch size.
 * @param prefetch Amount to buffer for prefetching/shuffling.
 * @returns A TensorFlow Dataset that contains batched AugmentedExperience
 * objects.
 */
export function createAExpDataset(
    aexpPaths: readonly string[],
    numThreads: number,
    batchSize: number,
    prefetch: number,
): tf.data.Dataset<BatchedAExp> {
    const pool = new AExpDecoderPool(numThreads);

    return (
        tf.data
            .generator<TensorAExp>(
                // Note: This still works with async generators even though the
                // typings don't explicitly support it.
                async function* () {
                    const gen = pool.decode(
                        aexpPaths,
                        prefetch /*highWaterMark*/,
                    );
                    for await (const aexp of gen) {
                        yield aexpToTensor(aexp);
                    }
                } as unknown as () => Generator<TensorAExp>,
            )
            .prefetch(prefetch)
            .shuffle(prefetch)
            // After the batch operation, each entry of a generated AExp will
            // contain stacked tensors according to the batch size.
            .batch(batchSize) as tf.data.Dataset<BatchedAExp>
    );
}
