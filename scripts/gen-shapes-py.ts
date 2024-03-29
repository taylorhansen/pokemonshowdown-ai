/** @file Generates `shapes.py`. */
import {strict as assert} from "assert";
import {spawnSync} from "child_process";
import {writeFileSync} from "fs";
import * as path from "path";
import {actions} from "../src/ts/battle/agent";
import * as encoders from "../src/ts/battle/state/encoder";
import {
    numTeams,
    numPokemon,
    numActive,
    modelInputNames,
    numMoves,
} from "../src/ts/battle/state/encoder/shapes";
import * as rewards from "../src/ts/battle/worker/rewards";

const projectDir = path.resolve(__dirname, "..");
const shapesPyPath = path.join(projectDir, "src", "py", "gen", "shapes.py");

/**
 * Input shapes for the neural network model, without the batch dimension.
 *
 * Should correspond to {@link modelInputNames}.
 */
const modelInputShapes: readonly (readonly number[])[] = [
    [encoders.roomStatusEncoder.size],
    [numTeams, encoders.teamStatusEncoder.size],
    [numTeams, numActive, encoders.volatileStatusEncoder.size],
    [numTeams, numPokemon, encoders.basicEncoder.size],
    [numTeams, numPokemon + numActive, encoders.speciesEncoder.size],
    [numTeams, numPokemon + numActive, encoders.typesEncoder.size],
    [numTeams, numPokemon + numActive, encoders.statTableEncoder.size],
    [numTeams, numPokemon + numActive, encoders.abilityEncoder.size],
    [numTeams, numPokemon, 2 /*curr + last*/, encoders.itemEncoder.size / 2],
    [numTeams, numPokemon + numActive, numMoves, encoders.moveSlotEncoder.size],
];

/** Flattened version of {@link modelInputShapes}. */
const flattenedInputShapes: readonly number[] = modelInputShapes.map(shape =>
    shape.reduce((a, s) => a * s),
);

/** Total size of the input. Derived from {@link modelInputShapes}. */
const totalInputSize = flattenedInputShapes.reduce((a, b) => a + b);
assert.equal(encoders.stateEncoder.size, totalInputSize);

const shapesPy = `\
"""
Contains constants specifying the state input and action output shapes used by
the model.

Generated by ${path.relative(projectDir, __filename)}. Do not edit.
"""
import types
from typing import Final

MAX_REWARD: Final = ${rewards.max}
"""Maximum possible reward."""

MIN_REWARD: Final = ${rewards.min}
"""Minimum possible reward."""

NUM_TEAMS: Final = ${numTeams}
"""Number of players (teams) in a battle."""

NUM_POKEMON: Final = ${numPokemon}
"""Number of pokemon on a team."""

NUM_ACTIVE: Final = ${numActive}
"""Number of active pokemon per team."""

NUM_MOVES: Final = ${numMoves}
"""Number of moves in a moveset."""

STATE_NAMES: Final = (
    ${modelInputNames.map(name => `"${name}"`).join(",\n    ")},
)
"""List of state dictionary names in order. Used for (de)serialization."""

STATE_SHAPES: Final = types.MappingProxyType(
    {
        ${modelInputNames
            .map(
                (name, i) =>
                    `"${name}": (${
                        modelInputShapes[i].join(", ") +
                        (modelInputShapes[i].length === 1 ? "," : "")
                    }),`,
            )
            .join("\n        ")}
    }
)
"""
Dictionary of shapes for encoded battle state tensors to be used as input to the
model.
"""

STATE_SHAPES_FLAT: Final = types.MappingProxyType(
    {
        ${modelInputNames
            .map((name, i) => `"${name}": ${flattenedInputShapes[i]},`)
            .join("\n        ")}
    }
)
"""
Dictionary of flattened shapes for encoded battle state tensors, to be used in
(de)serialization.
"""

STATE_SIZE: Final = ${totalInputSize}
"""Total size of battle state tensor input."""

ACTION_IDS: Final = types.MappingProxyType(
    {
        ${actions.map((name, i) => `"${name}": ${i},`).join("\n        ")}
    }
)
"""Action output names mapped to numerical ids."""

ACTION_NAMES: Final = (
    ${actions.map(name => `"${name}",`).join("\n    ")}
)
"""
List of action output names. Effectively maps an action id from \`ACTION_IDS\`
back to its string identifier.
"""
`;

writeFileSync(shapesPyPath, shapesPy);

// Formatting.
spawnSync("isort", [shapesPyPath], {stdio: "inherit"});
spawnSync("black", ["-q", shapesPyPath], {stdio: "inherit"});
