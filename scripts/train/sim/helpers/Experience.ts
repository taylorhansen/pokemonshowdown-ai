import * as tf from "@tensorflow/tfjs-node";

/** Preprocessed network decision evaluation data. */
export interface Experience
{
    /** State in which the action was taken. */
    readonly state: tf.Tensor1D;
    /** Logits tensor mapping to action-probabilities. */
    readonly logits: tf.Tensor1D;
    /** State-value prediction. */
    readonly value: number;
    /** ID of the Choice that was taken. */
    readonly action: number;
    /** Reward gained from the action and state transition. */
    readonly reward: number;
}
