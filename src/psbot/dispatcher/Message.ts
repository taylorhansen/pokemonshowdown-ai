/**
 * @file Interfaces and helper functions for dealing with the arguments of a
 * MessageHandler.
 */
import { StatExceptHP } from "../../battle/dex/dex-util";
import { PlayerID, PokemonDetails, PokemonID, PokemonStatus, RoomType } from
    "../helpers";
import { AnyBattleEvent } from "./BattleEvent";

/** Set of MajorPrefixes. */
export const majorPrefixes =
{
    challstr: true, deinit: true, error: true, init: true, request: true,
    updatechallenges: true, updateuser: true
} as const;
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

/** Main message type produced by the MessageParser. */
export type MessageType = "battleinit" | "battleprogress" | MajorPrefix;

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
    readonly id: PlayerID;
    /** Username of a player. */
    readonly username: string;
    /** Fixed size of each team. */
    readonly teamSizes: {readonly [P in PlayerID]: number};
    /** Game type, e.g. `singles`. */
    readonly gameType: string;
    /** Cartridge generation. */
    readonly gen: number;
    /** Initial events. */
    readonly events: readonly AnyBattleEvent[];
}

/** Message for handling parsed BattleEvents. */
export interface BattleProgressMessage
{
    /** Sequence of events in the battle in the order they were parsed. */
    readonly events: readonly AnyBattleEvent[];
}

/** Message that provides the challenge string to verify login info. */
export interface ChallStrMessage
{
    /** String used to verify account login. */
    readonly challstr: string;
}

/** Message that indicates the leaving of a room. */
export interface DeInitMessage
{
}

/** Message for providing errors from the server. */
export interface ErrorMessage
{
    /** Why the requested action failed. */
    readonly reason: string;
}

/** Message that indicates the joining of a room. */
export interface InitMessage
{
    /** Type of room we're joining. */
    readonly type: RoomType;
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
    readonly wait?: boolean;
    /** Corresponds to which active pokemon slots must be filled. */
    readonly forceSwitch?: readonly boolean[];
    /** Active pokemon info. */
    readonly active?: readonly RequestActive[];
    /** Basic info about the entire team. */
    readonly side: RequestSide;
    /** Request id for verification. */
    readonly rqid?: number;
    /** Whether the given request cannot be canceled. */
    readonly noCancel?: boolean;
}

/** Active pokemon info. */
export interface RequestActive
{
    /** Move statuses. */
    readonly moves: readonly RequestMove[];
    /** Whether the pokemon is trapped and can't switch. */
    readonly trapped?: boolean;
}

/**
 * Data about an active pokemon's move. When trapped into using a multi-turn
 * move, only the `move` and `id` fields will be defined.
 */
export interface RequestMove
{
    /** Name of the move. */
    readonly move: string;
    /** Move id name. */
    readonly id: string;
    /** Current amount of power points. */
    readonly pp?: number;
    /** Maximum amount of power points. */
    readonly maxpp?: number;
    /** Target of the move. */
    readonly target?: string;
    /** Whether the move is currently disabled. */
    readonly disabled: boolean;
}

/** Basic team info. */
export interface RequestSide
{
    /** List of all pokemon on the team. */
    readonly pokemon: readonly RequestPokemon[];
}

/** Basic pokemon info. */
export interface RequestPokemon
{
    /** Parsed PokemonID. */
    readonly ident: PokemonID;
    /** Parsed PokemonDetails. */
    readonly details: PokemonDetails;
    /** Parsed PokemonStatus. */
    readonly condition: PokemonStatus;
    /** True if this pokemon is active. */
    readonly active: boolean;
    /** Pokemon's stats. */
    readonly stats: Readonly<Record<StatExceptHP, number>>;
    /** List of move id names. */
    readonly moves: readonly string[];
    /** Base ability id name. */
    readonly baseAbility: string;
    /** Item id name. */
    readonly item: string;
    /** Pokeball id name. */
    readonly pokeball: string;
}

/** Message that indicates a change in ingoing/outgoing challenges. */
export interface UpdateChallengesMessage
{
    /**
     * Maps users challenging the client to the battle format they're being
     * challenged to.
     */
    readonly challengesFrom: {readonly [user: string]: string};
    /** Current outgoing challenge from the client (TODO). */
    readonly challengeTo: null;
}

/** Message that changes the client's username and guest status. */
export interface UpdateUserMessage
{
    /** New username. */
    readonly username: string;
    /** Whether this is a guest account. */
    readonly isGuest: boolean;
}
