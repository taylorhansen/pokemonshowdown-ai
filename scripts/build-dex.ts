/**
 * @file Generates `dex.ts` through stdout. This should be called from
 * `build-dex.sh` after the `Pokemon-Showdown` repo has been cloned.
 */
import { ModdedDex } from "../pokemon-showdown/sim/dex";
import { Template } from "../pokemon-showdown/sim/dex-data";
import "../pokemon-showdown/sim/global-types";
import { NaturalGiftData, Type } from "../src/battle/dex/dex-util";
import { toIdName } from "../src/psbot/helpers";

// TODO: support other gens?

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
 * Wraps a string in quotes if it is a valid identifier. An invalid identifier
 * has dashes, spaces, or quotes in it.
 * @param str String to quote.
 * @returns The string given back if valid, else the string wrapped in quotes.
 */
function maybeQuote(str: string): string
{
    return /[- ']/.test(str) ? quote(str) : str;
}

/** Checks if a Movedex value is valid for gen4. */
function isGen4Move(move: any): boolean
{
    // only gen4 and under moves allowed
    if (move.num <= 0 || move.num >= 468 || move.isNonstandard) return false;

    // hidden power moves can have any type, but only one move really exists
    if (move.id === "hiddenpower" && move.type !== "Normal") return false;

    return true;
}

const dex = new ModdedDex("gen4");
const data = dex.data;

/**
 * Gets the complete movepool of a pokemon.
 * @param template Template object created by `dex.getTemplate()`.
 * @param restrict Whether to exclude restricted moves that are replaced or lost
 * upon form change.
 * @returns A Set of all the moves the pokemon can have.
 */
function composeMovepool(template: Template, restrict = false): Set<string>
{
    let result = new Set<string>();

    const learnset = template.learnset;
    if (learnset)
    {
        for (const moveName in learnset)
        {
            if (!learnset.hasOwnProperty(moveName)) continue;

            let learnable = false;
            for (const moveSource of learnset[moveName])
            {
                // must be learnable in gen 4 and earlier
                if (parseInt(moveSource.charAt(0), 10) > 4) continue;
                // disregard restricted moves when inheriting from base form
                if (restrict && moveSource.charAt(1) === "R") continue;

                learnable = true;
                break;
            }

            if (learnable) result.add(moveName);
        }
    }
    else if (template.inheritsFrom)
    {
        if (Array.isArray(template.inheritsFrom))
        {
            for (const inherit of template.inheritsFrom)
            {
                result = new Set(
                 [
                    ...result,
                    ...composeMovepool(dex.getTemplate(inherit),
                        /*restrict*/true)
                ]);
            }
        }
        else
        {
            result = new Set(
            [
                ...result,
                ...composeMovepool(dex.getTemplate(template.inheritsFrom),
                    /*restrict*/true)
            ]);
        }
    }
    if (template.baseSpecies && template.baseSpecies !== template.species)
    {
        result = new Set(
        [
            ...result,
            ...composeMovepool(dex.getTemplate(template.baseSpecies),
                /*restrict*/true)
        ]);
    }
    return result;
}

// import statement at the top of the file
console.log(`\
// istanbul ignore file
/**
 * @file Generated file containing all the dex data taken from Pokemon Showdown.
 */
import { Dex, MoveData, NaturalGiftData, PokemonData } from "./dex-util";
`);

// counter for the unique identifier of a pokemon, move, etc.
let uid = 0;

/** Contains ability ids. */
const abilities: {[name: string]: number} = {};
let numAbilities = 0;

// pokemon
const pokedex = data.Pokedex;
console.log("const pokemon: {readonly [species: string]: PokemonData} =\n{");
for (const name in pokedex)
{
    if (!pokedex.hasOwnProperty(name)) continue;
    const mon = pokedex[name];
    // only gen4 and under pokemon allowed
    if (mon.num < 1 || mon.num > 493 || isNonGen4(name) || mon.isNonstandard)
    {
        continue;
    }

    const stats = mon.baseStats;

    // get quoted base abilities
    const baseAbilities: string[] = [];
    for (const index of Object.keys(mon.abilities) as (keyof TemplateAbility)[])
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

    const types = mon.types as Type[];
    if (types.length > 2)
    {
        console.error("Error: Too many types for species " + name);
    }
    else if (types.length === 1) types.push("???");

    // optionally fill in other forms if there are any from gen4
    let otherForms: string[] | undefined;
    if (mon.otherFormes)
    {
        const tmp = mon.otherFormes.filter(isGen4);
        if (tmp.length > 0) otherForms = tmp;
    }

    const movepool = composeMovepool(dex.getTemplate(mon.species));

    console.log(`\
    ${maybeQuote(mon.species)}:
    {
        id: ${mon.num},
        uid: ${uid},
        name: ${quote(mon.species)},`);
    // tslint:disable:curly
    if (mon.baseSpecies) console.log(`\
        baseSpecies: ${quote(mon.baseSpecies)},`);
    if (mon.baseForme) console.log(`\
        baseForm: ${quote(mon.baseForme)},`);
    if (mon.forme) console.log(`\
        form: ${quote(mon.forme)},`);
    if (otherForms) console.log(`\
        otherForms: [${otherForms.map(quote).join(", ")}],`);
    // tslint:enable:curly
    console.log(`\
        abilities: [${baseAbilities.map(quote).join(", ")}],
        types: [${types.map(t => quote(t.toLowerCase())).join(", ")}],
        baseStats: {hp: ${stats.hp}, atk: ${stats.atk}, def: ${stats.def}, \
spa: ${stats.spa}, spd: ${stats.spd}, spe: ${stats.spe}},
        weightkg: ${mon.weightkg},
        movepool: [${[...movepool].map(quote).join(", ")}]
    },`);
    ++uid;
}

const numPokemon = uid;

console.log(`};

const abilities: {readonly [name: string]: number} =
{
${Object.keys(abilities).map(id => `    ${id}: ${abilities[id]},\n`).join("")}};
`);

// moves
const moves = data.Movedex;

const futureMoves: {[name: string]: number} = {};
let futureUid = 0;

const lockedMoves: {[name: string]: number} = {};
let lockedMoveUid = 0;

const twoTurnMoves: {[name: string]: number} = {};
let twoTurnUid = 0;

console.log("const moves: {readonly [name: string]: MoveData} =\n{");

uid = 0;
for (const moveName in moves)
{
    if (!moves.hasOwnProperty(moveName)) continue;
    const move = moves[moveName];

    // only gen4 and under moves allowed
    if (!isGen4Move(move)) continue;

    const target = quote(move.target);

    // factor pp boosts if the move supports it in game
    const pp = [move.pp, move.pp];
    if (!move.noPPBoosts) pp[1] = Math.floor(move.pp * 8 / 5);

    const selfSwitch = typeof move.selfSwitch === "string" ?
        quote(move.selfSwitch) : !!move.selfSwitch;

    let volatileEffect: string | undefined;
    if (move.volatileStatus) volatileEffect = move.volatileStatus;

    let selfVolatileEffect: string | undefined;
    if (move.self && move.self.volatileStatus)
    {
        selfVolatileEffect = move.self.volatileStatus;
        if (move.self.volatileStatus === "lockedmove")
        {
            lockedMoves[move.name] = lockedMoveUid++;
        }
    }

    let sideCondition: string | undefined;
    if (move.sideCondition) sideCondition = move.sideCondition.toLowerCase();

    const mirror = move.flags.mirror === 1;

    // two turn moves are also recorded in a different object
    if (move.flags.charge === 1) twoTurnMoves[move.name] = twoTurnUid++;

    // future moves are also recorded in a different object
    if (move.isFutureMove) futureMoves[move.name] = futureUid++;

    console.log(`\
    ${move.id}: {uid: ${uid}, pp: [${pp.join(", ")}], target: ${target}\
${selfSwitch ? `, selfSwitch: ${selfSwitch}` : ""}\
${volatileEffect ? `, volatileEffect: "${volatileEffect}"` : ""}\
${selfVolatileEffect ? `, selfVolatileEffect: "${selfVolatileEffect}"` : ""}\
${sideCondition ? `, sideCondition: "${sideCondition}"` : ""}\
, mirror: ${mirror}},`);
    ++uid;
}
console.log("};\n");
const numMoves = uid;

/**
 * Creates a map and length number for types of moves.
 * @param obj Maps move id name to a 0-based id number.
 * @param name Name for the variable.
 * @param display Name in the docs. Omit to assume `name` argument.
 */
function specificMoves(obj: {[id: string]: number}, name: string,
    display?: string)
{
    display = display || name;

    // build set of all moves of this specific type
    console.log(`
/** Set of all ${display} moves. Maps move name to its id within this object. */
export const ${name}Moves =
{`);

    for (const moveName in obj)
    {
        if (!obj.hasOwnProperty(moveName)) continue;

        console.log(`    ${toIdName(moveName)}: ${obj[moveName]},`);
    }

    const cap = name.slice(0, 1).toUpperCase() + name.slice(1);

    console.log(`} as const;

/** Types of ${display} moves. */
export type ${cap}Move = keyof typeof ${name}Moves;

/** Number of ${display} moves that exist. */
export const num${cap}Moves = ${Object.keys(obj).length};

/** Checks if a value is a ${cap}Move. */
export function is${cap}Move(value: any): value is ${cap}Move
{
    return ${name}Moves.hasOwnProperty(value);
}\n`);
}

specificMoves(futureMoves, "future");
specificMoves(lockedMoves, "locked");
specificMoves(twoTurnMoves, "twoTurn", "two-turn");

// items
const items = data.Items;
const berries: {[name: string]: NaturalGiftData} = {};
console.log(`const items: {readonly [name: string]: number} =
{
    none: 0,`);
uid = 1;
for (const itemName in items)
{
    if (!items.hasOwnProperty(itemName)) continue;
    const item = items[itemName];
    // only gen4 and under items allowed
    if (item.gen > 4 || item.isNonstandard) continue;

    /** Record Natural Gift data. */
    if (item.isBerry) berries[item.id] = item.naturalGift as NaturalGiftData;

    console.log(`    ${item.id}: ${uid++},`);
}
console.log("};\n");
const numItems = uid;

// berries
console.log(`
/** Set of all berry items. Maps name to Natural Gift move data. */
export const berries: {readonly [name: string]: NaturalGiftData} =
{`);
for (const berryName in berries)
{
    if (!berries.hasOwnProperty(berryName)) continue;
    const berry = berries[berryName];
    console.log(`    ${berryName}: {basePower: ${berry.basePower}, \
type: "${berry.type.toLowerCase()}"},`);
}

console.log(`};

/** Contains all relevant Pokemon-related data. */
export const dex: Dex =
{
    pokemon, numPokemon: ${numPokemon}, abilities, \
numAbilities: ${numAbilities}, moves,
    numMoves: ${numMoves}, items, numItems: ${numItems}
};`);
