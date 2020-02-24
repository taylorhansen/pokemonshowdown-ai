import * as tf from "@tensorflow/tfjs-node";
import { Experience } from "../sim/helpers/Experience";

/** Processed Experience tuple suitable for learning. */
export interface AugmentedExperience extends
    Omit<Experience, "logits" | "reward">
{
    /** Log-probabilities of selecting each action. */
    readonly logProbs: tf.Tensor;
    /** Discounted future reward. */
    readonly returns: number;
    /** Advantage estimate based on reward sum. */
    readonly advantage: number;
}
