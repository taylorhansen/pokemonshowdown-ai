/**
 * @file Dedicated worker for TensorFlow neural network operations during games.
 */
import * as tf from "@tensorflow/tfjs";
import { EventEmitter } from "events";
import { TypedEmitter } from "tiny-typed-emitter";
import { serialize } from "v8";
import { MessageChannel, MessagePort, parentPort, workerData } from
    "worker_threads";
import { battleStateEncoder } from "../../../../ai/encoder/encoders";
import { verifyModel } from "../../../../ai/networkAgent";
import { intToChoice } from "../../../../battle/agent/Choice";
import { importTfn } from "../../../../tfn";
import { ensureDir } from "../../../helpers/ensureDir";
import { learn, LearnConfig } from "../../learn/learn";
import { createModel } from "../../model";
import { PredictMessage, PredictResult, PredictWorkerResult } from
    "../ModelPort";
import { RawPortResultError } from "./AsyncPort";
import { setTimeoutNs } from "./helpers";
import { BatchOptions, NetworkProcessorLearnData, NetworkProcessorLearnResult,
    NetworkProcessorLoadResult, NetworkProcessorMessage,
    NetworkProcessorSaveResult, NetworkProcessorSubscribeResult,
    NetworkProcessorUnloadResult } from "./NetworkProcessorRequest";

if (!parentPort) throw new Error("No parent port!");

// select native backend, defaulting to cpu if not told to use gpu
const tfn = importTfn(!!workerData.gpu);

/** State+callback entry for a NetworkRegistry's batch queue. */
interface BatchEntry
{
    /** Encoded battle state. */
    state: Float32Array;
    /** Callback after getting the prediction for the given state. */
    res(result: PredictResult): void;
}

/** Describes the events emitted by `NetworkRegistry#batchEvents`. */
interface BatchEvents
{
    [NetworkRegistry.batchExecuteEvent](): void;
}

/** Manages a neural network registry. */
class NetworkRegistry
{
    /** Event for when the current batch should be executed. */
    public static readonly batchExecuteEvent = Symbol("batchExecuteEvent");

    /** Neural network object. */
    private readonly model: tf.LayersModel;
    /** Currently held game worker ports. */
    private readonly ports = new Set<MessagePort>();

    /** Prediction request buffer. */
    private readonly nextBatch: BatchEntry[] = [];
    /** Event listener for batch entries. */
    private readonly batchEvents =
        new EventEmitter({captureRejections: true}) as
            TypedEmitter<BatchEvents>;
    /** Resolves once the current batch timer expires. */
    private timeoutPromise: Promise<void> | null = null;
    /** Function to cancel the current timer. */
    private cancelTimer: (() => void) | null = null;
    /** Lock promise for managing the neural network resource. */
    private inUse: Promise<any>;

    /**
     * Creates a NetworkRegistry.
     * @param model Neural network object.
     * @param batchOptions Options for batching predict requests.
     */
    constructor(model: tf.LayersModel,
        private readonly batchOptions: BatchOptions)
    {
        try { verifyModel(model); }
        catch (e)
        {
            // cleanup model so it doesn't cause a memory leak
            model.dispose();
            throw e;
        }
        this.model = model;

        this.batchOptions =
        {
            ...batchOptions,
            // max 1 second
            timeoutNs: Math.min(999999999, batchOptions.timeoutNs)
        };

        // setup batch event listener
        this.batchEvents.on(NetworkRegistry.batchExecuteEvent,
            () => this.executeBatch());

        // warmup the model using dummy data
        // only useful with gpu backend
        if (workerData.gpu)
        {
            const dummyInput = tf.zeros([1, battleStateEncoder.size]);
            const dummyResult = model.predict(dummyInput) as tf.Tensor[];
            this.inUse = Promise.all(
                    dummyResult.map(r => r.data().then(() => r.dispose())))
                .then(() => dummyInput.dispose());
        }
        else this.inUse = Promise.resolve();
    }

    /** Saves the neural network to the given url. */
    public async save(url: string): Promise<void>
    {
        await this.inUse;
        await this.model.save(url);
    }

    /** Deletes everything in this registry. */
    public async unload(): Promise<void>
    {
        await this.inUse;
        for (const port of this.ports) port.close();
        this.model.dispose();
    }

    /**
     * Indicates that a game worker is subscribing to a model.
     * @param uid ID of the model.
     * @returns A port for queueing predictions that the game worker will use.
     */
    public subscribe(): MessagePort
    {
        const {port1, port2} = new MessageChannel();
        this.ports.add(port1);
        port1.on("message", (msg: PredictMessage) =>
            this.predict(msg)
                .then<PredictWorkerResult>(prediction =>
                ({
                    type: "predict", rid: msg.rid, done: true, ...prediction
                }))
                .catch<RawPortResultError>(err =>
                ({
                    type: "error", rid: msg.rid, done: true, err: serialize(err)
                }))
                .then(result =>
                    port1.postMessage(result,
                        result.type === "predict" ?
                            [result.probs.buffer] : [result.err.buffer])));
        // remove this port from the recorded references after close
        port1.on("close", () => this.ports.delete(port1));
        return port2;
    }

    /**
     * Queues a learning episode.
     * @param config Learning config.
     * @param callback Callback for tracking the training process.
     * @param logPath Path to the folder to store TensorBoard logs in. Omit to
     * not store logs.
     */
    public learn(config: LearnConfig,
        callback?: (data: NetworkProcessorLearnData) => void,
        logPath?: string): Promise<void>
    {
        let trainCallback: tf.CustomCallback | undefined;
        this.inUse = Promise.allSettled(
        [
            this.inUse,
            ...(logPath ?
                [ensureDir(logPath).then(() => tfn.node.tensorBoard(logPath))]
                : [])
        ])
            .then(([_, p]) =>
                p.status === "fulfilled" ? trainCallback = p.value
                    : Promise.reject(p.reason));

        return this.inUse = this.inUse.then(() =>learn(
        {
            model: this.model, ...config,
            ...(callback && {callback}),
            ...(trainCallback && {trainCallback})
        }));
    }

    /** Queues a prediction for the neural network. */
    private async predict(msg: PredictMessage): Promise<PredictResult>
    {
        return new Promise(res =>
        {
            this.nextBatch.push({state: msg.state, res});
            this.checkPredictBatch();
        });
    }

    /**
     * Checks batch size and timer to see if the predict batch should be
     * executed.
     */
    private checkPredictBatch(): void
    {
        if (this.nextBatch.length >= this.batchOptions.maxSize)
        {
            // full batch
            this.batchEvents.emit(NetworkRegistry.batchExecuteEvent);
            return;
        }

        if (this.timeoutPromise) return;

        // setup batch timer
        this.timeoutPromise = new Promise<void>(res =>
                this.cancelTimer =
                    setTimeoutNs(res, this.batchOptions.timeoutNs))
            .then(() =>
            {
                this.timeoutPromise = null;
                this.cancelTimer = null;
            });

        // if the timer expired before the batch filled up, execute the
        //  batch as it is
        let didTimeout = false;
        Promise.race(
        [
            this.timeoutPromise.then(() => didTimeout = true),
            new Promise<void>(res =>
                    this.batchEvents.prependOnceListener(
                        NetworkRegistry.batchExecuteEvent, res))
                .then(this.cancelTimer)
        ])
            .then(() =>
                didTimeout ?
                    this.batchEvents.emit(NetworkRegistry.batchExecuteEvent)
                    : undefined);
    }

    /** Flushes the predict buffer and executes the batch. */
    private async executeBatch(): Promise<void>
    {
        if (this.nextBatch.length <= 0) return;

        // allow for the next batch to start filling up
        const batch = [...this.nextBatch];
        this.nextBatch.length = 0;

        // batch and execute model

        const [batchedProbs, batchedValues] = tf.tidy(() =>
        {
            const batchStates = tf.stack(batch.map(req => req.state));
            const [batchProbs, batchValues] =
                this.model.predictOnBatch(batchStates) as tf.Tensor[];
            return [
                batchProbs.as2D(batch.length, intToChoice.length)
                    .unstack<tf.Tensor1D>(),
                batchValues.as1D()
            ];
        });

        // unpack and distribute batch entries

        const [probsData, valueData] = await Promise.all(
        [
            Promise.all(batchedProbs.map(
                t => t.data() as Promise<Float32Array>)),
            batchedValues.data() as Promise<Float32Array>
        ]);
        batchedProbs.forEach(t => t.dispose())
        batchedValues.dispose();

        for (let i = 0; i < batch.length; ++i)
        {
            batch[i].res({probs: probsData[i], value: valueData[i]});
        }
    }
}

/** Maps network uid to their registry objects. */
const networks = new Map<number, NetworkRegistry>();

/** Counter for network uids. */
let uidCounter = 0;

/**
 * Attempts to search for a network registry with the specified uid. Throws if
 * not found.
 */
function getRegistry(uid: number): NetworkRegistry
{
    const registry = networks.get(uid);
    if (!registry) throw new Error(`No such network with uid ${uid}`);
    return registry;
}

/** Registers a recently loaded model. */
function load(model: tf.LayersModel, rid: number, batchOptions: BatchOptions)
{
    networks.set(uidCounter, new NetworkRegistry(model, batchOptions));
    const result: NetworkProcessorLoadResult =
        {type: "load", rid, done: true, uid: uidCounter++};
    parentPort!.postMessage(result);
}

parentPort.on("message", async function(msg: NetworkProcessorMessage)
{
    const rid = msg.rid;
    let promise: Promise<void> | undefined;
    switch (msg.type)
    {
        case "load":
            // downcast msg to BatchOptions
            if (!msg.url) load(createModel(), rid, msg);
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
                const result: NetworkProcessorSaveResult =
                    {type: "save", rid, done: true};
                parentPort!.postMessage(result);
            });
            break;
        case "unload":
            promise = getRegistry(msg.uid).unload()
            .then(function()
            {
                networks.delete(msg.uid);
                const result: NetworkProcessorUnloadResult =
                    {type: "unload", rid, done: true};
                parentPort!.postMessage(result);
            });
            break;
        case "subscribe":
        {
            const port = getRegistry(msg.uid).subscribe();
            const result: NetworkProcessorSubscribeResult =
                {type: "subscribe", rid, done: true, port};
            parentPort!.postMessage(result, [port]);
            break;
        }
        case "learn":
            promise = getRegistry(msg.uid).learn(msg,
                data =>
                {
                    const result: NetworkProcessorLearnResult =
                        {type: "learn", rid, done: false, data};
                    parentPort!.postMessage(result);
                },
                msg.logPath)
            .then(function()
            {
                // send a final message to end the stream of updates
                const result: NetworkProcessorLearnResult =
                    {type: "learn", rid, done: true};
                parentPort!.postMessage(result);
            });
            break;
    }

    if (!promise) return;
    promise = promise.catch(function handleError(err: Error)
    {
        const errBuf = serialize(err);
        const result: RawPortResultError =
            {type: "error", rid, done: true, err: errBuf};
        parentPort!.postMessage(result, [errBuf.buffer]);
    });
});
