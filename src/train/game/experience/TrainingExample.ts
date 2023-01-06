import {Experience} from "./Experience";

/** Processed Experience tuple suitable for training. */
export interface TrainingExample extends Omit<Experience, "output" | "reward"> {
    /** Discount sum of the future reward, i.e. Monte Carlo returns. */
    returns: number;
}
