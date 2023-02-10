/**
 * @file Utility functions for model input/output data verification. Safe to
 * import in non-tf threads.
 */
import {intToChoice} from "../psbot/handlers/battle/agent";
import {flattenedInputShapes, modelInputNames} from "./shapes";

/** Assertions for model input data. */
export function verifyInputData(data: Float32Array[]): void {
    for (let i = 0; i < data.length; ++i) {
        const arr = data[i];
        if (arr.length !== flattenedInputShapes[i]) {
            throw new Error(
                `Model input ${i} (${modelInputNames[i]}) requires ` +
                    `${flattenedInputShapes[i]} elements but got ${arr.length}`,
            );
        }
        for (let j = 0; j < arr.length; ++j) {
            const value = arr[j];
            if (isNaN(value)) {
                throw new Error(
                    `Model input ${i} (${modelInputNames[i]}) contains ` +
                        `NaN at index ${j}`,
                );
            }
            if (value < -1 || value > 1) {
                throw new Error(
                    `Model input ${i} (${modelInputNames[i]}) contains ` +
                        `an out-of-range value ${value} at index ${j}`,
                );
            }
        }
    }
}

/** Assertions for model output data. */
export function verifyOutputData(output: Float32Array): void {
    if (output.length !== intToChoice.length) {
        throw new Error(
            `Expected ${intToChoice.length} output values but got ` +
                `${output.length}`,
        );
    }
    for (let i = 0; i < output.length; ++i) {
        if (isNaN(output[i])) {
            throw new Error(
                `Model output contains NaN for action ${i} (${intToChoice[i]})`,
            );
        }
    }
}
