/** @file Dedicated worker for TensorFlow model operations. */
import * as tf from "@tensorflow/tfjs";
import { serialize } from "v8";
import { parentPort, workerData } from "worker_threads";
import { formats } from "../../../psbot/handlers/battle";
import { RawPortResultError } from "../../port/PortProtocol";
import { WorkerClosed } from "../../port/WorkerProtocol";
import { createModel } from "../model";
import { BatchPredictOptions, ModelLearnResult, ModelLoadResult, ModelMessage,
    ModelSaveResult, ModelSubscribeResult, ModelUnloadResult } from
    "./ModelProtocol";
import { ModelRegistry } from "./ModelRegistry";

if (!parentPort) throw new Error("No parent port!");

const format: formats.FormatType = workerData.format;

/** Maps model uid to their registry objects. */
const models = new Map<number, ModelRegistry>();

/** Counter for model uids. */
let uidCounter = 0;

/**
 * Searches for a model registry with the specified uid.
 *
 * @throws Error if model not found.
 */
function getRegistry(uid: number): ModelRegistry
{
    const registry = models.get(uid);
    if (!registry) throw new Error(`No such model with uid ${uid}`);
    return registry;
}

/** Registers a recently loaded model. */
function load(model: tf.LayersModel, rid: number,
    batchOptions: BatchPredictOptions)
{
    models.set(uidCounter, new ModelRegistry(model, batchOptions));
    const result: ModelLoadResult =
        {type: "load", rid, done: true, uid: uidCounter++};
    parentPort!.postMessage(result);
}

parentPort.on("message", function handle(msg: ModelMessage)
{
    const rid = msg.rid;
    let promise: Promise<any> | undefined;
    switch (msg.type)
    {
        case "load":
            // downcast msg to BatchOptions
            if (!msg.url) load(createModel(format), rid, msg);
            else
            {
                promise = tf.loadLayersModel(msg.url)
                    .then(m => load(m, rid, msg));
            }
            break;
        case "save":
            promise = getRegistry(msg.uid).save(msg.url)
            .then(function()
            {
                const result: ModelSaveResult = {type: "save", rid, done: true};
                parentPort!.postMessage(result);
            });
            break;
        case "unload":
            promise = getRegistry(msg.uid).unload()
            .then(function()
            {
                models.delete(msg.uid);
                const result: ModelUnloadResult =
                    {type: "unload", rid, done: true};
                parentPort!.postMessage(result);
            });
            break;
        case "subscribe":
        {
            const port = getRegistry(msg.uid).subscribe();
            const result: ModelSubscribeResult =
                {type: "subscribe", rid, done: true, port};
            parentPort!.postMessage(result, [port]);
            break;
        }
        case "learn":
            promise = getRegistry(msg.uid).learn(msg,
                data =>
                {
                    const result: ModelLearnResult =
                        {type: "learn", rid, done: false, data};
                    parentPort!.postMessage(result);
                },
                msg.logPath)
            .then(function()
            {
                // send a final message to end the stream of updates
                const result: ModelLearnResult =
                    {type: "learn", rid, done: true};
                parentPort!.postMessage(result);
            });
            break;
        case "close":
        {
            promise = Promise.all(
                    Array.from(models,
                        ([uid, registry]) =>
                            registry.unload().then(() => models.delete(uid))))
                .then(() =>
                {
                    const result: WorkerClosed =
                        {type: "close", rid, done: true};
                    parentPort!.postMessage(result);
                });
        }
    }

    promise &&= promise.catch(function handleError(err: Error)
    {
        const errBuf = serialize(err);
        const result: RawPortResultError =
            {type: "error", rid, done: true, err: errBuf};
        parentPort!.postMessage(result, [errBuf.buffer]);
    });
});
