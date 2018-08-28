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
    id: number;
    /** Unique ID number that belongs to a single pokemon or form. */
    uid: number;
    baseStats: {[S in StatName]: number};
    types: Type[];
    /**
     * ID of the abilities this species can have. 1 or 2 means it's the
     * pokemon's first or second ability.
     */
    abilities: {[name: string]: 1 | 2};
}

/** Contains data for every pokemon in the supported generation. */
export const Dex: {[species: string]: PokemonData} =
{
    Bulbasaur:
    {
        id: 1,
        uid: 1,
        baseStats: {hp: 45, atk: 49, def: 49, spa: 65, spd: 65, spe: 45},
        types: ["grass", "poison"],
        abilities: {Overgrow: 1}
    }
    // TODO: fill in others
};
