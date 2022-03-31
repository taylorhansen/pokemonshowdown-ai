import {resolve} from "path";
import {MessagePort, Worker} from "worker_threads";
import {BatchPredictConfig} from "../../../config/types";
import {WorkerPort} from "../../port/WorkerPort";
import {
    ModelCopyMessage,
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
     * @param logPath Path to store logs in.
     */
    public constructor(gpu = false, logPath?: string) {
        const workerData: ModelWorkerData = {
            ...(gpu && {gpu: true}),
            ...(logPath && {logPath}),
        };
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
     * @param batchConfig Options for batching predict requests.
     * @param url URL to load from. If omitted, creates a default model.
     * @returns A unique identifier for further requests involving this network.
     */
    public async load(
        batchConfig: BatchPredictConfig,
        url?: string,
    ): Promise<number> {
        const msg: ModelLoadMessage = {
            type: "load",
            rid: this.workerPort.nextRid(),
            ...batchConfig,
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

    /**
     * Copies the weights from one model to another.
     *
     * @param uidFrom ID of the model to copy weights from.
     * @param uidTo ID of the model to copy weights to.
     */
    public async copy(uidFrom: number, uidTo: number): Promise<void> {
        const msg: ModelCopyMessage = {
            type: "copy",
            rid: this.workerPort.nextRid(),
            uidFrom,
            uidTo,
        };

        return await new Promise((res, rej) =>
            this.workerPort.postMessage<"copy">(msg, [], result =>
                result.type === "error" ? rej(result.err) : res(),
            ),
        );
    }
}
