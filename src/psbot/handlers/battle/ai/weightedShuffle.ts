// TODO: Is there a better algorithm that doesn't need a softmax precondition?
// FIXME: If the softmax from policyAgent gives very small values (e.g. 1e-15)
// compared to one big 0.99 entry, this can put undefined values into the array.
/**
 * Randomly shuffles the given array according to their corresponding
 * probabilities.
 *
 * @param weights A probability distribution for each corresponding index. All
 * weights must be positive, but they don't need to sum to 1.
 * @param arr Array to sort.
 */
export function weightedShuffle<T>(weights: number[], arr: T[]): void {
    // Perform a weighted shuffle of the choices, O(n^2*logn).
    if (weights.length !== arr.length) {
        throw new Error(
            `Weights and shuffle array have mismatched lengths ` +
                `(weights: ${weights.length}, arr: ${arr.length})`,
        );
    }
    // Cumulative sum version of weights array.
    const cw = weights.map(
        (
            sum => (value: number) =>
                (sum += value)
        )(0),
    );
    const copy = [...arr];
    for (let i = 0; i < arr.length; ++i) {
        // Get a random number between 0 and the sum of all the weights.
        // On the first iteration, this is between 0 and 1 approx.
        const rand = Math.random() * cw[cw.length - 1];
        // Choose the first cumulative weight that is greater than this number,
        // using a binary search since a cumulative sum array is always ordered.
        // Higher weight values have a greater chance of being selected here.
        const j = bisectRight(cw, rand);
        // The index of that weight will correspond to the next element that
        // will be added to the result array.
        arr[i] = copy[j];

        // Remove the selected weight value from all of the cumulative weights
        // that had this value, and also their corresponding values.
        // On the next iteration, the elements that were not selected will
        // compete for the next spot on the result array, still based on their
        // corresponding weights.
        for (let k = j; k < cw.length; ++k) {
            cw[k] -= weights[j];
        }
        cw.splice(j, 1);
        weights.splice(j, 1);
        copy.splice(j, 1);
    }
}

/**
 * Searches a sorted array `a` for an insertion index for the given number `n`.
 * If there are any duplicates, the right-most insertion index is chosen.
 */
function bisectRight(
    a: readonly number[],
    n: number,
    beg = 0,
    end = a.length,
): number {
    while (beg < end) {
        const mid = Math.floor((beg + end) / 2);
        if (a[mid] > n) {
            end = mid;
        } else {
            beg = mid + 1;
        }
    }
    return beg;
}
