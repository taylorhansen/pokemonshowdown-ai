import * as tf from "@tensorflow/tfjs-node";

/** Preprocessed network decision evaluation data. */
export interface Experience
{
    /** State in which the action was taken. */
    state: tf.Tensor;
    /** Logits tensor mapping to action-probabilities. */
    logits: tf.Tensor;
    /** State-value prediction. */
    value: number;
    /** ID of the Choice that was taken. */
    action: number;
    /** Reward gained from the action and state transition. */
    reward: number;
}
