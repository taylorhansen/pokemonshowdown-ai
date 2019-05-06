import { MajorStatus } from "../battle/state/utility";

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
