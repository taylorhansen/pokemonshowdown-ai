import * as tf from "@tensorflow/tfjs";
import {intToChoice} from "../../psbot/handlers/battle/agent";

/** Args for the {@link loss} function. */
export interface LossArgs {
    /** Model that will be trained. */
    readonly model: tf.LayersModel;
    /** State inputs, batched for each sample. */
    readonly state: tf.Tensor[];
    /** Choice ids for each sample. Must be an int32 tensor. */
    readonly action: tf.Tensor;
    /** Discounted cumulatively-summed rewards for each sample. */
    readonly returns: tf.Tensor;
}

/** Q-learning loss function. */
export const loss = ({model, state, action, returns}: LossArgs): tf.Scalar =>
    tf.tidy("loss", function lossImpl() {
        // Isolate the Q-value output that caused the action.
        const output = model.predictOnBatch(state) as tf.Tensor;
        const mask = tf.oneHot(action, intToChoice.length);
        const q = tf.sum(tf.mul(output, mask), -1);

        // Compute the loss.
        return tf.losses.meanSquaredError(returns, q);
    });
