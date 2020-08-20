import { resolve } from "path";
import { MessagePort, Worker } from "worker_threads";
import { AsyncPort } from "./helpers/AsyncPort";
import { NetworkProcessorLearnConfig, NetworkProcessorLearnData,
    NetworkProcessorLearnMessage, NetworkProcessorLoadMessage,
    NetworkProcessorRequestMap, NetworkProcessorSaveMessage,
    NetworkProcessorSubscribeMessage, NetworkProcessorUnloadMessage } from
    "./helpers/NetworkProcessorRequest";

/** Path to the worker script. */
const workerScriptPath = resolve(__dirname, "helpers", "worker.js");

/** Manages TensorFlow neural network operations in a separate thread. */
export class NetworkProcessor extends
    AsyncPort<NetworkProcessorRequestMap, Worker>
{
    /**
     * Creates a NetworkProcessor.
     * @param gpu Whether to enable GPU support.
     */
    constructor(gpu = false)
    {
        super(new Worker(workerScriptPath, {workerData: {gpu}}));
    }

    /** @override */
    public async close(): Promise<void> { await this.port.terminate(); }

    /**
     * Loads and registers a neural network.
     * @param url URL to load from. If omitted, create a default model.
     * @returns A unique identifier for further requests involving this network.
     */
    public load(url?: string): Promise<number>
    {
        const msg: NetworkProcessorLoadMessage =
            {type: "load", rid: this.generateRID(), ...(url && {url})};

        return new Promise((res, rej) =>
            this.postMessage<"load">(msg, [],
                result => result.type === "error" ?
                    rej(result.err) : res(result.uid)));
    }

    /**
     * Saves a neural network to disk.
     * @param uid ID of the network to save.
     * @param url URL to save to.
     */
    public save(uid: number, url: string): Promise<void>
    {
        const msg: NetworkProcessorSaveMessage =
            {type: "save", rid: this.generateRID(), uid, url};

        return new Promise((res, rej) =>
            this.postMessage<"save">(msg, [],
                result => result.type === "error" ? rej(result.err) : res()));
    }

    /**
     * Deregisters and disposes a neural network.
     * @param uid ID of the network to dispose.
     * @param saveUrl If provided, save the neural network to the given url.
     */
    public unload(uid: number): Promise<void>
    {
        const msg: NetworkProcessorUnloadMessage =
            {type: "unload", rid: this.generateRID(), uid};

        return new Promise((res, rej) =>
            this.postMessage<"unload">(msg, [],
                result => result.type === "error" ? rej(result.err) : res()));
    }

    /**
     * Requests a unique game worker port from a neural network. This is
     * intended to be used by a ModelPort object in a game worker thread.
     * Closing the port will remove this link.
     * @param uid ID of the network.
     * @see ModelPort
     */
    public subscribe(uid: number): Promise<MessagePort>
    {
        const msg: NetworkProcessorSubscribeMessage =
            {type: "subscribe", rid: this.generateRID(), uid};

        return new Promise((res, rej) =>
            this.postMessage<"subscribe">(msg, [],
                result => result.type === "error" ?
                        rej(result.err) : res(result.port)));
    }

    /**
     * Queues a learning episode.
     * @param uid ID of the network.
     * @param config Learning config.
     * @param callback Callback after each batch and epoch during the learning
     * step.
     */
    public learn(uid: number, config: NetworkProcessorLearnConfig,
        callback?: (data: NetworkProcessorLearnData) => void): Promise<void>
    {
        const msg: NetworkProcessorLearnMessage =
            {type: "learn", rid: this.generateRID(), uid, ...config};

        const transferList: ArrayBuffer[] = [];
        for (const sample of config.samples)
        {
            transferList.push(sample.state.buffer, sample.logProbs.buffer);
        }

        return new Promise((res, rej) =>
            this.postMessage<"learn">(msg, transferList, result =>
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
