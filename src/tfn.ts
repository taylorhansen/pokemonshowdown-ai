/** @file Imports `tfjs-node` or `tfjs-node-gpu` based on argument. */
/** TF library import type for type checking. */
export type TFN = typeof import("@tensorflow/tfjs-node-gpu") |
    typeof import("@tensorflow/tfjs-node");

/** Previous importTfn() argument. */
let importGpu: boolean | undefined;
/**
 * Imports the appropriate tfjs-node library.
 * @param gpu Whether to enable GPU support. If called multiple times, this
 * parameter must not change from the first call.
 */
// tslint:disable-next-line: no-default-export
export function importTfn(gpu = false): TFN
{
    if (importGpu === undefined) importGpu = gpu;
    else if (importGpu !== gpu)
    {
        throw new Error("tfImport was previously called with " +
            `gpu=${importGpu} but is now being called with gpu=${gpu}`)
    }
    return gpu ? require("@tensorflow/tfjs-node-gpu") :
        require("@tensorflow/tfjs-node");
}
