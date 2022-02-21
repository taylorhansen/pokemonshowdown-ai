/** Standard unbiased Fisher-Yates shuffle algorithm. Shuffles in-place. */
export function shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length; i > 0; --i) {
        const j = Math.floor(Math.random() * i);
        [arr[i - 1], arr[j]] = [arr[j], arr[i - 1]];
    }
    return arr;
}
