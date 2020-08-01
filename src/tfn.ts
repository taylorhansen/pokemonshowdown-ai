/** TF library import type for type checking. */
export type TFN = typeof import("@tensorflow/tfjs-node-gpu") &
    typeof import("@tensorflow/tfjs-node");

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
    /*return gpu ? import("@tensorflow/tfjs-node-gpu") :
        import("@tensorflow/tfjs-node");*/
    return gpu ? require("@tensorflow/tfjs-node-gpu") :
        require("@tensorflow/tfjs-node");
}
