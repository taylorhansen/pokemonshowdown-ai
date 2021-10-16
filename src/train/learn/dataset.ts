import * as tf from "@tensorflow/tfjs";
import { AugmentedExperience } from "../play/experience/AugmentedExperience";
import { AExpDecoderPool } from "../tfrecord/decoder";

/**
 * {@link AugmentedExperience} with numbers/arrays replaced with
 * {@link tf.Tensor tensors}.
 */
export type TensorAExp =
{
    [T in keyof AugmentedExperience]:
        AugmentedExperience[T] extends number ? tf.Scalar
        : AugmentedExperience[T] extends Float32Array ? tf.Tensor1D
        : never;
};

/**
 * Batched {@link AugmentedExperience} stacked {@link tf.Tensor tensors}.
 *
 * Essentially a list of {@link TensorAExp TensorAExps} but with each
 * corresponding field turned into a stacked tensor.
 */
export type BatchedAExp =
{
    [T in keyof AugmentedExperience]:
        AugmentedExperience[T] extends number ? tf.Tensor1D
        : AugmentedExperience[T] extends Float32Array ? tf.Tensor2D
        : never;
};

/**
 * Wraps a set of `.tfrecord` files as a TensorFlow
 * {@link tf.data.Dataset Dataset}, parsing each file in parallel and shuffling
 * according to the preftech buffer.
 *
 * @param aexpPaths Array of paths to the `.tfrecord` files holding the
 * AugmentedExperiences.
 * @param numThreads Max number of files to read in parallel.
 * @param batchSize AugmentedExperience batch size.
 * @param prefetch Amount to buffer for prefetching/shuffling.
 * @returns A TensorFlow Dataset that contains batched AugmentedExperience
 * objects.
 */
export function createAExpDataset(aexpPaths: readonly string[],
    numThreads: number, batchSize: number, prefetch: number):
    tf.data.Dataset<BatchedAExp>
{
    const pool = new AExpDecoderPool(numThreads);

    return tf.data.generator<TensorAExp>(
            // tensorflow supports async generators, but the typings don't
            () => pool.decode(aexpPaths, prefetch) as any)
        .prefetch(prefetch)
        .shuffle(prefetch)
        // after the batch operation, each entry of a generated AExp will
        //  contain stacked tensors according to the batch size
        .batch(batchSize)
        // make sure action indexes are integers
        .map(((batch: BatchedAExp) =>
            ({...batch, action: batch.action.cast("int32")})) as any) as
                tf.data.Dataset<BatchedAExp>;
}
