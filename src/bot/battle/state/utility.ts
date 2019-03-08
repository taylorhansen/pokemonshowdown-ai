/** @file Helper functions for BattleState classes. */

/**
 * One-hot encodes a class of values.
 * @param id 0-based integer to encode.
 * @param length Number of classes to encode.
 */
export function oneHot(id: number | null, length: number): number[]
{
    return Array.from({length}, (v, i) => i === id ? 1 : 0);
}

/**
 * Encodes the number of turns that a temporary status has persisted into a
 * "likelihood" that the status will persist on the next turn.
 * @param turns Number of turns.
 * @returns Encoded turn data for toArray() functions.
 */
export function tempStatusTurns(turns: number): number
{
    return turns === 0 ? 0 : 1 / turns;
}
