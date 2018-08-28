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

/** Types the JSON data in a |request| message. */
export interface RequestData
{
    /** Move status of active pokemon. */
    active: {moves: RequestMove[]};
    /** Basic info about the entire team. */
    side: RequestSide;
    /** Request id for verification. */
    rqid: number;

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
    ident: string;
    /** Parseable PokemonDetails. */
    details: string;
    /** Parseable PokemonStatus. */
    condition: string;
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
