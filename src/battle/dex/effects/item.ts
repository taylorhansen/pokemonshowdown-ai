import * as effects from "./effects";

/** Effects on the holder after a move has dealt damage. */
export type MovePostDamage = effects.PercentDamage;

/** End of turn effects for the holder. */
export type Turn = effects.PercentDamage | effects.Status;
