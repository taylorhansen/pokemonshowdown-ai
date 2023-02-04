/** @file Dedicated worker for TensorFlow model operations. */
import {serialize} from "v8";
import {parentPort, TransferListItem, workerData} from "worker_threads";
import * as tf from "@tensorflow/tfjs";
import {train} from "../../train/train";
import {RawPortResultError} from "../../util/port/PortProtocol";
import {importTfn} from "../../util/tfn";
import {createModel} from "../model";
import {
    ModelMessage,
    ModelResult,
    ModelTrainResult,
    ModelWorkerData,
} from "./ModelProtocol";
import {ModelRegistry} from "./ModelRegistry";

if (!parentPort) {
    throw new Error("No parent port!");
}

// Used for debugging.
Error.stackTraceLimit = Infinity;

// Make sure we're using the right TF backend.
const {gpu} = workerData as ModelWorkerData;
importTfn(gpu);

tf.enableProdMode();

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
        throw new Error(`No model registered under name '${model}'`);
    }
    return registry;
}

async function handle(msg: ModelMessage): Promise<void> {
    const {rid} = msg;
    let result: ModelResult | RawPortResultError;
    const transferList: TransferListItem[] = [];
    try {
        switch (msg.type) {
            case "load": {
                if (models.has(msg.name)) {
                    throw new Error(
                        `Model with name '${msg.name}' already exists`,
                    );
                }
                const model = msg.url
                    ? await tf.loadLayersModel(msg.url)
                    : createModel(msg.name, msg.config, msg.seed);
                try {
                    models.set(
                        msg.name,
                        new ModelRegistry(msg.name, model, msg.predict),
                    );
                } catch (e) {
                    model.dispose();
                    throw e;
                }
                result = {type: "load", rid, done: true, name: msg.name};
                break;
            }
            case "unload": {
                getRegistry(msg.model).unload();
                models.delete(msg.model);
                result = {type: "unload", rid, done: true};
                break;
            }
            case "train": {
                await train(
                    getRegistry(msg.model).model,
                    msg.config,
                    msg.paths,
                    data => {
                        const interim: ModelTrainResult = {
                            type: "train",
                            rid,
                            done: false,
                            data,
                        };
                        const interimTransfer: TransferListItem[] = [];
                        if (
                            (data.type === "rollout" || data.type === "eval") &&
                            data.err
                        ) {
                            interimTransfer.push(data.err.buffer);
                        }
                        parentPort!.postMessage(interim, interimTransfer);
                    },
                );
                result = {type: "train", rid, done: true};
                break;
            }
            case "subscribe": {
                const port = getRegistry(msg.model).subscribe();
                result = {type: "subscribe", rid, done: true, port};
                transferList.push(port);
                break;
            }
            case "close": {
                models.forEach(reg => reg.unload());
                models.clear();
                result = {type: "close", rid, done: true};
                break;
            }
            default: {
                const unsupported: never = msg;
                throw new Error(
                    "Unsupported message type " +
                        `'${(unsupported as {type: string}).type}'`,
                );
            }
        }
    } catch (err) {
        const errBuf = serialize(err);
        result = {
            type: "error",
            rid,
            done: true,
            err: errBuf,
        };
        transferList.push(errBuf.buffer);
    }
    parentPort!.postMessage(result, transferList);
}

parentPort.on("message", (msg: ModelMessage) => void handle(msg));
