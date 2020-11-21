/** @file Describes ability effects. */
import * as effects from "./effects";

/** Types of effects from an absorbing ability. */
export type Absorb = effects.PercentDamage | effects.Boost |
    effects.Status;

/** Ability effects that can happen on move contact. */
export type MoveContact = effects.PercentDamage | effects.Status;

/** Ability effects that can happen on move contact KO. */
export type MoveContactKO = effects.PercentDamage;
