import { dex, numFutureMoves, numTwoTurnMoves, twoTurnMoves } from
    "../battle/dex/dex";
import { BoostName, boostNames, hpTypes, MajorStatus, majorStatuses, numHPTypes,
    Type, types, WeatherType, weatherTypes } from "../battle/dex/dex-util";
import { BattleState } from "../battle/state/BattleState";
import { HP } from "../battle/state/HP";
import { Move } from "../battle/state/Move";
import { Moveset } from "../battle/state/Moveset";
import { Pokemon } from "../battle/state/Pokemon";
import { PossibilityClass } from "../battle/state/PossibilityClass";
import { RoomStatus } from "../battle/state/RoomStatus";
import { Team } from "../battle/state/Team";
import { TeamStatus } from "../battle/state/TeamStatus";
import { VolatileStatus } from "../battle/state/VolatileStatus";
import { Weather } from "../battle/state/Weather";

/**
 * One-hot encodes a class of values.
 * @param id 0-based integer to encode.
 * @param length Number of classes to encode.
 */
export function oneHot(id: number | null, length: number): number[]
{
    return Array.from({length}, (v, i) => i === id ? 1 : 0);
}

/**
 * Encodes the number of turns that a temporary status has persisted.
 * @param turns Number of turns.
 * @returns Status turn data for encoder functions as a "likelihood" that the
 * status will persist on the next turn.
 */
export function tempStatusTurns(turns: number): number
{
    return turns === 0 ? 0 : 1 / turns;
}

/**
 * Interpolates max status duration and current number of turns.
 * @param turns Number of turns the status has been active (including current
 * turn).
 * @param duration Maximum amount of turns the status can be active.
 * @returns Status turn data for encoder functions as a "likelihood" that the
 * status will persist on the next turn.
 */
export function limitedStatusTurns(turns: number, duration: number): number
{
    // turns left / total duration
    return Math.max(0, (duration - turns - 1) / duration);
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
export function encodePossiblityClass<TData>(pc: PossibilityClass<TData>,
    getId: (data: TData) => number, length: number): number[]
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

// TODO: guarantee order? move to dex-util once figured out
/** Types without `???` type. */
const filteredTypes = Object.keys(types).filter(t => t !== "???") as Type[];

/** Length of the return value of `encodeVolatileStatus()`. */
export const sizeVolatileStatus =
    /*boostable stats*/Object.keys(boostNames).length + /*confuse*/1 +
    /*embargo*/1 + /*ingrain*/1 + /*magnet rise*/1 + /*substitute*/1 +
    /*suppress ability*/1 + /*disabled moves*/4 + /*locked move*/1 +
    /*must recharge*/1 + /*override ability*/dex.numAbilities +
    /*override species*/dex.numPokemon +
    /*override types*/filteredTypes.length + /*roost*/1 +
    /*stall fail rate*/1 + /*taunt*/1 + /*two-turn status*/numTwoTurnMoves +
    /*will truant*/1;

/** Formats volatile status info into an array of numbers. */
export function encodeVolatileStatus(status: VolatileStatus): number[]
{
    // passable
    const boosts = (Object.keys(status.boosts) as BoostName[])
        .map(key => status.boosts[key]);
    const confused = tempStatusTurns(status.confuseTurns);
    const embargo = tempStatusTurns(status.embargoTurns);
    const ingrain = status.ingrain ? 1 : 0;
    const magnetRise = tempStatusTurns(status.magnetRiseTurns);
    const substitute = status.substitute ? 1 : 0;
    const suppressed = status.isAbilitySuppressed() ? 1 : 0;

    // non-passable
    const disabled = status.disableTurns.map(tempStatusTurns);
    const lockedMove = tempStatusTurns(status.lockedMoveTurns);
    const mustRecharge = status.mustRecharge ? 1 : 0;
    const overrideAbility = oneHot(status.overrideAbilityId, dex.numAbilities);
    const overrideSpecies = oneHot(status.overrideSpeciesId, dex.numPokemon);
    const overrideTypes = status.overrideTypes.concat(status.addedType);
    const overrideTypeData =
        filteredTypes.map(typeName => overrideTypes.includes(typeName) ? 1 : 0);
    const roost = status.roost ? 1 : 0;
    const stallFailRate = tempStatusTurns(status.stallTurns);
    const taunt = tempStatusTurns(status.tauntTurns);
    const twoTurn = oneHot(status.twoTurn ? twoTurnMoves[status.twoTurn] : null,
            numTwoTurnMoves);
    const willTruant = status.willTruant ? 1 : 0;

    return [
        ...boosts, confused, embargo, ingrain, magnetRise, substitute,
        suppressed, ...disabled, lockedMove, mustRecharge,
        ...overrideAbility, ...overrideSpecies, ...overrideTypeData,
        roost, stallFailRate, taunt, ...twoTurn, willTruant
    ];
}

/** Length of the return value of `encodeMove()`. */
export const sizeMove = dex.numMoves + /*pp and maxpp*/2;

/**
 * Formats move info into an array of numbers. Null means unknown, while
 * undefined means nonexistent.
 */
export function encodeMove(move?: Move | null): number[]
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
export const sizeMoveset = /*hiddenpower*/Object.keys(hpTypes).length +
    Moveset.maxSize * sizeMove;

/** Formats moveset info into an array of numbers. */
export function encodeMoveset(moveset?: Moveset | null): number[]
{
    if (moveset === null)
    {
        // unknown
        const hpTypeKeys = Object.keys(hpTypes);
        const move = encodeMove(null);
        return [
            ...hpTypeKeys.map(() => 1 / hpTypeKeys.length),
            ...([] as number[]).concat(
                ...Array.from({length: Moveset.maxSize}, () => move))
        ];
    }
    if (!moveset)
    {
        // nonexistent
        const move = encodeMove();
        return [
            ...Object.keys(hpTypes).map(() => -1),
            ...([] as number[]).concat(
                ...Array.from({length: Moveset.maxSize}, () => move))
        ];
    }
    return [
        ...encodePossiblityClass(moveset.hpType, i => i, numHPTypes),
        ...([] as number[]).concat(...moveset.moves.map(encodeMove))
    ];
}

/** Length of the return value of `encodeHP()`. */
export const sizeHP = 2;

/**
 * Formats hp info into an array of numbers. Null means unknown, while undefined
 * means nonexistent.
 */
export function encodeHP(hp?: HP | null): number[]
{
    if (hp === null) return [100, 100];
    if (!hp) return [-1, -1];
    // TODO: scale down based on max possible hp
    // also: how to handle hp.isPercent?
    return [hp.current, hp.max];
}

/** Length of the return value of `encodePokemon()` when inactive. */
export const sizePokemon = /*gender*/3 + dex.numPokemon + dex.numItems +
    dex.numAbilities + /*level*/1 + sizeMoveset + sizeHP + /*grounded*/2 +
    /*base type excluding ??? type*/Object.keys(types).length - 1 +
    /*majorStatus except empty*/Object.keys(majorStatuses).length - 1;

/** Length of the return value of `encodePokemon()` when active. */
export const sizeActivePokemon = sizePokemon + sizeVolatileStatus;

/**
 * Formats pokemon info into an array of numbers. Null means unknown, while
 * undefined means nonexistent.
 */
export function encodePokemon(mon?: Pokemon | null): number[]
{
    if (mon === null)
    {
        // unknown
        return [
            // gender
            1 / 3, 1 / 3, 1 / 3,
            // species, item, ability
            ...Array.from(
                {length: dex.numPokemon + dex.numItems + dex.numAbilities},
                () => 0),
            // level
            0,
            ...encodeMoveset(null), ...encodeHP(null),
            // grounded
            0.5, 0.5,
            ...filteredTypes.map(() => 1 / filteredTypes.length),
            ...Array.from(
                {length: Object.keys(majorStatuses).length - 1}, () => 0)
        ];
    }
    if (!mon)
    {
        // nonexistent
        return [
            // gender
            -1, -1, -1,
            // species, item, ability
            ...Array.from(
                {length: dex.numPokemon + dex.numItems + dex.numAbilities},
                () => -1),
            // level
            -1,
            ...encodeMoveset(), ...encodeHP(),
            // grounded
            -1, -1,
            ...filteredTypes.map(() => -1),
            ...Array.from(
                {length: Object.keys(majorStatuses).length - 1}, () => 0)
        ];
    }

    const a =
    [
        mon.gender === "M" ? 1 : 0, mon.gender === "F" ? 1 : 0,
        mon.gender === null ? 1 : 0,
        ...oneHot(mon.species.uid, dex.numPokemon),
        ...encodePossiblityClass(mon.item, d => d, dex.numItems),
        ...encodePossiblityClass(mon.baseAbility, d => d, dex.numAbilities),
        mon.level, ...encodeMoveset(mon.moveset), ...encodeHP(mon.hp),
        mon.isGrounded ? 1 : 0, mon.maybeGrounded ? 1 : 0,
        ...filteredTypes.map(type => mon.species.types.includes(type) ? 1 : 0),
        ...(Object.keys(majorStatuses) as MajorStatus[])
            // only include actual statuses, not the empty string
            .filter(status => status !== "")
            .map(status => mon.majorStatus === status ? 1 : 0)
    ];
    if (mon.active) a.push(...encodeVolatileStatus(mon.volatile));
    return a;
}

/** Length of the return value of `encodeTeamStatus()`. */
export const sizeTeamStatus = /*selfSwitch*/2 + /*wish*/1 +
    /*future moves*/numFutureMoves + /*entry hazards*/3;

/** Formats team status info into an array of numbers. */
export function encodeTeamStatus(status: TeamStatus): number[]
{
    return [
        status.selfSwitch ? 1 : 0, status.selfSwitch === "copyvolatile" ? 1 : 0,
        status.isWishing ? 1 : 0,
        // TODO: guarantee order of future move turn values
        ...Object.values(status.futureMoveTurns),
        // divide hazard level by their max levels
        // TODO: factor out into constants somewhere
        status.spikes / 3, status.stealthRock, status.toxicSpikes / 2
    ];
}

/** Length of the return value of `encodeTeam()`. */
export const sizeTeam = sizeActivePokemon + (Team.maxSize - 1) * sizePokemon +
    sizeTeamStatus;

/** Formats team info into an array of numbers. */
export function encodeTeam(team: Team): number[]
{
    return ([] as number[]).concat(...team.pokemon.map(encodePokemon),
        encodeTeamStatus(team.status));
}

/** Length of the return value of `encodeWeather()`. */
export const sizeWeather =
    // weather types excluding none
    Object.keys(weatherTypes).length - 1;

/** Formats weather info into an array of numbers. */
export function encodeWeather(weather: Weather): number[]
{
    // encode likelihood of the weather persisting for next turn
    // -1 = no, 0 = n/a, 1 = yes, in between = maybe
    let persistence: number;

    // weather not applicable
    if (weather.type === "none") persistence = 0;
    // infinite duration
    else if (weather.duration === null) persistence = 1;
    // 1 turn left
    else if (weather.duration - weather.turns === 1)
    {
        // possibly no, but could have a weather rock
        // TODO: scale by likelihood that it has the item
        if (weather.duration === 5 && weather.source && !weather.source.item)
        {
            persistence = -0.5;
        }
        else persistence = -1;
    }
    // could have weather rock so take average of both durations
    // TODO: interpolate instead by likelihood that it has the item
    else if (weather.duration === 5 && weather.source && !weather.source.item)
    {
        persistence = limitedStatusTurns(weather.turns, 6.5);
    }
    else persistence = limitedStatusTurns(weather.turns, weather.duration);

    // one-hot encode weather type, inserting the persistence value as the "one"
    return (Object.keys(weatherTypes) as WeatherType[])
        // no weather is the default so doesn't need to be included here
        .filter(t => t !== "none")
        .map(t => t === weather.type ? persistence : 0);
}

/** Length of the return value of `encodeRoomStatus()`. */
export const sizeRoomStatus = /*gravity*/1 + sizeWeather;

/** Formats room status info into an array of numbers. */
export function encodeRoomStatus(status: RoomStatus): number[]
{
    return [
        tempStatusTurns(status.gravityTurns), ...encodeWeather(status.weather)
    ];
}

/** Length of the return value of `encodeBattleState()`. */
export const sizeBattleState = sizeRoomStatus + 2 * sizeTeam;

/**
 * Formats all battle info into an array of numbers suitable for a neural
 * network managed by a `Network` object. As the `BattleState` changes, the
 * length of this array should always be of length `sizeBattleState`.
 */
export function encodeBattleState(state: BattleState): number[]
{
    return [
        ...encodeRoomStatus(state.status), ...encodeTeam(state.teams.us),
        ...encodeTeam(state.teams.them)
    ];
}
