/** @file Helper functions for BattleState classes. */

/**
 * One-hot encodes a class of values.
 * @param id 0-based integer to encode.
 * @param length Number of classes to encode.
 */
export function oneHot(id: number, length: number): number[]
{
    return Array.from({length}, (v, i) => i === id ? 1 : 0);
}
