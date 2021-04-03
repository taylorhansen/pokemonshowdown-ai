import { Experience } from "../../sim/helpers/Experience";

/** Processed Experience tuple suitable for learning. */
export interface AugmentedExperience extends Omit<Experience, "reward">
{
    /** Discounted future reward. */
    returns: number;
    /** Advantage estimate. */
    advantage: number;
}
