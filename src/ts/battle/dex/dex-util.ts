/** @file Type definitions and helper functions for dealing with the dex. */

// TODO: Split into multiple files.
// TODO: Replace some types with aliases from @pkmn/types instead.

/** Set of {@link Type} names. Each type has a 0-based unique index. */
export const types = {
    bug: 0,
    dark: 1,
    dragon: 2,
    electric: 3,
    fighting: 4,
    fire: 5,
    flying: 6,
    ghost: 7,
    grass: 8,
    ground: 9,
    ice: 10,
    normal: 11,
    poison: 12,
    psychic: 13,
    rock: 14,
    steel: 15,
    water: 16,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "???": 17,
} as const;
/** Sorted array of all {@link Type} names. */
export const typeKeys = Object.keys(types).sort() as readonly Type[];
/** The different types a pokemon can have. */
export type Type = keyof typeof types;

/** Set of {@link HpType} names. Each type has a 0-based unique index. */
export const hpTypes = {
    bug: 0,
    dark: 1,
    dragon: 2,
    electric: 3,
    fighting: 4,
    fire: 5,
    flying: 6,
    ghost: 7,
    grass: 8,
    ground: 9,
    ice: 10,
    poison: 11,
    psychic: 12,
    rock: 13,
    steel: 14,
    water: 15,
} as const;
/** Sorted array of all {@link HpType} names. */
export const hpTypeKeys = Object.keys(hpTypes).sort() as readonly HpType[];
/** The different hidden power types a pokemon can have. */
export type HpType = keyof typeof hpTypes;

/** Hold the set of all major status names. Maps status name to a unique id. */
export const majorStatuses = {
    brn: 0,
    frz: 1,
    par: 2,
    psn: 3,
    slp: 4,
    tox: 5,
} as const;
/** Sorted array of all major statuses. */
export const majorStatusKeys = Object.keys(
    majorStatuses,
).sort() as readonly MajorStatus[];
/** Major status conditions. */
export type MajorStatus = keyof typeof majorStatuses;

/** Holds the set of all stat names except Hp. */
export const statsExceptHp = {
    atk: true,
    def: true,
    spa: true,
    spd: true,
    spe: true,
} as const;
/** Names of pokemon stats except Hp. */
export type StatExceptHp = keyof typeof statsExceptHp;

/** Holds the set of all stat names. */
export const statNames = {hp: true, ...statsExceptHp} as const;
/** Sorted array of all stat names. */
export const statKeys = Object.keys(statNames).sort() as readonly StatName[];
/** Names of pokemon stats. */
export type StatName = keyof typeof statNames;

/** Holds the set of all boostable stat names. */
export const boostNames = {
    ...statsExceptHp,
    accuracy: true,
    evasion: true,
} as const;
/** Sorted array of all boost names. */
export const boostKeys = Object.keys(boostNames).sort() as readonly BoostName[];
/** Names of pokemon stats that can be boosted. */
export type BoostName = keyof typeof boostNames;
/** Boost table mapped type. */
export type BoostTable<T = number> = {readonly [U in BoostName]: T};

/**
 * Holds the set of all {@link WeatherType} names, mapping to the name of its
 * extension item.
 */
export const weatherItems = {
    SunnyDay: "heatrock",
    RainDance: "damprock",
    Sandstorm: "smoothrock",
    Hail: "icyrock",
} as const;
/** Sorted array of all {@link WeatherType} names. */
export const weatherKeys = Object.keys(
    weatherItems,
).sort() as readonly WeatherType[];
/** Types of weather conditions. */
export type WeatherType = keyof typeof weatherItems;

// TODO: Move to generated dex?
/** Moves similar to Rollout. */
export const momentumMoves = {rollout: true, iceball: true} as const;
/** Sorted array of all {@link MomentumMove} names. */
export const momentumMoveKeys = Object.keys(
    momentumMoves,
).sort() as readonly MomentumMove[];
/** Moves that are similar to Rollout. */
export type MomentumMove = keyof typeof momentumMoves;
/**
 * Checks if a value matches a Rollout-like move.
 *
 * @param type Value to be checked.
 * @returns `true` if the name matches, `false` otherwise.
 */
export function isMomentumMove(type: unknown): type is MomentumMove {
    return Object.hasOwnProperty.call(momentumMoves, type as PropertyKey);
}

/** Base interface for dex data entries. */
export interface DexData {
    /** Unique ID number that belongs to a single entry only. */
    readonly uid: number;
    /** Entry name. */
    readonly name: string;
    /** Display name. */
    readonly display: string;
}

/** Format of each pokemon entry in the Dex. */
export interface PokemonData extends DexData {
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
export type AbilityData = DexData;

/** Format for each move entry in the dex. */
export interface MoveData extends DexData {
    /** Move category. */
    readonly category: MoveCategory;
    /** Move's base power. */
    readonly basePower: number;
    /** Whether this is an OHKO move. */
    readonly ohko?: true;
    /** Type of move. */
    readonly type: Type;
    /** Target of the move. */
    readonly target: MoveTarget;
    /**
     * Target of the move if the user is not ghost-type. Defaults to whatever
     * {@link target} is.
     */
    readonly nonGhostTarget?: MoveTarget;
    /** Base power point range. */
    readonly pp: readonly [number, number];
    /** Self-switch effect. */
    readonly selfSwitch?: SelfSwitchType;
}

/** Types of categories for a move. */
export type MoveCategory = "physical" | "special" | "status";

/** Types of targets for a move. */
export type MoveTarget =
    | "adjacentAlly"
    | "adjacentAllyOrSelf"
    | "adjacentFoe"
    | "all"
    | "allAdjacent"
    | "allAdjacentFoes"
    | "allies"
    | "allySide"
    | "allyTeam"
    | "any"
    | "foeSide"
    | "normal"
    | "randomNormal"
    | "scripted"
    | "self";

/**
 * Whether this move causes the user to switch, but `"copyvolatile"`
 * additionally transfers certain volatile status conditions.
 */
export type SelfSwitchType = true | "copyvolatile";

/** Format for each item entry in the dex. */
export type ItemData = DexData;
