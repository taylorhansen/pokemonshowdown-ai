import {
    flattenedInputShapes,
    modelInputNames,
} from "../../../../../train/model/shapes";
import {alloc} from "../../../../../util/buf";
import * as dex from "../../dex";
import {ReadonlyBattleState} from "../../state/BattleState";
import {ReadonlyTeam, Team} from "../../state/Team";
import {
    definedAbilityEncoder,
    definedMovesetEncoder,
    definedSpeciesEncoder,
    definedStatTableEncoder,
    definedTypesEncoder,
    pokemonAbilityEncoder,
    PokemonArgs,
    pokemonBasicEncoder,
    pokemonItemEncoder,
    pokemonLastItemEncoder,
    pokemonMovesetEncoder,
    pokemonSpeciesEncoder,
    pokemonStatTableEncoder,
    pokemonTypesEncoder,
    roomStatusEncoder,
    teamStatusEncoder,
    volatileStatusEncoder,
} from "./encoders";

/**
 * Allocates {@link Float32Array}s suitable for {@link encodeState} as inputs to
 * the model.
 *
 * @param mode If `"shared"`, uses a {@link SharedArrayBuffer} internally. If
 * `"unsafe"`, uses a plain {@link Buffer} but without zeroing the contents so
 * it may contain unsafe data. If unspecified then just allocates normally with
 * zeroed contents.
 * @returns An array of {@link Float32Array}s of the given size and mode.
 * @see {@link flattenedInputShapes} for the array sizes.
 * @see {@link encodeState} to fill the arrays with encoded data.
 */
export function allocEncodedState(mode?: "shared" | "unsafe"): Float32Array[] {
    return flattenedInputShapes.map(size => alloc(size, mode));
}

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

    const [usPokemon, themPokemon] = [us, them].map(team =>
        Array.from<unknown, PokemonArgs>(
            {length: Team.maxSize},
            (_, i) =>
                // Treat fainted mons as nonexistent since they're permanently
                // removed from the game.
                team.pokemon[i] &&
                (team.pokemon[i]!.hp.current <= 0
                    ? undefined
                    : team.pokemon[i]!),
        ),
    );

    for (let i = 0; i < modelInputNames.length; ++i) {
        const arr = data[i];
        // Use ordering of input names to determine where to write encoded state
        // data.
        const name = modelInputNames[i];

        if (name === "room") {
            roomStatusEncoder.encode(arr, state.status);
            continue;
        }

        let team: ReadonlyTeam;
        let partialName = name;
        if (name.startsWith("us/")) {
            team = us;
            partialName = name.substring("us/".length);
        } else if (name.startsWith("them/")) {
            team = them;
            partialName = name.substring("them/".length);
        } else {
            throw new Error(`Unknown input name: ${name}`);
        }

        if (partialName === "status") {
            teamStatusEncoder.encode(arr, team.status);
            continue;
        }

        if (partialName.startsWith("active/")) {
            partialName = partialName.substring("active/".length);
            const {active} = team;
            switch (partialName) {
                case "volatile":
                    volatileStatusEncoder.encode(arr, active.volatile);
                    break;
                case "species":
                    definedSpeciesEncoder.encode(arr, active.volatile.species);
                    break;
                case "types":
                    definedTypesEncoder.encode(arr, active.volatile.types);
                    break;
                case "stats":
                    // istanbul ignore next: Should never happen.
                    if (!active.volatile.stats) {
                        throw new Error(
                            "VolatileStatus' stat table not initialized",
                        );
                    }
                    definedStatTableEncoder.encode(arr, active.volatile.stats);
                    break;
                case "ability":
                    definedAbilityEncoder.encode(
                        arr,
                        active.volatile.ability
                            ? [active.volatile.ability]
                            : dex.pokemon[active.volatile.species].abilities,
                    );
                    break;
                case "moves":
                    definedMovesetEncoder.encode(arr, {
                        moveset: active.volatile.moveset,
                        volatile: active.volatile,
                    });
                    break;
                default:
                    throw new Error(`Unknown input name: ${name}`);
            }
            continue;
        }
        if (partialName.startsWith("pokemon/")) {
            partialName = partialName.substring("pokemon/".length);
            const pokemon = team === us ? usPokemon : themPokemon;
            switch (partialName) {
                case "basic":
                    pokemonBasicEncoder.encode(arr, pokemon);
                    break;
                case "species":
                    pokemonSpeciesEncoder.encode(arr, pokemon);
                    break;
                case "types":
                    pokemonTypesEncoder.encode(arr, pokemon);
                    break;
                case "stats":
                    pokemonStatTableEncoder.encode(arr, pokemon);
                    break;
                case "ability":
                    pokemonAbilityEncoder.encode(arr, pokemon);
                    break;
                case "item":
                    pokemonItemEncoder.encode(arr, pokemon);
                    break;
                case "last_item":
                    pokemonLastItemEncoder.encode(arr, pokemon);
                    break;
                case "moves":
                    pokemonMovesetEncoder.encode(arr, pokemon);
                    break;
                default:
                    throw new Error(`Unknown input name: ${name}`);
            }
            continue;
        }
        throw new Error(`Unknown input name: ${name}`);
    }
}
