/** @file Specifies the input/output shapes of the model. */
import * as tf from "@tensorflow/tfjs";
import {intToChoice} from "../../psbot/handlers/battle/agent";
import * as encoders from "../../psbot/handlers/battle/ai/encoder/encoders";
import {Moveset} from "../../psbot/handlers/battle/state/Moveset";
import {Team} from "../../psbot/handlers/battle/state/Team";

/**
 * Input shapes for the {@link createModel model}, without the batch dimension.
 */
export const modelInputShapes: readonly (readonly number[])[] = [
    // Room.
    [encoders.roomStatusEncoder.size],
    // Teams.
    ...Array.from({length: 2}).flatMap(() => [
        // Team status.
        [encoders.teamStatusEncoder.size],
        // Active traits/statuses.
        [encoders.volatileStatusEncoder.size],
        [encoders.definedSpeciesEncoder.size],
        [encoders.definedTypesEncoder.size],
        [encoders.definedStatTableEncoder.size],
        [encoders.definedAbilityEncoder.size],
        [Moveset.maxSize, encoders.moveSlotEncoder.size],
        // Bench traits/statuses.
        [Team.maxSize, encoders.basicEncoder.size],
        [Team.maxSize, encoders.speciesEncoder.size],
        [Team.maxSize, encoders.typesEncoder.size],
        [Team.maxSize, encoders.statTableEncoder.size],
        [Team.maxSize, encoders.abilityEncoder.size],
        [Team.maxSize, encoders.itemEncoder.size],
        [Team.maxSize, encoders.lastItemEncoder.size],
        [Team.maxSize, Moveset.maxSize, encoders.moveSlotEncoder.size],
    ]),
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
    ...["us", "them"].flatMap(side =>
        [
            "status",
            "active/volatile",
            "active/species",
            "active/types",
            "active/stats",
            "active/ability",
            "active/moves",
            "pokemon/basic",
            "pokemon/species",
            "pokemon/types",
            "pokemon/stats",
            "pokemon/ability",
            "pokemon/item",
            "pokemon/last_item",
            "pokemon/moves",
        ].map(name => `${side}/${name}`),
    ),
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
