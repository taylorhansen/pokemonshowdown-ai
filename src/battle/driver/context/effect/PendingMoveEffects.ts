import * as dexutil from "../../../dex/dex-util";
import * as effects from "../../../dex/effects";
import { PendingBoostEffect } from "./PendingBoostEffect";
import { PendingEffect } from "./PendingEffect";
import { PendingEffects } from "./PendingEffects";
import { PendingValueEffect } from "./PendingValueEffect";

/** Used for get()/consume() typings. */
type TrivialOtherType = Exclude<effects.OtherType, "boost" | "secondary">;

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
    constructor(data: dexutil.MoveData)
    {
        // populate PendingEffects container
        for (const effect of data.effects ?? []) this.addEffect(effect);
    }

    /** Parses a MoveEffect object and creates PendingEffects for it. */
    private addEffect(effect: effects.Move): void
    {
        switch (effect.type)
        {
            case "call": case "countableStatus": case "delay": case "field":
            case "selfSwitch":
                this.addEffectImpl(`primary ${effect.type}`,
                    new PendingValueEffect(effect.value));
                break;
            case "swapBoost":
            {
                const boosts = dexutil.boostKeys.filter(b => effect.value[b]);
                this.addEffectImpl(`primary ${effect.type}`,
                    new PendingValueEffect(boosts.join(",")));
                break;
            }
            case "boost":
                this.addBoostEffect(effect, effect.ctg);
                break;
            case "implicitStatus": case "implicitTeam": case "status":
            case "team": case "unique":
                this.addEffectImpl(`${effect.ctg} ${effect.type}`,
                    new PendingValueEffect(effect.value));
                break;
            case "secondary":
                if (effect.value.type === "status")
                {
                    this.addEffectImpl(`${effect.ctg} secondary status`,
                        new PendingValueEffect(effect.value.value,
                            effect.chance));
                }
                else if (effect.value.type === "boost")
                {
                    this.addBoostEffect(effect.value, effect.ctg,
                        effect.chance);
                }
                // ignore flinch, since its effect is applied after the move
                //  (TODO: support)
                break;
            default:
                // should never happen
                throw new Error(`Unknown MoveEffect type '${effect!.type}'`);
        }
    }

    /**
     * Parses a BoostEffect object and creates PendingEffects for it.
     * @param effect Effect to parse.
     * @param ctg Move effect category.
     * @param chance Chance of happening, if this is a secondary effect.
     */
    private addBoostEffect(effect: effects.Boost,
        ctg?: effects.MoveEffectCategory, chance?: number): void
    {
        const tables = effect.value;
        for (const k of ["add", "set"] as const)
        {
            const table = tables[k];
            if (!table) continue;
            for (const b of dexutil.boostKeys)
            {
                if (!table.hasOwnProperty(b)) continue;
                this.addEffectImpl(`${ctg} ${chance ? "secondary " : ""}` +
                        `boost add ${b}`,
                    new PendingBoostEffect(table[b]!,
                        /*set*/ false, ...(chance ? [chance] : [])));
            }
        }
    }

    /** Adds a PendingEffect, or throws if duplicate. */
    private addEffectImpl(name: string, effect: PendingEffect): void
    {
        if (!this.effects.add(name, effect))
        {
            throw new Error(`Duplicate MoveEffect '${name}'`);
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

        for (const b of dexutil.boostKeys)
        {
            this.effects.consume(`${ctg} boost add ${b}`);
            this.effects.consume(`${ctg} boost set ${b}`);
            this.effects.consume(`${ctg} secondary boost add ${b}`);
            this.effects.consume(`${ctg} secondary boost set ${b}`);
        }
    }

    /**
     * Sets the CallEffect flag.
     * @param move Called move being expected.
     * @param bounced Whether the move was reflected by an effect.
     */
    public setCall(move: string, bounced = false): void
    {
        this.effects.add("primary call", new PendingValueEffect(move));
        if (bounced)
        {
            this.effects.add("primary call bounced",
                new PendingValueEffect(true));
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
    public get<T extends effects.PrimaryType>(ctg: "primary", key: T):
        effects.PrimaryMap[T]["value"] | null;
    /**
     * Gets a pending self/hit effect, excluding boost/secondaries.
     * @param ctg Category of effect.
     * @param key Type of effect.
     * @param effect Effect type to check. If omitted, checks are skipped.
     */
    public get<T extends TrivialOtherType>(ctg: effects.MoveEffectCategory,
        key: T): effects.OtherMap[T]["value"] | null;
    /**
     * Gets a pending self/hit boost effect.
     * @param ctg Category of effect.
     * @param stat Stat to check.
     * @param set Whether to check for setting or adding boosts. Default false.
     * @returns The expected boost number to be applied.
     */
    public get(ctg: effects.MoveEffectCategory, key: "boost",
        stat: dexutil.BoostName, set?: boolean): number | null;
    // TODO: secondary
    public get(ctg: "primary" | effects.MoveEffectCategory, key: string,
        stat?: dexutil.BoostName, set?: boolean):
        effects.PrimaryMap[effects.PrimaryType]["value"] |
        effects.OtherMap[TrivialOtherType]["value"] | number | null
    {
        if (ctg === "primary" && key === "swapBoost")
        {
            const effect = this.effects.get("primary swapBoost") as
                PendingValueEffect;
            if (!effect) return null;
            // unpack swap-boost string
            return Object.fromEntries(
                (effect.value as string).split(",").map(s => [s, true]));
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
     * Checks and consumes a pending trivial primary effect.
     * @param key Type of effect to consume.
     * @param effect Effect type to check. If omitted, checks are skipped except
     * whether the effect is pending.
     * @returns True if the effect has now been consumed, false otherwise.
     */
    public consume<T extends effects.PrimaryType>(ctg: "primary",
        key: T, effect?: effects.PrimaryMap[T]["value"]): boolean;
    /**
     * Checks and consumes a pending call effect.
     * @param effect Effect type to check. If `"bounced"` check for bounced
     * flag. If omitted, checks are skipped except whether the effect is
     * pending.
     * @returns True if the effect has now been consumed, false otherwise.
     */
    public consume(ctg: "primary", key: "call",
        effect?: effects.CallType | "bounced"): boolean;
    /**
     * Checks and consumes a pending self-switch effect.
     * @param effect Effect type to check. If omitted, checks are skipped except
     * whether the effect is pending.
     * @returns True if the effect has now been consumed, false otherwise.
     */
    public consume(ctg: "primary", key: "selfSwitch",
        effect?: effects.SelfSwitchType): boolean;
    /**
     * Checks and consumes a pending swap-boost effect.
     * @param stats Stats to check. The pending move effect must contain all of
     * the given stats before they can be consumed. If omitted, checks are
     * skipped except whether the effect is pending.
     * @returns True if the effect has now been consumed, false otherwise.
     */
    public consume(ctg: "primary", key: "swapBoost",
        stats?: readonly dexutil.BoostName[]): boolean;
    /**
     * Checks and consumes a pending trivial self/hit effect.
     * @param ctg Category of effect.
     * @param key Type of effect to consume.
     * @param effect Effect type to check. If omitted, checks are skipped except
     * whether the effect is pending.
     * @returns True if the effect has now been consumed, false otherwise.
     */
    public consume<T extends effects.OtherType>(ctg: "self" | "hit",
        key: T, effect?: effects.OtherMap[T]["value"]): boolean;
    /**
     * Checks and consumes a pending boost effect.
     * @param ctg Category of effect.
     * @param stat Stat to check.
     * @param amount Boost amount to check.
     * @param cur Current corresponding stat boost amount, in order to check
     * against the max value 6 for saturation. If omitted, assume the stat is
     * being set.
     * @returns True if the effect has now been consumed, false otherwise.
     */
    public consume(ctg: "self" | "hit", key: "boost", stat: dexutil.BoostName,
        amount: number, cur?: number): boolean;
    /**
     * Checks and consumes any pending self/hit MajorStatus effect.
     * @param ctg Category of effect.
     * @returns True if the effect has now been consumed, false otherwise.
     */
    public consume<T extends keyof effects.Move>(ctg: "self" | "hit",
        key: "status", effect: "MajorStatus"): boolean;
    public consume(ctg: "primary" | effects.MoveEffectCategory, key: string,
        effectOrStat?: string | effects.SelfSwitchType |
            readonly dexutil.BoostName[] | dexutil.BoostName | "MajorStatus",
        amount?: number, cur?: number): boolean
    {
        if (!effectOrStat)
        {
            // skip checks
            let result = false;
            if (ctg !== "primary" && key === "boost")
            {
                for (const b of dexutil.boostKeys)
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

        if (ctg === "primary" && key === "call" && effectOrStat === "bounced")
        {
            return this.effects.consume("primary call bounced", true);
        }
        if (ctg === "primary" && key === "swapBoost")
        {
            const stats = effectOrStat as readonly dexutil.BoostName[];
            return this.effects.consume("primary swapBoost", stats.join(","));
        }
        if (ctg !== "primary" && key === "boost")
        {
            const boost = cur == null ? "set" : "add"
            const stat = effectOrStat as dexutil.BoostName;
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
                !dexutil.isMajorStatus(name) || !this.effects.consume(name))
            {
                // check secondary effect
                name = `${ctg} secondary status`;
                effect = this.effects.get(name);
                return effect instanceof PendingValueEffect &&
                    dexutil.isMajorStatus(effect.value) &&
                    this.effects.consume(name);
            }
            return true;
        }
        return this.effects.consume(`${ctg} ${key}`, effectOrStat) ||
            this.effects.consume(`${ctg} secondary ${key}`, effectOrStat);
    }
}
