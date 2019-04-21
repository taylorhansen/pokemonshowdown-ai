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

/**
 * Interpolates max status duration and current number of turns.
 * @param turns Number of turns the status has been active (including current
 * turn).
 * @param duration Maximum amount of turns the status can be active.
 * @returns Encoded turn data for toArray() functions.
 */
export function limitedStatusTurns(turns: number, duration: number): number
{
    // turns left / total duration
    return (duration - turns - 1) / duration;
}

// istanbul ignore next: only used in logging
/**
 * Pluralizes the word "turns". E.g. `pluralTurns("tox", 1)` returns
 * `"tox for 1 turn"`.
 * @param name Name of status.
 * @param turns Number of turns.
 * @param limit Max number of turns.
 */
export function pluralTurns(name: string, turns: number, limit?: number): string
{
    return `${name} for ${turns}${limit ? `/${limit}` : ""} \
turn${turns !== 1 ? "s" : ""}`;
}
