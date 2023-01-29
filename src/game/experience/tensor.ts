import * as tf from "@tensorflow/tfjs";
import {Experience} from "./Experience";

/** {@link Experience} with values converted to {@link tf.Tensor tensors}. */
export type TensorExperience = {
    [T in keyof Experience]: Experience[T] extends number | boolean
        ? tf.Scalar
        : Experience[T] extends Float32Array[]
        ? tf.Tensor[]
        : never;
};

/**
 * Batched {@link Experience} stacked {@link tf.Tensor tensors}.
 *
 * Essentially a list of {@link TensorExperience}s but with values converted to
 * stacked tensors.
 */
export type BatchTensorExperience = {
    [T in keyof Experience]: Experience[T] extends number | boolean
        ? tf.Tensor1D
        : Experience[T] extends Float32Array[]
        ? tf.Tensor[]
        : never;
};
