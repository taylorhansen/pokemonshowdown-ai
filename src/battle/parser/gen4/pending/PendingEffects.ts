import { PendingBoostEffect } from "./PendingBoostEffect";
import { PendingEffect } from "./PendingEffect";
import { PendingPercentEffect } from "./PendingPercentEffect";
import { PendingValueEffect } from "./PendingValueEffect";

// TODO: replace PendingEffects system with something better, likely requiring a
//  dex refactor

/** String union for `PendingEffects#add()`. */
export type EffectAddMode = "assert" | "alt" | "reject";

/** Container for managing/consuming PendingEffect objs. */
export class PendingEffects
{
    /** Whether all contained effects have been consumed. */
    public get handled(): boolean { return this.effects.size <= 0; }
    /** Internal effect container. */
    private readonly effects = new Map<string, PendingEffect[]>();

    /** Asserts that all pending effects have been cleared. */
    public assert(): void
    {
        const expected: string[] = [];
        for (const [name, effects] of this.effects)
        {
            // skip non-null non-100% chances
            const filtered =
                effects.filter(pe => pe.chance == null || pe.chance >= 100)
            if (filtered.length <= 0) continue;
            expected.push(`${name} [` +
                filtered.map(function(pe)
                {
                    // TODO: virtual method?
                    if (pe instanceof PendingValueEffect)
                    {
                        return `'${pe.value}'`;
                    }
                    if (pe instanceof PendingBoostEffect)
                    {
                        return `'${pe.pendingBoost}'`;
                    }
                    if (pe instanceof PendingPercentEffect)
                    {
                        return `'${pe.percent}%'`;
                    }
                    return "'unknown'";
                })
                .join(", ") + "]");
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
        return this.effects.get(name)?.[0];
    }

    /**
     * Adds a PendingEffect to this obj.
     * @param name Name of the effect.
     * @param effect Effect obj.
     * @param assert Whether to throw if the effect can't be added.
     * @param mode How the effect should be added. `"assert"` means no other
     * effect name should exist, `"alt"` allows for an alternate effect, and
     * `"reject"` returns an unsuccessful result. Default `"reject"`.
     * @returns Whether the effect was successfully added.
     */
    public add(name: string, effect: PendingEffect, mode?: EffectAddMode):
        boolean
    {
        if (this.effects.has(name))
        {
            if (mode === "reject") return false;
            if (mode === "assert")
            {
                throw new Error(`Duplicate PendingEffect '${name}'`);
            }
            this.effects.get(name)!.push(effect);
        }
        else this.effects.set(name, [effect]);
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
            !!this.effects.get(name)?.some(pe => pe.matches(...args));
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
