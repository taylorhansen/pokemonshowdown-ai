import { resolve } from "path";
import { MessagePort, Worker } from "worker_threads";
import { FormatType } from "../../../psbot/handlers/battle/formats";
import { WorkerPort } from "../../port/WorkerPort";
import { BatchPredictOptions, ModelLearnConfig, ModelLearnData,
    ModelLearnMessage, ModelLoadMessage, ModelProtocol, ModelSaveMessage,
    ModelSubscribeMessage, ModelUnloadMessage } from "./ModelProtocol";

/** Path to the worker script. */
const workerScriptPath = resolve(__dirname, "worker.js");

/**
 * Manages TensorFlow model operations in a separate worker thread with learning
 * and batch-predict functionality.
 */
export class ModelWorker
{
    /** Port wrapper. */
    private readonly workerPort: WorkerPort<ModelProtocol, keyof ModelProtocol>;

    /**
     * Creates a Model.
     *
     * @param format Game format type, used to verify input shape.
     * @param gpu Whether to enable GPU support. Default false.
     */
    constructor(format: FormatType, gpu = false)
    {
        this.workerPort = new WorkerPort(
            new Worker(workerScriptPath, {workerData: {format, gpu}}));
    }

    /** Safely closes the worker. */
    public async close(): Promise<void> { await this.workerPort.close(); }

    /**
     * Loads and registers a neural network.
     *
     * @param url URL to load from. If omitted, creates a default model.
     * @param batchOptions Options for batching predict requests.
     * @returns A unique identifier for further requests involving this network.
     */
    public load(batchOptions: BatchPredictOptions, url?: string):
        Promise<number>
    {
        const msg: ModelLoadMessage =
        {
            type: "load", rid: this.workerPort.nextRid(), ...batchOptions,
            ...url && {url}
        };

        return new Promise((res, rej) =>
            this.workerPort.postMessage<"load">(msg, [],
                result => result.type === "error" ?
                    rej(result.err) : res(result.uid)));
    }

    /**
     * Saves a neural network to disk.
     *
     * @param uid ID of the network to save.
     * @param url URL to save to.
     */
    public save(uid: number, url: string): Promise<void>
    {
        const msg: ModelSaveMessage =
            {type: "save", rid: this.workerPort.nextRid(), uid, url};

        return new Promise((res, rej) =>
            this.workerPort.postMessage<"save">(msg, [],
                result => result.type === "error" ? rej(result.err) : res()));
    }

    /**
     * Deregisters and disposes a neural network.
     *
     * @param uid ID of the network to dispose.
     * @param saveUrl If provided, save the neural network to the given url.
     */
    public unload(uid: number): Promise<void>
    {
        const msg: ModelUnloadMessage =
            {type: "unload", rid: this.workerPort.nextRid(), uid};

        return new Promise((res, rej) =>
            this.workerPort.postMessage<"unload">(msg, [],
                result => result.type === "error" ? rej(result.err) : res()));
    }

    /**
     * Requests a unique access port from a neural network. Closing the port
     * will remove this link.
     *
     * @param uid ID of the network.
     * @returns A MessagePort that implements the ModelPort protocol.
     * @see ModelPort
     */
    public subscribe(uid: number): Promise<MessagePort>
    {
        const msg: ModelSubscribeMessage =
            {type: "subscribe", rid: this.workerPort.nextRid(), uid};

        return new Promise((res, rej) =>
            this.workerPort.postMessage<"subscribe">(msg, [],
                result =>
                    result.type === "error" ?
                        rej(result.err) : res(result.port)));
    }

    /**
     * Queues a learning episode.
     *
     * @param uid ID of the network.
     * @param config Learning config.
     * @param callback Callback after each batch and epoch during the learning
     * step.
     */
    public learn(uid: number, config: ModelLearnConfig,
        callback?: (data: ModelLearnData) => void): Promise<void>
    {
        const msg: ModelLearnMessage =
            {type: "learn", rid: this.workerPort.nextRid(), uid, ...config};

        return new Promise((res, rej) =>
            this.workerPort.postMessage<"learn">(msg, [], result =>
            {
                if (result.type === "error") rej(result.err);
                else
                {
                    if (callback && result.data) callback(result.data);
                    if (result.done) res();
                }
            }));
    }
}
