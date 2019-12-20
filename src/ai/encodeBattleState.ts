import { dex, numFutureMoves, numLockedMoves, numTwoTurnMoves } from
    "../battle/dex/dex";
import { BoostName, boostNames, hpTypes, majorStatuses, numHPTypes,
    rolloutMoves, Type, types, weatherItems } from "../battle/dex/dex-util";
import { ReadonlyBattleState } from "../battle/state/BattleState";
import { ReadonlyHP } from "../battle/state/HP";
import { ReadonlyItemTempStatus } from "../battle/state/ItemTempStatus";
import { ReadonlyMajorStatusCounter } from "../battle/state/MajorStatusCounter";
import { ReadonlyMove } from "../battle/state/Move";
import { Moveset, ReadonlyMoveset } from "../battle/state/Moveset";
import { ReadonlyPokemon } from "../battle/state/Pokemon";
import { ReadonlyPokemonTraits } from "../battle/state/PokemonTraits";
import { ReadonlyPossibilityClass } from "../battle/state/PossibilityClass";
import { ReadonlyRoomStatus } from "../battle/state/RoomStatus";
import { ReadonlyStatRange, StatRange } from "../battle/state/StatRange";
import { ReadonlyStatTable } from "../battle/state/StatTable";
import { ReadonlyTeam, Team } from "../battle/state/Team";
import { ReadonlyTeamStatus } from "../battle/state/TeamStatus";
import { ReadonlyTempStatus } from "../battle/state/TempStatus";
import { ReadonlyVariableTempStatus } from "../battle/state/VariableTempStatus";
import { ReadonlyVolatileStatus } from "../battle/state/VolatileStatus";

/**
 * One-hot encodes a class of values.
 * @param id 0-based integer to encode.
 * @param length Number of classes to encode.
 * @param one Value to use for the one. Default `1`.
 * @param zero Value to use for the zero. Default `0`.
 */
export function oneHot(id: number | null, length: number, one = 1, zero = 0):
    number[]
{
    return Array.from({length}, (v, i) => i === id ? one : zero);
}

/**
 * Interpolates max status duration and current number of turns. Use this when
 * the duration (or max possible duration) of a status is known.
 * @param turns Number of turns the status has been active (including current
 * turn). E.g. if the status started during this turn and the end of the current
 * turn hasn't been reached yet, `turns` should be 1, and should be incremented
 * at the end of each turn. Values higher than `duration` will return zero.
 * @param duration Maximum amount of turns the status will last. Should be the
 * maximum value of `turns`.
 * @returns Status turn data for encoder functions as a "likelihood" that the
 * status will persist on the next turn.
 */
export function limitedStatusTurns(turns: number, duration: number): number
{
    // turns left excluding current turn / total expected duration
    return Math.max(0, (duration - turns + 1) / duration);
}

/**
 * Formats possibility class info into an array of numbers. The returned array
 * will have a length corresponding to the number of keys in the given object's
 * mapping.
 * @param pc PossibilityClass to encode.
 * @param getId Extracts a unique oneHot index from TData.
 * @param length Total length of returned array. Should be the max value of one
 * plus the return value of `getId`.
 */
export function encodePossiblityClass<TData>(
    pc: ReadonlyPossibilityClass<TData>, getId: (data: TData) => number,
    length: number): number[]
{
    const size = pc.possibleValues.size;
    const result = Array.from({length}, () => 0);
    if (size > 0)
    {
        const sumReciprocal = 1 / size;
        for (const value of pc.possibleValues)
        {
            result[getId(pc.map[value])] = sumReciprocal;
        }
    }
    return result;
}

/** Length of the return value of `encodeTempStatus()`. */
export const sizeTempStatus = 1;

/** Formats temporary status info into an array of numbers. */
export function encodeTempStatus(ts: ReadonlyTempStatus): number[]
{
    return [limitedStatusTurns(ts.turns, ts.duration)];
}

/**
 * Formats temporary status info into an array of numbers. Length is the number
 * of different types that can occupy this object plus one.
 */
export function encodeItemTempStatus<TStatusType extends string>(
    its: ReadonlyItemTempStatus<TStatusType>): number[]
{
    // modify one-hot value to interpolate status turns/duration
    let one: number;
    if (its.type === "none") one = 0; // not applicable
    else if (its.duration === null) one = 1; // infinite duration
    else if (its.duration === its.durations[0] && its.source &&
        !its.source.definiteValue)
    {
        // could have extension item so take average of both durations
        // TODO: interpolate instead by likelihood that the source has the item
        one = limitedStatusTurns(its.turns + 1,
            (its.durations[0] + its.durations[1]) / 2);
    }
    else one = limitedStatusTurns(its.turns + 1, its.duration);

    return [
        // TODO: guarantee order
        ...(Object.keys(its.items) as TStatusType[])
            .map(t => t === its.type ? one : 0),
        // indicate whether the extended duration is being used
        its.duration === its.durations[1] ? 1 : 0
    ];
}

/**
 * Formats temporary status info into an array of numbers. Length is the number
 * of different types that can occupy this object.
 */
export function encodeVariableTempStatus<TStatusType extends string>(
    vts: ReadonlyVariableTempStatus<TStatusType>): number[]
{
    // modify one-hot value to interpolate status turns/duration
    let one: number;
    if (vts.type === "none") one = 0; // not applicable
    else one = limitedStatusTurns(vts.turns + 1, vts.duration);

    // TODO: guarantee order?
    return (Object.keys(vts.map) as TStatusType[])
        .map(t => t === vts.type ? one : 0);
}

/** Length of the return value of `encodeStatRange()`. */
export const sizeStatRange = /*min*/1 + /*max*/1 + /*base*/1;

/** Max possible normal stat. */
const maxStat = StatRange.calcStat(/*hp*/false, 255, 100, 252, 31, 1.1);
/** Max possible hp stat. */
const maxStatHP = StatRange.calcStat(/*hp*/true, 255, 100, 252, 31, 1.1);

/** Formats stat range info into an array of numbers. */
export function encodeStatRange(stat: ReadonlyStatRange): number[];
/**
 * Formats stat range info into an array of numbers where the StatRange object
 * is unknown.
 * @param hp Whether this is an HP stat.
 */
export function encodeStatRange(stat: null, hp: boolean): number[];
/**
 * Formats stat range info into an array of numbers where the StatRange object
 * is nonexistent.
 */
export function encodeStatRange(stat?: undefined): number[];
export function encodeStatRange(stat?: ReadonlyStatRange | null,
    hp?: boolean): number[]
{
    const normal = hp || (stat && stat.hp) ? maxStatHP : maxStat;

    // average max stat as a guess
    if (stat === null) return [normal / 2, normal / 2, 127.5];
    if (!stat) return [-1, -1, -1];

    // normalize based on max possible stats
    return [
        (stat.min || normal / 2) / normal,
        (stat.max || normal / 2) / maxStat,
        (stat.base || 127.5) / 255
    ];
}

/** Length of the return value of `encodeStatTable()`. */
export const sizeStatTable = /*stat ranges*/6 * sizeStatRange + /*level*/1 +
    numHPTypes;

/**
 * Formats stat table info into an array of numbers. Null means unknown while
 * undefined means nonexistent.
 */
export function encodeStatTable(stats?: ReadonlyStatTable | null): number[]
{
    if (stats === null)
    {
        // unknown
        return [
            // stat ranges
            ...Array(6)
                .fill(encodeStatRange(null, /*hp*/true), 0, 1)
                .fill(encodeStatRange(null, /*hp*/false), 1, 6)
                .reduce((a, b) => a.concat(b)),
            0, // level (TODO: guess)
            ...hpTypeKeys.map(() => 1 / hpTypeKeys.length) // hp type
        ];
    }
    if (!stats)
    {
        // nonexistent
        return [
            // stat ranges
            ...Array(6)
                .fill(encodeStatRange(), 0, 6)
                .reduce((a, b) => a.concat(b)),
            -1, // level
            ...Array.from(hpTypeKeys, () => -1) // hp type
        ];
    }

    return [
        ...[stats.hp, stats.atk, stats.def, stats.spa, stats.spd, stats.spe]
            .map(encodeStatRange).reduce((a, b) => a.concat(b)),
        (stats.level || 0) / 100, // normalize level using max level (100)
        ...encodePossiblityClass(stats.hpType, i => i, numHPTypes)
    ];
}

// TODO: guarantee order? move to dex-util once figured out
/** Types without `???` type. */
const filteredTypes = Object.keys(types).filter(t => t !== "???") as Type[];

/** Length of the return value of `encodePokemonTraits()`. */
export const sizePokemonTraits = /*ability*/dex.numAbilities +
    /*species*/dex.numPokemon + /*stats*/sizeStatTable +
    /*types*/filteredTypes.length;

/**
 * Formats trait info into an array of numbers. Null means unknown while
 * undefined means nonexistent.
 */
export function encodePokemonTraits(traits?: null): number[];
/**
 * Formats trait info into an array of numbers.
 * @param traits Traits object.
 * @param addedType Optional third type.
 */
export function encodePokemonTraits(traits: ReadonlyPokemonTraits,
    addedType?: Type): number[];
export function encodePokemonTraits(traits?: ReadonlyPokemonTraits | null,
    addedType?: Type): number[]
{
    if (traits === null)
    {
        // unknown
        return [
            ...Array.from({length: dex.numAbilities + dex.numPokemon}, () => 0),
            ...encodeStatTable(null),
            // could be any one or two of these types (avg 1 and 2)
            ...filteredTypes.map(() => 1.5 / filteredTypes.length)
        ];
    }
    if (!traits)
    {
        // nonexistent
        return [
            ...Array.from({length: dex.numAbilities + dex.numPokemon},
                () => -1),
            ...encodeStatTable(), ...filteredTypes.map(() => -1)
        ];
    }

    return [
        ...encodePossiblityClass(traits.ability, d => d, dex.numAbilities),
        ...oneHot(traits.data.uid, dex.numPokemon),
        ...encodeStatTable(traits.stats),
        ...filteredTypes.map(type =>
            traits.types.includes(type) || type === addedType ? 1 : 0)
    ];
}

/** Length of the return value of `encodeVolatileStatus()`. */
export const sizeVolatileStatus =
    /*aqua ring*/1 + /*boostable stats*/Object.keys(boostNames).length +
    /*confusion*/sizeTempStatus + /*curse*/1 + /*embargo*/sizeTempStatus +
    /*focus energy*/1 + /*gastro acid*/1 + /*ingrain*/1 + /*leech seed*/1 +
    /*magnet rise*/sizeTempStatus + /*nightmare*/1 + /*perish*/1 +
    /*power trick*/1 + /*substitute*/1 + /*trapped*/1 + /*trapping*/1 +
    /*attract*/1 + /*bide*/sizeTempStatus + /*charge*/sizeTempStatus +
    /*defense curl*/1 + /*destiny bond*/1 +
    /*disabled moves*/(Moveset.maxSize * sizeTempStatus) + /*grudge*/1 +
    /*heal block*/sizeTempStatus + /*identified*/2 +
    /*locked move variants*/numLockedMoves + /*minimize*/1 + /*mud sport*/1 +
    /*must recharge*/1 + /*override traits*/sizePokemonTraits + /*rage*/1 +
    /*rollout*/Object.keys(rolloutMoves).length + /*roost*/1 +
    /*slow start*/sizeTempStatus + /*stall fail rate*/1 + /*stockpile*/1 +
    /*taunt*/sizeTempStatus + /*torment*/1 + /*transformed*/1 +
    /*two-turn*/numTwoTurnMoves + /*unburden*/1 + /*uproar*/sizeTempStatus +
    /*will truant*/1;

/** Formats volatile status info into an array of numbers. */
export function encodeVolatileStatus(status: ReadonlyVolatileStatus): number[]
{
    // passable
    const aquaRing = status.aquaRing ? 1 : 0;
    const boosts = (Object.keys(status.boosts) as BoostName[])
        .map(key => status.boosts[key]);
    const confused = encodeTempStatus(status.confusion);
    const curse = status.curse ? 1 : 0;
    const embargo = encodeTempStatus(status.embargo);
    const focusEnergy = status.focusEnergy ? 1 : 0;
    const gastroAcid = status.gastroAcid ? 1 : 0;
    const ingrain = status.ingrain ? 1 : 0;
    const leechSeed = status.leechSeed ? 1 : 0;
    const magnetRise = encodeTempStatus(status.magnetRise);
    const nightmare = status.nightmare ? 1 : 0;
    const perish = status.perish <= 0 ?
        0 : limitedStatusTurns(status.perish, 3);
    const powerTrick = status.powerTrick ? 1 : 0;
    const substitute = status.substitute ? 1 : 0;
    // TODO: be more specific with trapping info
    const trapped = status.trapped ? 1 : 0;
    const trapping = status.trapping ? 1 : 0;

    // non-passable
    const attract = status.attract ? 1 : 0;
    const bide = encodeTempStatus(status.bide);
    const charge = encodeTempStatus(status.charge);
    const defenseCurl = status.defenseCurl ? 1 : 0;
    const destinyBond = status.destinyBond ? 1 : 0;
    const disabled = status.disabledMoves.map(encodeTempStatus)
        .reduce((a, b) => a.concat(b));
    const grudge = status.grudge ? 1 : 0;
    const identified = ["foresight", "miracleeye"]
        .map(v => status.identified === v ? 1 : 0);
    const healBlock = encodeTempStatus(status.healBlock);
    const lockedMove = encodeVariableTempStatus(status.lockedMove);
    const minimize = status.minimize ? 1 : 0;
    const mudSport = status.mudSport ? 1 : 0;
    const mustRecharge = status.mustRecharge ? 1 : 0;
    const overrideTraits = encodePokemonTraits(status.overrideTraits,
        status.addedType);
    const rage = status.rage ? 1 : 0;
    const rollout = encodeVariableTempStatus(status.rollout);
    const roost = status.roost ? 1 : 0;
    const slowStart = encodeTempStatus(status.slowStart);
    // success rate halves each time a stalling move is used, capped at 12.5% in
    //  gen4
    const stallFailRate = Math.min(0.875, 1 - Math.pow(2, -status.stallTurns));
    const stockpile = status.stockpile / 3;
    const taunt = encodeTempStatus(status.taunt);
    const torment = status.torment ? 1 : 0;
    const transformed = status.transformed ? 1 : 0;
    const twoTurn = encodeVariableTempStatus(status.twoTurn);
    const unburden = status.unburden ? 1 : 0;
    const uproar = encodeTempStatus(status.uproar);
    const willTruant = status.willTruant ? 1 : 0;

    return [
        aquaRing, ...boosts, ...confused, curse, ...embargo, focusEnergy,
        gastroAcid, ingrain, leechSeed, ...magnetRise, nightmare, perish,
        powerTrick, substitute, trapped, trapping,

        attract, ...bide, ...charge, defenseCurl, destinyBond, ...disabled,
        grudge, ...identified, ...healBlock, ...lockedMove, minimize, mudSport,
        mustRecharge, ...overrideTraits, rage, ...rollout, roost, ...slowStart,
        stallFailRate, stockpile, ...taunt, torment, transformed, ...twoTurn,
        unburden, ...uproar, willTruant
    ];
}

/** Length of the return value of `encodeMajorStatusCounter()`. */
export const sizeMajorStatusCounter = Object.keys(majorStatuses).length;

/**
 * Formats major status info into an array of numbers. Null means unknown, while
 * undefined means nonexistent.
 */
export function encodeMajorStatusCounter(
    status?: ReadonlyMajorStatusCounter | null): number[]
{
    if (!status)
    {
        // both unrevealed and nonexistent can't have a major status
        return Array.from(Object.keys(majorStatuses), () => 0);
    }

    return oneHot(
        // convert to unique integer id or leave as null
        status.current && majorStatuses[status.current], sizeMajorStatusCounter,
        // %hp that will be taken away at the end of the next turn by toxic dmg
        status.current === "tox" ? Math.min(1, 0.0625 * status.turns)
        // chance of staying asleep
        : status.current === "slp" ?
            limitedStatusTurns(status.turns, status.duration!)
        // irrelevant
        : 1);
}

/** Length of the return value of `encodeMove()`. */
export const sizeMove = dex.numMoves + /*pp and maxpp*/2;

/**
 * Formats move info into an array of numbers. Null means unknown, while
 * undefined means nonexistent.
 */
export function encodeMove(move?: ReadonlyMove | null): number[]
{
    if (move === null)
    {
        // move exists but hasn't been revealed yet
        // TODO: use likelihood that a pokemon has a certain move/pp
        const v = 1 / dex.numMoves;
        return [...Array.from({length: dex.numMoves}, () => v), 32, 32];
    }
    // move doesn't exist
    if (!move) return [...Array.from({length: dex.numMoves}, () => 0), 0, 0];

    // TODO: normalize pp/maxpp
    return [...oneHot(move.id, dex.numMoves), move.pp, move.maxpp];
}

/** Length of the return value of `encodeMoveset()`. */
export const sizeMoveset = Moveset.maxSize * sizeMove;

/** Formats moveset info into an array of numbers. */
export function encodeMoveset(moveset?: ReadonlyMoveset | null): number[]
{
    if (moveset === null)
    {
        // unknown
        const move = encodeMove(null);
        return ([] as number[]).concat(
                ...Array.from({length: Moveset.maxSize}, () => move));
    }
    if (!moveset)
    {
        // nonexistent
        const move = encodeMove();
        return ([] as number[]).concat(
                ...Array.from({length: Moveset.maxSize}, () => move));
    }
    return ([] as number[]).concat(...moveset.moves.map(encodeMove));
}

/** Length of the return value of `encodeHP()`. */
export const sizeHP = 2;

/**
 * Formats hp info into an array of numbers. Null means unknown, while undefined
 * means nonexistent.
 */
export function encodeHP(hp?: ReadonlyHP | null): number[]
{
    if (hp === null) return [100, 100];
    if (!hp) return [-1, -1];
    // TODO: scale down based on max possible hp
    // also: how to handle hp.isPercent?
    return [hp.current, hp.max];
}

/** Length of the return value of `encodePokemon()` when inactive. */
export const sizePokemon = /*traits*/sizePokemonTraits +
    /*current+last item*/2 * dex.numItems + sizeMoveset + /*gender*/3 +
    /*happiness*/1 + sizeHP + sizeMajorStatusCounter + /*grounded*/2;

/** Length of the return value of `encodePokemon()` when active. */
export const sizeActivePokemon = sizePokemon + sizeVolatileStatus;

// TODO: guarantee order?
const hpTypeKeys = Object.keys(hpTypes);

/**
 * Formats pokemon info into an array of numbers. Null means unknown, while
 * undefined means nonexistent.
 */
export function encodePokemon(mon?: ReadonlyPokemon | null): number[]
{
    if (mon === null)
    {
        // unknown
        return [
            ...encodePokemonTraits(null),
            ...Array.from({length: 2 * dex.numItems}, () => 0), // item
            ...encodeMoveset(null),
            1 / 3, 1 / 3, 1 / 3, // gender
            127.5, // happiness
            ...encodeHP(null), ...encodeMajorStatusCounter(null),
            0.5, 0.5 // grounded
        ];
    }
    if (!mon)
    {
        // nonexistent
        return [
            ...encodePokemonTraits(),
            ...Array.from({length: 2 * dex.numItems}, () => -1), // item
            ...encodeMoveset(),
            -1, -1, -1, // gender
            -1, // happiness
            ...encodeHP(), ...encodeMajorStatusCounter(),
            -1, -1 // grounded
        ];
    }

    return [
        mon.gender === "M" ? 1 : 0, mon.gender === "F" ? 1 : 0,
        mon.gender === null ? 1 : 0,
        ...encodePokemonTraits(mon.baseTraits),
        ...encodePossiblityClass(mon.item, d => d, dex.numItems),
        ...encodePossiblityClass(mon.lastItem, d => d, dex.numItems),
        ...encodeMoveset(mon.moveset),
        // normalize happiness value
        (mon.happiness === null ? /*half*/127.5 : mon.happiness) / 255,
        ...encodeHP(mon.hp),
        mon.isGrounded ? 1 : 0, mon.maybeGrounded ? 1 : 0,
        ...encodeMajorStatusCounter(mon.majorStatus),
        ...(mon.active ? encodeVolatileStatus(mon.volatile) : [])
    ];
}

/** Length of the return value of `encodeTeamStatus()`. */
export const sizeTeamStatus = /*future moves*/numFutureMoves +
    /*healing wish*/1 + /*light screen*/2 + /*lunar dance*/1 + /*reflect*/2 +
    /*selfSwitch*/2 + /*entry hazards*/3 + /*tailwind*/sizeTempStatus +
    /*wish*/sizeTempStatus;

/** Formats team status info into an array of numbers. */
export function encodeTeamStatus(status: ReadonlyTeamStatus): number[]
{
    return [
        // TODO: guarantee order of future move turn values
        ...Object.values(status.futureMoves)
            .map(encodeTempStatus)
            .reduce((a, b) => a.concat(b), []),
        status.healingWish ? 1 : 0,
        ...encodeItemTempStatus(status.lightScreen),
        status.lunarDance ? 1 : 0,
        ...encodeItemTempStatus(status.reflect),
        status.selfSwitch ? 1 : 0, status.selfSwitch === "copyvolatile" ? 1 : 0,
        // divide hazard level by their max levels
        // TODO: factor out into constants somewhere
        status.spikes / 3, status.stealthRock, status.toxicSpikes / 2,
        ...encodeTempStatus(status.tailwind),
        ...encodeTempStatus(status.wish)
    ];
}

/** Length of the return value of `encodeTeam()`. */
export const sizeTeam = sizeActivePokemon + (Team.maxSize - 1) * sizePokemon +
    sizeTeamStatus;

/** Formats team info into an array of numbers. */
export function encodeTeam(team: ReadonlyTeam): number[]
{
    return ([] as number[]).concat(...team.pokemon.map(encodePokemon),
        encodeTeamStatus(team.status));
}

/** Length of the return value of `encodeRoomStatus()`. */
export const sizeRoomStatus = /*gravity*/sizeTempStatus +
    /*trickRoom*/sizeTempStatus +
    /*weather*/(Object.keys(weatherItems).length + 1);

/** Formats room status info into an array of numbers. */
export function encodeRoomStatus(status: ReadonlyRoomStatus): number[]
{
    return [
        ...encodeTempStatus(status.gravity),
        ...encodeTempStatus(status.trickRoom),
        ...encodeItemTempStatus(status.weather)
    ];
}

/** Length of the return value of `encodeReadonlyBattleState()`. */
export const sizeBattleState = sizeRoomStatus + 2 * sizeTeam;

/**
 * Formats all battle info into an array of numbers suitable for a neural
 * network managed by a `Network` object. As the battle state changes, the
 * length of this array should always be of length `sizeBattleState`.
 */
export function encodeBattleState(state: ReadonlyBattleState): number[]
{
    return [
        ...encodeRoomStatus(state.status), ...encodeTeam(state.teams.us),
        ...encodeTeam(state.teams.them)
    ];
}
