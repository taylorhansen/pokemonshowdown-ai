import * as tf from "@tensorflow/tfjs";
import {Experience} from "./Experience";

/** {@link Experience} with values converted to {@link tf.Tensor tensors}. */
export type TensorExperience = {
    [T in keyof Experience]: T extends "action" | "reward" | "done"
        ? tf.Scalar
        : T extends "choices"
        ? tf.Tensor1D
        : T extends "state" | "nextState"
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
    [T in keyof Experience]: T extends "action" | "reward" | "done"
        ? tf.Tensor1D
        : T extends "choices"
        ? tf.Tensor2D
        : T extends "state" | "nextState"
        ? tf.Tensor[]
        : never;
};
