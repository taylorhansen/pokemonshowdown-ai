import {resolve} from "path";
import {deserialize} from "v8";
import {MessagePort, Worker} from "worker_threads";
import {
    BatchPredictConfig,
    ModelConfig,
    TrainConfig,
} from "../../../config/types";
import {WorkerPort} from "../../port/WorkerPort";
import {ModelProtocol, ModelTrainData, ModelWorkerData} from "./ModelProtocol";

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
     * @param metricsPath Path to store metrics in.
     */
    public constructor(gpu = false, metricsPath?: string) {
        const workerData: ModelWorkerData = {
            ...(gpu && {gpu: true}),
            ...(metricsPath && {metricsPath}),
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
     * @param config Config for creating the model when `url` is omitted.
     * @param seed Seed for the random number generator when initializing the
     * model. Only applicable if `url` is omitted.
     * @returns The registered name of the model.
     */
    public async load(
        name: string,
        batchConfig: BatchPredictConfig,
        url?: string,
        config?: ModelConfig,
        seed?: string,
    ): Promise<string> {
        return await new Promise((res, rej) =>
            this.workerPort.postMessage<"load">(
                {
                    type: "load",
                    rid: this.workerPort.nextRid(),
                    name,
                    predict: batchConfig,
                    ...(url && {url}),
                    ...(config && {config}),
                    ...(seed && {seed}),
                },
                [],
                result =>
                    result.type === "error"
                        ? rej(result.err)
                        : res(result.name),
            ),
        );
    }

    /**
     * Deregisters and disposes a model.
     *
     * @param model Name of the model to dispose.
     */
    public async unload(model: string): Promise<void> {
        return await new Promise((res, rej) =>
            this.workerPort.postMessage<"unload">(
                {type: "unload", rid: this.workerPort.nextRid(), model},
                [],
                result => (result.type === "error" ? rej(result.err) : res()),
            ),
        );
    }

    /**
     * Starts the training loop for a model.
     *
     * @param model Model to train.
     * @param config Training config.
     * @param modelPath Path to store model checkpoints.
     * @param logPath Path to store game logs.
     * @param callback Called after each evaluation step with data that should
     * be logged to the user.
     * @returns A Promise that resolves once training is complete or
     * {@link trainStop} is called, or if an error is thrown during training.
     */
    public async train(
        model: string,
        config: TrainConfig,
        modelPath?: string,
        logPath?: string,
        callback?: (data: ModelTrainData<false /*TSerialized*/>) => void,
    ): Promise<void> {
        return await new Promise((res, rej) =>
            this.workerPort.postMessage<"train">(
                {
                    type: "train",
                    rid: this.workerPort.nextRid(),
                    model,
                    config,
                    ...(modelPath && {modelPath}),
                    ...(logPath && {logPath}),
                },
                [],
                result => {
                    if (result.type === "error") {
                        rej(result.err);
                    } else {
                        if (result.done) {
                            res();
                        } else if (callback) {
                            let data: ModelTrainData<false /*TSerialized*/>;
                            if (
                                result.data.type === "rollout" ||
                                result.data.type === "eval"
                            ) {
                                if (result.data.err) {
                                    data = {
                                        ...result.data,
                                        err: deserialize(
                                            result.data.err,
                                        ) as Error,
                                    };
                                } else {
                                    data = {...result.data, err: undefined};
                                }
                            } else {
                                ({data} = result);
                            }
                            callback(data);
                        }
                    }
                },
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
        return await new Promise((res, rej) =>
            this.workerPort.postMessage<"subscribe">(
                {type: "subscribe", rid: this.workerPort.nextRid(), model},
                [],
                result =>
                    result.type === "error"
                        ? rej(result.err)
                        : res(result.port),
            ),
        );
    }
}
