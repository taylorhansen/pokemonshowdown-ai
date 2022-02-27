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

/** Memoized results of {@link fillEncoder}. */
const memoizedFillEncoders = new Map<number, Map<number, Encoder<unknown>>>();

/**
 * Encoder that fills an array with some value.
 *
 * @param value Value to fill.
 * @param size Amount of numbers to fill with the given value.
 */
export function fillEncoder(value: number, size: number): Encoder<unknown> {
    let memoValue = memoizedFillEncoders.get(value);
    if (memoValue) {
        const memoValueSize = memoValue.get(size);
        if (memoValueSize) {
            return memoValueSize;
        }
    } else {
        memoValue = new Map();
        memoizedFillEncoders.set(value, memoValue);
    }

    const encoder: Encoder<unknown> = {
        encode(arr) {
            checkLength(arr, this.size);
            arr.fill(value);
        },
        size,
    };
    memoValue.set(size, encoder);
    return encoder;
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

/** Memoized results of {@link oneHotEncoder}. */
const memoizedOneHotEncoders = new Map<number, Encoder<OneHotEncoderArgs>>();

/**
 * Creates a one-hot encoder.
 *
 * @param size Number of discrete categories to encode.
 */
export function oneHotEncoder(size: number): Encoder<OneHotEncoderArgs> {
    const memo = memoizedOneHotEncoders.get(size);
    if (memo) {
        return memo;
    }

    const encoder: Encoder<OneHotEncoderArgs> = {
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
    memoizedOneHotEncoders.set(size, encoder);
    return encoder;
}
