import {alloc} from "../../../utils/buf";
import * as dex from "../../dex";
import {ReadonlyBattleState} from "../BattleState";
import {map} from "./Encoder";
import {
    abilityEncoder,
    allItemEncoder,
    basicEncoder,
    movesetEncoder,
    PokemonArgs,
    roomStatusEncoder,
    speciesEncoder,
    statTableEncoder,
    teamStatusEncoder,
    typesEncoder,
    volatileStatusEncoder,
} from "./encoders";
import {
    flattenedInputShapes,
    modelInputNames,
    numActive,
    numTeams,
    numPokemon,
    totalInputSize,
} from "./shapes";

/**
 * Allocates {@link Float32Array}s suitable for {@link encodeState} as inputs to
 * the model.
 *
 * @param mode If `"shared"`, uses a {@link SharedArrayBuffer} internally. If
 * `"unsafe"`, uses a plain {@link Buffer} but without zeroing the contents so
 * it may contain unsafe data. If unspecified then just allocates normally with
 * zeroed contents.
 * @returns An array of {@link Float32Array}s of the given size and mode, along
 * with the original underlying buffer.
 * @see {@link flattenedInputShapes} for the array sizes.
 * @see {@link encodeState} to fill the arrays with encoded data.
 */
export function allocEncodedState(mode?: "shared" | "unsafe"): {
    data: Float32Array[];
    original: Float32Array;
} {
    const data: Float32Array[] = [];
    const original = alloc(totalInputSize, mode);
    let offset = 0;
    for (const size of flattenedInputShapes) {
        const newOffset = offset + size;
        data.push(original.subarray(offset, newOffset));
        offset = newOffset;
    }
    return {data, original};
}

// Factored-out encoders for multiple encodeState() calls.
const teamStatusEncoders = map(numTeams, teamStatusEncoder);
const volatileStatusEncoders = map(numTeams, volatileStatusEncoder);
const pokemonBasicEncoders = map(numTeams, map(numPokemon, basicEncoder));
const pokemonSpeciesEncoders = map(
    numTeams,
    map(numPokemon + numActive, speciesEncoder),
);
const pokemonTypesEncoders = map(
    numTeams,
    map(numPokemon + numActive, typesEncoder),
);
const pokemonStatTableEncoders = map(
    numTeams,
    map(numPokemon + numActive, statTableEncoder),
);
const pokemonAbilityEncoders = map(
    numTeams,
    map(numPokemon + numActive, abilityEncoder),
);
const pokemonItemEncoders = map(numTeams, map(numPokemon, allItemEncoder));
const pokemonMovesetEncoders = map(
    numTeams,
    map(numPokemon + numActive, movesetEncoder),
);

/**
 * Encodes battle state data into a set of arrays suitable for feeding into the
 * model.
 *
 * @param data Arrays to fill with encoded data.
 * @param state Battle state to encode.
 * @see {@link allocEncodedState} to allocate the arrays.
 */
export function encodeState(
    data: Float32Array[],
    state: ReadonlyBattleState,
): void {
    if (data.length !== modelInputNames.length) {
        throw new Error(
            `Expected ${modelInputNames.length} inputs but got ${data.length}`,
        );
    }

    if (!state.ourSide) {
        throw new Error("state.ourSide is undefined");
    }
    const us = state.getTeam(state.ourSide);
    const them = state.getTeam(state.ourSide === "p1" ? "p2" : "p1");
    const teams = [us, them];

    const pokemon = teams.map(team =>
        Array.from<unknown, PokemonArgs>(
            {length: numPokemon},
            (_, i) =>
                // Treat fainted mons as nonexistent since they're permanently
                // removed from the game.
                team.pokemon[i] &&
                (team.pokemon[i]!.hp.current <= 0
                    ? undefined
                    : team.pokemon[i]!),
        ),
    );
    const actives = teams.map(t => t.active);

    for (let i = 0; i < modelInputNames.length; ++i) {
        const arr = data[i];
        // Use ordering of input names to determine where to write encoded state
        // data.
        const name = modelInputNames[i];

        switch (name) {
            case "room_status":
                roomStatusEncoder.encode(arr, state.status);
                break;
            case "team_status":
                teamStatusEncoders.encode(
                    arr,
                    teams.map(t => t.status),
                );
                break;
            case "volatile":
                volatileStatusEncoders.encode(
                    arr,
                    actives.map(p => p.volatile),
                );
                break;
            case "basic":
                pokemonBasicEncoders.encode(arr, pokemon);
                break;
            case "species":
                pokemonSpeciesEncoders.encode(
                    arr,
                    pokemon.map((a, j) => [
                        // Include active pokemon's override traits.
                        actives[j].hp.current > 0
                            ? actives[j].species
                            : undefined,
                        // Note: Don't use optional chain (?.) operator since
                        // that turns null into undefined, which has a different
                        // meaning in this context.
                        // eslint-disable-next-line @typescript-eslint/prefer-optional-chain
                        ...a.map(p => p && p.baseSpecies),
                    ]),
                );
                break;
            case "types":
                pokemonTypesEncoders.encode(
                    arr,
                    pokemon.map((a, j) => [
                        actives[j].hp.current > 0
                            ? actives[j].types
                            : undefined,
                        // eslint-disable-next-line @typescript-eslint/prefer-optional-chain
                        ...a.map(p => p && p.baseTypes),
                    ]),
                );
                break;
            case "stats":
                pokemonStatTableEncoders.encode(
                    arr,
                    pokemon.map((a, j) => [
                        actives[j].hp.current > 0
                            ? actives[j].stats
                            : undefined,
                        // eslint-disable-next-line @typescript-eslint/prefer-optional-chain
                        ...a.map(p => p && p.baseStats),
                    ]),
                );
                break;
            case "ability":
                pokemonAbilityEncoders.encode(
                    arr,
                    pokemon.map((a, j) => [
                        actives[j].hp.current > 0
                            ? actives[j].ability
                                ? [actives[j].ability]
                                : dex.pokemon[actives[j].species].abilities
                            : undefined,
                        ...a.map(
                            p =>
                                p &&
                                (p.baseAbility
                                    ? [p.baseAbility]
                                    : dex.pokemon[p.baseSpecies].abilities),
                        ),
                    ]),
                );
                break;
            case "item":
                pokemonItemEncoders.encode(
                    arr,
                    pokemon.map(a =>
                        // eslint-disable-next-line @typescript-eslint/prefer-optional-chain
                        a.map(p => [p && p.item, p && p.lastItem]),
                    ),
                );
                break;
            case "moves":
                pokemonMovesetEncoders.encode(
                    arr,
                    pokemon.map((a, j) => [
                        actives[j].hp.current > 0
                            ? {
                                  moveset: actives[j].moveset,
                                  volatile: actives[j].volatile,
                              }
                            : undefined,
                        ...a.map(
                            p =>
                                p && {
                                    moveset: p.baseMoveset,
                                    volatile: null,
                                },
                        ),
                    ]),
                );
                break;
            default:
                throw new Error(`Unknown input name '${name}'`);
        }
    }
}
