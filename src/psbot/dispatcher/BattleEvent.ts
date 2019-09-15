/** @file Interfaces and helper functions for handling BattleEvents. */
import { BoostName, MajorStatus, WeatherType } from "../../battle/dex/dex-util";
import { PlayerID, PokemonDetails, PokemonID, PokemonStatus } from "../helpers";

/** The types of BattleEvents that can exist. Used as event prefixes. */
export const battleEventTypes =
{
    "\n": true, "-ability": true, "-activate": true, "-boost": true, cant: true,
    "-clearallboost": true, "-clearboost": true, "-clearnegativeboost": true,
    "-clearpositiveboost": true, "-copyboost": true, "-curestatus": true,
    "-cureteam": true, "-damage": true, detailschange: true, drag: true,
    "-end": true, "-endability": true, "-enditem": true, "-fail": true,
    faint: true, "-fieldend": true, "-fieldstart": true, "-formechange": true,
    "-heal": true, "-immune": true, "-invertboost": true, "-item": true,
    "-miss": true, move: true, "-mustrecharge": true, "-prepare": true,
    "-setboost": true, "-sethp": true, "-sideend": true, "-sidestart": true,
    "-singlemove": true, "-singleturn": true, "-start": true, "-status": true,
    "-swapboost": true, switch: true, tie: true, "-transform": true, turn: true,
    "-unboost": true, upkeep: true, "-weather": true, win: true
} as const;
/** The types of BattleEvents that can exist. Used as event prefixes. */
export type BattleEventType = keyof typeof battleEventTypes;
/** Checks if a string is a BattleEventType. Usable as a type guard. */
export function isBattleEventType(value: any): value is BattleEventType
{
    return battleEventTypes.hasOwnProperty(value);
}

/** Maps BattleEventType to a BattleEvent interface type. */
export type BattleEvent<T extends BattleEventType> =
    T extends "\n" ? EmptyEvent
    : T extends "-ability" ? AbilityEvent
    : T extends "-activate" ? ActivateEvent
    : T extends "-boost" ? BoostEvent
    : T extends "cant" ? CantEvent
    : T extends "-clearallboost" ? ClearAllBoostEvent
    : T extends "-clearboost" ? ClearBoostEvent
    : T extends "-clearnegativeboost" ? ClearNegativeBoostEvent
    : T extends "-clearpositiveboost" ? ClearPositiveBoostEvent
    : T extends "-copyboost" ? CopyBoostEvent
    : T extends "-curestatus" ? CureStatusEvent
    : T extends "-cureteam" ? CureTeamEvent
    : T extends "-damage" ? DamageEvent
    : T extends "detailschange" ? DetailsChangeEvent
    : T extends "drag" ? DragEvent
    : T extends "-end" ? EndEvent
    : T extends "-endability" ? EndAbilityEvent
    : T extends "-enditem" ? EndItemEvent
    : T extends "-fail" ? FailEvent
    : T extends "faint" ? FaintEvent
    : T extends "-fieldend" ? FieldEndEvent
    : T extends "-fieldstart" ? FieldStartEvent
    : T extends "-formechange" ? FormeChangeEvent
    : T extends "-heal" ? HealEvent
    : T extends "-immune" ? ImmuneEvent
    : T extends "-invertboost" ? InvertBoostEvent
    : T extends "-item" ? ItemEvent
    : T extends "-miss" ? MissEvent
    : T extends "move" ? MoveEvent
    : T extends "-mustrecharge" ? MustRechargeEvent
    : T extends "-prepare" ? PrepareEvent
    : T extends "-setboost" ? SetBoostEvent
    : T extends "-sethp" ? SetHPEvent
    : T extends "-sideend" ? SideEndEvent
    : T extends "-sidestart" ? SideStartEvent
    : T extends "-singlemove" ? SingleMoveEvent
    : T extends "-singleturn" ? SingleTurnEvent
    : T extends "-start" ? StartEvent
    : T extends "-status" ? StatusEvent
    : T extends "-swapboost" ? SwapBoostEvent
    : T extends "switch" ? SwitchEvent
    : T extends "tie" ? TieEvent
    : T extends "-transform" ? TransformEvent
    : T extends "turn" ? TurnEvent
    : T extends "-unboost" ? UnboostEvent
    : T extends "upkeep" ? UpkeepEvent
    : T extends "-weather" ? WeatherEvent
    : T extends "win" ? WinEvent
    : never;

/** Stands for any type of event that can happen during a battle. */
export type AnyBattleEvent = BattleEvent<BattleEventType>;

/** Base class for BattleEvents. */
interface BattleEventBase
{
    /** Type of event this is. */
    readonly type: string;
    /** Optional From suffix object. */
    readonly from?: From;
    /** Additional PokemonID for context. */
    readonly of?: PokemonID;
    /**
     * Whether the event was caused from fatigue, or the completion of a
     * multi-turn locked move.
     */
    readonly fatigue?: boolean;
    /** Whether the event was due to eating. */
    readonly eat?: boolean;
    /** Whether the mentioned effect (usually a move) missed its target. */
    readonly miss?: boolean;
}

/** Event that wraps the main events, separating them from upkeep events. */
export interface EmptyEvent extends BattleEventBase
{
    readonly type: "\n";
}

/** Event where a pokemon's ability is revealed and activated. */
export interface AbilityEvent extends BattleEventBase
{
    readonly type: "-ability";
    /** ID of the pokemon. */
    readonly id: PokemonID;
    /** Ability being activated. */
    readonly ability: string;
}

/** Event where a volatile status is mentioned. */
export interface ActivateEvent extends BattleEventBase
{
    readonly type: "-activate";
    /** ID of the pokemon whose status is being activated. */
    readonly id: PokemonID;
    /** Volatile status name. */
    readonly volatile: string;
    /** Additional info if provided. */
    readonly otherArgs: readonly string[];
}

/** Event where a stat is being boosted. */
export interface BoostEvent extends BattleEventBase
{
    readonly type: "-boost";
    /** ID of the pokemon being boosted. */
    readonly id: PokemonID;
    /** Name of stat being boosted. */
    readonly stat: BoostName;
    /** Amount to boost by. */
    readonly amount: number;
}

/** Event where an action is prevented from being completed. */
export interface CantEvent extends BattleEventBase
{
    readonly type: "cant";
    /** ID of the pokemon. */
    readonly id: PokemonID;
    /** Why the action couldn't be completed. */
    readonly reason: string;
    /** The move that the pokemon wasn't able to use. */
    readonly moveName?: string;
}

/** Event where all stat boosts are being cleared. */
export interface ClearAllBoostEvent extends BattleEventBase
{
    readonly type: "-clearallboost";
}

/** Event where a pokemon's stat boosts are being cleared. */
export interface ClearBoostEvent extends BattleEventBase
{
    readonly type: "-clearboost";
    /** ID of the pokemon whose boosts are being cleared. */
    readonly id: PokemonID;
}

/** Event where a pokemon's negative boosts are being cleared. */
export interface ClearNegativeBoostEvent extends BattleEventBase
{
    readonly type: "-clearnegativeboost";
    /** ID of the pokemon whose negative boosts are being cleared. */
    readonly id: PokemonID;
}

/** Event where a pokemon's positive boosts are being cleared. */
export interface ClearPositiveBoostEvent extends BattleEventBase
{
    readonly type: "-clearpositiveboost";
    /** ID of the pokemon whose positive boosts are being cleared. */
    readonly id: PokemonID;
}

/** Event where a pokemon's boosts are being copied onto another pokemon. */
export interface CopyBoostEvent extends BattleEventBase
{
    readonly type: "-copyboost";
    /** ID of the pokemon copying the boosts. */
    readonly source: PokemonID;
    /** ID of the pokemon whose boosts are being copied. */
    readonly target: PokemonID;
}

/** Event where a pokemon's major status is cured. */
export interface CureStatusEvent extends BattleEventBase
{
    readonly type: "-curestatus";
    /** ID of the pokemon being cured. */
    readonly id: PokemonID;
    /** Status condition the pokemon is being cured of. */
    readonly majorStatus: MajorStatus;
}

/** Event where all of a team's pokemon are cured of major statuses. */
export interface CureTeamEvent extends BattleEventBase
{
    readonly type: "-cureteam";
    /** ID of the pokemon whose team is being cured of a major status. */
    readonly id: PokemonID;
}

/** Event where a pokemon is damaged. */
export interface DamageEvent extends BattleEventBase
{
    readonly type: "-damage";
    /** ID of the pokemon being damaged. */
    readonly id: PokemonID;
    /** New hp/status. */
    readonly status: PokemonStatus;
}

/** Event where id, details, and status of a pokemon are revealed or changed. */
interface AllDetailsEvent extends BattleEventBase
{
    /** ID of the pokemon being revealed or changed. */
    readonly id: PokemonID;
    /** Some details on species, level, etc. */
    readonly details: PokemonDetails;
    /** HP and any status conditions. */
    readonly status: PokemonStatus;
}

/** Event where a pokemon permanently changes form. */
export interface DetailsChangeEvent extends AllDetailsEvent
{
    readonly type: "detailschange";
}

/** Event where a pokemon was switched in unintentionally. */
export interface DragEvent extends AllDetailsEvent
{
    readonly type: "drag";
}

/** Event where a pokemon temporarily changes form. */
export interface FormeChangeEvent extends AllDetailsEvent
{
    readonly type: "-formechange";
}

/** Event where a pokemon was switched in. */
export interface SwitchEvent extends AllDetailsEvent
{
    readonly type: "switch";
}

/** Event addon where a volatile status has ended. */
export interface EndEvent extends BattleEventBase
{
    readonly type: "-end";
    /** ID of the pokemon ending a volatile status. */
    readonly id: PokemonID;
    /** Volatile status name to be removed. */
    readonly volatile: string;
}

/** Event where a pokemon's ability is temporarily removed. */
export interface EndAbilityEvent extends BattleEventBase
{
    readonly type: "-endability";
    /** ID of the pokemon. */
    readonly id: PokemonID;
    /** Ability being removed. */
    readonly ability: string;
}

/** Event where a pokemon's item is being removed or consumed. */
export interface EndItemEvent extends BattleEventBase
{
    readonly type: "-enditem";
    /** ID of the pokemon whose item is being removed. */
    readonly id: PokemonID;
    /** Name of the item. */
    readonly item: string;
}

/** Event where a pokemon has failed at a certain action. */
export interface FailEvent extends BattleEventBase
{
    readonly type: "-fail";
    /** ID of the pokemon. */
    readonly id: PokemonID;
}

/** Event where a pokemon has fainted. */
export interface FaintEvent extends BattleEventBase
{
    readonly type: "faint";
    /** ID of the pokemon that has fainted. */
    readonly id: PokemonID;
}

/** Event where a field effect has ended. */
export interface FieldEndEvent extends BattleEventBase
{
    readonly type: "-fieldend";
    /** Name of the field effect. */
    readonly effect: string;
}

/** Event where a field effect has started. */
export interface FieldStartEvent extends BattleEventBase
{
    readonly type: "-fieldstart";
    /** Name of the field effect. */
    readonly effect: string;
}

/** Event where a pokemon is healed. */
export interface HealEvent extends BattleEventBase
{
    readonly type: "-heal";
    /** ID of the pokemon being healed. */
    readonly id: PokemonID;
    /** New hp/status. */
    readonly status: PokemonStatus;
}

/** Event where a pokemon's immunity was mentioned. */
export interface ImmuneEvent extends BattleEventBase
{
    readonly type: "-immune";
    /** ID of the pokemon who was immune to the last action. */
    readonly id: PokemonID;
}

/** Event where a pokemon's boosts are being inverted. */
export interface InvertBoostEvent extends BattleEventBase
{
    readonly type: "-invertboost";
    /** ID of the pokemon whose boosts are being inverted. */
    readonly id: PokemonID;
}

/** Event where a pokemon's item is being revealed and/or activated. */
export interface ItemEvent extends BattleEventBase
{
    readonly type: "-item";
    /** ID of the pokemon whose item is activating. */
    readonly id: PokemonID;
    /** Name of the item. */
    readonly item: string;
}

/** Event where a move missed one of its targets. */
export interface MissEvent extends BattleEventBase
{
    readonly type: "-miss";
    /** ID of the pokemon who used the move. */
    readonly id: PokemonID;
    /** ID of the target pokemon. */
    readonly targetId: PokemonID;
}

/** Event where a move was used. */
export interface MoveEvent extends BattleEventBase
{
    readonly type: "move";
    /** ID of the pokemon who used the move. */
    readonly id: PokemonID;
    /** Display name of the move being used. */
    readonly moveName: string;
    /** ID of the target pokemon. */
    readonly targetId?: PokemonID;
}

/** Event where a pokemon must recharge on the next turn. */
export interface MustRechargeEvent extends BattleEventBase
{
    readonly type: "-mustrecharge";
    /** ID of the pokemon that needs to recharge. */
    readonly id: PokemonID;
}

/** Event where a move is being prepared, and will fire next turn. */
export interface PrepareEvent extends BattleEventBase
{
    readonly type: "-prepare";
    /** ID of the pokemon preparing the move. */
    readonly id: PokemonID;
    /** Display name of the move being prepared. */
    readonly moveName: string;
    /** ID of the target pokemon. */
    readonly targetId?: PokemonID;
}

/** Event where a pokemon's stat boost is being set. */
export interface SetBoostEvent extends BattleEventBase
{
    readonly type: "-setboost";
    /** ID of the pokemon whose boost is being set. */
    readonly id: PokemonID;
    /** Stat boost being set. */
    readonly stat: BoostName;
    /** Boost amount to be set. */
    readonly amount: number;
}

/** Event where the HP of a pokemon is being modified. */
export interface SetHPEvent extends BattleEventBase
{
    readonly type: "-sethp";
    /** ID of the Pokemon being set. */
    readonly id: PokemonID;
    /** New HP/status combo. */
    readonly status: PokemonStatus;
}

/** Event where a side condition has ended. */
export interface SideEndEvent extends BattleEventBase
{
    readonly type: "-sideend";
    /** ID of the player whose side is affected. */
    readonly id: PlayerID;
    /** Name of the side condition. */
    readonly condition: string;
}

/** Event where a side condition has started. */
export interface SideStartEvent extends BattleEventBase
{
    readonly type: "-sidestart";
    /** ID of the player whose side is affected. */
    readonly id: PlayerID;
    /** Name of the side condition. */
    readonly condition: string;
}

/** Event where a move status is applied until another move is attempted. */
export interface SingleMoveEvent extends BattleEventBase
{
    readonly type: "-singlemove";
    /** ID of the pokemon getting the status. */
    readonly id: PokemonID;
    /** Name of the move status. */
    readonly move: string;
}

/** Event where a status is temporarily added for a single turn. */
export interface SingleTurnEvent extends BattleEventBase
{
    readonly type: "-singleturn";
    /** ID of the pokemon getting the status. */
    readonly id: PokemonID;
    /** Name of the temporary status. */
    readonly status: string;
}

/** Event where a volatile status condition has started. */
export interface StartEvent extends BattleEventBase
{
    readonly type: "-start";
    /** ID of the pokemon starting a volatile status. */
    readonly id: PokemonID;
    /** Type of volatile status condition. */
    readonly volatile: string;
    /** Additional info if provided. */
    readonly otherArgs: readonly string[];
}

/** Event where a pokemon is afflicted with a status. */
export interface StatusEvent extends BattleEventBase
{
    readonly type: "-status";
    /** ID of the pokemon being afflicted with a status condition. */
    readonly id: PokemonID;
    /** Status condition being afflicted. */
    readonly majorStatus: MajorStatus;
}

/** Event where a pokemon's boosts are being swapped with another's. */
export interface SwapBoostEvent extends BattleEventBase
{
    readonly type: "-swapboost";
    /** Pokemon whose stats are being swapped. */
    readonly source: PokemonID;
    /** Other swap target. */
    readonly target: PokemonID;
    /** Stats being swapped. */
    readonly stats: readonly BoostName[];
}

/** Event indicating that the game has ended in a tie. */
export interface TieEvent extends BattleEventBase
{
    readonly type: "tie";
}

/** Event where a pokemon transforms into another. */
export interface TransformEvent extends BattleEventBase
{
    readonly type: "-transform";
    /** Pokemon who is transforming. */
    readonly source: PokemonID;
    /** Pokemon that will be copied. */
    readonly target: PokemonID;
}

/** Event indicating that a new turn has started. */
export interface TurnEvent extends BattleEventBase
{
    readonly type: "turn";
    /** New turn number. */
    readonly num: number;
}

/** Event where a stat is being unboosted. */
export interface UnboostEvent extends BattleEventBase
{
    readonly type: "-unboost";
    /** ID of the pokemon being unboosted. */
    readonly id: PokemonID;
    /** Name of stat being unboosted. */
    readonly stat: BoostName;
    /** Amount to unboost by. */
    readonly amount: number;
}

/** Event indicating that the main BattleEvents are over. */
export interface UpkeepEvent extends BattleEventBase
{
    readonly type: "upkeep";
}

/** Event where the weather is being changed or maintained. */
export interface WeatherEvent extends BattleEventBase
{
    readonly type: "-weather";
    /** Type of weather, or `"none"` if being reset. */
    readonly weatherType: WeatherType | "none";
    /** Whether this is an upkeep message. */
    readonly upkeep: boolean;
}

/** Event indicating that the game has ended with a winner. */
export interface WinEvent extends BattleEventBase
{
    readonly type: "win";
    /** Username of the winner. */
    readonly winner: string;
}

// from suffix types

/** Optional event suffixes. */
export type From = FromAbility | FromItem | FromLockedMove | FromMove |
    FromPsn | FromStealEat;

/** Base class for From suffixes. */
interface FromBase
{
    /** Which type of cause this is. */
    readonly type: string;
}

/** Caused from an ability being activated. */
export interface FromAbility extends FromBase
{
    readonly type: "ability";
    /** Name of the ability being activated. */
    readonly ability: string;
}

/** Caused from a held item. */
export interface FromItem extends FromBase
{
    readonly type: "item";
    /** Item name. */
    readonly item: string;
}

/** Caused from being locked into using the last move. */
export interface FromLockedMove extends FromBase
{
    readonly type: "lockedmove";
}

/** Caused from a pokemon's move. */
export interface FromMove extends FromBase
{
    readonly type: "move";
    /** Move name. */
    readonly move: string;
}

/** Caused from being poisoned. */
export interface FromPsn extends FromBase
{
    readonly type: "psn";
}

/** Caused from a berry being stolen and consumed */
export interface FromStealEat extends FromBase
{
    readonly type: "stealeat";
}
