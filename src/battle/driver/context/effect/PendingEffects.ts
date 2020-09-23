import { PendingBoostEffect } from "./PendingBoostEffect";
import { PendingEffect } from "./PendingEffect";
import { PendingValueEffect } from "./PendingValueEffect";

/** Container for managing/consuming PendingEffect objs. */
export class PendingEffects
{
    /** Whether all contained effects have been consumed. */
    public get handled(): boolean { return this.effects.size <= 0; }
    /** Internal effect container. */
    private readonly effects = new Map<string, PendingEffect>();

    /** Asserts that all pending effects have been cleared. */
    public assert(): void
    {
        const expected: string[] = [];
        for (const [name, effect] of this.effects)
        {
            // skip non-null non-100% chances
            if (effect.chance != null && effect.chance !== 100) continue;
            if (effect instanceof PendingValueEffect)
            {
                expected.push(`${name} '${effect.value}'`);
            }
            else if (effect instanceof PendingBoostEffect)
            {
                expected.push(`${name} '${effect.pendingBoost}'`);
            }
            else expected.push(name);
        }
        if (expected.length > 0)
        {
            throw new Error("Expected effects that didn't happen: " +
                expected.join(", "));
        }
    }

    /** Clears all pending effects. */
    public clear(): void
    {
        this.effects.clear();
    }

    /**
     * Gets a PendingEffect.
     * @param name Name of the effect.
     * @returns The corresponding PendingEffect obj, or undefined if not found.
     */
    public get(name: string): PendingEffect | undefined
    {
        return this.effects.get(name);
    }

    /**
     * Adds a PendingEffect to this obj.
     * @param name Name of the effect.
     * @param effect Effect obj.
     * @param assert Whether to throw if the effect can't be added.
     * @returns Whether the effect was successfully added.
     */
    public add(name: string, effect: PendingEffect, assert?: boolean): boolean
    {
        if (this.effects.has(name))
        {
            if (!assert) return false;
            throw new Error(`Duplicate PendingEffect '${name}'`);
        }
        this.effects.set(name, effect);
        return true;
    }

    /**
     * Checks a pending effect.
     * @param name Name of the effect.
     * @param args Arguments for matching the effect's value. If empty, the
     * check will be skipped except for whether the effect is pending.
     * @returns Whether the effect is present or matches the given args.
     */
    public check(name: string, ...args: any[]): boolean
    {
        return (args.length <= 0 && this.effects.has(name)) ||
            !!this.effects.get(name)?.matches(...args);
    }

    /**
     * Consumes a pending effect.
     * @param name Name of the effect.
     * @param args Arguments for matching the effect's value. If empty, the
     * check will be skipped except for whether the effect is pending.
     * @returns Whether the effect has now been consumed.
     */
    public consume(name: string, ...args: any[]): boolean
    {
        return this.check(name, ...args) && this.effects.delete(name);
    }
}
