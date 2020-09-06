import { BoostName, MoveData, MoveEffect, PrimaryEffect, StatusEffect } from
    "../../dex/dex-util";
import { deepClone, DeepNullable, DeepWritable } from "./helpers";

/** Categories of move effects. */
export type EffectCategory = "primary" | "self" | "hit";

/** Tracks pending move effects. */
export class PendingEffects
{
    /** Whether all effects have been handled. */
    public get handled(): boolean
    {
        return !this.primary && !this.self && !this.hit;
    }

    /** Pending primary move effects. */
    private primary?: DeepNullable<DeepWritable<PrimaryEffect>>;
    /** Pending move effects for user. */
    private self?: DeepNullable<DeepWritable<MoveEffect>>;
    /** Pending move effects for target. */
    private hit?: DeepNullable<DeepWritable<MoveEffect>>;

    /**
     * Creates a PendingEffects obj.
     * @param param0 Move data.
     */
    constructor({primary, self, hit}: MoveData)
    {
        if (primary) this.primary = deepClone(primary);
        if (self) this.self = deepClone(self);
        if (hit) this.hit = deepClone(hit);
    }

    /** Clears all pending effects. */
    public clear(): void
    {
        this.primary = null;
        this.self = null;
        this.hit = null;
    }

    /**
     * Indicates that the user or target has fainted. Clears non-team effects
     * related to the pokemon in question.
     */
    public clearFaint(ctg: "self" | "hit"): void
    {
        const effect = this[ctg];
        if (!effect) return;
        effect.status = null;
        effect.unique = null;
        effect.implicitStatus = null;
        effect.boost = null;
        effect.secondary = null;
    }

    /** Gets pending primary move effects. */
    public get(ctg: "primary"): DeepNullable<PrimaryEffect>;
    /** Gets pending self/hit move effects. */
    public get(ctg: "self" | "hit"): DeepNullable<MoveEffect>;
    public get<TCtg extends EffectCategory>(ctg: TCtg):
        DeepNullable<TCtg extends "primary" ? PrimaryEffect : MoveEffect>
    {
        return this[ctg as EffectCategory] as
            DeepNullable<TCtg extends "primary" ? PrimaryEffect : MoveEffect>;
    }

    /** Sets the self-switch flag. */
    public setSelfSwitch(): void
    {
        if (!this.primary) this.primary = {selfSwitch: true};
        else this.primary.selfSwitch = this.primary.selfSwitch || true;
    }

    /**
     * Checks and consumes a pending primary effect.
     * @param key Type of effect to consume.
     * @param effect Effect type to check. If omitted, checks are skipped.
     * @returns True if the effect has now been consumed, false otherwise.
     */
    public consume<T extends keyof PrimaryEffect>(ctg: "primary",
        key: T, effect?: PrimaryEffect[T]): boolean;
    /**
     * Checks and consumes a pending primary effect.
     * @param stats Stats to check. The pending move effect must contain all of
     * the given stats before they can be consumed. If omitted, checks are
     * skipped.
     * @returns True if the effect has now been consumed, false otherwise.
     */
    public consume(ctg: "primary", key: "swapBoost",
        stats?: readonly BoostName[]):
        boolean;
    /**
     * Checks and consumes a pending self/hit effect.
     * @param key Type of effect to consume.
     * @param effect Effect type to check. If omitted, checks are skipped.
     * @returns True if the effect has now been consumed, false otherwise.
     */
    public consume<T extends keyof MoveEffect>(ctg: "self" | "hit",
        key: T, effect?: MoveEffect[T]): boolean;
    /**
     * Checks and consumes a pending self/hit effect.
     * @param stat Stat to check.
     * @param amount Boost amount to check.
     * @param cur Current corresponding stat boost amount, in order to check
     * against the max value 6 for saturation. If omitted, assume the stat is
     * being set.
     * @returns True if the effect has now been consumed, false otherwise.
     */
    public consume(ctg: "self" | "hit", key: "boost", stat: BoostName,
        amount: number, cur?: number): boolean;
    public consume<TCtg extends EffectCategory,
        T extends keyof PrimaryEffect | keyof MoveEffect>(
        ctg: TCtg,
        key: TCtg extends "primary" ? keyof PrimaryEffect : keyof MoveEffect,
        effectOrStat?: T extends "primary" ?
                T extends "swapBoost" ? readonly BoostName[] : PrimaryEffect[T]
            : T extends "self" | "hit" ?
                T extends "boost" ? BoostName : MoveEffect[T]
            : never,
        amount?: number, cur?: number): boolean
    {
        if (!this[ctg as EffectCategory]) return false;
        if (!effectOrStat)
        {
            // skip checks
            const container = this[ctg as EffectCategory];
            (container as any)[key] = null;

            // also consume secondary status effects if possible
            if (key === "status" && ctg !== "primary")
            {
                const moveEffect = (container as
                    DeepNullable<DeepWritable<MoveEffect>>)!;
                moveEffect.secondary = moveEffect?.secondary?.filter(
                    s => !s?.flinch && !s?.boosts && s?.status) ?? null;
                if (moveEffect.secondary?.length ?? 0 <= 0)
                {
                    moveEffect.secondary = null;
                }
            }
            this.checkEmpty(ctg);
            return true;
        }

        let result = false;
        switch (ctg)
        {
            case "primary":
            {
                if (!this.primary) break;
                const pk = key as keyof PrimaryEffect;
                if (pk !== "swapBoost")
                {
                    // consume trivial string effect
                    if (this.primary[pk] !== effectOrStat) break;
                    this.primary[pk] = null;
                    result = true;
                }
                else if (this.primary.swapBoost)
                {
                    // consume swap boost effect
                    const stats = effectOrStat as BoostName[];
                    if (stats.some(stat => !this.primary!.swapBoost![stat]))
                    {
                        break;
                    }
                    for (const stat of stats)
                    {
                        this.primary.swapBoost[stat] = null;
                    }
                    result = true;
                    // after consuming a swap boost effect, check if we can null
                    //  its container
                    PendingEffects.checkCleared(this.primary, "swapBoost");
                }
                break;
            }
            case "self": case "hit":
            {
                const moveEffect = this[ctg as "self" | "hit"];
                if (!moveEffect) break;
                const mk = key as keyof MoveEffect;
                if (mk !== "boost")
                {
                    if (moveEffect[mk] === effectOrStat)
                    {
                        moveEffect[mk] = null;
                        result = true;
                    }
                    // try to search secondary effects before failing check
                    else if (mk === "status" &&
                        this.consumeSecondary(moveEffect, "status",
                            effectOrStat as StatusEffect))
                    {
                        result = true;
                    }
                }
                else if (amount != null)
                {
                    const boost = moveEffect.boost;
                    const op = cur != null ? "add" : "set";
                    const stat = effectOrStat as BoostName;
                    if (boost?.[op]?.[stat] != null &&
                        PendingEffects.checkBoost(boost![op]![stat]!, amount,
                            cur))
                    {
                        // consume stat
                        boost![op]![stat] = null;
                        result = true;
                        // after consuming a boost op, check if we can null its
                        //  container
                        PendingEffects.checkCleared(boost, op);
                        PendingEffects.checkCleared(moveEffect, "boost");
                    }
                    // try to search secondary effects before failing check
                    else if (cur != null &&
                        this.consumeSecondary(moveEffect, "boosts", stat,
                            amount, cur))
                    {
                        result = true;
                    }
                }
            }
        }
        // after consuming an effect flag, check if we can null its
        //  container
        if (result) this.checkEmpty(ctg);
        return result;
    }

    /** Asserts that all pending effects have been cleared. */
    public assert(): void
    {
        if (this.handled) return;
        // TODO: find cases where we shouldn't throw
        // walk pending effect objs for sanity checks
        if (this.primary)
        {
            for (const [value, name] of
            [
                [this.primary.delay, "delay"],
                [this.primary.call, "CallEffect"],
                // walk swapBoost dict
                ...(this.primary.swapBoost ?
                    [[
                        Object.keys(this.primary!.swapBoost!).join(","),
                        "swapBoost"
                    ] as const]
                    : []),
                [this.primary.countableStatus, "CountableStatusEffect"],
                [this.primary.field, "FieldEffect"]
            ] as const)
            {
                if (!value) continue;
                throw new Error(`Expected primary ${name} '${value}' but it ` +
                    `didn't happen`);
            }
        }

        for (const [effect, title] of
            [[this.self, "self"], [this.hit, "hit"]] as const)
        {
            if (!effect) continue;
            for (const [value, name] of
            [
                [effect.unique, "UniqueEffect"],
                [effect.implicitStatus, "ImplicitStatusEffect"],
                // walk BoostEffect obj
                ...(effect.boost ?
                    (Object.keys(effect.boost) as (keyof typeof effect.boost)[])
                        .map(k =>
                            (Object.keys(effect.boost![k]!) as BoostName[])
                                .map(b =>
                                [
                                    effect.boost![k]![b],
                                    `BoostEffect ${k} ${b}`
                                ] as const))
                        .reduce((a, b) => a.concat(b), [])
                    : []),
                [effect.team, "TeamEffect"],
                [effect.implicitTeam, "ImplicitTeamEffect"],
                // walk SecondaryEffect objs but only the guaranteed ones
                ...(effect.secondary?.filter(s => s?.chance === 100)
                    .map(s =>
                    [
                        [s?.status, "secondary StatusEffect"] as const,
                        // can't track flinch since its effect is applied once
                        //  the target attempts to move (TODO)
                        // [s?.flinch, "secondary flinch"],
                        ...(s?.boosts ?
                            (Object.keys(s.boosts) as BoostName[])
                                .map(k =>
                                [
                                    s?.boosts?.[k], `secondary boost ${k}`
                                ] as const)
                            : [])
                    ])
                    .reduce((a, b) => a.concat(b), []) ?? [])
            ] as const)
            {
                if (value == null) continue;
                throw new Error(`Expected ${title} ${name} '${value}' but it ` +
                    `didn't happen`);
            }
        }
    }

    /**
     * Attempts to consume a pending secondary effect.
     * @param secondary Secondary effect container.
     * @param effectType Category of effect.
     * @param effect Type of effect to consume.
     * @returns True if the effect is now consumed, false otherwise.
     */
    private consumeSecondary(
        container: DeepNullable<DeepWritable<MoveEffect>>, effectType: "status",
        effect: StatusEffect): boolean;
    /**
     * Attempts to consume a pending secondary effect.
     * @param secondary Secondary effect container.
     * @param effectType Category of effect.
     * @param effect Type of effect to consume.
     * @param boost Expected boost amount.
     * @param cur Current correspnding boost amount, in order to check against
     * the max value 6 for saturation.
     * @returns True if the effect is now consumed, false otherwise.
     */
    private consumeSecondary(
        container: DeepNullable<DeepWritable<MoveEffect>>, effectType: "boosts",
        stat: BoostName, boost: number, cur: number): boolean;
    private consumeSecondary(
        container: DeepNullable<DeepWritable<MoveEffect>>,
        effectType: "status" | "boosts", effectOrStat: StatusEffect | BoostName,
        boost?: number, cur?: number): boolean
    {
        if (!container?.secondary) return false;
        let result = false;
        // iterate in reverse, so removals don't affect i
        for (let i = container.secondary.length - 1; i >= 0; --i)
        {
            const s = container.secondary[i];
            if (!s)
            {
                container.secondary.splice(i, 1);
                continue;
            }

            if (!result)
            {
                switch (effectType)
                {
                    case "status":
                    {
                        const effect = effectOrStat as StatusEffect;
                        if (s.status !== effect) break;
                        s.status = null;
                        result = true;
                        break;
                    }
                    case "boosts":
                    {
                        const stat = effectOrStat as BoostName;
                        if (boost == null) break;
                        if (!s.boosts?.[stat]) break;
                        if (!PendingEffects.checkBoost(s.boosts![stat]!,
                            boost, cur))
                        {
                            break;
                        }
                        s.boosts[stat] = null;
                        PendingEffects.checkCleared(s, "boosts");
                        result = true;
                        break;
                    }
                }
            }

            // if we cleared this effect, we can remove it from the array
            // TODO: also track flinch
            if (!s.status && !s.boosts) container.secondary.splice(i, 1);
        }

        // if we consumed all the secondary effects available, null the array
        if (container.secondary.length <= 0) container.secondary = null;

        return result;
    }

    /** Clears an empty effect category */
    private checkEmpty(ctg: EffectCategory): void
    {
        const effect = this[ctg];
        if (!effect) return;

        let cleared = true;
        for (const key in effect)
        {
            if (!effect.hasOwnProperty(key)) continue;
            if (effect[key as keyof typeof effect] != null)
            {
                cleared = false;
                break;
            }
        }
        if (cleared) this[ctg] = null;
    }

    /**
     * Checks if a dictionary was cleared. If it is, then its parent container
     * sets it to null.
     * @param effects Container for the dictionary.
     * @param effectType Dictionary to check.
     */
    private static checkCleared<TEffectType1 extends string,
        TEffectType2 extends string>(
        effects: DeepNullable<
            {[T in TEffectType1]?: {[U in TEffectType2]?: any}}>,
        effectType: TEffectType1): boolean
    {
        if (!effects) return true;
        let cleared = true;
        for (const key in effects[effectType])
        {
            if (!effects[effectType]?.hasOwnProperty(key)) continue;
            if (effects[effectType][key] != null) cleared = false;
        }
        if (cleared) effects[effectType] = null as any;
        return cleared;
    }

    /**
     * Compares pending stat boosts to see if they are valid.
     * @param expected Pending boost amount.
     * @param actual Reported boost amount to check.
     * @param cur Current corresponding stat boost amount, in order to check
     * against the max value 6 for saturation. If omitted, assume the stat is
     * being set.
     * @returns True if valid, false if invalid.
     */
    private static checkBoost(pending: number, actual: number, cur?: number):
        boolean
    {
        if (pending === actual) return true;
        if (cur == null) return false;

        const next = cur + actual;
        const expected = cur + pending;
        return (next >= 6 && expected >= 6) || (next <= -6 && expected <= -6);
    }
}
