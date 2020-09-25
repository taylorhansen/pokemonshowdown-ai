import * as effects from "./effects";

/** Set of Type names. Each type has a 0-based unique index. */
export const types =
{
    bug: 0, dark: 1, dragon: 2, fire: 3, flying: 4, ghost: 5, electric: 6,
    fighting: 7, grass: 8, ground: 9, ice: 10, normal: 11, poison: 12,
    psychic: 13, rock: 14, steel: 15, water: 16, "???": 17
} as const;
/** Sorted array of all types. */
export const typeKeys = Object.keys(types).sort() as readonly Type[];
/** The different types a pokemon can have. */
export type Type = keyof typeof types;

/** Set of HPType names. Each type has a 0-based unique index. */
export const hpTypes =
{
    bug: 0, dark: 1, dragon: 2, fire: 3, flying: 4, ghost: 5, electric: 6,
    fighting: 7, grass: 8, ground: 9, ice: 10, poison: 11, psychic: 12,
    rock: 13, steel: 14, water: 15
} as const;
/** Sorted array of all hidden power types. */
export const hpTypeKeys = Object.keys(hpTypes).sort() as readonly HPType[];
/** The different hidden power types a pokemon can have. */
export type HPType = keyof typeof hpTypes;

/** Data for the Natural Gift move. */
export interface NaturalGiftData
{
    /** Move's base power. */
    readonly basePower: number;
    /** Move's type. */
    readonly type: Type;
}

/** List of moves that transfer items to the user. */
export const itemTransferMoves: readonly string[] =
    ["thief", "covet", "trick", "switcheroo", "recycle"];

/** List of moves that remove an item from its target. */
export const itemRemovalMoves: readonly string[] =
    [...itemTransferMoves, "knockoff"];

/** Hold the set of all major status names. Maps status name to a unique id. */
export const majorStatuses =
{
    brn: 0, par: 1, psn: 2, tox: 3, slp: 4, frz: 5
} as const;
/** Sorted array of all major statuses. */
export const majorStatusKeys = Object.keys(majorStatuses).sort() as
    readonly MajorStatus[]
/** Major pokemon status conditions. */
export type MajorStatus = keyof typeof majorStatuses;
/**
 * Checks if a value matches a major status.
 * @param status Value to be checked.
 * @returns True if the name matches, false otherwise.
 */
export function isMajorStatus(status: any): status is MajorStatus
{
    return majorStatuses.hasOwnProperty(status);
}

/** Holds the set of all stat names except HP. */
export const statsExceptHP =
    {atk: true, def: true, spa: true, spd: true, spe: true} as const;
/** Names of pokemon stats except HP. */
export type StatExceptHP = keyof typeof statsExceptHP;

/** Holds the set of all stat names. */
export const statNames =
    {hp: true, ...statsExceptHP} as const;
/** Sorted array of all stat names. */
export const statKeys = Object.keys(statNames).sort() as readonly StatName[]
/** Names of pokemon stats. */
export type StatName = keyof typeof statNames;

/** Holds the set of all boostable stat names. */
export const boostNames =
    {...statsExceptHP, accuracy: true, evasion: true} as const;
/** Sorted array of all boost names. */
export const boostKeys = Object.keys(boostNames).sort() as readonly BoostName[];
/** Names of pokemon stats that can be boosted. */
export type BoostName = keyof typeof boostNames;
/**
 * Checks if a value matches a boost name.
 * @param stat Value to be checked.
 * @returns True if the name matches, false otherwise.
 */
export function isBoostName(stat: any): stat is BoostName
{
    return boostNames.hasOwnProperty(stat);
}
/** Boost table mapped type. */
export type BoostTable<T = number> = {readonly [U in BoostName]: T};

// TODO: make weather types lowercase, shorten
/** Holds the set of all weather types, mapping to its extension item. */
export const weatherItems =
{
    SunnyDay: "heatrock", RainDance: "damprock", Sandstorm: "smoothrock",
    Hail: "icyrock"
} as const;
/** Sorted array of all weather types. */
export const weatherKeys = Object.keys(weatherItems).sort() as
    readonly WeatherType[];
/** Types of weather conditions. */
export type WeatherType = keyof typeof weatherItems;
/**
 * Checks if a value matches a weather type.
 * @param type Value to be checked.
 * @returns True if the name matches, false otherwise.
 */
export function isWeatherType(type: any): type is WeatherType
{
    return weatherItems.hasOwnProperty(type);
}

// TODO: move to dex, rename to momentum moves
/** Moves similar to Rollout. */
export const rolloutMoves = {rollout: true, iceball: true} as const;
/** Sorted array of all rollout moves. */
export const rolloutKeys = Object.keys(rolloutMoves).sort() as
    readonly RolloutMove[];
/** Moves that are similar to Rollout. */
export type RolloutMove = keyof typeof rolloutMoves;
/**
 * Checks if a value matches a Rollout-like move.
 * @param type Value to be checked.
 * @returns True if the name matches, false otherwise.
 */
export function isRolloutMove(type: any): type is RolloutMove
{
    return rolloutMoves.hasOwnProperty(type);
}

/** Base interface for dex data entries. */
export interface DexData
{
    /** Unique ID number that belongs to a single entry only. */
    readonly uid: number;
    /** Entry name. */
    readonly name: string;
    /** Display name. */
    readonly display: string;
}

/** Format of each pokemon entry in the Dex. */
export interface PokemonData extends DexData
{
    /** ID number in the Pokedex. */
    readonly id: number;
    /** Species this pokemon is derived from. */
    readonly baseSpecies?: string;
    /** Alternate form this pokemon is derived from. */
    readonly baseForm?: string;
    /** Alternate form name. */
    readonly form?: string;
    /** Alternate forms of this pokemon. */
    readonly otherForms?: readonly string[];
    /** Id names of the abilities this species can have. */
    readonly abilities: readonly string[];
    /** Types of the pokemon. */
    readonly types: readonly [Type, Type];
    /** Base stats. */
    readonly baseStats: {readonly [S in StatName]: number};
    /** Pokemon's weight in kg. Affected by certain moves. */
    readonly weightkg: number;
    /** All the possible moves this pokemon can have. */
    readonly movepool: readonly string[];
}

/** Format for each ability entry in the dex. */
export interface AbilityData extends DexData
{
    /** Status immunity. */
    readonly immune?: "confusion";
    /** Whether this ability cancels move recoil damage. */
    readonly noRecoil?: true;
    /** Additional ability effects. */
    readonly effects?:
    {
        readonly [T in effects.ability.On]?: readonly effects.ability.Ability[]
    };
}

/** Format for each move entry in the dex. */
export interface MoveData extends DexData
{
    /** Move category. */
    readonly category: MoveCategory;
    /** Type of move. */
    readonly type: Type;
    /** Target of the move. */
    readonly target: MoveTarget;
    /** Base power point range. */
    readonly pp: [number, number];
    /** Optional move flags. */
    readonly flags?: MoveFlags;
    /** Additional move effects */
    readonly effects?: readonly effects.move.Move[];
}

/** Types of categories for a move. */
export type MoveCategory = "physical" | "special" | "status";

/** Types of targets for a move. */
export type MoveTarget = "adjacentAlly" | "adjacentAllyOrSelf" | "adjacentFoe" |
    "all" | "allAdjacent" | "allAdjacentFoes" | "allies" | "allySide" |
    "allyTeam" | "any" | "foeSide" | "normal" | "randomNormal" | "scripted" |
    "self";

/** Flag container for moves. */
export interface MoveFlags
{
    /** Whether this is a damaging contact move. */
    readonly contact?: true;
    /**
     * Whether this move can't be copied by Mirror Move. This should only be
     * present for targeted moves.
     */
    readonly noMirror?: true;
    /** Whether this move can't be copied by Copycat. */
    readonly noCopycat?: true;
    /** Whether this move can be reflected by Magic Coat. */
    readonly reflectable?: true;
}

/** Format for each item entry in the dex. */
export interface ItemData extends DexData
{
    /** Whether this is a choice item. */
    readonly isChoice?: true;
    /** Additional item effects. */
    readonly effects?: readonly effects.item.Item[];
}
