import { BoostableStatName } from "./battle/state/VolatileStatus";

/**
 * @file Interfaces and helper functions for dealing with the arguments of a
 * MessageHandler.
 */

// MessageType

/** Main message type produced by the MessageParser. */
export type MessageType = "battleinit" | "battleprogress" | MajorPrefix;

/** Set of EventPrefixes. */
export const eventPrefixes =
{
    "-ability": true, "-activate": true, "-boost": true, cant: true,
    "-curestatus": true, "-cureteam": true, "-damage": true, drag: true,
    "-end": true, faint: true, "-heal": true, move: true, "-mustrecharge": true,
    "-prepare": true, "-sethp": true, "-singleturn": true, "-start": true,
    "-status": true, switch: true, tie: true, turn: true, "-unboost": true,
    upkeep: true, win: true
};
/** Message types that are parsed as battle events. */
export type EventPrefix = keyof typeof eventPrefixes;
/**
 * Checks if a value is an EventPrefix. Usable as a type guard.
 * @param value Value to check.
 * @returns Whether the value is an EventPrefix.
 */
export function isEventPrefix(value: any): value is EventPrefix
{
    return eventPrefixes.hasOwnProperty(value);
}

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
export type BattleEvent = AbilityEvent | ActivateEvent | BoostEvent |
    CantEvent | CureStatusEvent | CureTeamEvent | DamageEvent | EndEvent |
    FaintEvent | MoveEvent | MustRechargeEvent | PrepareEvent | SetHPEvent |
    SingleTurnEvent | StartEvent | StatusEvent | SwitchEvent | TieEvent |
    TurnEvent | UpkeepEvent | WinEvent;

/** Base class for BattleEvents. */
interface BattleEventBase
{
    /** Type of event this is. */
    type: string;
    /** Cause of event. */
    cause?: Cause;
}

/** Event where a pokemon's ability is revealed and activated. */
export interface AbilityEvent extends BattleEventBase
{
    type: "ability";
    /** ID of the pokemon. */
    id: PokemonID;
    /** Ability being activated. */
    ability: string;
}

/** Event where a volatile status is mentioned. */
export interface ActivateEvent extends BattleEventBase
{
    type: "activate";
    /** ID of the pokemon whose status is being activated. */
    id: PokemonID;
    /** Volatile status name. */
    volatile: string;
}

/** Event where a stat is being boosted or unboosted. */
export interface BoostEvent extends BattleEventBase
{
    type: "boost";
    /** ID of the pokemom being boosted. */
    id: PokemonID;
    /** Name of stat being boosted. */
    stat: BoostableStatName;
    /** Amount to boost by. */
    amount: number;
}

/** Event where an action is prevented from being completed. */
export interface CantEvent extends BattleEventBase
{
    type: "cant";
    /** ID of the pokemom. */
    id: PokemonID;
    /** Why the action couldn't be completed. */
    reason: string;
    /** The move that the pokemon wasn't able to use. */
    moveName?: string;
}

/** Event where a pokemon's major status is cured. */
export interface CureStatusEvent extends BattleEventBase
{
    type: "curestatus";
    /** ID of the pokemon being cured. */
    id: PokemonID;
    /** Status condition the pokemon is being cured of. */
    majorStatus: MajorStatus;
}

/** Event where all of a team's pokemon are cured of major statuses. */
export interface CureTeamEvent extends BattleEventBase
{
    type: "cureteam";
    /** ID of the pokemon whose team is being cured of a major status. */
    id: PokemonID;
}

/** Event where a pokemon is damaged or healed. */
export interface DamageEvent extends BattleEventBase
{
    type: "damage" | "heal";
    /** ID of the pokemon being damaged. */
    id: PokemonID;
    /** New hp/status. */
    status: PokemonStatus;
}

/** Event addon where a volatile status has ended. */
export interface EndEvent extends BattleEventBase
{
    type: "end";
    /** ID of the pokemon ending a volatile status. */
    id: PokemonID;
    /** Volatile status name to be removed. */
    volatile: string;
}

/** Event where a pokemon has fainted. */
export interface FaintEvent extends BattleEventBase
{
    type: "faint";
    /** ID of the pokemon that has fainted. */
    id: PokemonID;
}

/** Event where a move was used. */
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

/** Event where a pokemon must recharge on the next turn. */
export interface MustRechargeEvent extends BattleEventBase
{
    type: "mustrecharge";
    /** ID of the pokemon that needs to recharge. */
    id: PokemonID;
}

/** Event where a move is being prepared, and will fire next turn. */
export interface PrepareEvent extends BattleEventBase
{
    type: "prepare";
    /** ID of the pokemon preparing the move. */
    id: PokemonID;
    /** Display name of the move being prepared. */
    moveName: string;
    /** ID of the target pokemon. */
    targetId: PokemonID;
}

/** Event where the HP of multiple pokemon is being modified at once. */
export interface SetHPEvent extends BattleEventBase
{
    type: "sethp";
    /** PokemonIDs with their corresponding new statuses. */
    newHPs: {id: PokemonID, status: PokemonStatus}[];
}

/** Event where a status is temporarily added for a single turn. */
export interface SingleTurnEvent extends BattleEventBase
{
    type: "singleturn";
    /** ID of the pokemon getting the status. */
    id: PokemonID;
    /** Name of the temporary status. */
    status: string;
}

/** Event where a volatile status condition has started. */
export interface StartEvent extends BattleEventBase
{
    type: "start";
    /** ID of the pokemon starting a volatile status. */
    id: PokemonID;
    /** Type of volatile status condition. */
    volatile: string;
}

/** Event where a pokemon is afflicted with a status. */
export interface StatusEvent extends BattleEventBase
{
    type: "status";
    /** ID of the pokemon being afflicted with a status condition. */
    id: PokemonID;
    /** Status condition being afflicted. */
    majorStatus: MajorStatus;
}

/** Event where a pokemon was switched in. */
export interface SwitchEvent extends BattleEventBase
{
    type: "switch";
    /** ID of the pokemon being switched in. */
    id: PokemonID;
    /** Some details on species; level; etc. */
    details: PokemonDetails;
    /** HP and any status conditions. */
    status: PokemonStatus;
}

/** Event indicating that the game has ended in a tie. */
export interface TieEvent extends BattleEventBase
{
    type: "tie";
}

/** Event indicating that a new turn has started. */
export interface TurnEvent extends BattleEventBase
{
    type: "turn";
    /** New turn number. */
    num: number;
}

/** Event indicating that the main BattleEvents are over. */
export interface UpkeepEvent extends BattleEventBase
{
    type: "upkeep";
}

/** Event indicating that the game has ended with a winner. */
export interface WinEvent extends BattleEventBase
{
    type: "win";
    /** Username of the winner. */
    winner: string;
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
