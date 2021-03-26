/**
 * @file Generates `dex.ts` through stdout. This should be called from
 * `build-dex.sh` after the `Pokemon-Showdown` repo has been cloned.
 */
// TODO: getting errors when trying to import the ts file, but js works fine
// @ts-ignore
import psDex = require("../pokemon-showdown/.sim-dist/dex");
// import { ModdedDex } from "../pokemon-showdown/sim/dex";
import "../pokemon-showdown/sim/global-types";
import * as dexutil from "../src/battle/dex/dex-util";
import { toIdName } from "../src/psbot/helpers";

/** Helper type for converting readonly containers to writable versions. */
type Writable<T> = {-readonly [K in keyof T]: T[K]};

// TODO: support other gens?
const dex = new psDex.ModdedDex("gen4").includeData();

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

// adapted from pokemon-showdown/data

/** Moves that are blocked by Damp-like abilities. */
const explosive: {readonly [move: string]: boolean} =
    {explosion: true, selfdestruct: true};

/** Moves that intercept switch-ins. */
const interceptSwitch: {readonly [move: string]: boolean} = {pursuit: true};

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

/** Maps move name to whether it transforms the user into the target. */
const transformMap: {readonly [move: string]: boolean} = {transform: true};

/** Maps some move names to CallTypes. */
const callTypeMap: {readonly [move: string]: dexutil.CallType} =
{
    assist: true, copycat: "copycat", mefirst: "target", metronome: true,
    mirrormove: "mirror", naturepower: true, sleeptalk: "self"
};

/** Moves that have special damage effects. */
const customDamageMap:
{
    readonly [move: string]: NonNullable<dexutil.MoveData["effects"]>["damage"]
} =
{
    bellydrum: {type: "percent", target: "self", percent: -50},
    curse: {type: "percent", target: "self", percent: -50, ghost: true},
    substitute: {type: "percent", target: "self", percent: -25},

    // TODO: weather changes this amount (same for all 3)
    moonlight: {type: "percent", target: "self", percent: 50},
    morningsun: {type: "percent", target: "self", percent: 50},
    synthesis: {type: "percent", target: "self", percent: 50},

    painsplit: {type: "split"}
};

/** Maps some move names to swap-boost effects. */
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
    {readonly [move: string]: dexutil.CountableStatusType} =
    {perishsong: "perish", stockpile: "stockpile"};

/** Maps some move names to FieldTypes. */
const fieldTypeMap:
{
    readonly [move: string]: NonNullable<dexutil.MoveData["effects"]>["field"]
} =
{
    // weathers
    sunnyday: {effect: "SunnyDay"}, raindance: {effect: "RainDance"},
    sandstorm: {effect: "Sandstorm"}, hail: {effect: "Hail"},
    // pseudo-weathers
    gravity: {effect: "gravity"}, trickroom: {effect: "trickRoom", toggle: true}
};

/** Maps some move names or effects to StatusTypes. */
const statusTypeMap: {readonly [move: string]: readonly dexutil.StatusType[]} =
{
    // TODO: followme, helpinghand, partiallytrapped, telekinesis (gen5)
    // normal statuses
    aquaring: ["aquaRing"], attract: ["attract"], charge: ["charge"],
    embargo: ["embargo"], encore: ["encore"], focusenergy: ["focusEnergy"],
    foresight: ["foresight"], healblock: ["healBlock"], imprison: ["imprison"],
    ingrain: ["ingrain"], leechseed: ["leechSeed"], magnetrise: ["magnetRise"],
    miracleeye: ["miracleEye"], mudsport: ["mudSport"],
    nightmare: ["nightmare"], powertrick: ["powerTrick"],
    substitute: ["substitute"], gastroacid: ["suppressAbility"],
    taunt: ["taunt"], torment: ["torment"], watersport: ["waterSport"],
    yawn: ["yawn"],
    // updatable
    confusion: ["confusion"], bide: ["bide"], uproar: ["uproar"],
    // singlemove
    destinybond: ["destinyBond"], grudge: ["grudge"], rage: ["rage"],
    // singleturn
    endure: ["endure"], magiccoat: ["magicCoat"], protect: ["protect"],
    roost: ["roost"], snatch: ["snatch"],
    // major status
    brn: ["brn"],  frz: ["frz"], par: ["par"], psn: ["psn"], slp: ["slp"],
    tox: ["tox"]
};

/**
 * Move names that count as both moves and StatusType names, but the effect the
 * move inflicts either doesn't target the move target but instead the user
 * (e.g. rage), or doesn't have the same name as the status it inflicts
 * (e.g. confusion).
 */
const explicitMoveEffect: {readonly [move: string]: boolean} =
    {confusion: true, rage: true, uproar: true};

/** Moves that have special status effects. */
const customStatusMap:
{
    readonly [move: string]: NonNullable<dexutil.MoveData["effects"]>["status"]
} =
{
    curse: {ghost: true, hit: ["curse"]},
    triattack: {chance: 20, hit: ["brn", "frz", "par"]}
};

/** Maps some move names to ImplicitStatusTypes. */
const implicitStatusTypeMap:
    {readonly [move: string]: dexutil.ImplicitStatusType} =
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

/** Moves that have special boost effects. */
const customBoostMap:
{
    readonly [move: string]: NonNullable<dexutil.MoveData["effects"]>["boost"]
} =
    {curse: {noGhost: true, self: {atk: 1, def: 1, spe: -1}}};

/** Maps some move names to TeamEffects. */
const teamStatusTypeMap: {readonly [move: string]: dexutil.TeamEffectType} =
{
    lightscreen: "lightScreen", luckychant: "luckyChant", mist: "mist",
    reflect: "reflect", safeguard: "safeguard", spikes: "spikes",
    stealthrock: "stealthRock", tailwind: "tailwind",
    toxicspikes: "toxicSpikes"
    // TODO: auroraveil (gen6), stickyweb (gen6)
};

/** Maps some move names to ImplicitTeamTypes. */
const implicitTeamTypeMap:
    {readonly [move: string]: dexutil.ImplicitTeamEffectType} =
    {healingwish: "healingWish", lunardance: "lunarDance", wish: "wish"};

/** Maps move name to how/whether it changes the target's type. */
const changeTypeMap: {readonly [move: string]: "conversion"} =
    {conversion: "conversion"};

/** Maps move name to whether it disables moves. */
const disableMoveMap: {readonly [move: string]: boolean} = {disable: true};

// NOTE(gen4): healingwish-like moves send in a replacement immediately after
//  self-faint
/** Secondary map for move name to self-switch effect. */
const selfSwitchMap: {readonly [move: string]: dexutil.SelfSwitchType} =
    {healingwish: true, lunardance: true}

const futureMoves: string[] = [];
const lockedMoves: string[] = []; // TODO: rename to rampage moves
const twoTurnMoves: string[] = [];
const moveCallers: [string, dexutil.CallType][] = [];

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
    if (!move.noSketch) sketchableMoves.push(move.id);

    const category = move.category.toLowerCase() as dexutil.MoveCategory;
    const basePower = move.basePower;

    let damage: dexutil.MoveDamage | undefined;
    if (move.ohko) damage = "ohko";
    else if (move.damage) damage = move.damage;
    else
    {
        switch (move.id)
        {
            case "superfang": damage = "half"; break;
            case "bide": damage = "bide"; break;
            case "counter": case "mirrorcoat": damage = "counter"; break;
            case "metalburst": damage = "metalburst"; break;
            case "psywave": damage = "psywave"; break;
            case "endeavor": damage = "hpdiff";
        }
    }

    const type = move.type.toLowerCase() as dexutil.Type;
    let modifyType: dexutil.MoveData["modifyType"];
    switch (move.id)
    {
        case "hiddenpower": modifyType = "hpType"; break;
        case "judgment": modifyType = "plateType"; break;
        case "struggle": modifyType = "???"; break;
    }
    typeToMoves[type].push(move.id);

    const target = move.target;
    const nonGhostTarget = move.nonGhostTarget as MoveTarget;

    // factor pp boosts if the move supports it
    const pp =
        [move.pp, move.noPPBoosts ? move.pp : Math.floor(move.pp * 8 / 5)] as
        const;

    let multihit = move.multihit as number | [number, number] | undefined;
    if (typeof multihit === "number") multihit = [multihit, multihit];
    else if (multihit && multihit.length !== 2)
    {
        throw new Error(`Invalid multihit array [${multihit.join(", ")}] for ` +
            `move '${move.id}'`);
    }

    // get flags
    const flags: NonNullable<dexutil.MoveData["flags"]> =
    {
        ...!!move.flags.contact && {contact: true},
        ...explosive.hasOwnProperty(move.id) && {explosive: true},
        ...move.id === "focuspunch" && {focus: true},
        // TODO(gen6): support type-based ignoreImmunity flag
        ...category !== "status" && move.ignoreImmunity &&
            {ignoreImmunity: true},
        ...!!move.flags.authentic && {ignoreSub: true},
        ...interceptSwitch.hasOwnProperty(move.id) && {interceptSwitch: true},
        ...noMirror.hasOwnProperty(move.id) && {noMirror: true},
        ...noCopycat.hasOwnProperty(move.id) && {noCopycat: true},
        ...!!move.flags.reflectable && {reflectable: true}
    };

    // setup move effects

    const self: dexutil.MoveEffectTarget = "self";
    const hit: dexutil.MoveEffectTarget =
        ["all", "allySide", "self"].includes(target) ? self : "hit";

    type MoveEffects = Writable<NonNullable<dexutil.MoveData["effects"]>>;

    // boost
    let boost: Writable<NonNullable<MoveEffects["boost"]>> =
        setBoostMap.hasOwnProperty(move.id) ?
            {set: true, [hit]: setBoostMap[move.id]}
        :
        {
            ...move.boosts && {[hit]: move.boosts},
            ...move.self?.boosts && {[self]: move.self.boosts},
            ...customBoostMap.hasOwnProperty(move.id) ?
                customBoostMap[move.id] : {}
        };

    // status
    let status: Writable<MoveEffects["status"]> =
    {
        ...statusTypeMap.hasOwnProperty(move.id) &&
            !explicitMoveEffect.hasOwnProperty(move.id) ?
            {[hit]: statusTypeMap[move.id]}
        : move.volatileStatus &&
            statusTypeMap.hasOwnProperty(move.volatileStatus) ?
            {[hit]: statusTypeMap[move.volatileStatus]}
        : move.status && statusTypeMap.hasOwnProperty(move.status) ?
            {[hit]: statusTypeMap[move.status]}
        : {},
        ...move.self?.volatileStatus &&
            statusTypeMap.hasOwnProperty(move.self.volatileStatus) ?
            {[self]: statusTypeMap[move.self.volatileStatus]}
        : move.self?.status && statusTypeMap.hasOwnProperty(move.self.status) ?
            {[self]: statusTypeMap[move.self.status]}
        : {},
        ...customStatusMap.hasOwnProperty(move.id) ?
            customStatusMap[move.id] : {}
    };

    // add boost/status secondary effects
    const psSecondaries = move.secondaries ??
        (move.secondary && [move.secondary] || []);
    for (const psSecondary of psSecondaries)
    {
        const tgt = psSecondary.self ? self : hit;
        const psHitEffect = psSecondary.self ? psSecondary.self : psSecondary;
        const chance = psSecondary.chance ?? 100;

        if (psHitEffect.boosts) boost = {chance, [tgt]: psHitEffect.boosts};
        if (psHitEffect.volatileStatus)
        {
            // TODO: support flinching
            // if (psHitEffect.volatileStatus === "flinch")
            if (statusTypeMap.hasOwnProperty(psHitEffect.volatileStatus))
            {
                status =
                    {chance, [tgt]: statusTypeMap[psHitEffect.volatileStatus]};
            }
        }
        if (psHitEffect.status &&
            statusTypeMap.hasOwnProperty(psHitEffect.status))
        {
            status = {chance, [tgt]: statusTypeMap[psHitEffect.status]};
        }
    }

    // team
    const team: Writable<MoveEffects["team"]> =
    {
        ...teamStatusTypeMap.hasOwnProperty(move.id) ?
            {[hit]: teamStatusTypeMap[move.id]}
        : move.sideCondition &&
            teamStatusTypeMap.hasOwnProperty(move.sideCondition) ?
            {[hit]: teamStatusTypeMap[move.sideCondition]}
        : move.slotCondition &&
            teamStatusTypeMap.hasOwnProperty(move.slotCondition) ?
            {[hit]: teamStatusTypeMap[move.slotCondition]}
        : {},
        ...move.self?.sideCondition &&
            teamStatusTypeMap.hasOwnProperty(move.self.sideCondition) ?
            {[self]: teamStatusTypeMap[move.self.sideCondition]}
        : move.self?.slotCondition &&
            teamStatusTypeMap.hasOwnProperty(move.self.slotCondition) ?
            {[self]: teamStatusTypeMap[move.self.slotCondition]}
        : {}
    };

    const moveEffects: MoveEffects =
    {
        ...transformMap.hasOwnProperty(move.id) && {transform: true},

        ...callTypeMap.hasOwnProperty(move.id) && {call: callTypeMap[move.id]},

        ...move.isFutureMove ? {delay: {type: "future"}}
        : move.flags.charge ?
        {delay: {
            // TODO: add effect for skullbash raising def on prepare
            type: "twoTurn", ...move.id === "solarbeam" && {solar: true}
        }}
        : {},

        ...move.heal ?
        {damage: {
            type: "percent", target: self,
            // TODO: should the fraction tuple be preserved in the MoveData?
            percent: 100 * move.heal[0] / move.heal[1]}
        }
        : customDamageMap.hasOwnProperty(move.id) ?
            {damage: customDamageMap[move.id]}
        : {},

        ...countableStatusTypeMap.hasOwnProperty(move.id) &&
            {count: countableStatusTypeMap[move.id]},

        ...Object.keys(boost).length > 0 && {boost},

        ...swapBoostMap.hasOwnProperty(move.id) &&
            {swapBoosts: swapBoostMap[move.id]},

        ...Object.keys(status).length > 0 && {status},

        ...Object.keys(team).length > 0 && {team},

        ...fieldTypeMap.hasOwnProperty(move.id) ?
            {field: fieldTypeMap[move.id]}
        : move.weather && fieldTypeMap.hasOwnProperty(move.weather) ?
            {field: fieldTypeMap[move.weather]}
        : move.pseudoWeather &&
            fieldTypeMap.hasOwnProperty(move.pseudoWeather) ?
            {field: fieldTypeMap[move.pseudoWeather]}
        : {},

        ...changeTypeMap.hasOwnProperty(move.id) &&
            {changeType: changeTypeMap[move.id]},

        ...disableMoveMap.hasOwnProperty(move.id) && {disableMove: true},

        ...move.drain && {drain: move.drain},

        ...move.recoil ?
        {recoil: {
            ratio: move.recoil, ...move.struggleRecoil && {struggle: true}
        }}
        : move.struggleRecoil ? {recoil: {ratio: [1, 4], struggle: true}}
        : {},

        ...move.selfdestruct &&
            {selfFaint: move.selfdestruct as dexutil.MoveSelfFaint},

        ...move.selfSwitch &&
            {selfSwitch: move.selfSwitch as dexutil.SelfSwitchType},
        ...selfSwitchMap.hasOwnProperty(move.id) &&
            {selfSwitch: selfSwitchMap[move.id]}
    };

    if (moveEffects.call) moveCallers.push([move.id, moveEffects.call]);

    // two turn/future moves are also recorded in a different object
    switch (moveEffects.delay?.type)
    {
        case "future": futureMoves.push(move.id); break;
        case "twoTurn": twoTurnMoves.push(move.id); break;
    }

    // implicit
    const implicit: Writable<dexutil.MoveData["implicit"]> =
    {
        ...implicitStatusTypeMap.hasOwnProperty(move.id) ?
            {status: implicitStatusTypeMap[move.id]}
        : move.volatileStatus &&
            implicitStatusTypeMap.hasOwnProperty(move.volatileStatus) ?
            {status: implicitStatusTypeMap[move.volatileStatus]}
        : move.status && implicitStatusTypeMap.hasOwnProperty(move.status) ?
            {status: implicitStatusTypeMap[move.status]}
        : move.self?.volatileStatus &&
            implicitStatusTypeMap.hasOwnProperty(move.self.volatileStatus) ?
            {status: implicitStatusTypeMap[move.self.volatileStatus]}
        : move.self?.status &&
            implicitStatusTypeMap.hasOwnProperty(move.self.status) ?
            {status: implicitStatusTypeMap[move.self.status]}
        : {},

        ...implicitTeamTypeMap.hasOwnProperty(move.id) ?
            {team: implicitTeamTypeMap[move.id]}
        : move.sideCondition &&
            implicitTeamTypeMap.hasOwnProperty(move.sideCondition) ?
            {team: implicitTeamTypeMap[move.sideCondition]}
        : move.slotCondition &&
            implicitTeamTypeMap.hasOwnProperty(move.slotCondition) ?
            {team: implicitTeamTypeMap[move.slotCondition]}
        : move.self?.sideCondition &&
            implicitTeamTypeMap.hasOwnProperty(move.self.sideCondition) ?
            {team: implicitTeamTypeMap[move.self.sideCondition]}
        : move.self?.slotCondition &&
            implicitTeamTypeMap.hasOwnProperty(move.self.slotCondition) ?
            {team: implicitTeamTypeMap[move.self.slotCondition]}
        : {}
    };

    // add to lockedmove dict
    if (implicit.status === "lockedMove" && !lockedMoves.includes(move.id))
    {
        lockedMoves.push(move.id);
    }

    moves[uid] =
    [
        move.id,
        {
            uid, name: move.id, display: move.name, category, basePower,
            ...damage && {damage}, type, ...modifyType && {modifyType}, target,
            ...nonGhostTarget && {nonGhostTarget}, pp,
            ...multihit && {multihit},
            ...Object.keys(flags).length > 0 && {flags},
            ...Object.keys(moveEffects).length > 0 && {effects: moveEffects},
            ...Object.keys(implicit).length > 0 && {implicit}
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

            if (learnset[moveName].some((source: string) =>
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
    for (const index in mon.abilities)
    {
        if (!mon.abilities.hasOwnProperty(index)) continue;
        const abilityName = mon.abilities[index as keyof Species["abilities"]];
        if (!abilityName) continue;
        const abilityId = toIdName(abilityName);
        baseAbilities.push(abilityId);
        if (!abilityNames.has(abilityId)) abilityNames.add(abilityId);
    }

    // don't sort types to keep primary/secondary type distinction
    let types: [dexutil.Type, dexutil.Type];
    const typeArr = mon.types.map((s: string) => s.toLowerCase()) as
        dexutil.Type[];
    if (typeArr.length > 2)
    {
        console.error(`Error: Too many types for species '${mon.id}'`);
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

const statusImmunityOn: dexutil.AbilityData["on"] =
    {start: {cure: true}, block: {status: true}, status: {cure: true}};

/** Maps ability name to data. */
const abilityData:
{
    readonly [ability: string]:
        Pick<dexutil.AbilityData, "on" | "statusImmunity" | "flags">
} =
{
    naturalcure: {on: {switchOut: {cure: true}}},

    // TODO(insomnia/vitalspirit): when using rest, ability causes it to fail if
    //  hp not full (`|-fail|mon|heal`)
    immunity: {on: statusImmunityOn, statusImmunity: {psn: true, tox: true}},
    insomnia: {on: statusImmunityOn, statusImmunity: {slp: true}},
    limber: {on: statusImmunityOn, statusImmunity: {par: true}},
    magmaarmor: {on: statusImmunityOn, statusImmunity: {frz: true}},
    // TODO: oblivious should also be immune to captivate
    oblivious: {on: statusImmunityOn, statusImmunity: {attract: true}},
    owntempo: {on: statusImmunityOn, statusImmunity: {confusion: true}},
    vitalspirit: {on: statusImmunityOn, statusImmunity: {slp: true}},
    waterveil: {on: statusImmunityOn, statusImmunity: {brn: true}},

    leafguard:
    {
        // can block statuses during sun, but only when attempting to afflict
        on: {block: {status: "SunnyDay"}},
        statusImmunity:
        {
            // status is blocked silently (gen4) except for yawn
            brn: "silent", par: "silent", psn: "silent", tox: "silent",
            slp: "silent", frz: "silent", yawn: true
        }
    },

    trace: {on: {start: {copyFoeAbility: true}}},
    frisk: {on: {start: {revealItem: true}}},
    forewarn: {on: {start: {warnStrongestMove: true}}},

    moldbreaker: {on: {start: {}}, flags: {ignoreTargetAbility: true}},
    pressure: {on: {start: {}}},

    // TODO(dryskin): sun/fire weakness
    dryskin: {on: {block: {move: {type: "water", percentDamage: 25}}}},
    // TODO(gen3-4): doesn't work while frozen
    flashfire: {on: {block: {move: {type: "fire", status: "flashFire"}}}},
    levitate: {on: {block: {move: {type: "ground"}}}},
    motordrive: {on: {block: {move: {type: "electric", boost: {spe: 1}}}}},
    voltabsorb: {on: {block: {move: {type: "electric", percentDamage: 25}}}},
    waterabsorb: {on: {block: {move: {type: "water", percentDamage: 25}}}},

    damp: {on: {block: {effect: {explosive: true}}}},

    clearbody: {on: {tryUnboost: {block: dexutil.boostNames}}},
    hypercutter: {on: {tryUnboost: {block: {atk: true}}}},
    keeneye: {on: {tryUnboost: {block: {accuracy: true}}}},
    whitesmoke: {on: {tryUnboost: {block: dexutil.boostNames}}},

    aftermath: {on: {moveContactKO: {explosive: true, percentDamage: -25}}},

    cutecharm: {on: {moveContact: {chance: 30, status: ["attract"]}}},
    effectspore:
        {on: {moveContact: {chance: 30, status: ["par", "psn", "slp"]}}},
    flamebody: {on: {moveContact: {chance: 30, status: ["brn"]}}},
    poisonpoint: {on: {moveContact: {chance: 30, status: ["psn"]}}},
    roughskin: {on: {moveContact: {percentDamage: -6.25}}},
    static: {on: {moveContact: {chance: 30, status: ["par"]}}},

    colorchange: {on: {moveDamage: {changeToMoveType: true}}},

    liquidooze: {on: {moveDrain: {invert: true}}},

    gluttony: {flags: {earlyBerry: true}},

    // gen3-4: no on-switchIn msg
    airlock: {flags: {suppressWeather: true}},
    cloudnine: {flags: {suppressWeather: true}},

    klutz: {flags: {ignoreItem: true}},

    skilllink: {flags: {maxMultihit: true}},

    magicguard: {flags: {noIndirectDamage: true}},
    rockhead: {flags: {noIndirectDamage: "recoil"}}
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
            ...abilityData[ability.id]
        }
    ]);
    ++uid;
}

// items and berries

/** Maps some item names to item effects. */
const itemOnMap:
    {readonly [item: string]: NonNullable<dexutil.ItemData["on"]>} =
{
    lifeorb: {movePostDamage: {percentDamage: -10}},

    blacksludge: {turn: {poisonDamage: 6.25, noPoisonDamage: -12.5}},
    leftovers: {turn: {poisonDamage: 6.25, noPoisonDamage: 6.25}},
    stickybarb: {turn: {poisonDamage:-12.5, noPoisonDamage: -12.5}},

    flameorb: {turn: {status: "brn"}},
    toxicorb: {turn: {status: "tox"}}
};

/** Maps some item names to consume effects. */
const itemConsumeOnMap:
    {readonly [item: string]: NonNullable<dexutil.ItemData["consumeOn"]>} =
{
    custapberry: {preMove: {threshold: 25, moveFirst: true}},

    powerherb: {moveCharge: "shorten"},

    // resist berries
    tangaberry: {preHit: {resistSuper: "bug"}},
    colburberry: {preHit: {resistSuper: "dark"}},
    habanberry: {preHit: {resistSuper: "dragon"}},
    wacanberry: {preHit: {resistSuper: "electric"}},
    chopleberry: {preHit: {resistSuper: "fighting"}},
    occaberry: {preHit: {resistSuper: "fire"}},
    cobaberry: {preHit: {resistSuper: "flying"}},
    kasibberry: {preHit: {resistSuper: "ghost"}},
    rindoberry: {preHit: {resistSuper: "grass"}},
    shucaberry: {preHit: {resistSuper: "ground"}},
    yacheberry: {preHit: {resistSuper: "ice"}},
    chilanberry: {preHit: {resistSuper: "normal"}},
    kebiaberry: {preHit: {resistSuper: "poison"}},
    payapaberry: {preHit: {resistSuper: "psychic"}},
    chartiberry: {preHit: {resistSuper: "rock"}},
    babiriberry: {preHit: {resistSuper: "steel"}},
    passhoberry: {preHit: {resistSuper: "water"}},

    // on-hit berries
    enigmaberry: {super: {heal: 25}},
    jabocaberry: {postHit: {condition: "physical", damage: 12.5}},
    rowapberry: {postHit: {condition: "special", damage: 12.5}},

    // fixed-heal berries
    oranberry:
    {update: {
        condition: "hp", threshold: 50, effect: {type: "healFixed", heal: 10}
    }},
    berryjuice:
    {update: {
        condition: "hp", threshold: 50, effect: {type: "healFixed", heal: 20}
    }},

    // percent-heal berries
    sitrusberry:
    {update: {
        condition: "hp", threshold: 50, effect: {type: "healPercent", heal: 25}
    }},
    figyberry:
    {update: {
        condition: "hp", threshold: 50,
        effect: {type: "healPercent", heal: 12.5, dislike: "atk"}
    }},
    iapapaberry:
    {update: {
        condition: "hp", threshold: 50,
        effect: {type: "healPercent", heal: 12.5, dislike: "def"}
    }},
    wikiberry:
    {update: {
        condition: "hp", threshold: 50,
        effect: {type: "healPercent", heal: 12.5, dislike: "spa"}
    }},
    aguavberry:
    {update: {
        condition: "hp", threshold: 50,
        effect: {type: "healPercent", heal: 12.5, dislike: "spd"}
    }},
    magoberry:
    {update: {
        condition: "hp", threshold: 50,
        effect: {type: "healPercent", heal: 12.5, dislike: "spe"}
    }},

    // stat-boost berries
    liechiberry:
    {update: {
        condition: "hp", threshold: 25,
        effect: {type: "boost", boostOne: {atk: 1}}
    }},
    ganlonberry:
    {update: {
        condition: "hp", threshold: 25,
        effect: {type: "boost", boostOne: {def: 1}}
    }},
    petayaberry:
    {update: {
        condition: "hp", threshold: 25,
        effect: {type: "boost", boostOne: {spa: 1}}
    }},
    apicotberry:
    {update: {
        condition: "hp", threshold: 25,
        effect: {type: "boost", boostOne: {spd: 1}}
    }},
    salacberry:
    {update: {
        condition: "hp", threshold: 25,
        effect: {type: "boost", boostOne: {spe: 1}}
    }},
    starfberry:
    {update: {
        condition: "hp", threshold: 25,
        effect:
            {type: "boost", boostOne: {atk: 2, def: 2, spa: 2, spd: 2, spe: 2}}
    }},

    lansatberry:
    {update: {
        condition: "hp", threshold: 25, effect: {type: "focusEnergy"}
    }},

    // TODO: white herb

    // status berries
    rawstberry: {update: {condition: "status", cure: {brn: true}}},
    cheriberry: {update: {condition: "status", cure: {par: true}}},
    pechaberry: {update: {condition: "status", cure: {psn: true, tox: true}}},
    chestoberry: {update: {condition: "status", cure: {slp: true}}},
    aspearberry: {update: {condition: "status", cure: {frz: true}}},
    persimberry: {update: {condition: "status", cure: {confusion: true}}},
    lumberry:
    {update: {
        condition: "status",
        cure: {
            brn: true, par: true, psn: true, tox: true, slp: true, frz: true,
            confusion: true
        }
    }},
    // gen4: only cures attract
    mentalherb: {update: {condition: "status", cure: {attract: true}}},

    leppaberry: {update: {condition: "depleted", restore: 10}},

    micleberry: {residual: {threshold: 25, status: "micleberry"}}
};

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
            ...item.isChoice && {isChoice: true},
            ...item.isBerry && {isBerry: true},
            ...item.onPlate &&
                {plateType: item.onPlate.toLowerCase() as dexutil.Type},
            ...itemOnMap.hasOwnProperty(item.id) && {on: itemOnMap[item.id]},
            ...itemConsumeOnMap.hasOwnProperty(item.id) &&
                {consumeOn: itemConsumeOnMap[item.id]}
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

/**
 * Creates an exported memoized function for wrapping mapped `dexutil`
 * structures.
 * @param name Name of the wrapper class.
 * @param dataName Name of the `dexutil` wrapped type.
 * @param mapName Name of the `dexutil` type map.
 */
function exportDataWrapper(name: string, dataName: string, mapName: string):
    string
{
    const lower = name.charAt(0).toLowerCase() + name.substr(1);
    return `\
/** Memoization of \`get${name}()\`. */
const ${lower}Memo = new Map<${dataName}, ${name}>();

/** Creates a \`${dataName}\` wrapper. */
export function get${name}(data: ${dataName}): ${name};
/** Creates a \`${dataName}\` wrapper, or null if not found. */
export function get${name}(name: string): ${name} | null;
export function get${name}(name: string | ${dataName}): ${name} | null
{
    if (typeof name === "string")
    {
        if (!${mapName}.hasOwnProperty(name)) return null;
        name = ${mapName}[name];
    }
    let result = ${lower}Memo.get(name);
    if (!result) ${lower}Memo.set(name, result = new ${name}(name));
    return result;
}`;
}

console.log(`\
// istanbul ignore file
/**
 * @file Generated file containing all the dex data taken from Pokemon Showdown.
 */
import * as dexutil from "./dex-util";
import { Ability } from "./wrappers/Ability";
import { Item } from "./wrappers/Item";
import { Move } from "./wrappers/Move";

export { Ability } from "./wrappers/Ability";
export { Item } from "./wrappers/Item";
export { Move } from "./wrappers/Move";

/**
 * Contains info about each pokemon, with alternate forms as separate entries.
 */
${exportEntriesToDict(pokemon, "pokemon", "dexutil.PokemonData",
    p => deepStringifyDict(p, v => typeof v === "string" ? quote(v) : v))}

/** Sorted array of all pokemon names. */
${exportArray(pokemon, "pokemonKeys", "string", ([name]) => quote(name))}

${exportDataWrapper("Ability", "dexutil.AbilityData", "abilities")}

/** Contains info about each ability. */
${exportEntriesToDict(abilities, "abilities", "dexutil.AbilityData",
    a => deepStringifyDict(a, v => typeof v === "string" ? quote(v) : v))}

/** Sorted array of all ability names. */
${exportArray(abilities, "abilityKeys", "string", ([name]) => quote(name))}

${exportDataWrapper("Move", "dexutil.MoveData", "moves")}

/** Contains info about each move. */
${exportEntriesToDict(moves, "moves", "dexutil.MoveData", m =>
    deepStringifyDict(m, v => typeof v === "string" ? quote(v) : v))}

/** Sorted array of all move names. */
${exportArray(moves, "moveKeys", "string", ([name]) => quote(name))}

${exportSpecificMoves(futureMoves, "future")}

${exportSpecificMoves(lockedMoves, "locked")}

${exportSpecificMoves(twoTurnMoves, "twoTurn", "two-turn")}

/** Maps move name to its CallType, if any. Primarily used for easy testing. */
${exportEntriesToDict(moveCallers, "moveCallers", "dexutil.CallType",
    v => typeof v === "string" ? quote(v) : v.toString())}

/** Maps move type to each move of that type. */
${exportDict(typeToMoves, "typeToMoves",
    "{readonly [T in dexutil.Type]: readonly string[]}",
    a => `[${a.map(quote).join(", ")}]`)}

${exportDataWrapper("Item", "dexutil.ItemData", "items")}

/** Contains info about each item. */
${exportEntriesToDict(items, "items", "dexutil.ItemData", i =>
    deepStringifyDict(i, v => typeof v === "string" ? quote(v) : v))}

/** Sorted array of all item names, except with \`none\` at position 0. */
${exportArray(items, "itemKeys", "string", i => quote(i[0]))}

/** Contains info about each berry item. */
${exportEntriesToDict(berries, "berries", "dexutil.NaturalGiftData",
    b => stringifyDict(b, v => typeof v === "string" ? quote(v) : v))}`);
