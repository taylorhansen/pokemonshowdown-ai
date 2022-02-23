import {resolve} from "path";
import {MessagePort, Worker} from "worker_threads";
import {WorkerPort} from "../../port/WorkerPort";
import {
    BatchPredictOptions,
    ModelLearnConfig,
    ModelLearnData,
    ModelLearnMessage,
    ModelLoadMessage,
    ModelProtocol,
    ModelSaveMessage,
    ModelSubscribeMessage,
    ModelUnloadMessage,
    ModelWorkerData,
} from "./ModelProtocol";

/** Path to the worker script. */
const workerScriptPath = resolve(__dirname, "worker.js");

/**
 * Manages TensorFlow model operations in a separate worker thread with learning
 * and batch-predict functionality.
 */
export class ModelWorker {
    /** Port wrapper. */
    private readonly workerPort: WorkerPort<ModelProtocol, keyof ModelProtocol>;

    /**
     * Creates a ModelWorker.
     *
     * @param gpu Whether to enable GPU support. Default `false`.
     */
    public constructor(gpu = false) {
        const workerData: ModelWorkerData = {gpu};
        this.workerPort = new WorkerPort(
            new Worker(workerScriptPath, {workerData}),
        );
    }

    /** Safely closes the worker. */
    public async close(): Promise<void> {
        await this.workerPort.close();
    }

    /**
     * Loads and registers a neural network.
     *
     * @param batchOptions Options for batching predict requests.
     * @param url URL to load from. If omitted, creates a default model.
     * @returns A unique identifier for further requests involving this network.
     */
    public async load(
        batchOptions: BatchPredictOptions,
        url?: string,
    ): Promise<number> {
        const msg: ModelLoadMessage = {
            type: "load",
            rid: this.workerPort.nextRid(),
            ...batchOptions,
            ...(url && {url}),
        };

        return await new Promise((res, rej) =>
            this.workerPort.postMessage<"load">(msg, [], result =>
                result.type === "error" ? rej(result.err) : res(result.uid),
            ),
        );
    }

    /**
     * Saves a neural network to disk.
     *
     * @param uid ID of the model to save.
     * @param url URL to save to.
     */
    public async save(uid: number, url: string): Promise<void> {
        const msg: ModelSaveMessage = {
            type: "save",
            rid: this.workerPort.nextRid(),
            uid,
            url,
        };

        return await new Promise((res, rej) =>
            this.workerPort.postMessage<"save">(msg, [], result =>
                result.type === "error" ? rej(result.err) : res(),
            ),
        );
    }

    /**
     * Deregisters and disposes a neural network.
     *
     * @param uid ID of the model to dispose.
     * @param saveUrl If provided, save the neural network to the given url.
     */
    public async unload(uid: number): Promise<void> {
        const msg: ModelUnloadMessage = {
            type: "unload",
            rid: this.workerPort.nextRid(),
            uid,
        };

        return await new Promise((res, rej) =>
            this.workerPort.postMessage<"unload">(msg, [], result =>
                result.type === "error" ? rej(result.err) : res(),
            ),
        );
    }

    /**
     * Requests a unique access port from a neural network. Closing the port
     * will remove this link.
     *
     * @param uid ID of the model.
     * @returns A MessagePort that implements the ModelPort protocol.
     * @see ModelPort
     */
    public async subscribe(uid: number): Promise<MessagePort> {
        const msg: ModelSubscribeMessage = {
            type: "subscribe",
            rid: this.workerPort.nextRid(),
            uid,
        };

        return await new Promise((res, rej) =>
            this.workerPort.postMessage<"subscribe">(msg, [], result =>
                result.type === "error" ? rej(result.err) : res(result.port),
            ),
        );
    }

    /**
     * Queues a learning episode for the model.
     *
     * @param uid ID of the model.
     * @param config Learning config.
     * @param callback Callback after each batch and epoch during the learning
     * step.
     */
    public async learn(
        uid: number,
        config: ModelLearnConfig,
        callback?: (data: ModelLearnData) => void,
    ): Promise<void> {
        const msg: ModelLearnMessage = {
            type: "learn",
            rid: this.workerPort.nextRid(),
            uid,
            ...config,
        };

        return await new Promise((res, rej) =>
            this.workerPort.postMessage<"learn">(msg, [], result => {
                if (result.type === "error") {
                    rej(result.err);
                } else {
                    if (callback && result.data) {
                        callback(result.data);
                    }
                    if (result.done) {
                        res();
                    }
                }
            }),
        );
    }
}
