import * as dexutil from "../../../dex/dex-util";
import * as effects from "../../../dex/effects";
import { PendingBoostEffect } from "./PendingBoostEffect";
import { PendingEffect } from "./PendingEffect";
import { PendingEffects } from "./PendingEffects";
import { PendingPercentEffect } from "./PendingPercentEffect";
import { PendingValueEffect } from "./PendingValueEffect";

/** Used for get()/consume() typings. */
type TrivialPrimaryType = Exclude<effects.move.PrimaryType, "swapBoost">;

/** Used for get()/consume() typings. */
type TrivialOtherType = Exclude<effects.move.OtherType,
    "boost" | "percentDamage">;

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
    private addEffect(effect: effects.move.Move): void
    {
        switch (effect.type)
        {
            case "call": case "countableStatus": case "delay": case "field":
            case "selfSwitch":
                this.effects.add(`primary ${effect.type}`,
                    new PendingValueEffect(effect.value), "assert");
                break;
            case "drain":
                this.effects.add(`primary ${effect.type}`,
                    // TODO: custom drain handling
                    new PendingValueEffect(
                        `${effect.value[0]}/${effect.value[1]}`),
                    "assert");
                break;
            case "recoil":
                this.effects.add(`primary ${effect.type}`,
                    // TODO: custom recoil handling
                    new PendingValueEffect(
                        `${Math.round(100 / effect.value)}%`),
                    "assert");
                break;
            case "swapBoost":
            {
                const boosts = dexutil.boostKeys.filter(b => effect[b]);
                this.effects.add(`primary ${effect.type}`,
                    new PendingValueEffect(boosts.join(",")), "assert");
                break;
            }
            case "boost":
                this.addBoostEffect(effect, effect.ctg);
                break;
            case "implicitStatus": case "implicitTeam": case "status":
            case "team": case "unique":
                this.effects.add(`${effect.ctg} ${effect.type}`,
                    new PendingValueEffect(effect.value), "assert");
                break;
            case "percentDamage":
                this.effects.add(`${effect.ctg} ${effect.type}`,
                    new PendingPercentEffect(effect.value), "assert");
                break;
            case "chance":
            {
                // secondary effects
                if (effect.effects.length <= 0 || effect.effects.length > 1)
                {
                    // TODO: support
                    throw new Error("Unsupported secondary effect quantity " +
                        effect.effects.length);
                }
                const se = effect.effects[0];
                if (se.type === "status")
                {
                    this.effects.add(`${effect.ctg} secondary status`,
                        new PendingValueEffect(se.value, effect.chance),
                        "assert");
                }
                else if (se.type === "boost")
                {
                    this.addBoostEffect(se, effect.ctg, effect.chance);
                }
                // ignore flinch, since its effect is applied after the move
                //  (TODO: support)
                break;
            }
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
    private addBoostEffect(effect: effects.Boost, ctg?: effects.move.Category,
        chance?: number): void
    {
        for (const k of ["add", "set"] as const)
        {
            const table = effect[k];
            if (!table) continue;
            for (const b of dexutil.boostKeys)
            {
                if (!table.hasOwnProperty(b)) continue;
                this.effects.add(
                    `${ctg} ${chance ? "secondary " : ""}boost ${k} ${b}`,
                    new PendingBoostEffect(table[b]!,
                        /*set*/ k === "set", ...(chance ? [chance] : [])),
                    "assert");
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
     * Gets a pending trivial primary effect.
     * @param key Type of effect.
     */
    public get<T extends TrivialPrimaryType>(ctg: "primary", key: T):
        effects.move.PrimaryMap[T]["value"] | null;
    /**
     * Gets a pending swap-boost effect.
     * @param key Type of effect.
     */
    public get(ctg: "primary", key: "swapBoost"):
        Omit<effects.SwapBoost, "type"> | null;
    /**
     * Gets a pending self/hit effect, excluding boost/secondaries.
     * @param ctg Category of effect.
     * @param key Type of effect.
     * @param effect Effect type to check. If omitted, checks are skipped.
     */
    public get<T extends TrivialOtherType>(ctg: effects.move.Category,
        key: T): effects.move.OtherMap[T]["value"] | null;
    /**
     * Gets a pending self/hit boost effect.
     * @param ctg Category of effect.
     * @param stat Stat to check.
     * @param set Whether to check for setting or adding boosts. Default false.
     * @returns The expected boost number to be applied.
     */
    public get(ctg: effects.move.Category, key: "boost",
        stat: dexutil.BoostName, set?: boolean): number | null;
    // TODO: secondary
    public get(ctg: "primary" | effects.move.Category, key: string,
        stat?: dexutil.BoostName, set?: boolean):
        effects.move.PrimaryMap[TrivialPrimaryType]["value"] |
        Omit<effects.SwapBoost, "type"> |
        effects.move.OtherMap[TrivialOtherType]["value"] | number | null
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
            const effect = this.effects.get(`${ctg} ${key}`) as PendingEffect;
            if (effect instanceof PendingValueEffect) return effect.value;
            if (effect instanceof PendingPercentEffect) return effect.percent;
            return null;
        }
    }

    /**
     * Checks a pending trivial self/hit effect.
     * @param ctg Category of effect.
     * @param key Type of effect to check.
     * @param effect Effect type to check. If omitted, checks are skipped except
     * whether the effect is pending.
     * @returns True if the effect has now been consumed, false otherwise.
     */
    public check<T extends TrivialOtherType>(ctg: "self" | "hit",
        key: T, effect?: effects.move.OtherMap[T]["value"]): boolean
    {
        return this.effects.check(`${ctg} ${key}`,
                ...(effect ? [effect] : [])) ||
            this.effects.check(`${ctg} secondary ${key}`,
                ...(effect ? [effect] : []));
    }

    /**
     * Checks and consumes a pending trivial primary effect.
     * @param key Type of effect to consume.
     * @param effect Effect type to check. If omitted, checks are skipped except
     * whether the effect is pending.
     * @returns True if the effect has now been consumed, false otherwise.
     */
    public consume<T extends TrivialPrimaryType>(ctg: "primary",
        key: T, effect?: effects.move.PrimaryMap[T]["value"]): boolean;
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
    public consume<T extends TrivialOtherType>(ctg: "self" | "hit",
        key: T, effect?: effects.move.OtherMap[T]["value"]): boolean;
    /**
     * Checks and consumes a pending boost effect.
     * @param ctg Category of effect.
     * @param stat Stat to check. Omit to consume all boosts.
     * @param amount Boost amount to check. Omit to consume boost regardless.
     * @param cur Current corresponding stat boost amount, in order to check
     * against the max value 6 for saturation. If omitted, assume the stat is
     * being set.
     * @returns True if the effect has now been consumed, false otherwise.
     */
    public consume(ctg: "self" | "hit", key: "boost", stat?: dexutil.BoostName,
        amount?: number, cur?: number): boolean;
    /**
     * Checks and consumes a pending PercentDamage effect.
     * @param ctg Category of effect.
     * @param initial Initial HP value.
     * @param next Next HP value being sent.
     * @param max Max HP value.
     * @returns True if the effect has now been consumed, false otherwise.
     */
    public consume(ctg: "self" | "hit", key: "percentDamage", initial: number,
        next: number, max: number): boolean;
    /**
     * Checks and consumes any pending self/hit MajorStatus effect.
     * @param ctg Category of effect.
     * @returns True if the effect has now been consumed, false otherwise.
     */
    public consume(ctg: "self" | "hit", key: "status", effect: "MajorStatus"):
        boolean;
    public consume(ctg: "primary" | effects.move.Category, key: string,
        effectOrStat?: string | effects.SelfSwitchType |
            readonly dexutil.BoostName[] | dexutil.BoostName | number |
            "MajorStatus",
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
                    result = result || a || c || d;
                }
            }
            else
            {
                const e = this.effects.consume(`${ctg} ${key}`);
                const f = this.effects.consume(`${ctg} secondary ${key}`);
                result = result || e || f;
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
            const args =
            [
                ...(amount == null ?
                    [] : [amount, ...(cur == null ? [] : [cur])])
            ];

            return this.effects.consume(`${ctg} boost ${boost} ${stat}`,
                    ...args) ||
                this.effects.consume(`${ctg} secondary boost ${boost} ${stat}`,
                    ...args);
        }
        else if (ctg !== "primary" && key === "percentDamage")
        {
            const initial = effectOrStat as number;
            const next = amount!;
            const max = cur!;
            return this.effects.consume(`${ctg} ${key}`, initial, next, max);
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
