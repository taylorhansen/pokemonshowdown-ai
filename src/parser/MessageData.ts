import { MajorStatusName } from "../bot/battle/state/Pokemon";

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
    condition: MajorStatusName;
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

/** Types the JSON data in a |request| message. */
export interface RequestData
{
    /** Corresponds to which active pokemon slots must be filled. */
    forceSwitch?: boolean[];
    /** Active pokemon info. */
    active?: RequestActive[];
    /** Basic info about the entire team. */
    side: RequestSide;
    /** Request id for verification. */
    rqid: number;
    /** Whether the given request cannot be canceled. */
    noCancel?: boolean;

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
export function stringifyRequest(data: RequestData): string
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
