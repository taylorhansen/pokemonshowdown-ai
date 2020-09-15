import { PendingEffect } from "./PendingEffect";

/** Represents a PendingEffect containing a stat boost value. */
export class PendingBoostEffect extends PendingEffect
{
    /**
     * Creates a PendingBoostEffect.
     * @param pendingBoost Pending boost amount.
     * @param set Whether this is expected to set (true) or add (false) the
     * boost amount.
     * @param chance Chance of happening.
     */
    constructor(public readonly pendingBoost: number,
        public readonly set: boolean, chance?: number | null | undefined)
    { super(chance); }

    /**
     * Sees if this effect matches the given boost numbers.
     * @param actualBoost Actual boost amount sent by game events.
     * @param currentBoost Pokemon's boost amount prior to boost. Omit if
     * testing for a set boost event.
     * @override
     */
    public matches(actualBoost: number, currentBoost?: number, ...args: any[]):
        boolean
    {
        if (args.length > 0) return false;
        if (this.set)
        {
            return currentBoost == null && this.pendingBoost === actualBoost
        }
        if (currentBoost == null) return false;

        const next = Math.max(-6, Math.min(actualBoost + currentBoost, 6));
        const expected = Math.max(-6, Math.min(
                this.pendingBoost + currentBoost, 6));
        return next === expected;
    }
}
