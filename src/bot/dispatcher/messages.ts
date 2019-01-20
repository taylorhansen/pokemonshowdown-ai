/**
 * @file Interfaces and helper functions for dealing with the arguments of a
 * MessageHandler.
 */
import { PokemonDetails, PokemonID, PokemonStatus } from "../helpers";

/** Main message type produced by the MessageParser. */
export type MessageType = "battleinit" | "battleprogress" | MajorPrefix;

/** Set of MajorPrefixes. */
export const majorPrefixes =
{
    challstr: 1, deinit: 2, error: 3, init: 4, request: 5, updatechallenges: 6,
    updateuser: 7
};
/** Message types that are parsed as a single standalone line. */
export type MajorPrefix = keyof typeof majorPrefixes;
/**
 * Checks if a value is a Majorprefix. Usable as a type guard.
 * @param value Value to check.
 * @returns Whether the value is a MajorPrefix.
 */
export function isMajorPrefix(value: any): value is MajorPrefix
{
    return majorPrefixes.hasOwnProperty(value);
}

// full RequestArgs json typings

/** Active pokemon info. */
export interface RequestActive
{
    /** Move statuses. */
    moves: RequestMove[];
    /** Whether the pokemon is trapped and can't switch. */
    trapped?: boolean;
}

/**
 * Data about an active pokemon's move. When trapped into using a multi-turn
 * move, only the `move` and `id` fields will be defined.
 */
export interface RequestMove
{
    /** Name of the move. */
    move: string;
    /** Move id name. */
    id: string;
    /** Current amount of power points. */
    pp?: number;
    /** Maximum amount of power points. */
    maxpp?: number;
    /** Target of the move. */
    target?: string;
    /** Whether the move is currently disabled. */
    disabled: boolean;
}

/** Basic team info. */
export interface RequestSide
{
    /** List of all pokemon on the team. */
    pokemon: RequestPokemon[];
}

/** Basic pokemon info. */
export interface RequestPokemon
{
    /** Parseable PokemonID. */
    ident: PokemonID;
    /** Parseable PokemonDetails. */
    details: PokemonDetails;
    /** Parseable PokemonStatus. */
    condition: PokemonStatus;
    /** True if this pokemon is active. */
    active: boolean;
    /** Pokemon's stats. */
    stats: {atk: number, def: number, spa: number, spd: number, spe: number};
    /** List of move id names. */
    moves: string[];
    /** Base ability id name. */
    baseAbility: string;
    /** Item id name. */
    item: string;
    /** Pokeball id name. */
    pokeball: string;
}
