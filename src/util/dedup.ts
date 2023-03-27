/** Creates a new array without duplicates. */
export function dedup<T>(arr: readonly T[]): T[] {
    if (arr.length <= 0) {
        return [];
    }
    if (arr.length === 1) {
        return [arr[0]];
    }
    const set = new Set<T>();
    return arr.filter(x => {
        if (set.has(x)) {
            return false;
        }
        set.add(x);
        return true;
    });
}
