/** @file Dedicated worker for TensorFlow model operations. */
import {serialize} from "v8";
import {parentPort, workerData} from "worker_threads";
import * as tf from "@tensorflow/tfjs";
import {BatchPredictConfig} from "../../../config/types";
import {importTfn} from "../../../util/tfn";
import {RawPortResultError} from "../../port/PortProtocol";
import {WorkerClosed} from "../../port/WorkerProtocol";
import {closeDecoderPool} from "../learn/learn";
import {createModel} from "../model";
import {Metrics} from "./Metrics";
import {
    ModelCloneResult,
    ModelCopyResult,
    ModelLearnResult,
    ModelLoadResult,
    ModelLockResult,
    ModelLogMessage,
    ModelLogResult,
    ModelMessage,
    ModelSaveResult,
    ModelSubscribeResult,
    ModelUnloadResult,
    ModelUnlockResult,
    ModelWorkerData,
} from "./ModelProtocol";
import {ModelRegistry} from "./ModelRegistry";

if (!parentPort) {
    throw new Error("No parent port!");
}

// Make sure we're using the right TF backend.
const {gpu} = workerData as ModelWorkerData;
importTfn(gpu);

/** Maps model name to their registry objects. */
const models = new Map<string, ModelRegistry>();

/**
 * Searches for a model registry with the specified name.
 *
 * @throws Error if model not found.
 */
function getRegistry(model: string): ModelRegistry {
    const registry = models.get(model);
    if (!registry) {
        throw new Error(`No such model registered under name '${model}'`);
    }
    return registry;
}

/** Registers a recently loaded model. */
function load(
    rid: number,
    name: string,
    model: tf.LayersModel,
    batchConfig: BatchPredictConfig,
) {
    models.set(name, new ModelRegistry(name, model, batchConfig));
    const result: ModelLoadResult = {
        type: "load",
        rid,
        done: true,
        name,
    };
    parentPort!.postMessage(result);
}

parentPort.on("message", function handle(msg: ModelMessage) {
    const {rid} = msg;
    let promise: Promise<unknown> | undefined;
    switch (msg.type) {
        case "load":
            // Note: Downcasting msg to BatchPredictOptions.
            if (!msg.url) {
                load(
                    rid,
                    msg.name,
                    createModel(msg.name, msg.seed),
                    msg.predict,
                );
            } else {
                promise = tf
                    .loadLayersModel(msg.url)
                    .then(m => load(rid, msg.name, m, msg.predict));
            }
            break;
        case "clone":
            promise = getRegistry(msg.model)
                .clone(msg.name)
                .then(reg => {
                    if (models.has(msg.name)) {
                        throw new Error(
                            `Model with name '${msg.name}' already exists`,
                        );
                    }
                    models.set(msg.name, reg);
                    const result: ModelCloneResult = {
                        type: "clone",
                        rid,
                        done: true,
                        name: msg.name,
                    };
                    parentPort!.postMessage(result);
                });
            break;
        case "save":
            promise = getRegistry(msg.model)
                .save(msg.url)
                .then(function () {
                    const result: ModelSaveResult = {
                        type: "save",
                        rid,
                        done: true,
                    };
                    parentPort!.postMessage(result);
                });
            break;
        case "unload": {
            getRegistry(msg.model).unload();
            models.delete(msg.model);
            const result: ModelUnloadResult = {
                type: "unload",
                rid,
                done: true,
            };
            parentPort!.postMessage(result);
            break;
        }
        case "lock": {
            getRegistry(msg.model).lock(msg.name, msg.step);
            const result: ModelLockResult = {
                type: "lock",
                rid,
                done: true,
            };
            parentPort!.postMessage(result);
            break;
        }
        case "unlock": {
            getRegistry(msg.model).unlock();
            const result: ModelUnlockResult = {
                type: "unlock",
                rid,
                done: true,
            };
            parentPort!.postMessage(result);
            break;
        }
        case "subscribe": {
            const port = getRegistry(msg.model).subscribe();
            const result: ModelSubscribeResult = {
                type: "subscribe",
                rid,
                done: true,
                port,
            };
            parentPort!.postMessage(result, [port]);
            break;
        }
        case "learn":
            promise = getRegistry(msg.model)
                .learn(msg.config, data => {
                    const result: ModelLearnResult = {
                        type: "learn",
                        rid,
                        done: false,
                        data,
                    };
                    parentPort!.postMessage(result);
                })
                .then(function () {
                    // Send a final message to end the stream of updates.
                    const result: ModelLearnResult = {
                        type: "learn",
                        rid,
                        done: true,
                    };
                    parentPort!.postMessage(result);
                });
            break;
        case "copy": {
            getRegistry(msg.from).copyTo(getRegistry(msg.to));
            const result: ModelCopyResult = {type: "copy", rid, done: true};
            parentPort!.postMessage(result);
            break;
        }
        case "log": {
            logMetrics(msg);
            const result: ModelLogResult = {type: "log", rid, done: true};
            parentPort!.postMessage(result);
            break;
        }
        case "close": {
            for (const [uid, registry] of models) {
                registry.unload();
                models.delete(uid);
            }
            promise = closeDecoderPool().then(() => {
                const result: WorkerClosed = {type: "close", rid, done: true};
                parentPort!.postMessage(result);
            });
            break;
        }
        default: {
            const unsupported: never = msg;
            promise = Promise.reject(
                new Error(
                    "Unsupported message type: " +
                        (unsupported as {type: string}).type,
                ),
            );
        }
    }

    promise &&= promise.catch(function handleError(err: Error) {
        const errBuf = serialize(err);
        const result: RawPortResultError = {
            type: "error",
            rid,
            done: true,
            err: errBuf,
        };
        parentPort!.postMessage(result, [errBuf.buffer]);
    });
    // Promise should resolve on its own.
    void promise;
});

/** Logs metrics to Tensorboard. */
function logMetrics(msg: ModelLogMessage): void {
    const metrics = Metrics.get(msg.name);
    if (!metrics) {
        return;
    }
    for (const key in msg.logs) {
        if (!Object.hasOwnProperty.call(msg.logs, key)) {
            continue;
        }
        metrics.scalar(key, msg.logs[key], msg.step);
    }
    Metrics.flush();
}
