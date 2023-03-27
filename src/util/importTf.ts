import {TensorflowConfig} from "../config/types";

/** Tensorflow import type. */
export type Tfjs = typeof import("@tensorflow/tfjs");

/** Imports and configures a Tensorflow instance. */
export async function importTf(config: TensorflowConfig): Promise<Tfjs> {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const tf = require("@tensorflow/tfjs") as Tfjs;
    switch (config.backend) {
        case "tensorflow":
            importTfn(config.gpu);
            break;
        case "wasm": {
            const tfw =
                require("@tensorflow/tfjs-backend-wasm") as typeof import("@tensorflow/tfjs-backend-wasm");
            if (config.numThreads) {
                tfw.setThreadsCount(config.numThreads);
            }
            break;
        }
        default:
    }
    /* eslint-enable @typescript-eslint/no-require-imports */
    await tf.setBackend(config.backend);
    await tf.ready();
    return tf;
}

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
 * parameter must not change from the first call. Default false.
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
