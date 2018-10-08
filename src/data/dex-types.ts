/** Names of certain stats. */
export type StatName = "hp" | "atk" | "def" | "spa" | "spd" | "spe";

/** The different types a pokemon can have. */
export type Type = "bug" | "dark" | "dragon" | "fire" | "flying" | "ghost" |
    "electric" | "fighting" | "grass" | "ground" | "ice" | "normal" | "poison" |
    "psychic" | "rock" | "steel" | "water";

/** Format of each pokemon entry in the Dex. */
export interface PokemonData
{
    /** ID number in the Pokedex. */
    readonly id: number;
    /** Unique ID number that belongs to a single pokemon or form. */
    readonly uid: number;
    /** Species name. */
    readonly species: string;
    /** Species this pokemon is derived from. */
    readonly baseSpecies?: string;
    /** Alternate form this pokemon is derived from. */
    readonly baseForm?: string;
    /** Alternate form name. */
    readonly form?: string;
    /** Letter of the alternate form. */
    readonly formLetter?: string;
    /** Alternate forms of this pokemon. */
    readonly otherForms?: string[];
    /**
     * ID of the abilities this species can have. 0 or 1 means it's the
     * pokemon's first or second ability.
     */
    readonly abilities: {readonly [name: string]: 0 | 1};
    /** Types of the pokemon. */
    readonly types: Readonly<Type[]>;
    /** Base stats. */
    readonly baseStats: {readonly [S in StatName]: number};
    /** Pokemon's weight in kg. Affected by certain moves. */
    readonly weightkg: number;
}

/** Format for each move entry in the Dex. */
export interface MoveData
{
    /** Unique identifier number. */
    readonly uid: number;
    /** Target of the move. */
    readonly target: MoveTarget;
    /** Base power points. */
    readonly pp: number;
    /** Whether this move causes the user to switch. */
    readonly selfSwitch: SelfSwitch;
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

/** Type info for the dex variable. */
export interface Dex
{
    /** Contains info about each pokemon. */
    readonly pokemon: {readonly [species: string]: PokemonData};
    /** Total number of pokemon species. */
    readonly numPokemon: number;
    /** Maps a move id name to its id number. */
    readonly moves: {readonly [name: string]: MoveData};
    /** Total number of moves. */
    readonly numMoves: number;
    /** Maps an item id name to its id number. */
    readonly items: {readonly [name: string]: number};
    /** Total number of items. */
    readonly numItems: number;
}
