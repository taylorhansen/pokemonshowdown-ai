/**
 * @file Generates `dex.ts` through stdout. This should be called from
 * `build-dex.sh` after the `Pokemon-Showdown` repo has been cloned.
 */
const Dex = require("./Pokemon-Showdown/sim/dex");

// TODO: support other gens?

/**
 * Checks whether a pokemon id name is not from gen4.
 * @param {string} name Pokemon name.
 * @returns {boolean} True if the id is not from gen4 or below.
 */
function isNonGen4(name)
{
    // banlist: megas, primal, alola/totem, arceus fairy, pikachu alt forms
    // except yanmega, which isn't actually a mega evolution
    if (name === "yanmega") return false;
    return /(mega[xy]?|primal|alola|totem|arceusfairy|^pikachu.+)$/.test(name);
}

/**
 * Checks whether a pokemon id name is from gen4.
 * @param {string} name Pokemon name.
 * @returns {boolean} True if the id is from gen4 or below.
 */
function isGen4(name)
{
    return !isNonGen4(name);
}

/**
 * Wraps a string in quotes.
 * @param {string} str String to quote.
 * @returns {string} The given string in quotes.
 */
function quote(str)
{
    return `"${str}"`;
}

const data = Dex.mod("gen4").data;

// import statement at the top of the file
console.log(`\
/**
 * @file Generated file containing all the dex data taken from Pokemon Showdown.
 */
import { Dex, MoveData, PokemonData } from \"./dex-types\";
`);

// implicitly uses typings from:
//  https://github.com/Zarel/Pokemon-Showdown/blob/master/sim/dex-data.js

// counter for the unique identifier of a pokemon, move, etc.
/** @type {number} */
let uid = 0;

// pokemon
const pokedex = data.Pokedex;
console.log(`/** Contains data for every pokemon in the supported generation. */
const pokemon: {readonly [species: string]: PokemonData} =\n{`);
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

    // showdown dex maps a number of 0 or 1 with the ability name
    // we want the opposite of that, i.e. mapping the ability name with a number
    //  indicating first or second ability
    const abilities = [];
    for (const abilityId in mon.abilities)
    {
        if (!mon.abilities.hasOwnProperty(abilityId)) continue;

        // mon.abilities[abilityId] gives us the display name, e.g.
        //  "Serene Grace", but the actual name is all lowercase without spaces
        //  and such, e.g. "serenegrace"
        let abilityName = mon.abilities[abilityId].toLowerCase()
            .replace(/[- ]+/, "");
        abilities.push(`${abilityName}: ${parseInt(abilityId, 10)}`);
    }

    // optionally fill in other forms if there are any from gen4
    let otherForms;
    if (mon.otherFormes)
    {
        const tmp = mon.otherFormes.filter(isGen4);
        if (tmp.length > 0)
        {
            otherForms = tmp;
        }
    }

    console.log(`\
    ${/[- ']+/.test(mon.species) ? quote(mon.species) : mon.species}:
    {
        id: ${mon.num},
        uid: ${uid},
        species: ${quote(mon.species)},`);
    if (mon.baseSpecies) console.log(`\
        baseSpecies: ${quote(mon.baseSpecies)},`);
    if (mon.baseForme) console.log(`\
        baseForm: ${quote(mon.baseForme)},`);
    if (mon.forme) console.log(`\
        form: ${quote(mon.forme)},`);
    if (mon.formeLetter) console.log(`\
        formLetter: ${quote(mon.formeLetter)},`);
    if (otherForms) console.log(`\
        otherForms: [${otherForms.map(quote).join(", ")}],`);
    console.log(`\
        abilities: {${abilities.join(", ")}},
        types: [${mon.types.map(t => quote(t.toLowerCase())).join(", ")}],
        baseStats: {hp: ${stats.hp}, atk: ${stats.atk}, def: ${stats.def}, \
spa: ${stats.spa}, spd: ${stats.spd}, spe: ${stats.spe}},
        weightkg: ${mon.weightkg}
    },`);
    ++uid;
}
console.log("};\n");
const numPokemon = uid;

// moves
const moves = data.Movedex;
console.log(`/** Contains data for every move in the supported generation. */
const moves: {readonly [name: string]: MoveData} =\n{`);
uid = 0;
for (const moveName in moves)
{
    if (!moves.hasOwnProperty(moveName)) continue;
    const move = moves[moveName];
    // only gen4 and under moves allowed
    if (move.num <= 0 || move.num >= 468 || move.isNonstandard) continue;

    let id = move.id;
    // hidden power moves also need to encode their type
    // except hp normal which doesn't exist here
    if (id === "hiddenpower" && move.type !== "Normal")
    {
        id += move.type.toLowerCase();
    }

    // factor pp boosts if the move supports it in game
    let pp = move.pp;
    if (!move.noPPBoosts)
    {
        pp = Math.floor(pp * 8 / 5);
    }

    console.log(`    ${id}: {uid: ${uid}, pp: ${pp}},`);
    ++uid;
}
console.log("};\n");
const numMoves = uid;

// items
const items = data.Items;
console.log(`/** Contains data for every item in the supported generation. */
const items: {readonly [name: string]: number} =\n{`);
uid = 0;
for (const itemName in items)
{
    if (!items.hasOwnProperty(itemName)) continue;
    const item = items[itemName];
    // only gen4 and under items allowed
    if (item.gen > 4 || item.isNonstandard) continue;

    console.log(`    ${item.id}: ${uid},`);
    ++uid;
}
console.log("};\n");
const numItems = uid;

console.log(`export const dex: Dex =
{
    pokemon, numPokemon: ${numPokemon}, moves, numMoves: ${numMoves}, \
items, numItems: ${numItems}
};`);
