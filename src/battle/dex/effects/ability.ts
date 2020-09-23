/** @file Describes ability effects. */
import * as effects from "./effects";

/** Ability effect interface. */
export type Ability = AbilityBase &
    (TargetedAbilityEffect | effects.Chance<TargetedAbilityEffect>);

/** Base interface for Ability effects. */
interface AbilityBase
{
    /** Circumstance that should activate the effect. */
    readonly on: AbilityOn;
    /** Ability that blocks this effect. */
    readonly blockedBy?: string;
}

/** Viable ability effects with an AbilityTarget attached. */
type TargetedAbilityEffect = TargetedEffect &
    (effects.PercentDamage | effects.TypeChange | effects.Status);

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

/** Effect that has a target. */
interface TargetedEffect
{
    /** Target of the effect. */
    readonly tgt: AbilityTarget;
}
