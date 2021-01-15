/** @file Describes all the different types of effects. */
import { BoostTable, MajorStatus, WeatherType } from "../dex-util";
import { Effect } from "./internal";

// effects

/** Effect that causes a stat boost. Can either add or set boost. */
export type Boost = Effect<"boost"> & (AddBoost | SetBoost);

/** Add boost effect. */
interface AddBoost
{
    /** Add boost. */
    readonly add: Partial<BoostTable>;
    readonly set?: undefined;
}

/** Set boost effect. */
interface SetBoost
{
    readonly add?: undefined;
    /** Set boost. */
    readonly set: Partial<BoostTable>;
}

/** Effect that calls a move. */
export type Call = Effect<"call", CallType>;

// tslint:disable: no-trailing-whitespace (force newlines in doc)
/**
 * Specifies how this move can call another move.
 *
 * `true` - Calls a move normally.  
 * `"copycat"` - Called move must match the RoomStatus' `#lastMove` field and
 * not have the `noCopycat` flag set, else this effect should fail.  
 * `"mirror"` - Mirror move. Called move should match the user's `mirrorMove`
 * VolatileStatus field, or fail if null.  
 * `"self"` - Calls a move from the user's moveset.  
 * `"target"` - Calls a move from the target's moveset (caller must have only
 * one target).  
 * `string` - Specifies the move that will be called.
 */
// tslint:enable: no-trailing-whitespace
export type CallType = true | "copycat" | "mirror" | "self" | "target" | string;

/** Effect that has a chance to do one of the listed effects. */
export interface Chance<T> extends Effect<"chance">
{
    /** Percent chance of activating, out of 100. */
    readonly chance: number;
    /** Effects that can activate. */
    readonly effects: readonly T[];
}

// TODO: add copy-boost effect

/** Effect that activates a countable status. */
export type CountableStatus = Effect<"countableStatus", CountableStatusType>;

/** Status effects that are explicitly counted in game events. */
export type CountableStatusType = "perish" | "stockpile";

/** Effect that activates a delayed move. */
export type Delay = Effect<"delay", DelayType>;

/**
 * Effect that heals the user proportional to the amount of damage dealt by a
 * move. Value is the fraction of damage being healed by the user.
 */
export type Drain = Effect<"drain", readonly [number, number]>;

/** Types of delayed moves. */
export type DelayType = "future" | "twoTurn";

/** Effect that causes a field effect. */
export type Field = Effect<"field", FieldType>;

/** Effect that causes flinching. */
export type Flinch = Effect<"flinch">;

/** Status effects that are explicitly started/ended in game events. */
export type FieldType = UpdatableFieldType | "gravity" | "trickRoom";

/**
 * Field effects that are explicitly updated throughout their duration in game
 * events.
 */
export type UpdatableFieldType = WeatherType;

/** Effect that describes an implicit status for a move. */
export type ImplicitStatus = Effect<"implicitStatus", ImplicitStatusType>;

// TODO: add rollout
/** Status effects that are implied by the successful use of a move. */
export type ImplicitStatusType = "defenseCurl" | "lockedMove" | "minimize" |
    "mustRecharge";

/** Effect that describes an implicit team status for a move. */
export type ImplicitTeam = Effect<"implicitTeam", ImplicitTeamType>;

/**
 * Team effects that are implied by the successful use of a move, but events may
 * still mention them based on specific circumstances.
 */
export type ImplicitTeamType = "healingWish" | "lunarDance" | "wish";

/**
 * Effect that causes damage according to a percentage of the pokemon's max hp.
 * Negative takes damage, while positive heals it.
 */
export type PercentDamage = Effect<"percentDamage", number>;

/**
 * Effect that causes recoil damage to the user. Value is the ratio of dealt
 * damage to recoil damage.
 */
export type Recoil = Effect<"recoil", number>;

/** Effect that causes a pokemon to switch out in the middle of a turn. */
export type SelfSwitch = Effect<"selfSwitch", SelfSwitchType>;

/**
 * Whether this move causes the user to switch, but `copyvolatile` additionally
 * transfers certain volatile status conditions.
 */
export type SelfSwitchType = true | "copyvolatile";

/** Effect that activates a status. */
export type Status = Effect<"status", StatusType>;

/** Status effects that are explicitly started/ended in game events. */
export type StatusType = UpdatableStatusType | SingleMoveType |
    SingleTurnType | MajorStatus | "aquaRing" | "attract" | "charge" |
    "curse" | "embargo" | "encore" | "flashFire" | "focusEnergy" | "foresight" |
    "healBlock" | "imprison" | "ingrain" | "leechSeed" | "magnetRise" |
    "miracleEye" | "mudSport" | "nightmare" | "powerTrick" | "slowStart" |
    "substitute" | "suppressAbility" | "taunt" | "torment" | "waterSport" |
    "yawn";

/**
 * Status effects that are explicitly updated throughout their duration in game
 * events.
 */
export type UpdatableStatusType = "confusion" | "bide" | "uproar";

/** Types of single-move effects. */
export type SingleMoveType = "destinyBond" | "grudge" | "rage";

/** Types of single-turn effects. */
export type SingleTurnType = "endure" | "focus" | "magicCoat" | "protect" |
    "roost" | "snatch";

/** Effect that causes certain boosts to be swapped. */
export type SwapBoost = Effect<"swapBoost"> & Partial<BoostTable<true>>;

/** Effect that causes a team status. */
export type Team = Effect<"team", TeamType>;

/** Team status effects that are explicitly started/ended in game events. */
export type TeamType = "lightScreen" | "luckyChant" | "mist" | "reflect" |
    "safeguard" | "spikes" | "stealthRock" | "tailwind" | "toxicSpikes";

/** Effect that changes the pokemon's type. */
export type TypeChange = Effect<"typeChange", TypeChangeRule>;

// tslint:disable: no-trailing-whitespace (force newlines in doc)
/**
 * Rule for changing a pokemon's type according to a TypeChange effect.  
 * `"colorchange"` - Matches the type of the move that was just used against it.
 */
// tslint:enable: no-trailing-whitespace
export type TypeChangeRule = "colorchange";

/** Effect that causes a unique status that requires special handling. */
export type Unique = Effect<"unique", UniqueType>;

// tslint:disable: no-trailing-whitespace (force newlines in doc)
/**
 * Status effects that require more special attention.  
 * `"conversion"` - Change user's type to that of a known move.
 * `"disable"` - Disable the target's last used move.
 */
// tslint:enable: no-trailing-whitespace
export type UniqueType = "conversion" | "disable";
