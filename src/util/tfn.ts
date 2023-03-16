/** @file Imports `tfjs-node` or `tfjs-node-gpu` based on argument. */
export type TfjsNode = typeof import("@tensorflow/tfjs-node");
export type TfjsNodeGpu = typeof import("@tensorflow/tfjs-node-gpu");

/** TF library import type for type checking. */
export type Tfn = TfjsNode | TfjsNodeGpu;

/** Previous {@link importTfn} argument. */
let importGpu: boolean | undefined;

/**
 * Imports the appropriate `tfjs-node[-gpu]` library.
 *
 * @param gpu Whether to enable GPU support. If called multiple times, this
 * parameter must not change from the first call.
 */
export function importTfn(gpu = false): Tfn {
    if (importGpu === undefined) {
        importGpu = gpu;
    } else if (importGpu !== gpu) {
        throw new Error(
            `importTfn was previously called with gpu=${importGpu} but is ` +
                `now being called with gpu=${gpu}`,
        );
    }
    /* eslint-disable @typescript-eslint/no-require-imports */
    return gpu
        ? (require("@tensorflow/tfjs-node-gpu") as TfjsNodeGpu)
        : (require("@tensorflow/tfjs-node") as TfjsNode);
    /* eslint-enable @typescript-eslint/no-require-imports */
}
