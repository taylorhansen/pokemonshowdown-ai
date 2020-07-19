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
 * Checks whether a pokemon id name is not from gen4.
 * @param name Pokemon name.
 * @returns True if the id is not from gen4 or below.
 */
function isNonGen4(name: string): boolean
{
    // banlist: megas, primal, alola/totem, arceus fairy, galar, LGPE starters
    // except yanmega, which isn't actually a mega evolution
    return name !== "yanmega" &&
        (name === "arceusfairy" ||
            /(mega[xy]?|primal|alola|totem|galar|gmax|^(pikachu|eevee).+)$/
                .test(name));
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
    // only gen4 and under moves allowed
    if (move.gen > 4 || move.isNonstandard) return false;

    // hidden power moves can have any type, but only one move really exists
    if (move.id === "hiddenpower" && move.type !== "Normal") return false;

    return true;
}

// counter for the unique identifier of a pokemon, move, etc.
let uid = 0;

// moves

const moves: {[name: string]: MoveData} = {};

const futureMoves: {[name: string]: number} = {};
let futureUid = 0;

const lockedMoves: {[name: string]: number} = {};
let lockedMoveUid = 0;

const twoTurnMoves: {[name: string]: number} = {};
let twoTurnUid = 0;

const sketchableMoves: string[] = [];

const typeToMoves: {[T in Type]: string[]} =
{
    bug: [], dark: [], dragon: [], fire: [], flying: [], ghost: [],
    electric: [], fighting: [], grass: [], ground: [], ice: [], normal: [],
    poison: [], psychic: [], rock: [], steel: [], water: [], "???": []
};

uid = 0;
for (const moveName in dex.data.Movedex)
{
    if (!dex.data.Movedex.hasOwnProperty(moveName)) continue;
    const move = dex.getMove(moveName);

    // only gen4 and under moves allowed
    if (!isGen4Move(move)) continue;

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
        if (move.self.volatileStatus === "lockedmove")
        {
            lockedMoves[move.name] = lockedMoveUid++;
        }
    }

    let sideCondition: SideCondition | undefined;
    if (move.sideCondition)
    {
        sideCondition = toIdName(move.sideCondition) as SideCondition;
    }

    const mirror = move.flags.mirror === 1;

    // two turn moves are also recorded in a different object
    if (move.flags.charge === 1) twoTurnMoves[move.name] = twoTurnUid++;

    // future moves are also recorded in a different object
    if (move.isFutureMove) futureMoves[move.name] = futureUid++;

    if (!move.noSketch) sketchableMoves.push(move.id);

    typeToMoves[move.type.toLowerCase() as Type].push(move.id);

    moves[move.id] =
    {
        uid, pp, target, mirror,
        ...(selfSwitch && {selfSwitch}),
        ...(volatileEffect && {volatileEffect}),
        ...(selfVolatileEffect && {selfVolatileEffect}),
        ...(sideCondition && {sideCondition})
    };
    ++uid;
}
const numMoves = uid;

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

const pokemon: {[species: string]: PokemonData} = {};

const abilities: {[name: string]: number} = {};
let numAbilities = 0;

uid = 0;
for (const name in dex.data.Pokedex)
{
    if (!dex.data.Pokedex.hasOwnProperty(name)) continue;
    const mon = dex.getSpecies(name);
    // only gen4 and under pokemon allowed
    if (mon.num < 1 || mon.num > 493 || isNonGen4(name) || mon.isNonstandard)
    {
        continue;
    }

    const stats = mon.baseStats;

    // get quoted base abilities
    const baseAbilities: string[] = [];
    for (const index of Object.keys(mon.abilities) as (keyof SpeciesAbility)[])
    {
        const abilityName = mon.abilities[index];
        if (!abilityName) continue;
        const abilityId = toIdName(abilityName);
        baseAbilities.push(abilityId);
        if (!abilities.hasOwnProperty(abilityId))
        {
            // post-increment so that id number is 0-based, since numAbilities
            //  starts at 0
            abilities[abilityId] = numAbilities++;
        }
    }

    let types: [Type, Type];
    const typeArr = mon.types.map(s => s.toLowerCase()) as Type[];
    if (typeArr.length > 2)
    {
        console.error("Error: Too many types for species " + name);
    }
    else if (typeArr.length === 1) typeArr.push("???");
    types = typeArr as [Type, Type];

    // optionally fill in other forms if there are any from gen4
    let otherForms: string[] | undefined;
    if (mon.otherFormes)
    {
        const tmp = mon.otherFormes.filter(f => isGen4(toIdName(f)));
        if (tmp.length > 0) otherForms = tmp;
    }

    const movepool = composeMovepool(mon);

    pokemon[mon.name] =
    {
        id: mon.num, uid, name: mon.name, abilities: baseAbilities, types,
        baseStats: stats, weightkg: mon.weightkg, movepool: [...movepool],
        ...(mon.baseSpecies !== mon.name && {baseSpecies: mon.baseSpecies}),
        ...(mon.baseForme && {baseForm: mon.baseForme}),
        ...(mon.forme && {form: mon.forme}),
        ...(otherForms && {otherForms})
    };
    ++uid;
}

const numPokemon = uid;

// items and berries

const items: {[name: string]: number} = {none: 0};
const berries: {[name: string]: NaturalGiftData} = {};

uid = 1;
for (const itemName in dex.data.Items)
{
    if (!dex.data.Items.hasOwnProperty(itemName)) continue;
    const item = dex.getItem(itemName);
    // only gen4 and under items allowed
    if (item.gen > 4 || item.isNonstandard) continue;

    if (item.isBerry && item.naturalGift)
    {
        berries[item.id] =
        {
            basePower: item.naturalGift.basePower,
            type: item.naturalGift.type.toLowerCase() as Type
        };
    }

    items[item.id] = uid++;
}
const numItems = uid;

// print data

/**
 * Creates an export declaration for a dictionary.
 * @param dict Dictionary to stringify.
 * @param name Name of the dictionary.
 * @param typeName Type name for the dictionary.
 * @param comment Doc comment contents.
 * @param converter Stringifier for dictionary keys.
 * @param indent Number of indent spaces. Default 4.
 */
function stringifyDictDecl(dict: {readonly [name: string]: any},
    name: string, typeName: string, comment: string,
    converter: (value: any) => string, indent = 4): string
{
    let result = `/** ${comment} */
export const ${name}: ${typeName} =\n{`;
    const s = " ".repeat(indent);

    for (const key in dict)
    {
        if (!dict.hasOwnProperty(key)) continue;
        result += `\n${s}${maybeQuote(key)}: ${converter(dict[key])},`;
    }
    return result + "\n};";
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
 * Creates a map and length number for types of moves.
 * @param obj Maps move id name to a 0-based id number.
 * @param name Name for the variable.
 * @param display Name in the docs. Omit to assume `name` argument.
 */
function specificMoves(obj: {[id: string]: number}, name: string,
    display?: string, indent = 4): string
{
    const s = " ".repeat(indent);
    display = display || name;

    // build set of all moves of this specific type
    let result = `/** Set of all ${display} moves. Maps move name to its id ` +
        `within this object. */\nexport const ${name}Moves =\n{`;

    for (const moveName in obj)
    {
        if (!obj.hasOwnProperty(moveName)) continue;

        result += `\n${s}${toIdName(moveName)}: ${obj[moveName]},`;
    }

    const cap = name.slice(0, 1).toUpperCase() + name.slice(1);

    return result + `\n} as const;

/** Types of ${display} moves. */
export type ${cap}Move = keyof typeof ${name}Moves;

/** Number of ${display} moves that exist. */
export const num${cap}Moves = ${Object.keys(obj).length};

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

${stringifyDictDecl(pokemon, "pokemon",
    "{readonly [name: string]: PokemonData}",
    "Contains info about each pokemon.",
    p => stringifyDict(p,
        v =>
            typeof v === "string" ? quote(v) :
            Array.isArray(v) ? `[${v.map(quote).join(", ")}]` :
            typeof v === "object" ? stringifyDict(v, vv => vv as string) :
            v))}

/** Total number of pokemon species. */
export const numPokemon = ${numPokemon};

${stringifyDictDecl(abilities, "abilities", "{readonly [name: string]: number}",
    "Maps ability id name to an id number.", a => a as string)}

/** Total number of abilities. */
export const numAbilities = ${numAbilities};

${stringifyDictDecl(moves, "moves", "{readonly [name: string]: MoveData}",
    "Contains info about each move.",
    m => stringifyDict(m,
        v =>
            typeof v === "string" ? quote(v) :
            Array.isArray(v) ? `[${v.join(", ")}]` :
            v))}

/** Total number of moves. */
export const numMoves = ${numMoves};

${specificMoves(futureMoves, "future")}

${specificMoves(lockedMoves, "locked")}

${specificMoves(twoTurnMoves, "twoTurn", "two-turn")}

${stringifyDictDecl(typeToMoves, "typeToMoves",
    "{readonly [T in Type]: string[]}",
    "Maps move type to each move of that type.",
    a => `[${a.map(quote).join(", ")}]`)}

${stringifyDictDecl(items, "items", "{readonly [name: string]: number}",
    "Maps item id name to its id number.", i => i as string)}

/** Total number of items. */
export const numItems = ${numItems};

${stringifyDictDecl(berries, "berries",
    "{readonly [name: string]: NaturalGiftData}",
    "Contains info about each berry item.",
    b => stringifyDict(b, v => typeof v === "string" ? quote(v) : v))}`);
