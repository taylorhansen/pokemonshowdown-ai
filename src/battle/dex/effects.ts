import { BoostName, MajorStatus, WeatherType } from "./dex-util";

/** Base interface for Effects. */
interface Effect<TType extends string, TValue>
{
    /** Type of effect. */
    readonly type: TType;
    /** Main effect value. */
    readonly value: TValue;
}

// ability

/** Ability effect interface. */
export type Ability = AbilityBase & AbilityEffects;

type AbilityEffects = TargetedAbilityEffects | Chance<TargetedAbilityEffects>;

type TargetedAbilityEffects = TargetedEffect &
    (PercentDamage | TypeChange | Status);

// tslint:disable: no-trailing-whitespace (force newlines in doc)
/**
 * Name of the circumstance that should activate the ability effect.  
 * `"contact"` - Hit by a damaging contact move.
 * `"contactKO"` - Knocked out by a damaging contact move.
 * `"damaged"` - Hit by a damaging move.
 */
// tslint:enable: no-trailing-whitespace
export type AbilityOn = "contact" | "contactKO" | "damaged";

// tslint:disable: no-trailing-whitespace (force newlines in doc)
/**
 * Target of the ability effect.
 * `"hit"` - Opponent that caused the ability to activate.
 * `"self"` - Owner of the ability. Cancels if fainted by a move before
 * activating.
 */
// tslint:enable: no-trailing-whitespace
// TODO: restrict hit based on AbilityOn container/generic
export type AbilityTarget = "hit" | "self";

/** Base interface for Ability effects. */
interface AbilityBase
{
    /** Circumstance that should activate the effect. */
    readonly on: AbilityOn;
    /** Ability that blocks this effect. */
    readonly blockedBy?: string;
}

/** Effect that has a target. */
interface TargetedEffect
{
    /** Target of the effect. */
    readonly tgt: AbilityTarget;
}

/** Effect that changes the pokemon's type. */
export type TypeChange = Effect<"typeChange", TypeChangeRule>;

// tslint:disable: no-trailing-whitespace (force newlines in doc)
/**
 * Rule for changing a pokemon's type according to a TypeChange effect.  
 * `"colorchange"` - Matches the type of the move last used against it.
 */
// tslint:enable: no-trailing-whitespace
export type TypeChangeRule = "colorchange";

/**
 * Effect that causes damage according to a percentage of the pokemon's max hp.
 * Negative takes damage, while positive heals it.
 */
export type PercentDamage = Effect<"percentDamage", number>;

/** Effect that has a chance to do one of the listed effects. */
export interface Chance<TEffect> extends Effect<"chance", readonly TEffect[]>
{
    /** Percent chance of activating. */
    readonly chance: number;
}

// move

/** Move effect interface. */
export type Move = Primary | (MoveBase & Other);

/** Base interface for target-based MoveEffects. */
interface MoveBase
{
    /** Category of move effect. */
    ctg: MoveEffectCategory;
}

/** Categories of move effects. */
export type MoveEffectCategory = "self" | "hit";

// primary move effects

/** Map type for Primary effects. */
export interface PrimaryMap
{
    call: Call;
    countableStatus: CountableStatus;
    delay: Delay;
    field: Field;
    recoil: Recoil;
    selfSwitch: SelfSwitch;
    swapBoost: SwapBoost;
}

/** Types of Primary effects. */
export type PrimaryType = keyof PrimaryMap;

/**
 * Primary effects of a move. MoveEffects with these will not have
 * MoveEffectCategories assigned to them.
 */
export type Primary = PrimaryMap[PrimaryType];

/** Effect that calls a move. */
export type Call = Effect<"call", CallType>;

// tslint:disable: no-trailing-whitespace (force newlines in doc)
/**
 * Specifies how this move can call another move.
 *
 * `true` - Calls a move normally.  
 * `"copycat"` - Called move should match the RoomStatus' `#lastMove` field and
 * have the `#copycat=true` in its MoveData, or fail if either of the fields are
 * falsy.
 * `"mirror"` - Mirror move. Called move should match the user's `mirrorMove`
 * VolatileStatus field, or fail if null.  
 * `"self"` - Calls a move from the user's moveset.  
 * `"target"` - Calls a move from the target's moveset (caller must have only
 * one target).  
 * `string` - Specifies the move that will be called.
 */
// tslint:enable: no-trailing-whitespace
export type CallType = true | "copycat" | "mirror" | "self" | "target" | string;

// TODO: add copy-boost effect

/** Effect that activates a countable status. */
export type CountableStatus =
    Effect<"countableStatus", CountableStatusType>;

/** Status effects that are explicitly counted in game events. */
export type CountableStatusType = "perish" | "stockpile";

/** Effect that activates a delayed move. */
export type Delay = Effect<"delay", DelayType>;

/** Types of delayed moves. */
export type DelayType = "future" | "twoTurn";

/** Effect that causes a field effect. */
export type Field = Effect<"field", FieldType>;

/** Status effects that are explicitly started/ended in game events. */
export type FieldType = UpdatableFieldType | "gravity" | "trickRoom";

/**
 * Field effects that are explicitly updated throughout their duration in game
 * events.
 */
export type UpdatableFieldType = WeatherType;

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

/** Effect that causes certain boosts to be swapped. */
export type SwapBoost = Effect<"swapBoost", Partial<BoostTable<true>>>;

// other move effects

/** Map type for Other effects. */
export interface OtherMap
{
    boost: Boost;
    implicitStatus: ImplicitStatus;
    implicitTeam: ImplicitTeam;
    status: Status;
    team: Team;
    unique: Unique;
    secondary: Secondary;
}

/** Types of Other effects. */
export type OtherType = keyof OtherMap;

/**
 * Other effects of a move. MoveEffects with these will have
 * MoveEffectCategories assigned to them.
 */
export type Other = OtherMap[OtherType];

/** Effect that causes a stat boost. */
export type Boost =
    Effect<"boost",
        {readonly add: Partial<BoostTable>; readonly set?: undefined} |
        {readonly add?: undefined; readonly set: Partial<BoostTable>;}>;

/** Boost table mapped type. */
export type BoostTable<T = number> = {readonly [U in BoostName]: T};

/** Effect that describes an implicit status for a move. */
export type ImplicitStatus = Effect<"implicitStatus", ImplicitStatusType>;

// TODO: add rollout
/** Status effects that are implied by the successful use of a move. */
export type ImplicitStatusType = "defenseCurl" | "lockedMove" | "minimize" |
    "mustRecharge";

/** Effect that describes an implicit team status for a move. */
export type ImplicitTeam = Effect<"implicitTeam", ImplicitTeamType>;

/** Team effects that are implied by the successful use of a move. */
export type ImplicitTeamType = "wish";

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

/** Types of sinlge-move effects. */
export type SingleMoveType = "destinyBond" | "grudge" | "rage";

/** Types of sinlge-turn effects. */
export type SingleTurnType = "endure" | "magicCoat" | "protect" | "roost" |
    "snatch";

/** Effect that causes a team status. */
export type Team = Effect<"team", TeamType>;

/** Team status effects that are explicitly started/ended in game events. */
export type TeamType = "healingWish" | "lightScreen" | "luckyChant" |
    "lunarDance" | "mist" | "reflect" | "safeguard" | "spikes" | "stealthRock" |
    "tailwind" | "toxicSpikes";

/** Effect that causes a unique status that requires special handling. */
export type Unique = Effect<"unique", UniqueType>;

/** Status effects that require more special attention. */
export type UniqueType = "conversion" | "disable";

/** Effect that may happen after the normal effects of a move. */
export interface Secondary extends Effect<"secondary", SecondaryEffect>
{
    /** Chance (out of 100) of the effect happening. */
    readonly chance: number;
}

/** Contained secondary effects. */
type SecondaryEffect = Effect<"flinch", true> | Boost | Status;
