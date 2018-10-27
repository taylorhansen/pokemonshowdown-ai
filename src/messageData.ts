/**
 * @file Interfaces and helper functions for dealing with the arguments of a
 * MessageHandler.
 */

// MessageType

/** Main message type produced by the MessageParser. */
export type MessageType = "battleinit" | "battleprogress" | StandalonePrefix;

// StandalonePrefix

/** Set of StandalonePrefixes. */
export const standalonePrefixes =
{
    challstr: 1, deinit: 2, error: 3, init: 4, request: 5, tie: 6,
    updatechallenges: 7, updateuser: 8, win: 9
};
/** Message prefixes that can be parsed as a standalone message line. */
export type StandalonePrefix = keyof typeof standalonePrefixes;

// AddonPrefix

/** Set of AddonPrefixes. */
export const addonPrefixes =
{
    "-ability": 1, "-curestatus": 2, "-cureteam": 3, "-damage": 4, faint: 5,
    "-heal": 6, "-status": 7
};
/** Message types that are parsed as addons to a major event. */
export type AddonPrefix = keyof typeof addonPrefixes;

/**
 * Checks if a value is an AddonPrefix. Usable as a type guard.
 * @param value Value to check.
 * @returns Whether the value is an AddonPrefix.
 */
export function isAddonPrefix(value: any): value is AddonPrefix
{
    return addonPrefixes.hasOwnProperty(value);
}

// MajorPrefix

/** Set of MajorPrefixes. */
export const majorPrefixes =
{
    challstr: 1, deinit: 2, error: 3, init: 4, move: 5, player: 6,
    request: 7, switch: 8, teamsize: 9, tie: 10, turn: 11,
    updatechallenges: 12, updateuser: 13, upkeep: 14, win: 15
};
/** Major message type. */
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

// PlayerID type

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

// battle event types

/** Types of events that can happen during battle. */
export type BattleEvent = MoveEvent | SwitchInEvent;

/** Base class for BattleEvents. */
interface BattleEventBase
{
    /** Type of event this is. */
    type: string;
    /** Provides additional info about the event. */
    addons: BattleEventAddon[];
    /** Cause of event. */
    cause?: Cause;
}

/** BattleEvent where a move was used. */
export interface MoveEvent extends BattleEventBase
{
    type: "move";
    /** ID of the pokemon who used the move. */
    id: PokemonID;
    /** Display name of the move being used. */
    moveName: string;
    /** ID of the target pokemon. */
    targetId: PokemonID;
}

/** BattleEvent where a pokemon was switched in. */
export interface SwitchInEvent extends BattleEventBase
{
    type: "switch";
    /** ID of the pokemon being switched in. */
    id: PokemonID;
    /** Some details on species; level; etc. */
    details: PokemonDetails;
    /** HP and any status conditions. */
    status: PokemonStatus;
}

/** Contains minor events that happen at the end of a turn. */
export interface BattleUpkeep
{
    /** Provides additional info about the event. */
    addons: BattleEventAddon[];
}

// battle event addon types

/** Addon to an event that provides additional info. */
export type BattleEventAddon = AbilityAddon | CureStatusAddon | CureTeamAddon |
    DamageAddon | FaintAddon | StartAddon | StatusAddon;

/** Base class for BattleEventAddons. */
interface AddonBase
{
    /** The type of addon this is. */
    type: string;
    /** Cause of addon. */
    cause?: Cause;
}

/** Event addon where a pokemon's ability is revealed and activated. */
export interface AbilityAddon extends AddonBase
{
    type: "ability";
    /** ID of the pokemon. */
    id: PokemonID;
    /** Ability being activated. */
    ability: string;
}

/** Event addon where a pokemon's major status is cured. */
export interface CureStatusAddon extends AddonBase
{
    type: "curestatus";
    /** ID of the pokemon being cured. */
    id: PokemonID;
    /** Status condition the pokemon is being cured of. */
    majorStatus: MajorStatus;
}

/** Event addon where all of a team's pokemon are cured of major statuses. */
export interface CureTeamAddon extends AddonBase
{
    type: "cureteam";
    /** ID of the pokemon whose team is being cured of a major status. */
    id: PokemonID;
}

/** Event addon where a pokemon is damaged or healed. */
export interface DamageAddon extends AddonBase
{
    type: "damage" | "heal";
    /** ID of the pokemon being damaged. */
    id: PokemonID;
    /** New hp/status. */
    status: PokemonStatus;
}

/** Event addon where a pokemon has fainted. */
export interface FaintAddon extends AddonBase
{
    type: "faint";
    /** ID of the pokemon that has fainted. */
    id: PokemonID;
}

/** Event addon where a volatile status condition has started. */
export interface StartAddon extends AddonBase
{
    type: "start";
    /** ID of the pokemon starting a volatile status. */
    id: PokemonID;
    /** Type of volatile status condition. */
    volatile: string;
}

/** Event addon where a pokemon is afflicted with a status. */
export interface StatusAddon extends AddonBase
{
    type: "status";
    /** ID of the pokemon being afflicted with a status condition. */
    id: PokemonID;
    /** Status condition being afflicted. */
    majorStatus: MajorStatus;
}

// battle event cause types

export type Cause = FatigueCause | ItemCause | LockedMoveCause;

/** Base class for Causes. */
interface CauseBase
{
    /** The type of Cause this is. */
    type: string;
}

/** Caused by fatigue, or the completion of a multi-turn locked move. */
export interface FatigueCause extends CauseBase
{
    type: "fatigue";
}

/** Caused by a held item. */
export interface ItemCause extends CauseBase
{
    type: "item";
    /** Item name. */
    item: string;
}

/** Locked into a certain move. */
export interface LockedMoveCause extends CauseBase
{
    type: "lockedmove";
}

// other stuff

/** Types of server rooms. */
export type RoomType = "chat" | "battle";

/** Gives basic info about the owner and position of a pokemon. */
export interface PokemonID
{
    /** Whose side the pokemon is on. */
    owner: PlayerID;
    /** Active position (a, b, or c). */
    position: string;
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

// full |request| json typings

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
    disabled?: boolean;
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
