/**
 * @file Interfaces and helper functions for dealing with the arguments of a
 * MessageHandler.
 */
import { MessageArgs, MinorPrefix, RequestArgs } from "./AnyMessageListener";

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

/**
 * Maps users challenging the client to the battle format they're being
 * challenged to.
 */
export interface ChallengesFrom
{
    [user: string]: string;
}

/** Gives basic info about the owner and position of a pokemon. */
export interface PokemonID
{
    owner: PlayerID;
    position: string;
    nickname: string;
}

/**
 * Stringifies a PokemonID.
 * @param id ID object.
 * @returns The PokemonID in string form.
 */
export function stringifyID(id: PokemonID): string
{
    return `${id.owner}${id.position}: ${id.nickname}`;
}

/** Holds a couple details about a pokemon. */
export interface PokemonDetails
{
    species: string;
    shiny: boolean;
    gender: string | null;
    level: number;
}

/**
 * Stringifies a PokemonDetails.
 * @param details Details object.
 * @returns The PokemonDetails in string form.
 */
export function stringifyDetails(details: PokemonDetails): string
{
    const arr = [details.species];
    if (details.shiny) arr.push("shiny");
    if (details.gender) arr.push(details.gender);
    if (details.level !== 100) arr.push(`L${details.level}`);
    return arr.join(", ");
}

/** Details pokemon hp (can be percent) and status conditions. */
export interface PokemonStatus
{
    hp: number;
    hpMax: number;
    condition: MajorStatus;
}

/**
 * Stringifies a PokemonStatus.
 * @param details Status object.
 * @returns The PokemonStatus in string form.
 */
export function stringifyStatus(status: PokemonStatus): string
{
    if (status.hp === 0)
    {
        return "0 fnt";
    }
    return `${status.hp}/${status.hpMax}\
${status.condition ? ` ${status.condition}` : ""}`;
}

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

/** Active pokemon info. */
export interface RequestActive
{
    /** Move statuses. */
    moves: RequestMove[];
}

/** Data about an active pokemon's move. */
export interface RequestMove
{
    /** Name of the move. */
    move: string;
    /** Move id name. */
    id: string;
    /** Current amount of power points. */
    pp: number;
    /** Maximum amount of power points. */
    maxpp: number;
    /** Target of the move. */
    target: string;
    /** Whether the move is currently disabled. */
    disabled: boolean;
}

/** Basic team info. */
export interface RequestSide
{
    /** Username of the client. */
    name: string;
    /** Player ID. Can be p1 or p2. */
    id: PlayerID;
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

/**
 * Stringifies the object from a |request| message back to normal JSON.
 * @param data Data to stringify.
 */
export function stringifyRequest(data: RequestArgs): string
{
    // i mean, copying it this way is kind of efficient
    const obj: any = JSON.parse(JSON.stringify(data));

    for (const mon of obj.side.pokemon)
    {
        // ident, details, and condition fields are the same
        //  as the data from a |switch| message
        mon.ident = stringifyID(mon.ident);
        mon.details = stringifyDetails(mon.details);
        mon.condition = stringifyStatus(mon.condition);
    }
    return JSON.stringify(obj);
}
