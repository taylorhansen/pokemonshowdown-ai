/** @file Specifies the input/output shapes of the model. */
import * as tf from "@tensorflow/tfjs";
import {intToChoice} from "../../psbot/handlers/battle/agent";
import * as encoders from "../../psbot/handlers/battle/ai/encoder/encoders";
import {Moveset} from "../../psbot/handlers/battle/state/Moveset";
import {Team} from "../../psbot/handlers/battle/state/Team";

/** Number of sides to the game. */
export const numTeams = 2;

/** Number of pokemon on a team. */
export const teamSize = Team.maxSize;

/** Number of moves in a moveset. */
export const numMoves = Moveset.maxSize;

/**
 * Input shapes for the {@link createModel model}, without the batch dimension.
 */
export const modelInputShapes: readonly (readonly number[])[] = [
    // Room.
    [encoders.roomStatusEncoder.size],
    // Team status.
    [numTeams, encoders.teamStatusEncoder.size],
    // Active traits/statuses.
    [numTeams, encoders.volatileStatusEncoder.size],
    [numTeams, encoders.definedSpeciesEncoder.size],
    [numTeams, encoders.definedTypesEncoder.size],
    [numTeams, encoders.definedStatTableEncoder.size],
    [numTeams, encoders.definedAbilityEncoder.size],
    [numTeams, Moveset.maxSize, encoders.moveSlotEncoder.size],
    // Bench traits/statuses.
    [numTeams, teamSize, encoders.basicEncoder.size],
    [numTeams, teamSize, encoders.speciesEncoder.size],
    [numTeams, teamSize, encoders.typesEncoder.size],
    [numTeams, teamSize, encoders.statTableEncoder.size],
    [numTeams, teamSize, encoders.abilityEncoder.size],
    [numTeams, teamSize, encoders.itemEncoder.size],
    [numTeams, teamSize, encoders.lastItemEncoder.size],
    [numTeams, teamSize, numMoves, encoders.moveSlotEncoder.size],
];

/** Flattened version of {@link modelInputShapes}. */
export const flattenedInputShapes: readonly number[] = modelInputShapes.map(
    shape => shape.reduce((a, s) => a * s, 1),
);

/**
 * Input names for the {@link createModel model}.
 *
 * Same length as {@link modelInputShapes}.
 */
export const modelInputNames: readonly string[] = [
    "room",
    "team/status",
    "team/active/volatile",
    "team/active/species",
    "team/active/types",
    "team/active/stats",
    "team/active/ability",
    "team/active/moves",
    "team/pokemon/basic",
    "team/pokemon/species",
    "team/pokemon/types",
    "team/pokemon/stats",
    "team/pokemon/ability",
    "team/pokemon/item",
    "team/pokemon/last_item",
    "team/pokemon/moves",
];

/**
 * Maps input names from {@link modelInputNames} to their corresponding shapes
 * as specified in {@link modelInputShapes}.
 */
export const modelInputShapesMap: {
    readonly [name: string]: readonly number[];
} = Object.fromEntries(
    modelInputNames.map((name, i) => [name, modelInputShapes[i]]),
);

/**
 * Output shapes for the {@link createModel model}, with the batch dimension.
 */
export const modelOutputShapes: readonly Readonly<tf.Shape>[] = [
    // Action.
    [intToChoice.length],
    // Value.
    [1],
].map((shape: tf.Shape) => {
    // Add batch dimension.
    shape.unshift(null);
    return shape;
});

/**
 * Output names for the {@link createModel model}.
 *
 * Same length as {@link modelOutputShapes}.
 */
export const modelOutputNames: readonly string[] = ["action", "value"];

/**
 * Verifies that the model is compatible with the input/output shapes as
 * specified by {@link modelInputShapes} and {@link modelOutputShapes}.
 *
 * The model created by {@link createModel} is guaranteed to satisfy this check.
 *
 * @throws Error if invalid input/output shapes.
 */
export function verifyModel(model: tf.LayersModel): void {
    validateInput(model.input);
    validateOutput(model.output);
}

/** Ensures that the model input shape is valid. */
function validateInput(input: tf.SymbolicTensor | tf.SymbolicTensor[]): void {
    if (!Array.isArray(input)) {
        throw new Error("Model input is not an array");
    }
    if (input.length !== modelInputShapes.length) {
        throw new Error(
            `Expected ${modelInputShapes.length} inputs but found ` +
                `${input.length}`,
        );
    }
    for (let i = 0; i < modelInputShapes.length; ++i) {
        const {shape} = input[i];
        const expectedShape = [null, ...modelInputShapes[i]];
        let invalid: boolean | undefined;
        if (shape.length !== expectedShape.length) {
            invalid = true;
        } else {
            for (let j = 0; j < expectedShape.length; ++j) {
                if (shape[j] !== expectedShape[j]) {
                    invalid = true;
                    break;
                }
            }
        }
        if (invalid) {
            throw new Error(
                `Expected input ${i} (${modelInputNames[i]}) to have shape ` +
                    `${JSON.stringify(expectedShape)} but found ` +
                    `${JSON.stringify(shape)}`,
            );
        }
    }
}

/** Ensures that the model output shape is valid. */
function validateOutput(output: tf.SymbolicTensor | tf.SymbolicTensor[]): void {
    if (!Array.isArray(output)) {
        throw new Error("Model output is not an array");
    }
    if (output.length !== modelOutputShapes.length) {
        throw new Error(
            `Expected ${modelOutputShapes.length} outputs but found ` +
                `${output.length}`,
        );
    }
    for (let i = 0; i < modelOutputShapes.length; ++i) {
        const {shape} = output[i];
        const expectedShape = modelOutputShapes[i];
        let invalid: boolean | undefined;
        if (shape.length !== expectedShape.length) {
            invalid = true;
        } else {
            for (let j = 0; j < expectedShape.length; ++j) {
                if (shape[j] !== expectedShape[j]) {
                    invalid = true;
                    break;
                }
            }
        }
        if (invalid) {
            throw new Error(
                `Expected output ${i} (${modelOutputNames[i]}) to have shape ` +
                    `${JSON.stringify(expectedShape)} but found ` +
                    `${JSON.stringify(shape)}`,
            );
        }
    }
}
