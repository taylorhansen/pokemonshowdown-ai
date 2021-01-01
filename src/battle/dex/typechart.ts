import { MajorStatus, Type } from "./dex-util";

type AttackerMap = {readonly [TAttacker in Type]: number};
type StatusMap = {readonly [TStatus in MajorStatus]?: boolean};

// TODO: include TDefender's weather immunity, groundedness, etc
// tslint:disable: no-trailing-whitespace (force newline in doc)
/**
 * Type effectiveness chart for gen4.
 *
 * Usage:  
 * `typechart[defender][attacker]` - Maps defender and attacker types to the
 * appropriate damage multiplier.  
 * `typechart[defender][status]` - Maps to whether the defender is immune to the
 * given status.
 */
// tslint:enable: no-trailing-whitespace
export const typechart:
    {readonly [TDefender in Type]: AttackerMap & StatusMap} =
{
    "???":
    {
        "???": 1, bug: 1, dark: 1, dragon: 1, electric: 1, fighting: 1, fire: 1,
        flying: 1, ghost: 1, grass: 1, ground: 1, ice: 1, normal: 1, poison: 1,
        psychic: 1, rock: 1, steel: 1, water: 1
    },
    bug:
    {
        "???": 1, bug: 1, dark: 1, dragon: 1, electric: 1, fighting: 0.5,
        fire: 2, flying: 2, ghost: 1, grass: 0.5, ground: 0.5, ice: 1,
        normal: 1, poison: 1, psychic: 1, rock: 2, steel: 1, water: 1
    },
    dark:
    {
        "???": 1, bug: 2, dark: 0.5, dragon: 1, electric: 1, fighting: 2,
        fire: 1, flying: 1, ghost: 0.5, grass: 1, ground: 1, ice: 1, normal: 1,
        poison: 1, psychic: 0, rock: 1, steel: 1, water: 1
    },
    dragon:
    {
        "???": 1, bug: 1, dark: 1, dragon: 2, electric: 0.5, fighting: 1,
        fire: 0.5, flying: 1, ghost: 1, grass: 0.5, ground: 1, ice: 2,
        normal: 1, poison: 1, psychic: 1, rock: 1, steel: 1, water: 0.5
    },
    electric:
    {
        "???": 1, bug: 1, dark: 1, dragon: 1, electric: 0.5, fighting: 1,
        fire: 1, flying: 0.5, ghost: 1, grass: 1, ground: 2, ice: 1, normal: 1,
        poison: 1, psychic: 1, rock: 1, steel: 0.5, water: 1
    },
    fighting:
    {
        "???": 1, bug: 0.5, dark: 0.5, dragon: 1, electric: 1, fighting: 1,
        fire: 1, flying: 2, ghost: 1, grass: 1, ground: 1, ice: 1, normal: 1,
        poison: 1, psychic: 2, rock: 0.5, steel: 1, water: 1
    },
    fire:
    {
        "???": 1, bug: 0.5, dark: 1, dragon: 1, electric: 1, fighting: 1,
        fire: 0.5, flying: 1, ghost: 1, grass: 0.5, ground: 2, ice: 0.5,
        normal: 1, poison: 1, psychic: 1, rock: 2, steel: 0.5, water: 2,
        brn: true
    },
    flying:
    {
        "???": 1, bug: 0.5, dark: 1, dragon: 1, electric: 2, fighting: 0.5,
        fire: 1, flying: 1, ghost: 1, grass: 0.5, ground: 0, ice: 2, normal: 1,
        poison: 1, psychic: 1, rock: 2, steel: 1, water: 1
    },
    ghost:
    {
        "???": 1, bug: 0.5, dark: 2, dragon: 1, electric: 1, fighting: 0,
        fire: 1, flying: 1, ghost: 2, grass: 1, ground: 1, ice: 1, normal: 0,
        poison: 0.5, psychic: 1, rock: 1, steel: 1, water: 1
    },
    grass:
    {
        "???": 1, bug: 2, dark: 1, dragon: 1, electric: 0.5, fighting: 1,
        fire: 2, flying: 2, ghost: 1, grass: 0.5, ground: 0.5, ice: 2,
        normal: 1, poison: 2, psychic: 1, rock: 1, steel: 1, water: 0.5
    },
    ground:
    {
        "???": 1, bug: 1, dark: 1, dragon: 1, electric: 0, fighting: 1, fire: 1,
        flying: 1, ghost: 1, grass: 2, ground: 1, ice: 2, normal: 1,
        poison: 0.5, psychic: 1, rock: 0.5, steel: 1, water: 2
    },
    ice:
    {
        "???": 1, bug: 1, dark: 1, dragon: 1, electric: 1, fighting: 2, fire: 2,
        flying: 1, ghost: 1, grass: 1, ground: 1, ice: 0.5, normal: 1,
        poison: 1, psychic: 1, rock: 2, steel: 2, water: 1,
        frz: true
    },
    normal:
    {
        "???": 1, bug: 1, dark: 1, dragon: 1, electric: 1, fighting: 2, fire: 1,
        flying: 1, ghost: 0, grass: 1, ground: 1, ice: 1, normal: 1, poison: 1,
        psychic: 1, rock: 1, steel: 1, water: 1
    },
    poison:
    {
        "???": 1, bug: 0.5, dark: 1, dragon: 1, electric: 1, fighting: 0.5,
        fire: 1, flying: 1, ghost: 1, grass: 0.5, ground: 1, ice: 1, normal: 1,
        poison: 0.5, psychic: 2, rock: 1, steel: 1, water: 1,
        psn: true, tox: true
    },
    psychic:
    {
        "???": 1, bug: 2, dark: 2, dragon: 1, electric: 1, fighting: 0.5,
        fire: 1, flying: 1, ghost: 2, grass: 1, ground: 1, ice: 1, normal: 1,
        poison: 1, psychic: 0.5, rock: 1, steel: 1, water: 1
    },
    rock:
    {
        "???": 1, bug: 1, dark: 1, dragon: 1, electric: 1, fighting: 2,
        fire: 0.5, flying: 0.5, ghost: 1, grass: 2, ground: 2, ice: 1,
        normal: 0.5, poison: 0.5, psychic: 1, rock: 1, steel: 2, water: 2
    },
    steel:
    {
        "???": 1, bug: 0.5, dark: 0.5, dragon: 0.5, electric: 1, fighting: 2,
        fire: 2, flying: 0.5, ghost: 0.5, grass: 0.5, ground: 2, ice: 0.5,
        normal: 0.5, poison: 0, psychic: 0.5, rock: 0.5, steel: 0.5, water: 1,
        psn: true, tox: true
    },
    water:
    {
        "???": 1, bug: 1, dark: 1, dragon: 1, electric: 2, fighting: 1,
        fire: 0.5, flying: 1, ghost: 1, grass: 2, ground: 1, ice: 0.5,
        normal: 1, poison: 1, psychic: 1, rock: 1, steel: 0.5, water: 0.5
    }
};
