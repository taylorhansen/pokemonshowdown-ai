/** @file Specifies the Iter interface for Parser input. */

/** Immutable iterator object. */
export interface Iter<T>
{
    /** Gets the value at the current position. */
    get(): T;
    /** Creates a new Iterator at the next position. */
    next(): Iter<T>;
    /** Whether calls to `#get()` will return undefined. */
    readonly done: boolean;
}

/**
 * Creates an iterator object.
 * @param arr Array of values to process.
 * @param i Starting index.
 */
export function iter<T>(arr: readonly T[], i = 0): Iter<T>
{
    return {
        get() { return arr[i]; },
        next() { return iter(arr, i + 1); },
        done: i >= arr.length
    };
}
