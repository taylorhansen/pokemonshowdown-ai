/** Names of certain stats. */
export type StatName = "hp" | "atk" | "def" | "spa" | "spd" | "spe";

/** The different types a pokemon can have. */
export type Type = "bug" | "dark" | "dragon" | "fire" | "flying" | "ghost" |
    "electric" | "fighting" | "grass" | "ground" | "ice" | "normal" | "poison" |
    "psychic" | "rock" | "steel" | "water";

/** Format of each entry in the Dex. */
export interface PokemonData
{
    /** ID number in the Pokedex. */
    readonly id: number;
    /** Unique ID number that belongs to a single pokemon or form. */
    readonly uid: number;
    readonly baseStats: {readonly [S in StatName]: number};
    readonly types: Readonly<Type[]>;
    /**
     * ID of the abilities this species can have. 1 or 2 means it's the
     * pokemon's first or second ability.
     */
    abilities: {[name: string]: 1 | 2};
}

/** Type info for the dex variable. */
export interface Dex
{
    /** Contains info about each pokemon. */
    readonly pokemon: {readonly [species: string]: PokemonData};
    /** Maps a move id name to its id number. */
    readonly moves: {readonly [name: string]: number};
    /** Maps an item id name to its id number. */
    readonly items: {readonly [name: string]: number};
}

/** Contains data for every pokemon in the supported generation. */
export const dex: Dex =
{
    pokemon:
    {
        Bulbasaur:
        {
            id: 1,
            uid: 1,
            baseStats: {hp: 45, atk: 49, def: 49, spa: 65, spd: 65, spe: 45},
            types: ["grass", "poison"],
            abilities: {overgrow: 1}
        },
        Magikarp:
        {
            id: 2,
            uid: 2,
            baseStats: {hp: 20, atk: 10, def: 55, spa: 15, spd: 20, spe: 80},
            types: ["water"],
            abilities: {swiftswim: 1}
        }
        // TODO: fill in others
    },
    moves:
    {
        splash: 1,
        bounce: 2,
        flail: 3,
        tackle: 4
        // TODO: fill in others
    },
    items:
    {
        none: 0,
        focussash: 1
        // TODO: fill in others
    }
};
