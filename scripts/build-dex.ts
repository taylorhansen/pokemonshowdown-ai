/**
 * @file Generates `dex.ts` through stdout. This should be called from
 * `build-dex.sh` after the `Pokemon-Showdown` repo has been cloned.
 */
import { ModdedDex } from "../pokemon-showdown/sim/dex";
import { Species } from "../pokemon-showdown/sim/dex-data";
import "../pokemon-showdown/sim/global-types";
import * as dexutil from "../src/battle/dex/dex-util";
import * as effects from "../src/battle/dex/effects";
import { toIdName } from "../src/psbot/helpers";

/** Deep writable type. */
type DeepWritable<T> =
    T extends object ? {-readonly [K in keyof T]: DeepWritable<T[K]>} : T;

// TODO: support other gens?
const dex = new ModdedDex("gen4").includeData();

/**
 * Regex for checking whether a pokemon id name is not supported by gen4 (e.g.
 * megas, regional variants, etc). Actual pokedex differences, however, must be
 * handled separately.
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

const moves: (readonly [string, dexutil.MoveData])[] = [];

// copied from pokemon-showdown/data/mods/gen4/moves
/** Moves that can't be copied by Mirror Move. */
const noMirror: {readonly [move: string]: boolean} =
{
    acupressure: true, aromatherapy: true, assist: true, chatter: true,
    copycat: true, counter: true, curse: true, doomdesire: true, feint: true,
    focuspunch: true, futuresight: true, gravity: true, hail: true, haze: true,
    healbell: true, helpinghand: true, lightscreen: true, luckychant: true,
    magiccoat: true, mefirst: true, metronome: true, mimic: true,
    mirrorcoat: true, mirrormove: true, mist: true, mudsport: true,
    naturepower: true, perishsong: true, psychup: true, raindance: true,
    reflect: true, roleplay: true, safeguard: true, sandstorm: true,
    sketch: true, sleeptalk: true, snatch: true, spikes: true, spitup: true,
    stealthrock: true, struggle: true, sunnyday: true, tailwind: true,
    toxicspikes: true, transform: true, watersport: true
};
/** Moves that can't be copied by Copycat. */
const noCopycat: {readonly [move: string]: boolean} =
{
    assist: true, chatter: true, copycat: true, counter: true, covet: true,
    destinybond: true, detect: true, endure: true, feint: true,
    focuspunch: true, followme: true, helpinghand: true, mefirst: true,
    metronome: true, mimic: true, mirrorcoat: true, mirrormove: true,
    protect: true, sketch: true, sleeptalk: true, snatch: true, struggle: true,
    switcheroo: true, thief: true, trick: true
};

/** Maps some move names to CallTypes. */
const callTypeMap: {readonly [move: string]: effects.CallType} =
{
    assist: true, copycat: "copycat", mefirst: "target", metronome: true,
    mirrormove: "mirror", naturepower: true, sleeptalk: "self"
};

/** Maps some move names to swap boost effects. */
const swapBoostMap:
    {readonly [move: string]: Partial<dexutil.BoostTable<true>>} =
{
    // swapboost moves
    guardswap: {def: true, spd: true},
    heartswap:
    {
        atk: true, def: true, spa: true, spd: true, spe: true, accuracy: true,
        evasion: true
    },
    powerswap: {atk: true, spa: true}
};

/** Maps some move names to CountableStatusTypes. */
const countableStatusTypeMap:
    {readonly [move: string]: effects.CountableStatusType} =
{
    perishsong: "perish", stockpile: "stockpile"
};

/** Maps some move names to FieldTypes. */
const fieldTypeMap: {readonly [move: string]: effects.FieldType} =
{
    // weathers
    sunnyday: "SunnyDay", raindance: "RainDance", sandstorm: "Sandstorm",
    hail: "Hail",
    // pseudo-weathers
    gravity: "gravity", trickroom: "trickRoom"
};

/** Maps some move names or effects to StatusTypes. */
const statusTypeMap: {readonly [move: string]: effects.StatusType} =
{
    // TODO: followme, helpinghand, partiallytrapped, telekinesis (gen5)
    // TODO: triattack
    // normal statuses
    aquaring: "aquaRing", attract: "attract", charge: "charge", curse: "curse",
    embargo: "embargo", encore: "encore", focusenergy: "focusEnergy",
    foresight: "foresight", healblock: "healBlock", imprison: "imprison",
    ingrain: "ingrain", leechseed: "leechSeed", magnetrise: "magnetRise",
    miracleeye: "miracleEye", mudsport: "mudSport", nightmare: "nightmare",
    powertrick: "powerTrick", substitute: "substitute",
    gastroacid: "suppressAbility", taunt: "taunt", torment: "torment",
    watersport: "waterSport", yawn: "yawn",
    // updatable
    confusion: "confusion", bide: "bide", uproar: "uproar",
    // singlemove
    destinybond: "destinyBond", grudge: "grudge", rage: "rage",
    // singleturn
    endure: "endure", magiccoat: "magicCoat", protect: "protect",
    roost: "roost", snatch: "snatch",
    // major status
    brn: "brn",  frz: "frz", par: "par", psn: "psn", slp: "slp", tox: "tox"
};

/** Maps some move names to ImplicitStatusTypes. */
const implicitStatusTypeMap:
    {readonly [move: string]: effects.ImplicitStatusType} =
{
    defensecurl: "defenseCurl", lockedmove: "lockedMove", minimize: "minimize",
    mustrecharge: "mustRecharge"
};

/** Maps some move names to set-boost effects. */
const setBoostMap:
    {readonly [move: string]: Partial<dexutil.BoostTable<number>>} =
{
    // setboost moves
    bellydrum: {atk: 6}
};

/** Maps some move names to TeamEffects. */
const teamStatusTypeMap: {readonly [move: string]: effects.TeamType} =
{
    healingwish: "healingWish", lightscreen: "lightScreen",
    luckychant: "luckyChant", lunardance: "lunarDance", mist: "mist",
    reflect: "reflect", safeguard: "safeguard", spikes: "spikes",
    stealthrock: "stealthRock", tailwind: "tailwind",
    toxicspikes: "toxicSpikes"
    // TODO: auroraveil (gen6), stickyweb (gen6)
};

/** Maps some move names to ImplicitTeamTypes. */
const implicitTeamTypeMap:
    {readonly [move: string]: effects.ImplicitTeamType} = {wish: "wish"};

/** Maps some VolatileEffects to UniqueStatusTypes. */
const uniqueStatusTypeMap: {readonly [move: string]: effects.UniqueType} =
{
    conversion: "conversion", disable: "disable"
};

function addEffect(arr: effects.move.Move[], effect: effects.move.Move):
    boolean
{
    const jsonEffect = JSON.stringify(effect);
    if (!arr.every(e => JSON.stringify(e) !== jsonEffect)) return false;
    arr.push(effect);
    return true;
}

const futureMoves: string[] = [];
const lockedMoves: string[] = []; // TODO: rename to rampage moves
const twoTurnMoves: string[] = [];
const moveCallers: [string, effects.CallType][] = [];

const sketchableMoves: string[] = [];

const typeToMoves: {[T in dexutil.Type]: string[]} =
{
    bug: [], dark: [], dragon: [], fire: [], flying: [], ghost: [],
    electric: [], fighting: [], grass: [], ground: [], ice: [], normal: [],
    poison: [], psychic: [], rock: [], steel: [], water: [], "???": []
};

uid = 0;
for (const move of
    Object.keys(dex.data.Moves)
        .map(n => dex.getMove(n))
        .filter(isGen4Move)
        .sort((a, b) => a.id < b.id ? -1 : +(a.id > b.id)))
{
    typeToMoves[move.type.toLowerCase() as dexutil.Type].push(move.id);
    if (!move.noSketch) sketchableMoves.push(move.id);

    const category = move.category.toLowerCase() as dexutil.MoveCategory;
    const target = move.target;

    // factor pp boosts if the move supports it in game
    const pp = [move.pp, move.pp] as [number, number];
    if (!move.noPPBoosts) pp[1] = Math.floor(move.pp * 8 / 5);

    // get flags
    const flags: dexutil.MoveFlags =
    {
        ...(!!move.flags.contact && {contact: true}),
        ...(noMirror.hasOwnProperty(move.id) && {noMirror: true}),
        ...(noCopycat.hasOwnProperty(move.id) && {noCopycat: true}),
        ...(!!move.flags.reflectable && {reflectable: true})
    };
    const hasFlags = flags.contact || flags.noMirror || flags.noCopycat ||
        flags.reflectable;

    // setup move effects

    const arr: DeepWritable<effects.move.Move>[] = [];

    // primary effects

    if (callTypeMap.hasOwnProperty(move.id))
    {
        addEffect(arr, {type: "call", value: callTypeMap[move.id]});
        // add to move callers dict
        if (moveCallers.every(m => m[0] !== move.id))
        {
            moveCallers.push([move.id, callTypeMap[move.id]]);
        }
    }

    if (countableStatusTypeMap.hasOwnProperty(move.id))
    {
        addEffect(arr,
            {type: "countableStatus", value: countableStatusTypeMap[move.id]});
    }

    // two turn/future moves are also recorded in a different object in addition
    //  to containing a flag
    if (move.isFutureMove)
    {
        addEffect(arr, {type: "delay", value: "future"});
        futureMoves.push(move.id);
    }
    if (move.flags.charge === 1)
    {
        // TODO: add effect for skullbash raising def on prepare
        // TODO: add flag for solarbeam shortening during sun
        addEffect(arr, {type: "delay", value: "twoTurn"});
        twoTurnMoves.push(move.id);
    }

    if (fieldTypeMap.hasOwnProperty(move.id))
    {
        addEffect(arr, {type: "field", value: fieldTypeMap[move.id]});
    }
    if (move.weather && fieldTypeMap.hasOwnProperty(move.weather))
    {
        addEffect(arr, {type: "field", value: fieldTypeMap[move.weather]});
    }
    if (move.pseudoWeather && fieldTypeMap.hasOwnProperty(move.pseudoWeather))
    {
        addEffect(arr,
            {type: "field", value: fieldTypeMap[move.pseudoWeather]});
    }

    if (move.recoil)
    {
        addEffect(arr,
            {type: "recoil", value: move.recoil[1] / move.recoil[0]});
    }

    if (move.selfSwitch)
    {
        addEffect(arr,
        {
            type: "selfSwitch", value: move.selfSwitch as effects.SelfSwitchType
        });
    }

    if (swapBoostMap.hasOwnProperty(move.id))
    {
        addEffect(arr, {type: "swapBoost", ...swapBoostMap[move.id]});
    }

    const self: effects.move.Category = "self";
    const hit: effects.move.Category =
        ["all", "allySide", "self"].includes(target) ? self : "hit";

    function addEffects(ctg: effects.move.Category, psEffect: HitEffect):
        void
    {
        // TODO: more flags: multi-hit, recoil, etc

        // boost
        if (setBoostMap.hasOwnProperty(move.id))
        {
            addEffect(arr, {type: "boost", ctg, set: setBoostMap[move.id]});
        }
        if (psEffect.boosts)
        {
            addEffect(arr, {type: "boost", ctg, add: psEffect.boosts});
        }

        // single-target statuses
        for (const effectName of
        [
            move.id,
            ...(psEffect.volatileStatus && [psEffect.volatileStatus] || []),
            ...(psEffect.status && [psEffect.status] || [])
        ])
        {
            for (const [key, map] of
            [
                ["status", statusTypeMap], ["unique", uniqueStatusTypeMap],
                ["implicitStatus", implicitStatusTypeMap]
            ] as const)
            {
                if (map.hasOwnProperty(effectName))
                {
                    addEffect(arr,
                        {type: key, ctg, value: map[effectName]} as any);
                }
            }
            // add to lockedmove dict
            if (effectName === "lockedmove" && !lockedMoves.includes(move.id))
            {
                lockedMoves.push(move.id);
            }
        }

        for (const effectName of
        [
            move.id,
            ...(psEffect.sideCondition && [psEffect.sideCondition] || []),
            ...(psEffect.slotCondition && [psEffect.slotCondition] || [])
        ])
        {
            for (const [key, map] of
            [
                ["team", teamStatusTypeMap],
                ["implicitTeam", implicitTeamTypeMap]
            ] as const)
            {
                if (map.hasOwnProperty(effectName))
                {
                    addEffect(arr,
                        {type: key, ctg, value: map[effectName]} as any);
                }
            }
        }
    }

    addEffects(hit, move);
    if (move.self) addEffects(self, move.self);

    // add secondary effects
    const psSecondaries = move.secondaries ??
        (move.secondary && [move.secondary] || []);
    for (const psSecondary of psSecondaries)
    {
        const ctg = psSecondary.self ? self : hit;
        const psHitEffect = psSecondary.self ? psSecondary.self : psSecondary;
        const chance = psSecondary.chance ?? 100;

        if (psHitEffect.boosts)
        {
            addEffect(arr,
            {
                type: "chance", ctg, chance,
                effects: [{type: "boost", add: psHitEffect.boosts}]
            });
        }
        if (psHitEffect.volatileStatus)
        {
            if (psHitEffect.volatileStatus === "flinch")
            {
                addEffect(arr,
                    {type: "chance", ctg, chance, effects: [{type: "flinch"}]});
            }
            else if (statusTypeMap.hasOwnProperty(psHitEffect.volatileStatus))
            {
                addEffect(arr,
                {
                    type: "chance", ctg, chance,
                    effects:
                    [{
                        type: "status",
                        value: statusTypeMap[psHitEffect.volatileStatus] as any
                    }]
                });
            }
        }
        if (psHitEffect.status &&
            statusTypeMap.hasOwnProperty(psHitEffect.status))
        {
            addEffect(arr,
            {
                type: "chance", ctg, chance,
                effects:
                    [{type: "status", value: statusTypeMap[psHitEffect.status] as any}]
            });
        }
    }

    moves[uid] =
    [
        move.id,
        {
            uid, name: move.id, display: move.name, category, target, pp,
            ...(hasFlags && {flags}), ...(arr.length > 0 && {effects: arr})
        }
    ];
    ++uid;
}

// guarantee order
futureMoves.sort();
lockedMoves.sort();
twoTurnMoves.sort();
moveCallers.sort((a, b) => a[0] < b[0] ? -1 : +(a[0] > b[0]));

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

const pokemon: (readonly [string, dexutil.PokemonData])[] = []

const abilityNames = new Set<string>();

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
        if (!abilityNames.has(abilityId)) abilityNames.add(abilityId);
    }

    // don't sort types to keep primary/secondary type distinction
    let types: [dexutil.Type, dexutil.Type];
    const typeArr = mon.types.map(s => s.toLowerCase()) as dexutil.Type[];
    if (typeArr.length > 2)
    {
        console.error("Error: Too many types for species " + name);
    }
    else if (typeArr.length === 1) typeArr.push("???");
    types = typeArr as [dexutil.Type, dexutil.Type];

    const stats = mon.baseStats;

    // include refs to other forms if there are any
    let otherForms: string[] | undefined;
    if (mon.otherFormes)
    {
        const tmp = mon.otherFormes.map(toIdName).filter(isGen4);
        if (tmp.length > 0) otherForms = tmp.sort();
    }

    const movepool = [...composeMovepool(mon)].sort();

    const entry: [string, dexutil.PokemonData] =
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
            "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N",
            "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
            "Exclamation", "Question"
        ];
        const {baseForm: _, ...data2} = entry[1]; // omit baseForm from data2

        for (const letter of letters)
        {
            const lower = letter.toLowerCase();
            const name = `unown${lower}`;
            pokemon.push(
            [
                name,
                {
                    ...data2, name, display: `Unown-${letter}`,
                    baseSpecies: "unown", form: lower
                }
            ]);
        }

        // add alt forms to list
        // TODO: if other forms are treated as separate species, should forms
        //  even be mentioned?
        entry[1] =
        {
            ...entry[1],
            otherForms: letters.map(letter => `unown${letter.toLowerCase()}`)
        };
    }

    // make sure the next entry, cherrim-sunshine, receives the same uid since
    //  the two forms are functionally identical
    if (mon.name !== "Cherrim") ++uid;
}

// ability data

/** Maps ability name to whether they cancel move recoil damage. */
const noRecoil: {readonly [ability: string]: true | undefined} =
    {magicguard: true, rockhead: true};

/** Map for Ability effects. */
const abilityEffectMap:
    {readonly [ability: string]: readonly effects.ability.Ability[]} =
{
    aftermath:
    [{
        type: "percentDamage", on: "contactKO", tgt: "hit", blockedBy: "damp",
        value: 25
    }],
    colorchange:
    [{
        type: "typeChange", on: "damaged", tgt: "self", value: "colorchange"
    }],
    cutecharm:
    [{
        type: "chance", on: "contact", chance: 30,
        effects: [{type: "status", tgt: "hit", value: "attract"}]
    }],
    effectspore:
    [{
        type: "chance", on: "contact", chance: 30,
        effects:
        [
            {type: "status", tgt: "hit", value: "slp"},
            {type: "status", tgt: "hit", value: "par"},
            {type: "status", tgt: "hit", value: "psn"}
        ]
    }],
    flamebody:
    [{
        type: "chance", on: "contact", chance: 30,
        effects: [{type: "status", tgt: "hit", value: "brn"}]
    }],
    poisonpoint:
    [{
        type: "chance", on: "contact", chance: 30,
        effects: [{type: "status", tgt: "hit", value: "psn"}]
    }],
    roughskin:
        [{type: "percentDamage", on: "contact", tgt: "hit", value: 6.25}],
    static:
    [{
        type: "chance", on: "contact", chance: 30,
        effects: [{type: "status", tgt: "hit", value: "par"}]
    }],
};

const abilities: (readonly [string, dexutil.AbilityData])[] = [];

uid = 0;
for (const ability of
    [...abilityNames]
        .map(n => dex.getAbility(n))
        .sort((a, b) => a.id < b.id ? -1 : +(a.id > b.id)))
{
    abilities.push(
    [
        ability.id,
        {
            uid, name: ability.id, display: ability.name,
            ...(ability.id === "owntempo" && {immune: "confusion"}),
            ...(noRecoil[ability.id] && {noRecoil: true}),
            ...(abilityEffectMap[ability.id] &&
                {effects: abilityEffectMap[ability.id]})
        }
    ]);
    ++uid;
}

// items and berries

// make sure that having no item is possible
const items: (readonly [string, dexutil.ItemData])[] =
    [["none", {uid: 0, name: "none", display: "None"}]];
const berries: (readonly [string, dexutil.NaturalGiftData])[] = [];

uid = 1;
for (const item of
    Object.keys(dex.data.Items)
        .map(n => dex.getItem(n))
        // only gen4 and under items allowed
        .filter(i => i.gen <= 4 && !i.isNonstandard)
        .sort((a, b) => a.id < b.id ? -1 : +(a.id > b.id)))
{
    if (item.isBerry && item.naturalGift)
    {
        berries.push(
        [
            item.id,
            {
                basePower: item.naturalGift.basePower,
                type: item.naturalGift.type.toLowerCase() as dexutil.Type
            }
        ]);
    }

    items.push(
    [
        item.id,
        {
            uid, name: item.id, display: item.name,
            ...(item.isChoice && {isChoice: item.isChoice})
        }
    ]);
    ++uid;
}

// print data

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
 * Recursively stringifies a dictionary.
 * @param dict Dictionary to stringify.
 * @param converter Stringifier for dictionary values.
 */
function deepStringifyDict(dict: {readonly [name: string]: any},
    converter: (value: any) => string): string
{
    const entries: string[] = [];
    for (const key in dict)
    {
        if (!dict.hasOwnProperty(key)) continue;

        let str: string;
        const value = dict[key];
        if (Array.isArray(value)) str = deepStringifyArray(value, converter);
        else if (typeof value === "object")
        {
            str = deepStringifyDict(value, converter);
        }
        else str = converter(value);

        entries.push(`${maybeQuote(key)}: ${str}`);
    }
    return "{" + entries.join(", ") + "}";
}


/**
 * Recursively stringifies an array.
 * @param arr Array to stringify.
 * @param converter Stringifier for array values.
 */
function deepStringifyArray(arr: any[], converter: (value: any) => string):
    string
{
    const values: string[] = [];
    for (const value of arr)
    {
        let str: string;
        if (Array.isArray(value)) str = deepStringifyArray(value, converter);
        else if (typeof value === "object")
        {
            str = deepStringifyDict(value, converter);
        }
        else str = converter(value);

        values.push(str);
    }
    return `[${values.join(", ")}]`;
}

/**
 * Creates an export array.
 * @param arr Array to stringify.
 * @param name Name of the dictionary.
 * @param typeName Type name for the array values.
 * @param converter Stringifier for array values.
 */
function exportArray<T>(arr: readonly T[], name: string, typeName: string,
    converter: (t: T) => string): string
{
    return `export const ${name}: readonly ${typeName}[] = [` +
        arr.map(converter).join(", ") + "];";
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

/** Sorted array of all ${display} moves. */
${exportArray(moveNames, `${name}MoveKeys`, `${cap}Move`, quote)}

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
import * as dexutil from "./dex-util";
import * as effects from "./effects";

/**
 * Contains info about each pokemon, with alternate forms as separate entries.
 */
${exportEntriesToDict(pokemon, "pokemon", "dexutil.PokemonData",
    p => deepStringifyDict(p, v => typeof v === "string" ? quote(v) : v))}

/** Sorted array of all pokemon names. */
${exportArray(pokemon, "pokemonKeys", "string", ([name]) => quote(name))}

/** Contains info about each ability. */
${exportEntriesToDict(abilities, "abilities", "dexutil.AbilityData",
    a => deepStringifyDict(a, v => typeof v === "string" ? quote(v) : v))}

/** Sorted array of all ability names. */
${exportArray(abilities, "abilityKeys", "string", ([name]) => quote(name))}

/** Contains info about each move. */
${exportEntriesToDict(moves, "moves", "dexutil.MoveData", m =>
    deepStringifyDict(m, v => typeof v === "string" ? quote(v) : v))}

/** Sorted array of all move names. */
${exportArray(moves, "moveKeys", "string", ([name]) => quote(name))}

${exportSpecificMoves(futureMoves, "future")}

${exportSpecificMoves(lockedMoves, "locked")}

${exportSpecificMoves(twoTurnMoves, "twoTurn", "two-turn")}

/** Maps move name to its CallType, if any. */
${exportEntriesToDict(moveCallers, "moveCallers", "effects.CallType",
    v => typeof v === "string" ? quote(v) : v.toString())}

/** Maps move type to each move of that type. */
${exportDict(typeToMoves, "typeToMoves",
    "{readonly [T in dexutil.Type]: readonly string[]}",
    a => `[${a.map(quote).join(", ")}]`)}

/** Contains info about each item. */
${exportEntriesToDict(items, "items", "dexutil.ItemData", i =>
    stringifyDict(i, v => typeof v === "string" ? quote(v) : v))}

/** Sorted array of all item names, except with \`none\` at position 0. */
${exportArray(items, "itemKeys", "string", i => quote(i[0]))}

/** Contains info about each berry item. */
${exportEntriesToDict(berries, "berries", "dexutil.NaturalGiftData",
    b => stringifyDict(b, v => typeof v === "string" ? quote(v) : v))}`);
