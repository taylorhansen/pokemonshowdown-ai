/** Gives basic info about the owner and position of a pokemon. */
export interface PokemonID
{
    owner: string;
    position: string;
    nickname: string;
}

/** Holds a couple details about a pokemon. */
export interface PokemonDetails
{
    species: string;
    shiny: boolean;
    gender: string | null;
    level: number;
}

/** Details pokemon hp (can be percent) and status conditions. */
export interface PokemonStatus
{
    hp: number;
    hpMax: number;
    condition: string;
}

/** A combination of stats. */
export interface Stats
{
    atk: number | number[];
    def: number | number[];
    spa: number | number[];
    spd: number | number[];
    spe: number | number[];
}
