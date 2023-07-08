/** @file Encoder combinators. */
import {checkLength} from "./helpers";

/**
 * Describes a state object encoder that outputs into an array.
 *
 * @template TState State object type.
 */
export interface Encoder<TState> {
    /**
     * Encoder function.
     *
     * @param data Array to fill with the encoded data. Length should be at
     * least {@link size}.
     * @param args Data to encode.
     */
    readonly encode: (data: Float32Array, args: TState) => void;
    /**
     * Minimum size of the data input array that's required for the
     * {@link encode} method.
     */
    readonly size: number;
}

/**
 * Creates a no-op Encoder in order to make an assertion.
 *
 * @param assertion Assertion function to call. This function may throw if a
 * precondition about its input was violated.
 */
export function assertEncoder<TState>(
    assertion: (state: TState) => void,
): Encoder<TState> {
    return {
        encode(arr, state) {
            checkLength(arr, 0);
            assertion(state);
        },
        size: 0,
    };
}

/**
 * Augments an encoder to become compatible with a different input type.
 *
 * @param getter Function to transform the new input type into the old one.
 * @param encoder Encoder that works with the old input type.
 * @returns An Encoder that takes the new input type.
 */
export function augment<TState1, TState2>(
    getter: (args: TState1) => TState2,
    encoder: Encoder<TState2>,
): Encoder<TState1> {
    return {
        encode(arr, args) {
            encoder.encode(arr, getter(args));
        },
        size: encoder.size,
    };
}

/**
 * Creates an Encoder that concatenates the results of each of the given
 * Encoders using the same original input state.
 *
 * Since all the results are concatenated, the returned Encoder will require an
 * array that spans the sum of each Encoder's required array size.
 */
export function concat<TState>(
    ...encoders: Encoder<TState>[]
): Encoder<TState> {
    return {
        encode(arr, args) {
            checkLength(arr, this.size);
            let nextByteOffset = arr.byteOffset;
            const maxByteOffset = arr.byteLength + arr.byteOffset;
            for (const encoder of encoders) {
                const byteOffset = nextByteOffset;
                nextByteOffset += encoder.size * arr.BYTES_PER_ELEMENT;
                if (nextByteOffset > maxByteOffset) {
                    throw new Error(
                        "concat() encoder array was too small for the given " +
                            `encoders (${arr.byteLength} bytes vs at least ` +
                            `${nextByteOffset - arr.byteOffset})`,
                    );
                }
                const a = new Float32Array(
                    arr.buffer,
                    byteOffset,
                    encoder.size,
                );
                encoder.encode(a, args);
            }
            if (nextByteOffset !== maxByteOffset) {
                throw new Error(
                    "concat() encoder didn't fill the given array (filled " +
                        `${nextByteOffset - arr.byteOffset} bytes, given ` +
                        `${arr.byteLength})`,
                );
            }
        },
        size: encoders.reduce((a, b) => a + b.size, 0),
    };
}

/**
 * Creates an Encoder that maps over a collection of states.
 *
 * @param length Number of state objects to encode.
 * @param encoder Encoder to use for each state object.
 */
export function map<TState>(
    length: number,
    encoder: Encoder<TState>,
): Encoder<Readonly<ArrayLike<TState>>> {
    return concat(
        assertEncoder(states => checkLength(states, length)),
        ...Array.from({length}, (_, i) =>
            augment((states: ArrayLike<TState>) => states[i], encoder),
        ),
    );
}

/**
 * Creates an encoder that defaults to another if the state input is
 * `undefined`.
 *
 * @param encoder Encoder when the state is defined.
 * @param alt Encoder when the state input is `undefined`.
 */
export function nullable<TState>(
    encoder: Encoder<TState>,
    alt: Encoder<undefined>,
): Encoder<TState | undefined> {
    if (encoder.size !== alt.size) {
        throw new Error(
            "nullable() encoder arguments do not have the same size " +
                `(${encoder.size} vs ${alt.size})`,
        );
    }
    return {
        encode(arr, state) {
            if (state === undefined) {
                alt.encode(arr, undefined);
            } else {
                encoder.encode(arr, state);
            }
        },
        size: encoder.size,
    };
}

/**
 * Creates an Encoder that selects one of three given Encoders depending on
 * whether the input is defined, `null`, or `undefined`.
 *
 * @param defined Encoder when the input is defined.
 * @param unknown Encoder when the input is `null`.
 * @param empty Encoder when the input is `undefined`.
 */
export function optional<TState>(
    defined: Encoder<TState>,
    unknown: Encoder<null>,
    empty: Encoder<undefined>,
): Encoder<TState | null | undefined> {
    if (defined.size !== unknown.size || defined.size !== empty.size) {
        throw new Error(
            "optional() encoder arguments do not have the same size " +
                `(${defined.size} vs ${unknown.size} vs ${empty.size})`,
        );
    }
    return {
        encode(arr, state) {
            if (state === undefined) {
                empty.encode(arr, undefined);
            } else if (state === null) {
                unknown.encode(arr, null);
            } else {
                defined.encode(arr, state);
            }
        },
        size: defined.size,
    };
}
