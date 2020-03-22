import { Experience } from "../../sim/helpers/Experience";

/** Processed Experience tuple suitable for learning. */
export interface AugmentedExperience extends
    Omit<Experience, "logits" | "reward">
{
    /** Log-probabilities of selecting each action. */
    logProbs: Float32Array;
    /** Discounted future reward. */
    returns: number;
    /** Advantage estimate based on reward sum. */
    advantage: number;
}
