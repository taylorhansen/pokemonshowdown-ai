/** @file Describes move effects. */
import * as effects from "./effects";
import { EffectMap } from "./internal";

/** Move effect interface. */
export type Move = Primary | (MoveBase & (Other | Secondary));

/** Base interface for target-based MoveEffects. */
interface MoveBase
{
    /** Category of move effect. */
    readonly ctg: Category;
}

/** Categories of move effects. */
export type Category = "self" | "hit";

/** Map type for Primary effects. */
export type PrimaryMap = EffectMap<PrimaryType>;

/** Types of Primary effects. */
export type PrimaryType = "call" | "countableStatus" | "delay" | "field" |
    "recoil" | "selfSwitch" | "swapBoost";

/**
 * Primary effect of a move. MoveEffects with these will not have
 * MoveEffectCategories assigned to them.
 */
export type Primary = PrimaryMap[PrimaryType];

/** Map type for Other effects. */
export type OtherMap = EffectMap<OtherType>;

/** Types of Other effects. */
export type OtherType = "boost" | "implicitStatus" | "implicitTeam" | "status" |
    "team" | "unique";

/**
 * Other effects of a move. MoveEffects with these will have
 * MoveEffectCategories assigned to them.
 */
export type Other = OtherMap[OtherType];

/** Contained secondary effects. */
export type Secondary =
    effects.Chance<effects.Boost | effects.Flinch | effects.Status>;
