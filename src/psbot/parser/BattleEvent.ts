/** @file Interfaces and helper functions for handling BattleEvents. */
import { BoostName, MajorStatus, WeatherType } from "../../battle/dex/dex-util";
import { DriverSwitchOptions } from "../../battle/driver/DriverEvent";
import { PlayerID, PokemonDetails, PokemonID, PokemonStatus } from "../helpers";

/** The types of major BattleEvents that can exist. Used as event prefixes. */
const majorBattleEventTypes =
{
    "\n": {} as EmptyEvent,
    cant: {} as CantEvent,
    move: {} as MoveEvent,
    switch: {} as SwitchEvent
} as const;

/** The types of MajorBattleEvents that can exist. Used as event prefixes. */
export type MajorBattleEventType = keyof typeof majorBattleEventTypes;

/** Checks if a string is a MajorBattleEventType. Usable as a type guard. */
export function isMajorBattleEventType(value: any):
    value is MajorBattleEventType
{
    return majorBattleEventTypes.hasOwnProperty(value);
}

/**
 * Maps MajorBattleEventType to a MajorBattleEvent interface type. These
 * BattleEvents are direct results of a player's decisions in a battle. Other
 * MinorBattleEvents are caused by these events.
 */
export type MajorBattleEvent<T extends MajorBattleEventType> =
    typeof majorBattleEventTypes[T];

/** Stands for any type of MajorBattleEvent that can happen during a battle. */
export type AnyMajorBattleEvent = MajorBattleEvent<MajorBattleEventType>;

/** The types of minor BattleEvents that can exist. Used as event prefixes. */
const minorBattleEventTypes =
{
    "-ability": {} as AbilityEvent,
    "-activate": {} as ActivateEvent,
    "-boost": {} as BoostEvent,
    "-clearallboost": {} as ClearAllBoostEvent,
    "-clearboost": {} as ClearBoostEvent,
    "-clearnegativeboost": {} as ClearNegativeBoostEvent,
    "-clearpositiveboost": {} as ClearPositiveBoostEvent,
    "-copyboost": {} as CopyBoostEvent,
    "-crit": {} as CritEvent,
    "-curestatus": {} as CureStatusEvent,
    "-cureteam": {} as CureTeamEvent,
    "-damage": {} as DamageEvent,
    detailschange: {} as DetailsChangeEvent,
    drag: {} as DragEvent,
    "-end": {} as EndEvent,
    "-endability": {} as EndAbilityEvent,
    "-enditem": {} as EndItemEvent,
    "-fail": {} as FailEvent,
    faint: {} as FaintEvent,
    "-fieldend": {} as FieldEndEvent,
    "-fieldstart": {} as FieldStartEvent,
    "-formechange": {} as FormeChangeEvent,
    "-heal": {} as HealEvent,
    "-hitcount": {} as HitCountEvent,
    "-immune": {} as ImmuneEvent,
    "-invertboost": {} as InvertBoostEvent,
    "-item": {} as ItemEvent,
    "-miss": {} as MissEvent,
    "-mustrecharge": {} as MustRechargeEvent,
    "-notarget": {} as NoTargetEvent,
    "-prepare": {} as PrepareEvent,
    "-resisted": {} as ResistedEvent,
    "-setboost": {} as SetBoostEvent,
    "-sethp": {} as SetHPEvent,
    "-sideend": {} as SideEndEvent,
    "-sidestart": {} as SideStartEvent,
    "-singlemove": {} as SingleMoveEvent,
    "-singleturn": {} as SingleTurnEvent,
    "-start": {} as StartEvent,
    "-status": {} as StatusEvent,
    "-supereffective": {} as SuperEffectiveEvent,
    "-swapboost": {} as SwapBoostEvent,
    tie: {} as TieEvent,
    "-transform": {} as TransformEvent,
    turn: {} as TurnEvent,
    "-unboost": {} as UnboostEvent,
    upkeep: {} as UpkeepEvent,
    "-weather": {} as WeatherEvent,
    win: {} as WinEvent
} as const;

/** The types of MinorBattleEvents that can exist. Used as event prefixes. */
export type MinorBattleEventType = keyof typeof minorBattleEventTypes;

/** Checks if a string is a MinorBattleEventType. Usable as a type guard. */
export function isMinorBattleEventType(value: any):
    value is MinorBattleEventType
{
    return minorBattleEventTypes.hasOwnProperty(value);
}

/**
 * Maps MinorBattleEventType to a MinorBattleEvent interface type. These events
 * are typically caused by MajorBattleEvents or happen at the end of the turn.
 */
export type MinorBattleEvent<T extends MinorBattleEventType> =
    typeof minorBattleEventTypes[T];

/** Stands for any type of MinorBattleEvent that can happen during a battle. */
export type AnyMinorBattleEvent = MinorBattleEvent<MinorBattleEventType>;

// general BattleEvent definitions

/** The types of BattleEvents that can exist. Used as event prefixes. */
export type BattleEventType = MajorBattleEventType | MinorBattleEventType;

/** Checks if a string is a BattleEventType. Usable as a type guard. */
export function isBattleEventType(value: any): value is BattleEventType
{
    return isMinorBattleEventType(value) || isMajorBattleEventType(value);
}

/** Maps BattleEventType to a BattleEvent interface type. */
export type BattleEvent<T extends BattleEventType> =
    T extends MajorBattleEventType ? MajorBattleEvent<T>
    : T extends MinorBattleEventType ? MinorBattleEvent<T>
    : never;

/** Stands for any type of event that can happen during a battle. */
export type AnyBattleEvent = BattleEvent<BattleEventType>;

// BattleEvent interfaces

/** Base class for BattleEvents. */
interface BattleEventBase<T extends BattleEventType>
{
    /** Type of event this is. */
    readonly type: T;
    /** Optional `[from] x` suffix. */
    readonly from?: string;
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

/**
 * Event data that contains the id, details, and status of a pokemon.
 *
 * Note that when casting to DriverSwitchOptions, be sure to replace the
 * `species` field with an id name (e.g. via `toIdName()`).
 * @see DriverSwitchOptions
 * @see toIdName
 */
interface AllDetails extends DriverSwitchOptions, PokemonDetails, PokemonStatus
{
    /** ID of the pokemon being revealed or changed. */
    readonly id: PokemonID;
    /**
     * Species display name.
     * @override
     */
    readonly species: string;
}

// MajorBattleEvent interfaces

/** Base class for MajorBattleEvents. */
interface MajorBattleEventBase<T extends MajorBattleEventType> extends
    BattleEventBase<T>
{
    /** @override */
    readonly type: T;
}

/**
 * Event that wraps pre- and post-turn minor events, separating them from the
 * main events.
 */
export interface EmptyEvent extends MajorBattleEventBase<"\n"> {}

/** Event where an action is prevented from being completed. */
export interface CantEvent extends MajorBattleEventBase<"cant">
{
    /** ID of the pokemon. */
    readonly id: PokemonID;
    /** Why the action couldn't be completed. */
    readonly reason: string;
    /** The move that the pokemon wasn't able to use. */
    readonly moveName?: string;
}

/** Event where a move was used. */
export interface MoveEvent extends MajorBattleEventBase<"move">
{
    /** ID of the pokemon who used the move. */
    readonly id: PokemonID;
    /** Display name of the move being used. */
    readonly moveName: string;
    /** ID of the target pokemon. */
    readonly targetId?: PokemonID;
}

/** Event where a pokemon was chosen to switch in. */
export interface SwitchEvent extends AllDetails,
    MajorBattleEventBase<"switch"> {}

// MinorBattleEvent interfaces

/** Base class for MinorBattleEvents. */
interface MinorBattleEventBase<T extends MinorBattleEventType> extends
    BattleEventBase<T>
{
    /** @override */
    readonly type: T;
}

/** Event where a pokemon's ability is revealed and activated. */
export interface AbilityEvent extends MinorBattleEventBase<"-ability">
{
    /** ID of the pokemon. */
    readonly id: PokemonID;
    /** Ability being activated. */
    readonly ability: string;
}

/** Event where a volatile status is mentioned. */
export interface ActivateEvent extends MinorBattleEventBase<"-activate">
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
export interface BoostEvent extends MinorBattleEventBase<"-boost">
{
    /** ID of the pokemon being boosted. */
    readonly id: PokemonID;
    /** Name of stat being boosted. */
    readonly stat: BoostName;
    /** Amount to boost by. */
    readonly amount: number;
}

/** Event where all stat boosts are being cleared. */
export interface ClearAllBoostEvent extends
    MinorBattleEventBase<"-clearallboost"> {}

/** Event where a pokemon's stat boosts are being cleared. */
export interface ClearBoostEvent extends MinorBattleEventBase<"-clearboost">
{
    /** ID of the pokemon whose boosts are being cleared. */
    readonly id: PokemonID;
}

/** Event where a pokemon's negative boosts are being cleared. */
export interface ClearNegativeBoostEvent extends
    MinorBattleEventBase<"-clearnegativeboost">
{
    /** ID of the pokemon whose negative boosts are being cleared. */
    readonly id: PokemonID;
}

/** Event where a pokemon's positive boosts are being cleared. */
export interface ClearPositiveBoostEvent extends
    MinorBattleEventBase<"-clearpositiveboost">
{
    /** ID of the pokemon whose positive boosts are being cleared. */
    readonly id: PokemonID;
}

/** Event where a pokemon's boosts are being copied onto another pokemon. */
export interface CopyBoostEvent extends MinorBattleEventBase<"-copyboost">
{
    /** ID of the pokemon copying the boosts. */
    readonly source: PokemonID;
    /** ID of the pokemon whose boosts are being copied. */
    readonly target: PokemonID;
}

/** Event indicating a critical hit of a move on a pokemon. */
export interface CritEvent extends MinorBattleEventBase<"-crit">
{
    /** ID of the pokemon taking the hit. */
    readonly id: PokemonID;
}

/** Event where a pokemon's major status is cured. */
export interface CureStatusEvent extends MinorBattleEventBase<"-curestatus">
{
    /** ID of the pokemon being cured. */
    readonly id: PokemonID;
    /** Status condition the pokemon is being cured of. */
    readonly majorStatus: MajorStatus;
}

/** Event where all of a team's pokemon are cured of major statuses. */
export interface CureTeamEvent extends MinorBattleEventBase<"-cureteam">
{
    /** ID of the pokemon whose team is being cured of a major status. */
    readonly id: PokemonID;
}

/** Event where a pokemon is damaged. */
export interface DamageEvent extends MinorBattleEventBase<"-damage">
{
    /** ID of the pokemon being damaged. */
    readonly id: PokemonID;
    /** New hp/status. */
    readonly status: PokemonStatus;
}

/** Event where a pokemon permanently changes form. */
export interface DetailsChangeEvent extends AllDetails,
    MinorBattleEventBase<"detailschange"> {}

/** Event where a pokemon was switched in unintentionally. */
export interface DragEvent extends AllDetails, MinorBattleEventBase<"drag"> {}

/** Event addon where a volatile status has ended. */
export interface EndEvent extends MinorBattleEventBase<"-end">
{
    /** ID of the pokemon ending a volatile status. */
    readonly id: PokemonID;
    /** Volatile status name to be removed. */
    readonly volatile: string;
}

/** Event where a pokemon's ability is temporarily removed. */
export interface EndAbilityEvent extends MinorBattleEventBase<"-endability">
{
    /** ID of the pokemon. */
    readonly id: PokemonID;
    /** Ability being removed. */
    readonly ability: string;
}

/** Event where a pokemon's item is being removed or consumed. */
export interface EndItemEvent extends MinorBattleEventBase<"-enditem">
{
    /** ID of the pokemon whose item is being removed. */
    readonly id: PokemonID;
    /** Name of the item. */
    readonly item: string;
}

/** Event where a pokemon has failed at a certain action. */
export interface FailEvent extends MinorBattleEventBase<"-fail">
{
    /** ID of the pokemon. */
    readonly id: PokemonID;
}

/** Event where a pokemon has fainted. */
export interface FaintEvent extends MinorBattleEventBase<"faint">
{
    /** ID of the pokemon that has fainted. */
    readonly id: PokemonID;
}

/** Event where a field effect has ended. */
export interface FieldEndEvent extends MinorBattleEventBase<"-fieldend">
{
    /** Name of the field effect. */
    readonly effect: string;
}

/** Event where a field effect has started. */
export interface FieldStartEvent extends MinorBattleEventBase<"-fieldstart">
{
    /** Name of the field effect. */
    readonly effect: string;
}

/** Event where a pokemon temporarily changes form. */
export interface FormeChangeEvent extends AllDetails,
    MinorBattleEventBase<"-formechange"> {}

/** Event where a pokemon is healed. */
export interface HealEvent extends MinorBattleEventBase<"-heal">
{
    /** ID of the pokemon being healed. */
    readonly id: PokemonID;
    /** New hp/status. */
    readonly status: PokemonStatus;
}

/** Event specifying the total number of hits a move took. */
export interface HitCountEvent extends MinorBattleEventBase<"-hitcount">
{
    /** ID of the pokemon being hit. */
    readonly id: PokemonID;
    /** Number of hits. */
    readonly count: number;
}

/** Event where a pokemon's immunity was mentioned. */
export interface ImmuneEvent extends MinorBattleEventBase<"-immune">
{
    /** ID of the pokemon who was immune to the last action. */
    readonly id: PokemonID;
}

/** Event where a pokemon's boosts are being inverted. */
export interface InvertBoostEvent extends MinorBattleEventBase<"-invertboost">
{
    /** ID of the pokemon whose boosts are being inverted. */
    readonly id: PokemonID;
}

/** Event where a pokemon's item is being revealed and/or activated. */
export interface ItemEvent extends MinorBattleEventBase<"-item">
{
    /** ID of the pokemon whose item is activating. */
    readonly id: PokemonID;
    /** Name of the item. */
    readonly item: string;
}

/** Event where a move missed one of its targets. */
export interface MissEvent extends MinorBattleEventBase<"-miss">
{
    /** ID of the pokemon who used the move. */
    readonly id: PokemonID;
    /** ID of the target pokemon. */
    readonly targetId: PokemonID;
}

/** Event where a pokemon must recharge on the next turn. */
export interface MustRechargeEvent extends MinorBattleEventBase<"-mustrecharge">
{
    /** ID of the pokemon that needs to recharge. */
    readonly id: PokemonID;
}

/** Event where a pokemon's move can't target anything. */
export interface NoTargetEvent extends MinorBattleEventBase<"-notarget">
{
    /** ID of the pokemon attempting to use a move. */
    readonly id: PokemonID;
}

/** Event where a move is being prepared, and will fire next turn. */
export interface PrepareEvent extends MinorBattleEventBase<"-prepare">
{
    /** ID of the pokemon preparing the move. */
    readonly id: PokemonID;
    /** Display name of the move being prepared. */
    readonly moveName: string;
    /** ID of the target pokemon. */
    readonly targetId?: PokemonID;
}

/** Event where a pokemon was hit by a move it resists. */
export interface ResistedEvent extends MinorBattleEventBase<"-resisted">
{
    /** ID of the pokemon being hit. */
    readonly id: PokemonID;
}

/** Event where a pokemon's stat boost is being set. */
export interface SetBoostEvent extends MinorBattleEventBase<"-setboost">
{
    /** ID of the pokemon whose boost is being set. */
    readonly id: PokemonID;
    /** Stat boost being set. */
    readonly stat: BoostName;
    /** Boost amount to be set. */
    readonly amount: number;
}

/** Event where the HP of a pokemon is being modified. */
export interface SetHPEvent extends MinorBattleEventBase<"-sethp">
{
    /** ID of the Pokemon being set. */
    readonly id: PokemonID;
    /** New HP/status combo. */
    readonly status: PokemonStatus;
}

/** Event where a side condition has ended. */
export interface SideEndEvent extends MinorBattleEventBase<"-sideend">
{
    /** ID of the player whose side is affected. */
    readonly id: PlayerID;
    /** Name of the side condition. */
    readonly condition: string;
}

/** Event where a side condition has started. */
export interface SideStartEvent extends MinorBattleEventBase<"-sidestart">
{
    /** ID of the player whose side is affected. */
    readonly id: PlayerID;
    /** Name of the side condition. */
    readonly condition: string;
}

/** Event where a move status is applied until another move is attempted. */
export interface SingleMoveEvent extends MinorBattleEventBase<"-singlemove">
{
    /** ID of the pokemon getting the status. */
    readonly id: PokemonID;
    /** Name of the move status. */
    readonly move: string;
}

/** Event where a status is temporarily added for a single turn. */
export interface SingleTurnEvent extends MinorBattleEventBase<"-singleturn">
{
    /** ID of the pokemon getting the status. */
    readonly id: PokemonID;
    /** Name of the temporary status. */
    readonly status: string;
}

/** Event where a volatile status condition has started. */
export interface StartEvent extends MinorBattleEventBase<"-start">
{
    /** ID of the pokemon starting a volatile status. */
    readonly id: PokemonID;
    /** Type of volatile status condition. */
    readonly volatile: string;
    /** Additional info if provided. */
    readonly otherArgs: readonly string[];
}

/** Event where a pokemon is afflicted with a status. */
export interface StatusEvent extends MinorBattleEventBase<"-status">
{
    /** ID of the pokemon being afflicted with a status condition. */
    readonly id: PokemonID;
    /** Status condition being afflicted. */
    readonly majorStatus: MajorStatus;
}

/** Event where a pokemon was hit by a move it was weak to. */
export interface SuperEffectiveEvent extends
    MinorBattleEventBase<"-supereffective">
{
    /** ID of the pokemon being hit. */
    readonly id: PokemonID;
}

/** Event where a pokemon's boosts are being swapped with another's. */
export interface SwapBoostEvent extends MinorBattleEventBase<"-swapboost">
{
    /** Pokemon whose stats are being swapped. */
    readonly source: PokemonID;
    /** Other swap target. */
    readonly target: PokemonID;
    /** Stats being swapped. */
    readonly stats: readonly BoostName[];
}

/** Event indicating that the game has ended in a tie. */
export interface TieEvent extends MinorBattleEventBase<"tie"> {}

/** Event where a pokemon transforms into another. */
export interface TransformEvent extends MinorBattleEventBase<"-transform">
{
    /** Pokemon who is transforming. */
    readonly source: PokemonID;
    /** Pokemon that will be copied. */
    readonly target: PokemonID;
}

/** Event indicating that a new turn has started. */
export interface TurnEvent extends MinorBattleEventBase<"turn">
{
    /** New turn number. */
    readonly num: number;
}

/** Event where a stat is being unboosted. */
export interface UnboostEvent extends MinorBattleEventBase<"-unboost">
{
    /** ID of the pokemon being unboosted. */
    readonly id: PokemonID;
    /** Name of stat being unboosted. */
    readonly stat: BoostName;
    /** Amount to unboost by. */
    readonly amount: number;
}

/** Event indicating that the main BattleEvents are over. */
export interface UpkeepEvent extends MinorBattleEventBase<"upkeep"> {}

/** Event where the weather is being changed or maintained. */
export interface WeatherEvent extends MinorBattleEventBase<"-weather">
{
    /** Type of weather, or `"none"` if being reset. */
    readonly weatherType: WeatherType | "none";
    /** Whether this is an upkeep message. */
    readonly upkeep: boolean;
}

/** Event indicating that the game has ended with a winner. */
export interface WinEvent extends MinorBattleEventBase<"win">
{
    /** Username of the winner. */
    readonly winner: string;
}
