/**
 * @file Dedicated worker for TensorFlow neural network operations during games.
 */
import * as tf from "@tensorflow/tfjs";
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
import { PredictMessage, PredictWorkerResult } from "../ModelPort";
import { RawPortResultError } from "./AsyncPort";
import { NetworkProcessorLearnData, NetworkProcessorLearnResult,
    NetworkProcessorLoadResult, NetworkProcessorMessage,
    NetworkProcessorSaveResult, NetworkProcessorSubscribeResult,
    NetworkProcessorUnloadResult } from "./NetworkProcessorRequest";

if (!parentPort) throw new Error("No parent port!");

// select native backend, defaulting to cpu if not told to use gpu
const tfn = importTfn(!!workerData.gpu);

/** Manages a neural network registry. */
class NetworkRegistry
{
    /** Neural network object. */
    private readonly model: tf.LayersModel;
    /** Currently held game worker ports. */
    private readonly ports: Set<MessagePort>;
    /** Prediction request buffer. */
    private readonly predictBuffer: {msg: PredictMessage, port: MessagePort}[];
    /** Lock promise for managing the neural network resource. */
    private inUse: Promise<any>;

    /**
     * Creates a NetworkRegistry.
     * @param model Neural network object.
     */
    constructor(model: tf.LayersModel)
    {
        try { verifyModel(model); }
        catch (e)
        {
            // cleanup model so it doesn't cause a memory leak
            model.dispose();
            throw e;
        }
        this.model = model;
        this.ports = new Set();
        this.predictBuffer = [];

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

    /** Waits until this registry is no longer being used. */
    public waitUntilFree(): Promise<void> { return this.inUse; }

    /** Saves the neural network to the given url. */
    public async save(url: string): Promise<void>
    {
        await this.model.save(url);
    }

    /** Deletes everything in this registry. */
    public async unload(): Promise<void>
    {
        await this.waitUntilFree();
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
        {
            // queue a predict request
            this.predictBuffer.push({msg, port: port1});
            // see if we should flush the predict buffer once the neural network
            //  is free
            this.checkPredictBuffer();
        });
        port1.on("close", () =>
        {
            // remove this port from the recorded references
            this.ports.delete(port1);
            this.checkPredictBuffer();
        });
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
        this.inUse = Promise.all(
        [
            this.waitUntilFree(),
            ...(logPath ?
            [
                ensureDir(logPath)
                    .then(() =>
                        void (trainCallback = tfn.node.tensorBoard(logPath)))
            ] : [])
        ]);

        return this.inUse = this.waitUntilFree().then(() =>learn(
        {
            model: this.model, ...config,
            ...(callback && {callback}),
            ...(trainCallback && {trainCallback})
        }));
    }

    /** Once this registry is free, checks and flushes the predict buffer. */
    private checkPredictBuffer(): void
    {
        this.inUse = this.waitUntilFree()
            .then(() => this.checkPredictBufferImpl());
    }

    /** Flushes the predict buffer if sufficiently full. */
    private async checkPredictBufferImpl(): Promise<void>
    {
        if (this.predictBuffer.length <= 0) return;
        const batchSize = Math.floor(this.ports.size / 2);
        if (this.predictBuffer.length < batchSize) return;

        const batchedStateData = this.predictBuffer.map(req => req.msg.state);
        const [batchedLogits, batchedValues] = tf.tidy(() =>
        {
            const batchStates = tf.stack(batchedStateData);
            const [batchLogits, batchValues] =
                this.model.predictOnBatch(batchStates) as tf.Tensor[]
            return [
                batchLogits.as2D(this.predictBuffer.length, intToChoice.length)
                    .unstack(),
                batchValues.as1D()
            ];
        });

        const [batchedLogitsData, batchedValueData] = await Promise.all(
        [
            Promise.all(batchedLogits.map(
                t => t.data() as Promise<Float32Array>)),
            batchedValues.data() as Promise<Float32Array>
        ]);
        batchedLogits.forEach(t => t.dispose())
        batchedValues.dispose();

        for (let i = 0; i < this.predictBuffer.length; ++i)
        {
            const req = this.predictBuffer[i];
            const rid = req.msg.rid;
            const state = batchedStateData[i];
            const logits = batchedLogitsData[i];
            const value = batchedValueData[i];
            const result: PredictWorkerResult =
                {type: "predict", rid, done: true, state, logits, value};
            req.port.postMessage(result, [state.buffer, logits.buffer]);
        }
        this.predictBuffer.length = 0;
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
function load(model: tf.LayersModel, rid: number)
{
    networks.set(uidCounter, new NetworkRegistry(model));
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
            if (!msg.url) load(createModel(), rid);
            else promise = tf.loadLayersModel(msg.url).then(m => load(m, rid));
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
