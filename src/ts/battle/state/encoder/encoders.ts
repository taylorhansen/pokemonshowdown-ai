/** @file Formats BattleState objects into data usable by the neural network. */
import * as dex from "../../dex";
import {ReadonlyHp} from "../Hp";
import {ReadonlyMajorStatusCounter} from "../MajorStatusCounter";
import {ReadonlyMove} from "../Move";
import {Moveset, ReadonlyMoveset} from "../Moveset";
import {ReadonlyMultiTempStatus} from "../MultiTempStatus";
import {ReadonlyPokemon} from "../Pokemon";
import {ReadonlyRoomStatus} from "../RoomStatus";
import {ReadonlyStatRange, StatRange} from "../StatRange";
import {ReadonlyStatTable} from "../StatTable";
import {ReadonlyTeamStatus} from "../TeamStatus";
import {ReadonlyTempStatus} from "../TempStatus";
import {ReadonlyVolatileStatus} from "../VolatileStatus";
import {augment, concat, Encoder, map, nullable, optional} from "./Encoder";
import {
    booleanEncoder,
    checkLength,
    fillEncoder,
    limitedStatusTurns,
    numberEncoder,
    oneHotEncoder,
    zeroEncoder,
} from "./helpers";

//#region Helper encoders.

/** Encoder for an unknown key with a set of possible values. */
export function unknownKeyEncoder(
    domain: readonly string[],
): Encoder<readonly string[]> {
    return {
        encode(arr, possible) {
            checkLength(arr, this.size);

            const x = 1 / possible.length;
            for (let i = 0; i < this.size; ++i) {
                arr[i] = possible.includes(domain[i]) ? x : 0;
            }
        },
        size: domain.length,
    };
}

/** Encodes temporary status info. */
export const tempStatusEncoder: Encoder<ReadonlyTempStatus> = {
    encode(arr, ts) {
        checkLength(arr, 1);
        arr[0] = tempStatusEncoderImpl(ts);
    },
    size: 1,
};

/** Encodes TempStatus data into a number. */
function tempStatusEncoderImpl(ts: ReadonlyTempStatus): number {
    return limitedStatusTurns(ts.turns + +ts.isActive, ts.duration);
}

/**
 * Creates an Encoder for a MultiTempStatus.
 *
 * @param keys Status types to encode.
 */
export function multiTempStatusEncoder<TStatusType extends string>(
    keys: readonly TStatusType[],
): Encoder<ReadonlyMultiTempStatus<TStatusType>> {
    const size = keys.length;
    return {
        encode(arr, mts) {
            checkLength(arr, size);

            // One-hot encode status type, with the 1 also encoding the amount
            // of turns left.
            for (let i = 0; i < keys.length; ++i) {
                arr[i] =
                    keys[i] === mts.type
                        ? mts.infinite
                            ? 1
                            : limitedStatusTurns(mts.turns + 1, mts.duration)
                        : 0;
            }
        },
        size,
    };
}

//#endregion

//#region Field/team statuses.

/** Encoder for a RoomStatus. */
export const roomStatusEncoder: Encoder<ReadonlyRoomStatus> = concat(
    augment(rs => rs.gravity, tempStatusEncoder),
    augment(rs => rs.trickroom, tempStatusEncoder),
    augment(rs => rs.weather, multiTempStatusEncoder(dex.weatherKeys)),
);

/** Encoder for a {@link TeamStatus}. */
export const teamStatusEncoder: Encoder<ReadonlyTeamStatus> = concat(
    ...dex.futureMoveKeys.map(fm =>
        augment(
            (ts: ReadonlyTeamStatus) => ts.futureMoves[fm],
            tempStatusEncoder,
        ),
    ),
    augment(ts => ts.healingwish, booleanEncoder),
    augment(ts => ts.lightscreen, tempStatusEncoder),
    augment(ts => ts.luckychant, tempStatusEncoder),
    augment(ts => ts.lunardance, booleanEncoder),
    augment(ts => ts.mist, tempStatusEncoder),
    augment(ts => ts.reflect, tempStatusEncoder),
    augment(ts => ts.safeguard, tempStatusEncoder),
    augment(ts => !!ts.selfSwitch, booleanEncoder),
    augment(ts => ts.selfSwitch === "copyvolatile", booleanEncoder),
    augment(ts => ts.spikes / 3, numberEncoder),
    augment(ts => ts.stealthrock, numberEncoder),
    augment(ts => ts.toxicspikes / 2, numberEncoder),
    augment(ts => ts.tailwind, tempStatusEncoder),
    augment(ts => ts.wish, tempStatusEncoder),
);

//#endregion

//#region Team Pokemon traits/statuses.

/** Team pokemon args. */
export type PokemonArgs = ReadonlyPokemon | null | undefined;

//#region Alive boolean.

export const aliveEncoder: Encoder<PokemonArgs> = {
    encode(data, args) {
        checkLength(data, this.size);
        if (args === undefined) {
            data[0] = 0;
        } else if (args === null) {
            data[0] = 1;
        } else {
            data[0] = args.hp.current > 0 ? 1 : 0;
        }
    },
    size: 1,
};

//#endregion

//#region Basic Pokemon traits/statuses.

/** Encoder for an Hp object. */
export const hpEncoder: Encoder<ReadonlyHp> = augment(
    // Note: Since hp stat ranges are already encoded in the pokemon traits,
    // just give the current/max hp ratio.
    hp => (hp.max === 0 ? 0 : hp.current / hp.max),
    numberEncoder,
);

/** Encoder for an unknown Hp object. */
export const unknownHpEncoder: Encoder<null> = fillEncoder(1 /*full hp*/, 1);

/** Encoder for a nonexistent Hp object. */
export const emptyHpEncoder: Encoder<undefined> = zeroEncoder(1);

/** Encoder for a defined MajorStatusCounter. */
export const definedMajorStatusCounterEncoder: Encoder<ReadonlyMajorStatusCounter> =
    augment(
        msc => ({
            id: msc.current && dex.majorStatuses[msc.current],
            one:
                msc.current === "tox"
                    ? // %hp taken by toxic damage next turn, capped at 15/16.
                      // Note: Damage is actually turns * max(1, floor(hp/16)).
                      Math.min(15 / 16, msc.turns / 16)
                    : msc.current === "slp"
                    ? // Chance of staying asleep.
                      limitedStatusTurns(msc.turns, msc.duration!)
                    : // Irrelevant.
                      1,
        }),
        oneHotEncoder(dex.majorStatusKeys.length),
    );

/** Encoder for an unknown MajorStatusCounter. */
export const unknownMajorStatusCounterEncoder: Encoder<null> = zeroEncoder(
    definedMajorStatusCounterEncoder.size,
);

/** Encoder for a nonexistent MajorStatusCounter. */
export const emptyMajorStatusCounterEncoder: Encoder<undefined> = zeroEncoder(
    definedMajorStatusCounterEncoder.size,
);

/** Encoder for a defined Pokemon's basic traits/statuses. */
export const definedBasicEncoder: Encoder<ReadonlyPokemon> = concat(
    augment(p => p.gender === "M", booleanEncoder),
    augment(p => p.gender === "F", booleanEncoder),
    augment(p => p.gender === null, booleanEncoder),
    augment(p => (p.happiness ?? /*guess*/ 255) / 255, numberEncoder),
    augment(p => p.hp, hpEncoder),
    augment(p => p.majorStatus, definedMajorStatusCounterEncoder),
);

/** Encoder for an unknown Pokemon's basic traits/statuses. */
export const unknownBasicEncoder: Encoder<null> = concat(
    fillEncoder(1 / 3, 3), // Gender possibilities.
    fillEncoder(1, 1), // Happiness (guess 255).
    unknownHpEncoder,
    unknownMajorStatusCounterEncoder,
);

/** Encoder for a nonexistent Pokemon's basic traits/statuses. */
export const emptyBasicEncoder: Encoder<undefined> = concat(
    zeroEncoder(4), // Gender + happiness.
    emptyHpEncoder,
    emptyMajorStatusCounterEncoder,
);

/** Encoder for a Pokemon's basic traits/statuses. */
export const basicEncoder: Encoder<PokemonArgs> = optional(
    definedBasicEncoder,
    unknownBasicEncoder,
    emptyBasicEncoder,
);

//#endregion

//#region Volatile status.

/** Encoder for a VolatileStatus, excluding override traits. */
export const volatileStatusEncoder: Encoder<ReadonlyVolatileStatus> = concat(
    // Passable.
    augment(vs => vs.aquaring, booleanEncoder),
    {
        encode(arr, vs: ReadonlyVolatileStatus) {
            checkLength(arr, dex.boostKeys.length);
            for (let i = 0; i < dex.boostKeys.length; ++i) {
                arr[i] = vs.boosts[dex.boostKeys[i]] / 6;
            }
        },
        size: dex.boostKeys.length,
    },
    augment(vs => vs.confusion, tempStatusEncoder),
    augment(vs => vs.curse, booleanEncoder),
    augment(vs => vs.embargo, tempStatusEncoder),
    augment(vs => vs.focusenergy, booleanEncoder),
    augment(vs => vs.ingrain, booleanEncoder),
    augment(vs => vs.leechseed, booleanEncoder),
    augment(
        vs => vs.lockedOnBy?.lockOnTurns,
        nullable(tempStatusEncoder, zeroEncoder(tempStatusEncoder.size)),
    ),
    augment(vs => vs.lockOnTurns, tempStatusEncoder),
    augment(vs => vs.magnetrise, tempStatusEncoder),
    augment(vs => vs.nightmare, booleanEncoder),
    augment(
        vs => (vs.perish <= 0 ? 0 : limitedStatusTurns(vs.perish, 3)),
        numberEncoder,
    ),
    augment(vs => vs.powertrick, booleanEncoder),
    augment(vs => vs.substitute, booleanEncoder),
    augment(vs => vs.suppressAbility, booleanEncoder),
    augment(vs => !!vs.trapped, booleanEncoder),
    augment(vs => !!vs.trapping, booleanEncoder),

    // Semi-passable.
    // Note: The lastMove field is handled by the individual move encoders.

    // Note: Override traits are skipped.

    // Non-passable.
    augment(vs => vs.attract, booleanEncoder),
    augment(vs => vs.bide, tempStatusEncoder),
    augment(vs => vs.charge, tempStatusEncoder),
    augment(vs => vs.defensecurl, booleanEncoder),
    augment(vs => vs.destinybond, booleanEncoder),
    // Note: Disabled/encore move statuses are handled by the individual move
    // encoders.
    augment(vs => vs.flashfire, booleanEncoder),
    augment(vs => vs.focus, booleanEncoder),
    augment(vs => vs.grudge, booleanEncoder),
    augment(vs => vs.healblock, tempStatusEncoder),
    augment(vs => vs.identified === "foresight", booleanEncoder),
    augment(vs => vs.identified === "miracleeye", booleanEncoder),
    augment(vs => vs.imprison, booleanEncoder),
    augment(vs => vs.magiccoat, booleanEncoder),
    augment(vs => vs.micleberry, booleanEncoder),
    augment(vs => vs.minimize, booleanEncoder),
    augment(vs => vs.momentum, multiTempStatusEncoder(dex.momentumMoveKeys)),
    augment(vs => vs.mudsport, booleanEncoder),
    augment(vs => vs.mustRecharge, booleanEncoder),
    augment(vs => vs.rage, booleanEncoder),
    augment(vs => vs.rampage, multiTempStatusEncoder(dex.rampageMoveKeys)),
    augment(vs => vs.roost, booleanEncoder),
    augment(vs => vs.slowstart, tempStatusEncoder),
    augment(vs => vs.snatch, booleanEncoder),
    // Stall fail rate.
    // Note(gen4): Success rate halves each time a stalling move is used, capped
    // at min 12.5%.
    augment(vs => Math.min(0.875, 1 - 2 ** -vs.stallTurns), numberEncoder),
    augment(vs => vs.stockpile / 3, numberEncoder),
    augment(vs => vs.taunt, tempStatusEncoder),
    augment(vs => vs.torment, booleanEncoder),
    augment(vs => vs.transformed, booleanEncoder),
    augment(vs => vs.twoTurn, multiTempStatusEncoder(dex.twoTurnMoveKeys)),
    augment(vs => vs.uproar, tempStatusEncoder),
    augment(vs => vs.watersport, booleanEncoder),
    augment(vs => vs.willTruant, booleanEncoder),
    augment(vs => vs.yawn, tempStatusEncoder),
);

//#endregion

//#region Species.

/** Encoder for a defined Pokemon's species. */
export const definedSpeciesEncoder: Encoder<string> = augment(
    species => ({id: dex.pokemon[species].uid}),
    oneHotEncoder(dex.pokemonKeys.length),
);

/** Encoder for an unknown Pokemon's species. */
export const unknownSpeciesEncoder: Encoder<null> = fillEncoder(
    1 / dex.pokemonKeys.length,
    dex.pokemonKeys.length,
);

/** Encoder for a nonexistent Pokemon's species. */
export const emptySpeciesEncoder: Encoder<undefined> = zeroEncoder(
    dex.pokemonKeys.length,
);

/** Encoder for a Pokemon's species. */
export const speciesEncoder: Encoder<string | null | undefined> = optional(
    definedSpeciesEncoder,
    unknownSpeciesEncoder,
    emptySpeciesEncoder,
);

//#endregion

//#region Types.

/** Types without `???` type. */
export const filteredTypes = dex.typeKeys.filter(t => t !== "???") as Exclude<
    dex.Type,
    "???"
>[];

/** Encoder for a defined Pokemon's types. */
export const definedTypesEncoder: Encoder<readonly dex.Type[]> = {
    encode(arr, types) {
        checkLength(arr, this.size);
        for (let i = 0; i < this.size; ++i) {
            arr[i] = +types.includes(filteredTypes[i]);
        }
    },
    size: filteredTypes.length,
};

/** Encoder for an unknown Pokemon's types. */
export const unknownTypesEncoder: Encoder<null> = fillEncoder(
    // Note: Could be any one or two of these types (avg 1-2 types).
    1.5 / filteredTypes.length,
    filteredTypes.length,
);

/** Encoder for a nonexistent Pokemon's types. */
export const emptyTypesEncoder: Encoder<undefined> = zeroEncoder(
    filteredTypes.length,
);

/** Encoder for a Pokemon's types. */
export const typesEncoder: Encoder<readonly dex.Type[] | null | undefined> =
    optional(definedTypesEncoder, unknownTypesEncoder, emptyTypesEncoder);

//#endregion

//#region Stats.

/** Max possible base stat. */
export const maxBaseStat = 255;
/** Max possible normal stat. */
export const maxStat = StatRange.calcStat(
    false /*hp*/,
    maxBaseStat,
    100 /*level*/,
    252 /*ev*/,
    31 /*iv*/,
    1.1 /*nature*/,
);
/** Max possible hp stat. */
export const maxStatHp = StatRange.calcStat(
    true /*hp*/,
    maxBaseStat,
    100 /*level*/,
    252 /*ev*/,
    31 /*iv*/,
    1 /*nature*/,
);

/** Encoder for a defined StatRange. */
export const definedStatRangeEncoder: Encoder<ReadonlyStatRange> = {
    encode(arr, sr) {
        checkLength(arr, 3);
        // Normalize based on max possible stats.
        const reference = sr.hp ? maxStatHp : maxStat;
        arr[0] = sr.min / reference;
        arr[1] = sr.max / reference;
        arr[2] = sr.base / maxBaseStat;
    },
    size: 3,
};

/** Encoder for an unknown StatRange. */
export const unknownStatRangeEncoder: Encoder<null> =
    // Halve max stat as a guess.
    fillEncoder(0.5, definedStatRangeEncoder.size);

/** Encoder for a nonexistent StatRange. */
export const emptyStatRangeEncoder: Encoder<undefined> = zeroEncoder(
    definedStatRangeEncoder.size,
);

/** Encoder for a defined StatTable. */
export const definedStatTableEncoder: Encoder<ReadonlyStatTable> = concat(
    ...dex.statKeys.map(statName =>
        augment(
            (st: ReadonlyStatTable) => st[statName],
            definedStatRangeEncoder,
        ),
    ),
    augment(st => (st.level ?? 0) / 100, numberEncoder), // Level out of 100.
    augment(
        st => ({id: st.hpType ? dex.hpTypes[st.hpType] : null}),
        oneHotEncoder(dex.hpTypeKeys.length),
    ),
);

/** Encoder for an unknown StatTable. */
export const unknownStatTableEncoder: Encoder<null> = concat(
    ...Array.from(dex.statKeys, () => unknownStatRangeEncoder),
    fillEncoder(0.8, 1), // Level out of 100 (guess).
    fillEncoder(1 / dex.hpTypeKeys.length, dex.hpTypeKeys.length), // Hp type.
);

/** Encoder for a nonexistent StatTable. */
export const emptyStatTableEncoder: Encoder<undefined> = concat(
    ...Array.from(dex.statKeys, () => emptyStatRangeEncoder),
    zeroEncoder(1 + dex.hpTypeKeys.length), // No level + hp type possibilities.
);

/** Encoder for a StatTable. */
export const statTableEncoder: Encoder<ReadonlyStatTable | null | undefined> =
    optional(
        definedStatTableEncoder,
        unknownStatTableEncoder,
        emptyStatTableEncoder,
    );

//#endregion

//#region Ability.

/** Encoder for a defined Pokemon's ability. */
export const definedAbilityEncoder: Encoder<readonly string[]> =
    unknownKeyEncoder(dex.abilityKeys);

/** Encoder for an unknown Pokemon's ability. */
export const unknownAbilityEncoder: Encoder<null> = fillEncoder(
    1 / dex.abilityKeys.length,
    dex.abilityKeys.length,
);

/** Encoder for a nonexistent Pokemon's ability. */
export const emptyAbilityEncoder: Encoder<undefined> = zeroEncoder(
    dex.abilityKeys.length,
);

/** Encoder for a Pokemon's ability. */
export const abilityEncoder: Encoder<readonly string[] | null | undefined> =
    optional(definedAbilityEncoder, unknownAbilityEncoder, emptyAbilityEncoder);

//#endregion

//#region Item.

const itemKeysEncoder: Encoder<readonly string[]> = unknownKeyEncoder(
    dex.itemKeys,
);

/** Encoder for a defined Pokemon's item. */
export const definedItemEncoder: Encoder<string> = augment(
    item => (item ? [item] : []),
    itemKeysEncoder,
);

/** Encoder for an unknown Pokemon's item. */
export const unknownItemEncoder: Encoder<null> = augment(
    () => [],
    itemKeysEncoder,
);

/** Encoder for a nonexistent Pokemon's item. */
export const emptyItemEncoder: Encoder<undefined> = zeroEncoder(
    dex.itemKeys.length,
);

/** Encoder for a Pokemon's current held item. */
export const itemEncoder: Encoder<string | null | undefined> = optional(
    definedItemEncoder,
    unknownItemEncoder,
    emptyItemEncoder,
);

/** Encoder for an unknown Pokemon's last item. */
export const unknownLastItemEncoder: Encoder<null> = augment(
    () => ["none"],
    itemKeysEncoder,
);

/** Encoder for a Pokemon's last item. */
export const lastItemEncoder: Encoder<string | null | undefined> = optional(
    definedItemEncoder,
    unknownLastItemEncoder,
    emptyItemEncoder,
);

/** Encoder for both the current and last held item of a Pokemon. */
export const allItemEncoder: Encoder<
    [string | null | undefined, string | null | undefined]
> = concat(
    augment(([item]) => item, itemEncoder),
    augment(([, lastItem]) => lastItem, lastItemEncoder),
);

//#endregion

//#region Moves.

/** Args for {@link moveEncoder} to indicate that the Move is known. */
export interface KnownMoveArgs {
    /** Move to encode. */
    readonly move: ReadonlyMove;
    /**
     * Conveys move status information, e.g. disabled/encore. Null if inactive.
     */
    readonly volatile: ReadonlyVolatileStatus | null;
}

/** Max PP of any move. */
export const maxPossiblePp = Math.max(
    ...dex.moveKeys.map(m => dex.moves[m].pp[1]),
);

/** Encoder for an unknown Move's PP value. */
export const unknownPpEncoder: Encoder<unknown> = {
    encode(arr) {
        checkLength(arr, 2);
        arr[0] = 1; // Ratio of pp to maxpp.
        arr[1] = 0.5; // Ratio of maxpp to max possible pp (TODO: guess).
    },
    size: 2,
};

/** Encoder for a defined Pokemon's known Move. */
export const definedMoveEncoder: Encoder<KnownMoveArgs> = concat(
    augment(
        ({move: m}) => ({id: m.data.uid}),
        oneHotEncoder(dex.moveKeys.length),
    ),
    // Ratio of pp to maxpp.
    augment(({move: m}) => m.pp / m.maxpp, numberEncoder),
    // Ratio of maxpp to max possible pp.
    augment(({move: m}) => m.maxpp / maxPossiblePp, numberEncoder),
    // Disabled/encore move statuses.
    {
        encode(arr, {move: m, volatile: vs}) {
            checkLength(arr, 3);
            if (!vs) {
                arr.fill(0, 0, 3);
                return;
            }
            arr[0] =
                m.name === vs.disabled.move
                    ? tempStatusEncoderImpl(vs.disabled.ts)
                    : 0;
            arr[1] =
                m.name === vs.encore.move
                    ? tempStatusEncoderImpl(vs.encore.ts)
                    : 0;
            arr[2] = +(m.name === vs.lastMove);
        },
        size: 3,
    },
);

/** Args for {@link constrainedMoveEncoder}. */
export interface ConstrainedMoveArgs {
    readonly move: "constrained";
    /** Set of possible moves. */
    readonly constraint: ReadonlySet<string>;
}

/** Encoder for a defined Pokemon's unknown Move with a constraint. */
export const constrainedMoveEncoder: Encoder<ConstrainedMoveArgs> = concat(
    {
        encode(arr, {constraint}) {
            checkLength(arr, dex.moveKeys.length);
            // Encode constraint data.
            arr.fill(1 / constraint.size, 0, dex.moveKeys.length);
        },
        size: dex.moveKeys.length,
    } as Encoder<ConstrainedMoveArgs>,
    unknownPpEncoder,
    // Disabled/encore/lastMove.
    zeroEncoder(3),
);

/** Encoder for an unknown Pokemon's Move . */
export const unknownMoveEncoder: Encoder<null> = concat(
    // Assume each move is equally probable.
    fillEncoder(1 / dex.moveKeys.length, dex.moveKeys.length),
    unknownPpEncoder,
    // Disabled/encore/lastMove.
    zeroEncoder(3),
);

/** Encoder for a nonexistent Move. */
export const emptyMoveEncoder: Encoder<undefined> =
    // No likelihood for any move type + 0 pp/maxpp + disabled/encore/lastMove.
    zeroEncoder(dex.moveKeys.length + 5);

/** Args for {@link moveSlotEncoder}. */
export type MoveSlotArgs = KnownMoveArgs | ConstrainedMoveArgs | undefined;

/** Encoder for a Move slot within a Moveset. */
export const moveSlotEncoder: Encoder<MoveSlotArgs> = {
    encode(arr, args) {
        checkLength(arr, this.size);
        if (!args) {
            emptyMoveEncoder.encode(arr, args);
        } else if (args.move === "constrained") {
            constrainedMoveEncoder.encode(arr, args);
        } else {
            definedMoveEncoder.encode(arr, args);
        }
    },
    size: definedMoveEncoder.size,
};

/** Args for {@link definedMovesetEncoder}. */
export interface DefinedMovesetArgs {
    /** Move to encode. */
    readonly moveset: ReadonlyMoveset;
    /**
     * Conveys move status information, e.g. disabled/encore. Null if inactive.
     */
    readonly volatile: ReadonlyVolatileStatus | null;
}

/** Encoder for a defined Pokemon's Moveset. */
export const definedMovesetEncoder: Encoder<DefinedMovesetArgs> = augment(
    getMoveArgs,
    map(Moveset.maxSize, moveSlotEncoder),
);

/**
 * Gets data about every moveslot in the given Moveset.
 *
 * @param ms Moveset to extract from.
 * @returns An array of partially-encoded {@link moveEncoder} args.
 */
function getMoveArgs({
    moveset: ms,
    volatile,
}: DefinedMovesetArgs): MoveSlotArgs[] {
    const result: MoveSlotArgs[] = [];
    // Known.
    for (const move of ms.moves.values()) {
        result.push({move, volatile});
    }
    // Unknown.
    if (ms.moves.size < ms.size) {
        const constrainedArgs: ConstrainedMoveArgs = {
            move: "constrained",
            constraint: ms.constraint,
        };
        for (let i = ms.moves.size; i < ms.size; ++i) {
            result.push(constrainedArgs);
        }
    }
    // Empty.
    for (let i = ms.size; i < Moveset.maxSize; ++i) {
        result.push(undefined);
    }
    return result;
}

/** Encoder for an unknown Pokemon's Moveset. */
export const unknownMovesetEncoder: Encoder<null> = concat(
    ...Array.from({length: Moveset.maxSize}, () => unknownMoveEncoder),
);

/** Encoder for a nonexistent Pokemon's Moveset. */
export const emptyMovesetEncoder: Encoder<undefined> = concat(
    ...Array.from({length: Moveset.maxSize}, () => emptyMoveEncoder),
);

/** Encoder for a Pokemon's Moveset. */
export const movesetEncoder: Encoder<DefinedMovesetArgs | null | undefined> =
    optional(definedMovesetEncoder, unknownMovesetEncoder, emptyMovesetEncoder);

//#endregion

//#endregion
