/** @file Dedicated worker for TensorFlow model operations. */
import {serialize} from "v8";
import {parentPort, workerData} from "worker_threads";
import * as tf from "@tensorflow/tfjs";
import {BatchPredictConfig} from "../../../config/types";
import {importTfn} from "../../../util/tfn";
import {RawPortResultError} from "../../port/PortProtocol";
import {WorkerClosed} from "../../port/WorkerProtocol";
import {createModel} from "../model";
import {Metrics} from "./Metrics";
import {
    ModelCopyResult,
    ModelLearnResult,
    ModelLoadResult,
    ModelLogWltMessage,
    ModelLogWltResult,
    ModelMessage,
    ModelSaveResult,
    ModelSubscribeResult,
    ModelUnloadResult,
    ModelWorkerData,
} from "./ModelProtocol";
import {ModelRegistry} from "./ModelRegistry";

if (!parentPort) {
    throw new Error("No parent port!");
}

// Make sure we're using the right TF backend.
const {gpu} = workerData as ModelWorkerData;
importTfn(gpu);

/** Maps model uid to their registry objects. */
const models = new Map<number, ModelRegistry>();

/** Counter for model uids. */
let uidCounter = 0;

/**
 * Searches for a model registry with the specified uid.
 *
 * @throws Error if model not found.
 */
function getRegistry(uid: number): ModelRegistry {
    const registry = models.get(uid);
    if (!registry) {
        throw new Error(`No such model with uid ${uid}`);
    }
    return registry;
}

/** Registers a recently loaded model. */
function load(
    rid: number,
    model: tf.LayersModel,
    batchConfig: BatchPredictConfig,
) {
    models.set(uidCounter, new ModelRegistry(model, batchConfig));
    const result: ModelLoadResult = {
        type: "load",
        rid,
        done: true,
        uid: uidCounter++,
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
                load(rid, createModel(), msg);
            } else {
                promise = tf
                    .loadLayersModel(msg.url)
                    .then(m => load(rid, m, msg));
            }
            break;
        case "save":
            promise = getRegistry(msg.uid)
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
        case "unload":
            promise = getRegistry(msg.uid)
                .unload()
                .then(function () {
                    models.delete(msg.uid);
                    const result: ModelUnloadResult = {
                        type: "unload",
                        rid,
                        done: true,
                    };
                    parentPort!.postMessage(result);
                });
            break;
        case "subscribe": {
            const port = getRegistry(msg.uid).subscribe();
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
            promise = getRegistry(msg.uid)
                .learn(msg, data => {
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
            getRegistry(msg.uidFrom).copyTo(getRegistry(msg.uidTo));
            const result: ModelCopyResult = {type: "copy", rid, done: true};
            parentPort!.postMessage(result);
            break;
        }
        case "logWlt": {
            logWlt(msg);
            const result: ModelLogWltResult = {type: "logWlt", rid, done: true};
            parentPort!.postMessage(result);
            break;
        }
        case "close": {
            promise = Promise.all(
                Array.from(
                    models,
                    async ([uid, registry]) =>
                        await registry.unload().then(() => models.delete(uid)),
                ),
            ).then(() => {
                const result: WorkerClosed = {type: "close", rid, done: true};
                parentPort!.postMessage(result);
            });
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

/** Logs win/loss/tie metrics to Tensorboard. */
function logWlt(msg: ModelLogWltMessage): void {
    const metrics = Metrics.get(msg.name);
    if (!metrics) {
        return;
    }

    const total = msg.wins + msg.losses + msg.ties;
    metrics.scalar(
        `eval/vs_${msg.opponent}/win_ratio`,
        msg.wins / total,
        msg.step,
    );
    metrics.scalar(
        `eval/vs_${msg.opponent}/loss_ratio`,
        msg.losses / total,
        msg.step,
    );
    metrics.scalar(
        `eval/vs_${msg.opponent}/tie_ratio`,
        msg.ties / total,
        msg.step,
    );
    Metrics.flush();
}
