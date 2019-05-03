/** @file Contains useful helper types. */

/** Player ID in a battle. */
export type PlayerID = "p1" | "p2";

/**
 * Gets the opposite PlayerID of the given one.
 * @param id Given player id.
 * @returns The other PlayerID.
 */
export function otherId(id: PlayerID): PlayerID
{
    if (id === "p1")
    {
        return "p2";
    }
    return "p1";
}

/**
 * Checks whether a string is a PlayerID.
 * @param id Value to check.
 * @returns True if the value is part of the PlayerID type union.
 */
export function isPlayerId(id: any): id is PlayerID
{
    return id === "p1" || id === "p2";
}

/** Types of server rooms. */
export type RoomType = "chat" | "battle";

/** Gives basic info about the owner and position of a pokemon. */
export interface PokemonID
{
    /** Whose side the pokemon is on. */
    owner: PlayerID;
    /**
     * Active position (a, b, or c). Only really applicable in non-single
     * battles.
     */
    position?: string;
    /** Display nickname. */
    nickname: string;
}

/** Holds a couple details about a pokemon. */
export interface PokemonDetails
{
    species: string;
    shiny: boolean;
    gender: string | null;
    level: number;
}

/** Details pokemon hp (can be percent) and status conditions. */
export interface PokemonStatus
{
    hp: number;
    hpMax: number;
    condition: MajorStatus;
}

// major status

/** Hold the set of all major status names. Empty string means no status. */
export const majorStatuses =
{
    "": 0, brn: 1, par: 2, psn: 3, tox: 4, slp: 5, frz: 6
};

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

// istanbul ignore next: trivial
/** Converts a display name into an id name. */
export function toIdName(str: string): string
{
    return str.toLowerCase().replace(/[ -]/g, "");
}
