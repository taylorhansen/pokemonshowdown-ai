/** @file Helper functions and Encoders. */
import {Encoder} from "./Encoder";

/** Makes sure that an array is of a certain length. */
export function checkLength(
    arr: Readonly<ArrayLike<unknown>>,
    length: number,
): void {
    if (arr.length < length) {
        throw new Error(`Expected length ${length} but got ${arr.length}`);
    }
}

/**
 * Interpolates max status duration and current number of turns. Use this when
 * the duration (or max possible duration) of a status is known.
 *
 * @param turns Number of turns the status has been active (including current
 * turn), i.e., if the status started during this turn and the end of the
 * current turn hasn't been reached yet, `turns` should be 1, and should be
 * incremented at the end of each turn. Values higher than `duration` will
 * return zero.
 * @param duration Maximum amount of turns the status will last. Should be the
 * maximum value of `turns`.
 * @returns Status turn data for encoder functions as a "likelihood" that the
 * status will persist on the next turn.
 */
export function limitedStatusTurns(turns: number, duration: number): number {
    // Turns left excluding current turn / total expected duration.
    if (turns <= 0) {
        return 0;
    }
    return Math.max(0, (duration - turns + 1) / duration);
}

/** Encoder for a number. */
export const numberEncoder: Encoder<number> = {
    encode(arr, n) {
        checkLength(arr, 1);
        arr[0] = n;
    },
    size: 1,
};

/** Encoder for a boolean. */
export const booleanEncoder: Encoder<boolean> = {
    encode(arr, b) {
        checkLength(arr, 1);
        arr[0] = b ? 1 : 0;
    },
    size: 1,
};

/**
 * Encoder that fills an array with some value.
 *
 * @param value Value to fill.
 * @param size Amount of numbers to fill with the given value.
 */
export function fillEncoder(value: number, size: number): Encoder<unknown> {
    return {
        encode(arr) {
            checkLength(arr, this.size);
            arr.fill(value);
        },
        size,
    };
}

/**
 * Encoder that fills an array with zeros.
 *
 * Equivalent to {@link fillEncoder}(0, size).
 *
 * @param size Amount of zeros to fill.
 */
export function zeroEncoder(size: number): Encoder<unknown> {
    return fillEncoder(0, size);
}

/** Arguments for the Encoder returned by `oneHotEncoder()`. */
export interface OneHotEncoderArgs {
    /**
     * 0-based integer to encode. If null, the array will be filled with zeros.
     */
    readonly id: number | null;
    /** Value to use instead of default `1`. */
    readonly one?: number;
    /** Value to use instead of default `0`. */
    readonly zero?: number;
}

/**
 * Creates a one-hot encoder.
 *
 * @param size Number of discrete categories to encode.
 */
export function oneHotEncoder(size: number): Encoder<OneHotEncoderArgs> {
    return {
        encode(arr, {id, one = 1, zero = 0}) {
            checkLength(arr, this.size);
            if (id === null || id < 0 || id >= this.size) {
                arr.fill(zero);
            } else {
                for (let i = 0; i < this.size; ++i) {
                    arr[i] = i === id ? one : zero;
                }
            }
        },
        size,
    };
}

/**
 * Creates a constraint map with all of the smoothed probabilities.
 *
 * @param constraint Contains all of the keys that should be considered.
 * @param usage Probabilities in {@link constraint} that should be overridden.
 * Should only contain keys in constraint.
 * @param smoothing Amount of smoothing to apply onto the probability
 * distribution. A value of 1 turns this into a uniform distribution, while 0
 * leaves the probabilities unchanged.
 * @returns Complete probability map for the cosntraint.
 */
export function constraintWithUsage(
    constraint: readonly string[] | ReadonlySet<string>,
    usage: ReadonlyMap<string, number>,
    smoothing?: number,
): ReadonlyMap<string, number> {
    const numKeys = Array.isArray(constraint)
        ? constraint.length
        : (constraint as ReadonlySet<string>).size;
    if (numKeys <= 0) {
        throw new Error("Empty constraint");
    }

    const constraintMap = new Map<string, number>();
    const probScale = smoothing ? 1.0 - smoothing : 1.0;
    const zeroProb = smoothing ? smoothing / numKeys : 0.0;
    for (const key of constraint) {
        let prob = usage.get(key);
        // Relax confidence in override probabilities via label smoothing.
        prob = prob ? probScale * prob + zeroProb : zeroProb;
        constraintMap.set(key, prob);
    }
    return constraintMap;
}

/**
 * Given probabilities that sum to 1, outputs a probability distribution where
 * the probability of each element is the probability given that one of the
 * items `i` was previously removed with probability `probs[i]` and the rest of
 * the probabilities were re-balanced (i.e. divided by the remaining sum
 * `1-probs[i]`).
 *
 * Calling this function multiple times on the previous call's output should
 * tend toward a uniform distribution, and calling this function on an
 * already-uniform distribution should return the same probabilities.
 */
export function rebalanceDist(probs: readonly number[]): number[] {
    // Note: O(n^2), not sure if this can be optimized further.
    const output = new Array<number>(probs.length).fill(0.0);
    // Use actual sum instead of 1.0 for numerical stability.
    const sum = probs.reduce((a, b) => a + b, 0.0);
    for (let i = 0; i < probs.length; ++i) {
        // Combine selection prob and the divisor used for re-balancing.
        const tmp = probs[i] / (sum - probs[i]);
        for (let j = 0; j < probs.length; ++j) {
            if (i === j) {
                continue;
            }
            // New probability of selecting item j is the weighted average
            // of the probabilities that were re-balanced due to each possible
            // removal of some item i, weighted by that item's selection
            // probability.
            output[j] += probs[j] * tmp;
        }
    }
    return output;
}
