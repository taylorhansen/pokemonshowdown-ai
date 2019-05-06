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

// istanbul ignore next: trivial
/** Converts a display name into an id name. */
export function toIdName(str: string): string
{
    return str.toLowerCase().replace(/[ -]/g, "");
}

const majorStatusesInternal =
{
    "": 0, brn: 1, par: 2, psn: 3, tox: 4, slp: 5, frz: 6
};
/** Hold the set of all major status names. Empty string means no status. */
export const majorStatuses: Readonly<typeof majorStatusesInternal> =
    majorStatusesInternal;

/** Major pokemon status conditions. */
export type MajorStatus = keyof typeof majorStatuses;

/**
 * Checks if a value matches a major status.
 * @param status Value to be checked.
 * @returns True if the name matches, false otherwise.
 */
export function isMajorStatus(status: any): status is MajorStatus
{
    return majorStatuses.hasOwnProperty(status);
}

/** Holds the set of all boostable stat names. */
export const boostableStatNames =
{
    atk: true, def: true, spa: true, spd: true, spe: true, accuracy: true,
    evasion: true
};

/** Names of pokemon stats that can be boosted. */
export type BoostableStatName = keyof typeof boostableStatNames;
