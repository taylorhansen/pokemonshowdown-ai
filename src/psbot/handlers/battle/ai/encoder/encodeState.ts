import {
    flattenedInputShapes,
    modelInputNames,
    numActive,
    numTeams,
    teamSize,
} from "../../../../../model/shapes";
import {alloc} from "../../../../../util/buf";
import * as dex from "../../dex";
import {ReadonlyBattleState} from "../../state/BattleState";
import {map} from "./Encoder";
import {
    abilityEncoder,
    aliveEncoder,
    basicEncoder,
    itemEncoder,
    lastItemEncoder,
    movesetEncoder,
    PokemonArgs,
    roomStatusEncoder,
    speciesEncoder,
    statTableEncoder,
    teamStatusEncoder,
    typesEncoder,
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
const pokemonAliveEncoders = map(numTeams, map(teamSize, aliveEncoder));
const pokemonBasicEncoders = map(numTeams, map(teamSize, basicEncoder));
const pokemonSpeciesEncoders = map(
    numTeams,
    map(teamSize + numActive, speciesEncoder),
);
const pokemonTypesEncoders = map(
    numTeams,
    map(teamSize + numActive, typesEncoder),
);
const pokemonStatTableEncoders = map(
    numTeams,
    map(teamSize + numActive, statTableEncoder),
);
const pokemonAbilityEncoders = map(
    numTeams,
    map(teamSize + numActive, abilityEncoder),
);
const pokemonItemEncoders = map(numTeams, map(teamSize, itemEncoder));
const pokemonLastItemEncoders = map(numTeams, map(teamSize, lastItemEncoder));
const pokemonMovesetEncoders = map(
    numTeams,
    map(teamSize + numActive, movesetEncoder),
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
    const actives = teams.map(t => t.active);

    for (let i = 0; i < modelInputNames.length; ++i) {
        const arr = data[i];
        // Use ordering of input names to determine where to write encoded state
        // data.
        const name = modelInputNames[i];

        switch (name) {
            case "room/status":
                roomStatusEncoder.encode(arr, state.status);
                break;
            case "team/status":
                teamStatusEncoders.encode(
                    arr,
                    teams.map(t => t.status),
                );
                break;
            case "active/volatile":
                volatileStatusEncoders.encode(
                    arr,
                    actives.map(p => p.volatile),
                );
                break;
            case "pokemon/alive":
                pokemonAliveEncoders.encode(arr, pokemon);
                break;
            case "pokemon/basic":
                pokemonBasicEncoders.encode(arr, pokemon);
                break;
            case "pokemon/species":
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
            case "pokemon/types":
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
            case "pokemon/stats":
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
            case "pokemon/ability":
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
            case "pokemon/item":
                pokemonItemEncoders.encode(
                    arr,
                    // eslint-disable-next-line @typescript-eslint/prefer-optional-chain
                    pokemon.map(a => a.map(p => p && p.item)),
                );
                break;
            case "pokemon/last_item":
                pokemonLastItemEncoders.encode(
                    arr,
                    // eslint-disable-next-line @typescript-eslint/prefer-optional-chain
                    pokemon.map(a => a.map(p => p && p.lastItem)),
                );
                break;
            case "pokemon/moves":
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
