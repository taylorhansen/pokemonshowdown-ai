/**
 * @file Generates `dex.ts` through stdout. This should be called from
 * `build-dex.sh` after the `Pokemon-Showdown` repo has been cloned.
 */
import { ModdedDex } from "../pokemon-showdown/sim/dex";
import { Species } from "../pokemon-showdown/sim/dex-data";
import "../pokemon-showdown/sim/global-types";
import { MoveData, MoveTarget, NaturalGiftData, PokemonData, SelfSwitch,
    SelfVolatileEffect, SideCondition, Type, VolatileEffect } from
    "../src/battle/dex/dex-util";
import { toIdName } from "../src/psbot/helpers";

// TODO: support other gens?
const dex = new ModdedDex("gen4").includeData();

/**
 * Pre-compiled regex for checking whether a pokemon id name is not supported by
 * gen4 (e.g. megas, regional variants, etc). Actual pokedex differences,
 * however, must be handled separately.
 */
const nonGen4Regex =
    /(^(arceusfairy|((pikachu|eevee).+))$)|(((?<!yan)mega[xy]?)|primal|alola|totem|galar|gmax)$/;

/**
 * Checks whether a pokemon id name is not from gen4.
 * @param name Pokemon name.
 * @returns True if the id is not from gen4 or below.
 */
function isNonGen4(name: string): boolean
{
    return nonGen4Regex.test(name);
}

/**
 * Checks whether a pokemon id name is from gen4.
 * @param name Pokemon name.
 * @returns True if the id is from gen4 or below.
 */
function isGen4(name: string): boolean
{
    return !isNonGen4(name);
}

/**
 * Wraps a string in quotes.
 * @param str String to quote.
 * @returns The given string in quotes.
 */
function quote(str: string): string
{
    return `"${str}"`;
}

/**
 * Wraps a string in quotes if it is an invalid identifier, i.e. it has dashes,
 * spaces, or quotes in it.
 * @param str String to quote.
 * @returns The given string if it's a valid identifier, otherwise the string
 * wrapped in quotes.
 */
function maybeQuote(str: string): string
{
    return /[^a-zA-Z0-9]/.test(str) ? quote(str) : str;
}

/** Checks if a Movedex value is valid for gen4. */
function isGen4Move(move: Move): boolean
{
    return move.gen > 0 && move.gen <= 4 && !move.isNonstandard &&
        // hidden power moves can have any type, but only one move really exists
        (move.id !== "hiddenpower" || move.type === "Normal");
}

// counter for the unique identifier of a pokemon, move, etc.
let uid = 0;

// moves

const moves: (readonly [string, MoveData])[] = [];

const futureMoves: string[] = [];
const lockedMoves: string[] = [];
const twoTurnMoves: string[] = [];

const sketchableMoves: string[] = [];

const typeToMoves: {[T in Type]: string[]} =
{
    bug: [], dark: [], dragon: [], fire: [], flying: [], ghost: [],
    electric: [], fighting: [], grass: [], ground: [], ice: [], normal: [],
    poison: [], psychic: [], rock: [], steel: [], water: [], "???": []
};

uid = 0;
for (const move of
    Object.keys(dex.data.Movedex)
        .map(n => dex.getMove(n))
        .filter(isGen4Move)
        .sort((a, b) => a.id < b.id ? -1 : +(a.id > b.id)))
{
    const target = move.target as MoveTarget;

    // factor pp boosts if the move supports it in game
    const pp = [move.pp, move.pp] as [number, number];
    if (!move.noPPBoosts) pp[1] = Math.floor(move.pp * 8 / 5);

    const selfSwitch = move.selfSwitch as SelfSwitch;

    let volatileEffect: VolatileEffect | undefined;
    if (move.volatileStatus)
    {
        volatileEffect = move.volatileStatus as VolatileEffect;
    }

    let selfVolatileEffect: SelfVolatileEffect | undefined;
    if (move.self && move.self.volatileStatus)
    {
        selfVolatileEffect = move.self.volatileStatus as SelfVolatileEffect;
        // locking moves are also recorded in a different object
        if (move.self.volatileStatus === "lockedmove")
        {
            lockedMoves.push(move.id);
        }
    }

    let sideCondition: SideCondition | undefined;
    if (move.sideCondition)
    {
        sideCondition = toIdName(move.sideCondition) as SideCondition;
    }

    const mirror = move.flags.mirror === 1;

    // two turn/future moves are also recorded in a different object
    if (move.flags.charge === 1) twoTurnMoves.push(move.id);
    if (move.isFutureMove) futureMoves.push(move.id);

    if (!move.noSketch) sketchableMoves.push(move.id);

    typeToMoves[move.type.toLowerCase() as Type].push(move.id);

    moves[uid] =
    [
        move.id,
        {
            uid, name: move.id, display: move.name, pp, target, mirror,
            ...(selfSwitch && {selfSwitch}),
            ...(volatileEffect && {volatileEffect}),
            ...(selfVolatileEffect && {selfVolatileEffect}),
            ...(sideCondition && {sideCondition})
        }
    ];
    ++uid;
}

futureMoves.sort();
lockedMoves.sort();
twoTurnMoves.sort();

// pokemon and abilities

/**
 * Gets the complete movepool of a pokemon.
 * @param species Species object created by `dex.getSpecies()`.
 * @param restrict Whether to exclude restricted moves that are replaced or lost
 * upon form change, e.g. Rotom and Kyurem moves. Default false.
 * @returns A Set of all the moves the pokemon can have.
 */
function composeMovepool(species: Species, restrict = false): Set<string>
{
    let result = new Set<string>();

    const learnset = dex.getLearnsetData(species.id).learnset;
    if (learnset)
    {
        for (const moveName in learnset)
        {
            if (!learnset.hasOwnProperty(moveName)) continue;

            if (learnset[moveName].some(source =>
                    // must be learnable in gen 4 or earlier
                    parseInt(source.charAt(0), 10) <= 4 &&
                    // include restricted moves unless told not to
                    (!restrict || source.charAt(1) !== "R")))
            {
                result.add(moveName);
                // if the movepool contains Sketch, all Sketchable moves have to
                //  be included
                if (moveName === "sketch")
                {
                    for (const sketch of sketchableMoves) result.add(sketch);
                }
            }
        }
    }
    if (species.changesFrom)
    {
        result = new Set(
        [
            ...result,
            ...composeMovepool(dex.getSpecies(species.baseSpecies),
                /*restrict*/true)
        ]);
    }
    if (species.prevo)
    {
        result = new Set(
        [
            ...result,
            ...composeMovepool(dex.getSpecies(species.prevo),
                /*restrict*/true)
        ]);
    }
    return result;
}

const pokemon: (readonly [string, PokemonData])[] = []

const abilities = new Set<string>();

uid = 0;
for (const mon of
    Object.keys(dex.data.Pokedex)
        .map(n => dex.getSpecies(n))
        .filter(m => m.num >= 1 && m.num <= 493 && isGen4(m.id) &&
            !m.isNonstandard)
        .sort((a, b) => a.id < b.id ? -1 : +(a.id > b.id)))
{
    // don't sort base abilities, since the 3rd one is a hidden ability (gen5)
    const baseAbilities: string[] = [];
    for (const index of Object.keys(mon.abilities) as (keyof SpeciesAbility)[])
    {
        const abilityName = mon.abilities[index];
        if (!abilityName) continue;
        const abilityId = toIdName(abilityName);
        baseAbilities.push(abilityId);
        if (!abilities.has(abilityId)) abilities.add(abilityId);
    }

    // don't sort types to keep primary/secondary type distinction
    let types: [Type, Type];
    const typeArr = mon.types.map(s => s.toLowerCase()) as Type[];
    if (typeArr.length > 2)
    {
        console.error("Error: Too many types for species " + name);
    }
    else if (typeArr.length === 1) typeArr.push("???");
    types = typeArr as [Type, Type];

    const stats = mon.baseStats;

    // include refs to other forms if there are any
    let otherForms: string[] | undefined;
    if (mon.otherFormes)
    {
        const tmp = mon.otherFormes.map(toIdName).filter(isGen4);
        if (tmp.length > 0) otherForms = tmp.sort();
    }

    const movepool = [...composeMovepool(mon)].sort();

    const entry: [string, PokemonData] =
    [
        mon.id,
        {
            id: mon.num, uid, name: mon.id, display: mon.name,
            abilities: baseAbilities, types, baseStats: stats,
            weightkg: mon.weightkg, movepool,
            ...(mon.baseSpecies !== mon.name &&
                {baseSpecies: toIdName(mon.baseSpecies)}),
            ...(mon.baseForme && {baseForm: toIdName(mon.baseForme)}),
            ...(mon.forme && {form: toIdName(mon.forme)}),
            ...(otherForms && {otherForms})
        }
    ];
    pokemon.push(entry);

    if (mon.name === "Gastrodon")
    {
        // add missing gastrodon-east form
        const {baseForm: _, ...data2} = entry[1]; // omit baseForm from data2
        pokemon.push(
        [
            "gastrodoneast",
            {
                ...data2, name: "gastrodoneast", display: "Gastrodon-East",
                baseSpecies: "gastrodon", form: "east"
            }
        ]);

        // add alt form to list
        entry[1] = {...entry[1], otherForms: ["gastrodoneast"]};
    }
    else if (mon.name === "Unown")
    {
        // add forms for all the other letters
        const letters =
        [
            "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n",
            "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z", "!", "?"
        ];
        const {baseForm: _, ...data2} = entry[1]; // omit baseForm from data2

        for (const letter of letters)
        {
            const name = `unown${letter}`;
            pokemon.push(
            [
                name,
                {
                    ...data2, name, display: `Unown-${letter.toUpperCase()}`,
                    baseSpecies: "unown", form: letter
                }
            ]);
        }

        // add alt forms to list
        entry[1] =
            {...entry[1], otherForms: letters.map(letter => `unown${letter}`)};
    }

    // make sure the next entry, cherrim-sunshine, receives the same uid since
    //  the two forms are functionally identical
    if (mon.name !== "Cherrim") ++uid;
}

// items and berries

// make sure that having no item is possible
const items: string[] = ["none"];
const berries: (readonly [string, NaturalGiftData])[] = [];

for (const itemName of Object.keys(dex.data.Items).sort())
{
    if (!dex.data.Items.hasOwnProperty(itemName)) continue;
    const item = dex.getItem(itemName);
    // only gen4 and under items allowed
    if (item.gen > 4 || item.isNonstandard) continue;

    if (item.isBerry && item.naturalGift)
    {
        berries.push(
        [
            item.id,
            {
                basePower: item.naturalGift.basePower,
                type: item.naturalGift.type.toLowerCase() as Type
            }
        ]);
    }

    items.push(item.id);
}

// print data

/**
 * Creates an export dictionary for a Set of names, sorting the Set and
 * assigning a uid to each entry in order.
 * @param set Set to stringify.
 * @param name Name of the dictionary.
 * @param indent Number of indent spaces. Default 4.
 */
function exportSetToDict(set: Set<string>, name: string, indent = 4): string
{
    return exportArrayToDict([...set].sort(), name, indent);
}

/**
 * Creates an export dictionary for an array of names, assigning a uid to each
 * entry in order.
 * @param arr Array to stringify.
 * @param name Name of the dictionary.
 * @param indent Number of indent spaces. Default 4.
 */
function exportArrayToDict(arr: readonly string[], name: string, indent = 4):
    string
{
    return exportEntriesToDict(arr.map((key, i) => [key, i]), name,
        "number", (t: number) => t.toString(), indent);
}

/**
 * Creates an export dictionary for an array of dictionary entries.
 * @param entries Array to stringify.
 * @param name Name of the dictionary.
 * @param typeName Type name for the dictionary values.
 * @param converter Stringifier for dictionary values.
 * @param indent Number of indent spaces. Default 4.
 */
function exportEntriesToDict<T>(entries: (readonly [string, T])[], name: string,
    typeName: string, converter: (t: T) => string, indent = 4): string
{
    let result = `export const ${name}: ` +
        `{readonly [name: string]: ${typeName}} =\n{`;
    const s = " ".repeat(indent);

    for (const [key, value] of entries)
    {
        result += `\n${s}${maybeQuote(key)}: ${converter(value)},`;
    }
    return result + "\n};";
}

/**
 * Creates an export dictionary for a dictionary, sorting the keys in alphabetic
 * order.
 * @param dict Dictionary to stringify.
 * @param name Name of the dictionary.
 * @param typeName Type name for the dictionary.
 * @param converter Stringifier for dictionary keys.
 * @param indent Number of indent spaces. Default 4.
 */
function exportDict(dict: {readonly [name: string]: any},
    name: string, typeName: string,
    converter: (value: any) => string, indent = 4): string
{
    const s = " ".repeat(indent);
    return Object.keys(dict).sort()
            .reduce(
                (prev, key) =>
                    prev + `\n${s}${maybeQuote(key)}: ${converter(dict[key])},`,
                `export const ${name}: ${typeName} =\n{`) +
        "\n};";
}

/**
 * Stringifies a dictionary.
 * @param dict Dictionary to stringify.
 * @param converter Stringifier for dictionary values.
 */
function stringifyDict(dict: {readonly [name: string]: any},
    converter: (value: any) => string): string
{
    const entries: string[] = [];
    for (const key in dict)
    {
        if (!dict.hasOwnProperty(key)) continue;
        entries.push(`${maybeQuote(key)}: ${converter(dict[key])}`);
    }
    return "{" + entries.join(", ") + "}";
}

/**
 * Creates an export dictionary, string union, etc. for a specific set of moves.
 * @param moves Array of the move names.
 * @param name Name for the variable.
 * @param display Name in the docs. Omit to assume `name` argument.
 */
function exportSpecificMoves(moveNames: readonly string[], name: string,
    display = name, indent = 4): string
{
    const s = " ".repeat(indent);
    const cap = name.slice(0, 1).toUpperCase() + name.slice(1);

    // build set of all moves of this specific type
    return moveNames.reduce(
            (prev, moveName, i) => prev + `\n${s}${moveName}: ${i},`,
            `/** Set of all ${display} moves. Maps move name to its id ` +
                `within this object. */\nexport const ${name}Moves =\n{`) +
        `\n} as const;

/** Types of ${display} moves. */
export type ${cap}Move = keyof typeof ${name}Moves;

/** Number of ${display} moves that exist. */
export const num${cap}Moves = ${moves.length};

/** Checks if a value is a ${cap}Move. */
export function is${cap}Move(value: any): value is ${cap}Move
{
    return ${name}Moves.hasOwnProperty(value);
}`;
}

console.log(`\
// istanbul ignore file
/**
 * @file Generated file containing all the dex data taken from Pokemon Showdown.
 */
import { MoveData, NaturalGiftData, PokemonData, Type } from "./dex-util";

/**
 * Contains info about each pokemon, with alternate forms as separate entries.
 */
${exportEntriesToDict(pokemon, "pokemon", "PokemonData",
    p => stringifyDict(p,
        v =>
            typeof v === "string" ? quote(v) :
            Array.isArray(v) ? `[${v.map(quote).join(", ")}]` :
            typeof v === "object" ? stringifyDict(v, vv => vv as string) :
            v))}

/** Total number of pokemon species. */
export const numPokemon = ${pokemon.length};

/** Maps ability id name to an id number. */
${exportSetToDict(abilities, "abilities")}

/** Total number of abilities. */
export const numAbilities = ${abilities.size};

/** Contains info about each move. */
${exportEntriesToDict(moves, "moves", "MoveData",
    m => stringifyDict(m,
        v =>
            typeof v === "string" ? quote(v) :
            Array.isArray(v) ? `[${v.join(", ")}]` :
            v))}

/** Total number of moves. */
export const numMoves = ${moves.length};

${exportSpecificMoves(futureMoves, "future")}

${exportSpecificMoves(lockedMoves, "locked")}

${exportSpecificMoves(twoTurnMoves, "twoTurn", "two-turn")}

/** Maps move type to each move of that type. */
${exportDict(typeToMoves, "typeToMoves",
    "{readonly [T in Type]: string[]}",
    a => `[${a.map(quote).join(", ")}]`)}

/** Maps item id name to its id number. */
${exportArrayToDict(items, "items")}

/** Total number of items. */
export const numItems = ${items.length};

/** Contains info about each berry item. */
${exportEntriesToDict(berries, "berries", "NaturalGiftData",
    b => stringifyDict(b, v => typeof v === "string" ? quote(v) : v))}`);
