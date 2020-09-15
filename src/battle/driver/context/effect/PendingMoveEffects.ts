import { BoostEffect, boostKeys, BoostName, isMajorStatus, MoveData, MoveEffect,
    PrimaryEffect } from "../../../dex/dex-util";
import { PendingBoostEffect } from "./PendingBoostEffect";
import { PendingEffects } from "./PendingEffects";
import { PendingValueEffect } from "./PendingValueEffect";

/** Categories of move effects. */
export type MoveEffectCategory = "primary" | "self" | "hit";

/** Container for managing/consuming effects derived from move data. */
export class PendingMoveEffects
{
    /** Whether all effects have been consumed. */
    public get handled(): boolean { return this.effects.handled; }
    /** Internal effect container. */
    private readonly effects = new PendingEffects();

    /**
     * Creates a PendingMoveEffects obj.
     * @param data Move data to extract.
     */
    constructor(data: MoveData)
    {
        // populate PendingEffects container

        const {primary, self, hit} = data;

        if (primary)
        {
            for (const [value, name] of
            [
                [primary.selfSwitch, "selfSwitch"],
                [primary.delay, "delay"],
                [primary.call, "call"],
                // walk swapBoost dict
                ...(primary.swapBoost ?
                    [[
                        Object.keys(primary.swapBoost).join(","),
                        "swapBoost"
                    ] as const]
                    : []),
                [primary.countableStatus, "countableStatus"],
                [primary.field, "field"]
            ] as const)
            {
                if (!value) continue;
                this.effects.add("primary " + name,
                    new PendingValueEffect(value));
            }
        }

        for (const [effect, title] of [[self, "self"], [hit, "hit"]] as const)
        {
            if (!effect) continue;

            // value-based effects
            for (const [value, name, chance, boost] of
            [
                [effect.status, "status"],
                [effect.unique, "unique"],
                [effect.implicitStatus, "implicitStatus"],
                // walk BoostEffect obj
                ...(Object.keys(effect.boost ?? {}) as (keyof BoostEffect)[])
                        .map(k =>
                            (Object.keys(effect.boost![k] ?? {}) as
                                    BoostName[])
                                .map(b =>
                                [
                                    effect.boost![k]![b], `boost ${k} ${b}`,
                                    null, k
                                ] as const))
                        .reduce((a, b) => a.concat(b), []),
                [effect.team, "team"],
                [effect.implicitTeam, "implicitTeam"],
                // walk SecondaryEffect objs
                ...(effect.secondary
                    ?.map(s =>
                    [
                        [s?.status, "secondary status", s?.chance] as const,
                        // can't track flinch since its effect is applied once
                        //  the target attempts to move (TODO)
                        // [s?.flinch, "secondary flinch"],
                        ...(Object.keys(s?.boosts ?? {}) as BoostName[])
                            .map(b =>
                            [
                                s.boosts![b], `secondary boost add ${b}`,
                                s.chance, "add"
                            ] as const)
                    ])
                    .reduce((a, b) => a.concat(b), []) ?? [])
            ] as const)
            {
                if (value == null) continue;
                this.effects.add(title + " " + name,
                    boost ?
                        new PendingBoostEffect(value as number,
                            /*set*/ boost === "set", chance)
                        : new PendingValueEffect(value, chance));
            }
        }
    }

    /** Asserts that all pending effects have been cleared. */
    public assert(): void
    {
        this.effects.assert();
    }

    /** Clears all pending effects. */
    public clear(): void
    {
        this.effects.clear();
    }

    /**
     * Indicates that the user or target has fainted. Clears non-team effects
     * related to the pokemon in question.
     */
    public clearFaint(ctg: "self" | "hit"): void
    {
        for (const name of
            ["status", "unique", "implicitStatus", "secondary"] as
            const)
        {
            this.effects.consume(`${ctg} ${name}`);
            this.effects.consume(`${ctg} secondary ${name}`);
        }

        for (const b of boostKeys)
        {
            this.effects.consume(`${ctg} boost add ${b}`);
            this.effects.consume(`${ctg} boost set ${b}`);
            this.effects.consume(`${ctg} secondary boost add ${b}`);
        }
    }

    /** Sets the self-switch flag. */
    public setSelfSwitch(): void
    {
        this.effects.add("primary selfSwitch", new PendingValueEffect(true));
    }

    /**
     * Gets a pending primary effect.
     * @param key Type of effect.
     */
    public get<T extends keyof PrimaryEffect>(ctg: "primary", key: T):
        PrimaryEffect[T] | null;
    /**
     * Gets a pending swap boost effect.
     * @returns An array of stats expected to be swapped.
     */
    public get(ctg: "primary", key: "swapBoost"): readonly BoostName[];
    /**
     * Gets a pending self/hit effect.
     * @param ctg Category of effect.
     * @param key Type of effect.
     * @param effect Effect type to check. If omitted, checks are skipped.
     */
    public get<T extends Exclude<keyof MoveEffect, "secondary">>(
        ctg: "self" | "hit", key: T): MoveEffect[T] | null;
    /**
     * Gets a pending self/hit boost effect.
     * @param ctg Category of effect.
     * @param stat Stat to check.
     * @param set Whether to check for setting or adding boosts. Default false.
     * @returns The expected boost number to be applied.
     */
    public get(ctg: "self" | "hit", key: "boost", stat: BoostName,
        set?: boolean): number | null;
    public get(ctg: MoveEffectCategory, key: string, stat?: BoostName,
        set?: boolean):
        PrimaryEffect[keyof PrimaryEffect] | readonly BoostName[] |
        MoveEffect[Exclude<keyof MoveEffect, "secondary">] | number | null
    {
        if (ctg === "primary" && key === "swapBoost")
        {
            const effect = this.effects.get("primary swapBoost") as
                PendingValueEffect;
            if (!effect) return [];
            return (effect.value as string).split(",") as BoostName[];
        }
        if (ctg !== "primary" && key === "boost")
        {
            const effect = this.effects.get(`${ctg} boost ` +
                    `${set ? "set" : "add"} ${stat}`) as PendingBoostEffect;
            if (!effect) return null;
            return effect.pendingBoost;
        }
        else
        {
            const effect = this.effects.get(`${ctg} ${key}`) as
                PendingValueEffect;
            if (!effect) return null;
            return effect.value as any;
        }
    }

    /**
     * Checks and consumes a pending primary effect.
     * @param ctg Category of effect.
     * @param key Type of effect to consume.
     * @param effect Effect type to check. If omitted, checks are skipped except
     * whether the effect is pending.
     * @returns True if the effect has now been consumed, false otherwise.
     */
    public consume<T extends keyof PrimaryEffect>(ctg: "primary",
        key: T, effect?: PrimaryEffect[T]): boolean;
    /**
     * Checks and consumes a pending primary effect.
     * @param ctg Category of effect.
     * @param stats Stats to check. The pending move effect must contain all of
     * the given stats before they can be consumed. If omitted, checks are
     * skipped except whether the effect is pending.
     * @returns True if the effect has now been consumed, false otherwise.
     */
    public consume(ctg: "primary", key: "swapBoost",
        stats?: readonly BoostName[]):
        boolean;
    /**
     * Checks and consumes a pending self/hit effect.
     * @param ctg Category of effect.
     * @param key Type of effect to consume.
     * @param effect Effect type to check. If omitted, checks are skipped except
     * whether the effect is pending.
     * @returns True if the effect has now been consumed, false otherwise.
     */
    public consume<T extends keyof MoveEffect>(ctg: "self" | "hit",
        key: T, effect?: MoveEffect[T]): boolean;
    /**
     * Checks and consumes a pending self/hit effect.
     * @param ctg Category of effect.
     * @param stat Stat to check.
     * @param amount Boost amount to check.
     * @param cur Current corresponding stat boost amount, in order to check
     * against the max value 6 for saturation. If omitted, assume the stat is
     * being set.
     * @returns True if the effect has now been consumed, false otherwise.
     */
    public consume(ctg: "self" | "hit", key: "boost", stat: BoostName,
        amount: number, cur?: number): boolean;
    /**
     * Checks and consumes any pending self/hit MajorStatus effect.
     * @param ctg Category of effect.
     * @returns True if the effect has now been consumed, false otherwise.
     */
    public consume<T extends keyof MoveEffect>(ctg: "self" | "hit",
        key: "status", effect: "MajorStatus"): boolean;
    public consume(ctg: MoveEffectCategory, key: string,
        effectOrStat?:
            string | readonly BoostName[] | BoostName | "MajorStatus",
        amount?: number, cur?: number): boolean
    {
        if (!effectOrStat)
        {
            // skip checks
            let result = false;
            if (ctg !== "primary" && key === "boost")
            {
                for (const b of boostKeys)
                {
                    const a = this.effects.consume(`${ctg} boost add ${b}`);
                    const c = this.effects.consume(`${ctg} boost set ${b}`);
                    const d =
                        this.effects.consume(`${ctg} secondary boost add ${b}`);
                    result ||= a || c || d;
                }
            }
            else
            {
                const e = this.effects.consume(`${ctg} ${key}`);
                const f = this.effects.consume(`${ctg} secondary ${key}`);
                result ||= e || f;
            }
            return result;
        }

        if (ctg !== "primary" && key === "boost")
        {
            const boost = cur == null ? "set" : "add"
            const stat = effectOrStat as BoostName;
            return this.effects.consume(`${ctg} boost ${boost} ${stat}`, amount,
                    ...(cur == null ? [] : [cur])) ||
                this.effects.consume(`${ctg} secondary boost ${boost} ${stat}`,
                    amount, cur);
        }
        else if (ctg !== "primary" && key === "status" &&
            effectOrStat === "MajorStatus")
        {
            let name = `${ctg} status`;
            let effect = this.effects.get(name);
            if (!(effect instanceof PendingValueEffect) ||
                !isMajorStatus(name) || !this.effects.consume(name))
            {
                // check secondary effect
                name = `${ctg} secondary status`;
                effect = this.effects.get(name);
                return effect instanceof PendingValueEffect &&
                    isMajorStatus(effect.value) && this.effects.consume(name);
            }
            return true;
        }
        else if (ctg === "primary" && key === "swapBoost")
        {
            const stats = effectOrStat as readonly BoostName[];
            return this.effects.consume("primary swapBoost", stats.join(","));
        }
        else
        {
            return this.effects.consume(`${ctg} ${key}`, effectOrStat) ||
                this.effects.consume(`${ctg} secondary ${key}`, effectOrStat);
        }
    }
}
