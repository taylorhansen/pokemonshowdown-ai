/** Set of Type names. Each type has a 0-based unique index. */
export const types =
{
    bug: 0, dark: 1, dragon: 2, fire: 3, flying: 4, ghost: 5, electric: 6,
    fighting: 7, grass: 8, ground: 9, ice: 10, normal: 11, poison: 12,
    psychic: 13, rock: 14, steel: 15, water: 16, "???": 17
} as const;
/** The different types a pokemon can have. */
export type Type = keyof typeof types;

/** Set of HPType names. Each type has a 0-based unique index. */
export const hpTypes =
{
    bug: 0, dark: 1, dragon: 2, fire: 3, flying: 4, ghost: 5, electric: 6,
    fighting: 7, grass: 8, ground: 9, ice: 10, poison: 11, psychic: 12,
    rock: 13, steel: 14, water: 15
} as const;
/** Number of possible hidden power types. */
export const numHPTypes = Object.keys(hpTypes).length;
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

/** Effects and moves that can call moves from the user's moveset. */
export const selfMoveCallers: readonly string[] = ["sleeptalk"];

/**
 * Effects and moves that can call moves from the target's moveset before
 * they're revealed.
 */
export const targetMoveCallers: readonly string[] = ["mefirst"];

/** Effects and moves that can call moves that aren't in the user's moveset. */
export const nonSelfMoveCallers: readonly string[] =
[
    ...targetMoveCallers, "assist", "copycat", "magiccoat", "metronome",
    "mirrormove", "naturepower", "snatch"
];

/** Effects and moves that can call other moves. */
export const moveCallers: readonly string[] =
    [...selfMoveCallers, ...nonSelfMoveCallers];

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
/** Names of pokemon stats. */
export type StatName = keyof typeof statNames;

/** Holds the set of all boostable stat names. */
export const boostNames =
    {...statsExceptHP, accuracy: true, evasion: true} as const;
/** Array of all boost names. */
export const boostKeys = Object.keys(boostNames) as BoostName[];
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

/** Holds the set of all weather types, mapping to its extension item. */
export const weatherItems =
{
    SunnyDay: "heatrock", RainDance: "damprock", Sandstorm: "smoothrock",
    Hail: "icyrock"
} as const;
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

/** Moves similar to Rollout. */
export const rolloutMoves = {rollout: true, iceball: true} as const;

/** Format of each pokemon entry in the Dex. */
export interface PokemonData
{
    /** ID number in the Pokedex. */
    readonly id: number;
    /** Unique ID number that belongs to a single pokemon or form. */
    readonly uid: number;
    /** Species name. */
    readonly name: string;
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

/** Format for each move entry in the Dex. */
export interface MoveData
{
    /** Unique identifier number. */
    readonly uid: number;
    /** Target of the move. */
    readonly target: MoveTarget;
    /** Base power point range. First is base, second is with pp ups. */
    readonly pp: [number, number];
    /** Whether this move causes the user to switch. */
    readonly selfSwitch?: SelfSwitch;
    /** Main volatile status effect that may affect the opponent. */
    readonly volatileEffect?: VolatileEffect;
    /** Self-inflicted volatile status effect. */
    readonly selfVolatileEffect?: SelfVolatileEffect;
    /** Team-inflicted status effect. */
    readonly sideCondition?: SideCondition;
    /** Whether this move can be copied by Mirror Move. */
    readonly mirror: boolean;
}

/** Types of targets for a move. */
export type MoveTarget = "adjacentAlly" | "adjacentAllyOrSelf" | "adjacentFoe" |
    "all" | "allAdjacent" | "allAdjacentFoes" | "allySide" | "allyTeam" |
    "any" | "foeSide" | "normal" | "randomNormal" | "scripted" | "self";

/**
 * Whether this move causes the user to switch, but `copyvolatile` additionally
 * transfers volatile status conditions.
 */
export type SelfSwitch = boolean | "copyvolatile";

/** Volatile status effect for moves. */
export type VolatileEffect = "aquaring" | "attract" | "bide" | "charge" |
    "confusion" | "curse" | "defensecurl" | "destinybond" | "disable" |
    "embargo" | "encore" | "endure" | "focusenergy" | "followme" | "foresight" |
    "gastroacid" | "grudge" | "healblock" | "helpinghand" | "imprison" |
    "ingrain" | "leechseed" | "magiccoat" | "magnetrise" | "minimize" |
    "miracleeye" | "mudsport" | "nightmare" | "partiallytrapped" |
    "powertrick" | "protect" | "snatch" | "stockpile" | "substitute" | "taunt" |
    "telekinesis" | "torment" | "watersport" | "yawn";

/** Self-affecting volatile status effects for moves. */
export type SelfVolatileEffect = "lockedmove" | "mustrecharge" | "rage" |
    "roost" | "uproar";

/**
 * Team status effects. These are usually tracked over the course of multiple
 * Battle decisions.
 */
export type SideCondition = "auroraveil" | "healingwish" | "lightscreen" |
    "luckychant" | "lunardance" | "mist" | "reflect" | "safeguard" | "spikes" |
    "stealthrock" | "stickyweb" | "tailwind" | "toxicspikes" | "wish";

/** Type info for the dex variable. */
export interface Dex
{
    /** Contains info about each pokemon. */
    readonly pokemon: {readonly [species: string]: PokemonData};
    /** Total number of pokemon species. */
    readonly numPokemon: number;
    /** Maps ability id name to an id number. */
    readonly abilities: {readonly [name: string]: number};
    /** Total number of abilities. */
    readonly numAbilities: number;
    /** Maps a move id name to its Dex object. */
    readonly moves: {readonly [name: string]: MoveData};
    /** Total number of moves. */
    readonly numMoves: number;
    /** Maps an item id name to its id number. */
    readonly items: {readonly [name: string]: number};
    /** Total number of items. */
    readonly numItems: number;
}
