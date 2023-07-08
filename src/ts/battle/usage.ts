/** @file Looks up usage stats. */

import {HpType, StatName} from "./dex";
import {toIdName} from "./helpers";

export type UsageStats = ReadonlyMap<string, PokemonStats>;

export interface PokemonStats {
    /** Pokemon's set level. */
    level?: number;
    /** Ability stats. */
    abilities?: ReadonlyMap<string, number>;
    /** Item stats. */
    items?: ReadonlyMap<string, number>;
    /** Moveset stats. Note that move names include hiddenpower type. */
    moves?: ReadonlyMap<string, number>;
    /** Hidden Power type stats, if provided in {@link moves}. */
    hpType?: ReadonlyMap<HpType, number>;
    /** EV constraints. */
    evs?: {readonly [s in StatName]?: number};
    /** IV constraints. */
    ivs?: {readonly [s in StatName]?: number};
}

type UsageStatsJson = {readonly [p: string]: PokemonStatsJson};

interface PokemonStatsJson {
    level?: number;
    abilities?: {readonly [a: string]: number};
    items?: {readonly [i: string]: number};
    moves?: {readonly [m: string]: number};
    evs?: {readonly [s in StatName]?: number};
    ivs?: {readonly [s in StatName]?: number};
}

const cache = new Map<string, UsageStats>();

/** Looks up usage stats for the given format. */
export async function lookup(format: string): Promise<UsageStats> {
    let usageStats = cache.get(format);
    if (usageStats === undefined) {
        /* eslint-disable node/no-unsupported-features/es-syntax */
        const usageStatsJson = (
            (await import(
                `../../../vendor/randbats/data/stats/${format}.json`
            )) as {readonly default: UsageStatsJson}
        ).default;
        /* eslint-enable node/no-unsupported-features/es-syntax */
        usageStats = cleanUsageStats(usageStatsJson);
        cache.set(format, usageStats);
    }
    return usageStats;
}

function cleanUsageStats(usageStats: UsageStatsJson): UsageStats {
    return new Map(
        Object.entries(usageStats).map(([p, ps]) => [
            toIdName(p),
            {
                ...(ps.level && {level: ps.level}),
                ...(ps.abilities && {abilities: cleanDict(ps.abilities)}),
                ...(ps.items && {items: cleanDict(ps.items)}),
                ...(ps.moves && {moves: cleanDict(ps.moves)}),
                ...(ps.moves &&
                    Object.keys(ps.moves).some(m =>
                        m.startsWith("Hidden Power "),
                    ) && {hpType: hpTypeMap(ps.moves)}),
                ...(ps.evs && {evs: ps.evs}),
                ...(ps.ivs && {ivs: ps.ivs}),
            },
        ]),
    );
}

function cleanDict(dict: {readonly [s: string]: number}): Map<string, number> {
    return new Map(Object.entries(dict).map(([s, p]) => [toIdName(s), p]));
}

function hpTypeMap(moves: {readonly [m: string]: number}): Map<HpType, number> {
    let probSum = 0.0;
    const hpEntries = Object.entries(moves).flatMap<[HpType, number]>(
        ([m, p]) => {
            if (!m.startsWith("Hidden Power ")) {
                return [];
            }
            probSum += p;
            return [
                [toIdName(m.substring("Hidden Power ".length)) as HpType, p],
            ];
        },
    );
    // Normalize probabilities.
    for (const entry of hpEntries) {
        entry[1] /= probSum;
    }
    return new Map(hpEntries);
}
