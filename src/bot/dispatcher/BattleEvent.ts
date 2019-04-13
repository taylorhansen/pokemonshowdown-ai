/** @file Interfaces and helper functions for handling BattleEvents. */
import { WeatherType } from "../battle/state/Weather";
import { BoostableStatName, MajorStatus, PokemonDetails, PokemonID,
    PokemonStatus } from "../helpers";

/**
 * Set of BattleEventPrefixes. Heal, drag, and unboost are included here, but
 * are parsed as DamageEvents, SwitchEvents, and BoostEvents respectively.
 */
export const battleEventPrefixes =
{
    "-ability": true, "-activate": true, "-boost": true, cant: true,
    "-curestatus": true, "-cureteam": true, "-damage": true, drag: true,
    "-end": true, "-endability": true, faint: true, "-fieldend": true,
    "-fieldstart": true, "-heal": true, move: true, "-mustrecharge": true,
    "-prepare": true, "-sethp": true, "-singleturn": true, "-start": true,
    "-status": true, switch: true, tie: true, turn: true, "-unboost": true,
    upkeep: true, "-weather": true, win: true
};

/** Message line prefixes that are parsed as BattleEvents. */
export type BattleEventPrefix = keyof typeof battleEventPrefixes;

/** Checks if a string is a BattleEventPrefix. Usable as a type guard. */
export function isBattleEventPrefix(value: any): value is BattleEventPrefix
{
    return battleEventPrefixes.hasOwnProperty(value);
}

/** Stands for any type of event that can happen during a battle. */
export type AnyBattleEvent = BattleEvent<BattleEventType>;

const battleEventTypesInternal =
{
    ability: true, activate: true, boost: true, cant: true, curestatus: true,
    cureteam: true, damage: true, end: true, endability: true, faint: true,
    fieldend: true, fieldstart: true, move: true, mustrecharge: true,
    prepare: true, sethp: true, singleturn: true, start: true, status: true,
    switch: true, tie: true, turn: true, upkeep: true, weather: true, win: true
};

/** Names of BattleEvent types. */
export const battleEventTypes: Readonly<typeof battleEventTypesInternal> =
    battleEventTypesInternal;

/** Names of BattleEvent types. */
export type BattleEventType = keyof typeof battleEventTypesInternal;

/** Maps BattleEventType to a BattleEvent interface type. */
export type BattleEvent<T extends BattleEventType> =
    T extends "ability" ? AbilityEvent
    : T extends "activate" ? ActivateEvent
    : T extends "boost" ? BoostEvent
    : T extends "cant" ? CantEvent
    : T extends "curestatus" ? CureStatusEvent
    : T extends "cureteam" ? CureTeamEvent
    : T extends "damage" ? DamageEvent
    : T extends "end" ? EndEvent
    : T extends "endability" ? EndAbilityEvent
    : T extends "faint" ? FaintEvent
    : T extends "fieldend" ? FieldEndEvent
    : T extends "fieldstart" ? FieldStartEvent
    : T extends "move" ? MoveEvent
    : T extends "mustrecharge" ? MustRechargeEvent
    : T extends "prepare" ? PrepareEvent
    : T extends "sethp" ? SetHPEvent
    : T extends "singleturn" ? SingleTurnEvent
    : T extends "start" ? StartEvent
    : T extends "status" ? StatusEvent
    : T extends "switch" ? SwitchEvent
    : T extends "tie" ? TieEvent
    : T extends "turn" ? TurnEvent
    : T extends "upkeep" ? UpkeepEvent
    : T extends "weather" ? WeatherEvent
    : T extends "win" ? WinEvent
    : never;

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
    type: "damage";
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

/** Event where a pokemon's ability is temporarily removed. */
export interface EndAbilityEvent extends BattleEventBase
{
    type: "endability";
    /** ID of the pokemon. */
    id: PokemonID;
    /** Ability being removed. */
    ability: string;
}

/** Event where a pokemon has fainted. */
export interface FaintEvent extends BattleEventBase
{
    type: "faint";
    /** ID of the pokemon that has fainted. */
    id: PokemonID;
}

/** Event where a field effect has ended. */
export interface FieldEndEvent extends BattleEventBase
{
    type: "fieldend";
    /** Name of the field effect. */
    effect: string;
}

/** Event where a field effect has started. */
export interface FieldStartEvent extends BattleEventBase
{
    type: "fieldstart";
    /** Name of the field effect. */
    effect: string;
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
    /** Additional info if provided. */
    otherArgs: string[];
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
    /** Some details on species, level, etc. */
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

export interface WeatherEvent extends BattleEventBase
{
    type: "weather";
    /** Type of weather. */
    weatherType: WeatherType;
    /** Whether this is an upkeep message. */
    upkeep: boolean;
}

/** Event indicating that the game has ended with a winner. */
export interface WinEvent extends BattleEventBase
{
    type: "win";
    /** Username of the winner. */
    winner: string;
}

// battle event cause types

export type Cause = AbilityCause | FatigueCause | ItemCause | LockedMoveCause;

/** Base class for Causes. */
interface CauseBase
{
    /** The type of Cause this is. */
    type: string;
    /** Additional PokemonID for context. */
    of?: PokemonID;
}

export interface AbilityCause extends CauseBase
{
    type: "ability";
    /** Name of the ability being activated. */
    ability: string;
    /**
     * Either the ID of the pokemon with the ability or the ID of the recipient
     * of the ability's effect. Meaning may depend on the context.
     */
    of?: PokemonID;
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
