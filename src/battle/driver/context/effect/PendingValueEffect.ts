import { PendingEffect } from "./PendingEffect";

/** Represents a PendingEffect with a single value. */
export class PendingValueEffect extends PendingEffect
{
    /**
     * Creates a PendingValueEffect.
     * @param value Value to store.
     * @param chance Chance of happening.
     */
    constructor(public readonly value: any, chance?: number | null | undefined)
    { super(chance); }

    /** @override */
    public matches(value: any, ...args: any[]): boolean
    {
        return args.length <= 0 && this.value === value;
    }
}
