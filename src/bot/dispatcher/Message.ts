/**
 * @file Interfaces and helper functions for dealing with the arguments of a
 * MessageHandler.
 */
import { PlayerID, PokemonDetails, PokemonID, PokemonStatus, RoomType } from
    "../helpers";
import { AnyBattleEvent } from "./BattleEvent";

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

/** Argument object type for MessageHandlers. */
export type Message<T extends MessageType> =
    T extends "battleinit" ? BattleInitMessage
    : T extends "battleprogress" ? BattleProgressMessage
    : T extends "challstr" ? ChallStrMessage
    : T extends "deinit" ? DeInitMessage
    : T extends "error" ? ErrorMessage
    : T extends "init" ? InitMessage
    : T extends "request" ? RequestMessage
    : T extends "updatechallenges" ? UpdateChallengesMessage
    : T extends "updateuser" ? UpdateUserMessage
    : never;

/** Message for initializing a battle. Includes initial BattleEvents. */
export interface BattleInitMessage
{
    /** PlayerID of a player. */
    id: PlayerID;
    /** Username of a player. */
    username: string;
    /** Fixed size of each team. */
    teamSizes: {[P in PlayerID]: number};
    /** Game type, e.g. `singles`. */
    gameType: string;
    /** Cartridge generation. */
    gen: number;
    /** Initial events. */
    events: AnyBattleEvent[];
}

/** Message for handling parsed BattleEvents. */
export interface BattleProgressMessage
{
    /** Sequence of events in the battle in the order they were parsed. */
    events: AnyBattleEvent[];
}

/** Message that provides the challenge string to verify login info. */
export interface ChallStrMessage
{
    /** String used to verify account login. */
    challstr: string;
}

/** Message that indicates the leaving of a room. */
export interface DeInitMessage
{
}

/** Message for providing errors from the server. */
export interface ErrorMessage
{
    /** Why the requested action failed. */
    reason: string;
}

/** Message that indicates the joining of a room. */
export interface InitMessage
{
    /** Type of room we're joining. */
    type: RoomType;
}

/**
 * Message that requests an action taken by the client's battle handler.
 * Provides info on the client's team and possible choices. Some properties in
 * the parsed JSON have to be specially parsed in order to get the full context.
 */
export interface RequestMessage
{
    /**
     * Whether the opponent is the only one making a decision, meaning the
     * client has to wait.
     */
    wait?: boolean;
    /** Corresponds to which active pokemon slots must be filled. */
    forceSwitch?: boolean[];
    /** Active pokemon info. */
    active?: RequestActive[];
    /** Basic info about the entire team. */
    side: RequestSide;
    /** Request id for verification. */
    rqid?: number;
    /** Whether the given request cannot be canceled. */
    noCancel?: boolean;
}

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
    /** Parsed PokemonID. */
    ident: PokemonID;
    /** Parsed PokemonDetails. */
    details: PokemonDetails;
    /** Parsed PokemonStatus. */
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

/** Message that indicates a change in ingoing/outgoing challenges. */
export interface UpdateChallengesMessage
{
    /**
     * Maps users challenging the client to the battle format they're being
     * challenged to.
     */
    challengesFrom: {[user: string]: string};
    /** Current outgoing challenge from the client (TODO). */
    challengeTo: null;
}

/** Message that changes the client's username and guest status. */
export interface UpdateUserMessage
{
    /** New username. */
    username: string;
    /** Whether this is a guest account. */
    isGuest: boolean;
}
