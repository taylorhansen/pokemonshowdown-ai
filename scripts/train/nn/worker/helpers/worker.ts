/**
 * @file Dedicated worker for TensorFlow neural network operations during games.
 */
import * as tf from "@tensorflow/tfjs-node";
import { serialize } from "v8";
import { parentPort, MessageChannel, MessagePort } from "worker_threads";
import { verifyModel } from "../../../../../src/ai/networkAgent";
import { intToChoice } from "../../../../../src/battle/agent/Choice";
import { PredictMessage, PredictWorkerResult } from "../ModelPort";
import { PortResultError } from "./AsyncPort";
import { NetworkProcessorLearnResult, NetworkProcessorLoadResult,
    NetworkProcessorMessage, NetworkProcessorSaveResult,
    NetworkProcessorSubscribeResult, NetworkProcessorUnloadResult } from
    "./NetworkProcessorRequest";
import { learn, LearnArgs } from "../../learn/learn";
import { createModel } from "../../model";

if (!parentPort) throw new Error("No parent port!");

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
    private inUse: Promise<void> = Promise.resolve();

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
     * @param args Learning config.
     */
    public learn(args: Omit<LearnArgs, "model">): Promise<void>
    {
        return this.inUse = this.waitUntilFree()
            .then(() => learn({model: this.model, ...args}));
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
            promise =  getRegistry(msg.uid).save(msg.url)
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
            promise = getRegistry(msg.uid).learn(
            {
                ...msg,
                callback(data)
                {
                    const result: NetworkProcessorLearnResult =
                        {type: "learn", rid, done: false, data};
                    parentPort!.postMessage(result);
                }
            })
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
    promise = promise.catch(function (error: Error)
    {
        const errBuf = serialize(error);
        const result: PortResultError =
            {type: "error", rid, done: true, errBuf};
        parentPort!.postMessage(result, [errBuf.buffer]);
    });
});
