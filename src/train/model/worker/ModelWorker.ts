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
    ModelLogMessage,
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
     * @param name Name by which to refer to the model.
     * @param batchConfig Options for batching predict requests.
     * @param url URL to load from. If omitted, creates a default model.
     * @param seed Seed for the random number generator when initializing the
     * model. Only applicable if `url` is omitted.
     * @returns The registered name of the model.
     */
    public async load(
        name: string,
        batchConfig: BatchPredictConfig,
        url?: string,
        seed?: string,
    ): Promise<string> {
        const msg: ModelLoadMessage = {
            type: "load",
            rid: this.workerPort.nextRid(),
            name,
            predict: batchConfig,
            ...(url && {url}),
            ...(seed && {seed}),
        };

        return await new Promise((res, rej) =>
            this.workerPort.postMessage<"load">(msg, [], result =>
                result.type === "error" ? rej(result.err) : res(result.name),
            ),
        );
    }

    /**
     * Saves a neural network to disk.
     *
     * @param model Name of the model to save.
     * @param url URL to save to.
     */
    public async save(model: string, url: string): Promise<void> {
        const msg: ModelSaveMessage = {
            type: "save",
            rid: this.workerPort.nextRid(),
            model,
            url,
        };

        return await new Promise((res, rej) =>
            this.workerPort.postMessage<"save">(msg, [], result =>
                result.type === "error" ? rej(result.err) : res(),
            ),
        );
    }

    /**
     * Deregisters and disposes a model.
     *
     * @param model Name of the model to dispose.
     */
    public async unload(model: string): Promise<void> {
        const msg: ModelUnloadMessage = {
            type: "unload",
            rid: this.workerPort.nextRid(),
            model,
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
     * @param model Name of the model.
     * @returns A MessagePort that implements the ModelPort protocol.
     * @see ModelPort
     */
    public async subscribe(model: string): Promise<MessagePort> {
        const msg: ModelSubscribeMessage = {
            type: "subscribe",
            rid: this.workerPort.nextRid(),
            model,
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
     * @param model Name of the model.
     * @param config Learning config.
     * @param callback Callback after each batch and epoch during the learning
     * step.
     */
    public async learn(
        model: string,
        config: ModelLearnConfig,
        callback?: (data: ModelLearnData) => void,
    ): Promise<void> {
        const msg: ModelLearnMessage = {
            type: "learn",
            rid: this.workerPort.nextRid(),
            model,
            config,
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
     * @param from Name of the model to copy weights from.
     * @param to Name of the model to copy weights to.
     */
    public async copy(from: string, to: string): Promise<void> {
        const msg: ModelCopyMessage = {
            type: "copy",
            rid: this.workerPort.nextRid(),
            from,
            to,
        };

        return await new Promise((res, rej) =>
            this.workerPort.postMessage<"copy">(msg, [], result =>
                result.type === "error" ? rej(result.err) : res(),
            ),
        );
    }

    /**
     * Logs metrics to Tensorboard.
     *
     * @param name Name of the current training run, under which to store logs.
     * @param step Current episode iteration of the training run.
     * @param logs Dictionary of metrics to log.
     */
    public async log(
        name: string,
        step: number,
        logs: {readonly [key: string]: number},
    ): Promise<void> {
        const msg: ModelLogMessage = {
            type: "log",
            rid: this.workerPort.nextRid(),
            name,
            step,
            logs,
        };

        return await new Promise((res, rej) =>
            this.workerPort.postMessage<"log">(msg, [], result =>
                result.type === "error" ? rej(result.err) : res(),
            ),
        );
    }
}
