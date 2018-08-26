/** Player ID in a battle. */
export type PlayerID = "p1" | "p2";

/** Types of server rooms. */
export type RoomType = "chat" | "battle";

/**
 * Maps users challenging the client to the battle format they're being
 * challenged to.
 */
export type ChallengesFrom = {[user: string]: string}

/** Gives basic info about the owner and position of a pokemon. */
export interface PokemonID
{
    owner: string;
    position: string;
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
    condition: string;
}
