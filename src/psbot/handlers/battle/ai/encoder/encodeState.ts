import {
    flattenedInputShapes,
    modelInputNames,
    numTeams,
    teamSize,
} from "../../../../../train/model/shapes";
import {alloc} from "../../../../../util/buf";
import * as dex from "../../dex";
import {ReadonlyBattleState} from "../../state/BattleState";
import {map} from "./Encoder";
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

// Factored-out encoders for multiple encodeState() calls.
const teamStatusEncoders = map(numTeams, teamStatusEncoder);
const volatileStatusEncoders = map(numTeams, volatileStatusEncoder);
const definedSpeciesEncoders = map(numTeams, definedSpeciesEncoder);
const definedTypesEncoders = map(numTeams, definedTypesEncoder);
const definedStatTableEncoders = map(numTeams, definedStatTableEncoder);
const definedAbilityEncoders = map(numTeams, definedAbilityEncoder);
const definedMovesetEncoders = map(numTeams, definedMovesetEncoder);
const pokemonBasicEncoders = map(numTeams, pokemonBasicEncoder);
const pokemonSpeciesEncoders = map(numTeams, pokemonSpeciesEncoder);
const pokemonTypesEncoders = map(numTeams, pokemonTypesEncoder);
const pokemonStatTableEncoders = map(numTeams, pokemonStatTableEncoder);
const pokemonAbilityEncoders = map(numTeams, pokemonAbilityEncoder);
const pokemonItemEncoders = map(numTeams, pokemonItemEncoder);
const pokemonLastItemEncoders = map(numTeams, pokemonLastItemEncoder);
const pokemonMovesetEncoders = map(numTeams, pokemonMovesetEncoder);

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

    const teamPokemon = teams.map(team =>
        Array.from<unknown, PokemonArgs>(
            {length: teamSize},
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

        let partialName: string;
        if (name.startsWith("team/")) {
            partialName = name.slice("team/".length);
        } else {
            throw new Error(`Unknown input name: ${name}`);
        }

        if (partialName === "status") {
            teamStatusEncoders.encode(
                arr,
                teams.map(t => t.status),
            );
            continue;
        }

        if (partialName.startsWith("active/")) {
            partialName = partialName.substring("active/".length);
            const actives = teams.map(t => t.active);
            switch (partialName) {
                case "volatile":
                    volatileStatusEncoders.encode(
                        arr,
                        actives.map(p => p.volatile),
                    );
                    break;
                case "species":
                    definedSpeciesEncoders.encode(
                        arr,
                        actives.map(p => p.volatile.species),
                    );
                    break;
                case "types":
                    definedTypesEncoders.encode(
                        arr,
                        actives.map(p => p.volatile.types),
                    );
                    break;
                case "stats":
                    definedStatTableEncoders.encode(
                        arr,
                        actives.map(p => {
                            // istanbul ignore next: Should never happen.
                            if (!p.volatile.stats) {
                                throw new Error(
                                    "VolatileStatus' stat table not " +
                                        "initialized",
                                );
                            }
                            return p.volatile.stats;
                        }),
                    );
                    break;
                case "ability":
                    definedAbilityEncoders.encode(
                        arr,
                        actives.map(p =>
                            p.volatile.ability
                                ? [p.volatile.ability]
                                : dex.pokemon[p.volatile.species].abilities,
                        ),
                    );
                    break;
                case "moves":
                    definedMovesetEncoders.encode(
                        arr,
                        actives.map(p => ({
                            moveset: p.volatile.moveset,
                            volatile: p.volatile,
                        })),
                    );
                    break;
                default:
                    throw new Error(`Unknown input name: ${name}`);
            }
            continue;
        }
        if (partialName.startsWith("pokemon/")) {
            partialName = partialName.substring("pokemon/".length);
            switch (partialName) {
                case "basic":
                    pokemonBasicEncoders.encode(arr, teamPokemon);
                    break;
                case "species":
                    pokemonSpeciesEncoders.encode(arr, teamPokemon);
                    break;
                case "types":
                    pokemonTypesEncoders.encode(arr, teamPokemon);
                    break;
                case "stats":
                    pokemonStatTableEncoders.encode(arr, teamPokemon);
                    break;
                case "ability":
                    pokemonAbilityEncoders.encode(arr, teamPokemon);
                    break;
                case "item":
                    pokemonItemEncoders.encode(arr, teamPokemon);
                    break;
                case "last_item":
                    pokemonLastItemEncoders.encode(arr, teamPokemon);
                    break;
                case "moves":
                    pokemonMovesetEncoders.encode(arr, teamPokemon);
                    break;
                default:
                    throw new Error(`Unknown input name: ${name}`);
            }
            continue;
        }
        throw new Error(`Unknown input name: ${name}`);
    }
}
