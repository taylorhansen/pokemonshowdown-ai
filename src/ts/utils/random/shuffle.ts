import {Rng} from "./rng";

/**
 * Standard unbiased Fisher-Yates shuffle algorithm. Shuffles in-place.
 *
 * @param arr Array to shuffle.
 * @param random Random number generator. Should generate between 0 and 1.
 * @returns `arr` shuffled in-place.
 */
export function shuffle<T>(arr: T[], random: Rng = Math.random): T[] {
    for (let i = arr.length - 1; i > 0; --i) {
        const j = Math.floor(random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}
