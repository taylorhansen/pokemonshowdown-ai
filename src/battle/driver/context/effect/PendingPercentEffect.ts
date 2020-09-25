import { PendingEffect } from "./PendingEffect";

/** Represents a PendingEffect for a percentage difference. */
export class PendingPercentEffect extends PendingEffect
{
    /**
     * Creates a PendingPercentEffect.
     * @param percent Value to store.
     * @param chance Chance of happening.
     */
    constructor(public readonly percent: number,
        chance?: number | null | undefined)
    { super(chance); }

    /**
     * @param initial Initial HP value.
     * @param next Next HP value being set.
     * @param max Max HP value.
     * @override
     */
    public matches(initial: number, next: number, max: number, ...args: any[]):
        boolean
    {
        if (args.length > 0) return false;
        if (typeof initial !== "number" || initial < 0) return false;
        if (typeof next !== "number" || next < 0) return false;
        if (typeof max !== "number" || max <= 0) return false;
        // calculate diffs
        const diff = next - initial;
        const expectedDiff = Math.floor(max * this.percent / 100);
        // TODO: use actual hp numbers
        return Math.sign(diff) === Math.sign(expectedDiff);
    }
}
