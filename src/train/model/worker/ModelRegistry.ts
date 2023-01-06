import {serialize} from "v8";
import {MessageChannel, MessagePort} from "worker_threads";
import * as tf from "@tensorflow/tfjs";
import {BatchPredictConfig} from "../../../config/types";
import {modelInputShapes, verifyModel} from "../../../model/shapes";
import {intToChoice} from "../../../psbot/handlers/battle/agent";
import {setTimeoutNs} from "../../../util/nanosecond";
import {RawPortResultError} from "../../port/PortProtocol";
import {
    PredictMessage,
    PredictResult,
    PredictWorkerResult,
} from "../port/ModelPortProtocol";
import {Metrics} from "./Metrics";
import {PredictBatch} from "./PredictBatch";

/** Manages a neural network registry. */
export class ModelRegistry {
    /** Neural network object. */
    public readonly model: tf.LayersModel;
    /** Currently held game worker ports. */
    private readonly ports = new Set<MessagePort>();

    private scopeName: string | null = null;
    private scopeStep: number | null = null;
    /** Metrics logger for the current scope. */
    private scopeMetrics: Metrics | null = null;
    /** Time it takes for the model to process a batch, in milliseconds. */
    private readonly predictLatency: number[] = [];
    /** Time it takes for requests to arrive at the model, in milliseconds. */
    private readonly predictRequestLatency: number[] = [];
    /** Number of requests getting batched and sent to the model at once. */
    private readonly predictSize: number[] = [];

    /** Current pending predict request batch. */
    private predictBatch = new PredictBatch(modelInputShapes);
    /**
     * Resolves once the current batch timer expires, returning true if
     * {@link cancelTimer} is called.
     */
    private timeoutPromise: Promise<boolean> | null = null;
    /** Function to cancel the current batch predict timer. */
    private cancelTimer: (() => void) | null = null;

    /**
     * Creates a ModelRegistry.
     *
     * @param name Name of the model.
     * @param model Neural network object. This registry object will own the
     * model as soon as the constructor is called.
     * @param config Configuration for batching predict requests.
     */
    public constructor(
        public readonly name: string,
        model: tf.LayersModel,
        private readonly config: BatchPredictConfig,
    ) {
        try {
            verifyModel(model);
        } catch (e) {
            // Cleanup model so it doesn't cause a memory leak.
            model.dispose();
            throw e;
        }
        this.model = model;
    }

    /** Clones the current model into a new registry with the same config. */
    public async clone(name: string): Promise<ModelRegistry> {
        const modelArtifact = new Promise<tf.io.ModelArtifacts>(
            res =>
                void this.model.save({
                    save: async _modelArtifact => {
                        res(_modelArtifact);
                        return await Promise.resolve({} as tf.io.SaveResult);
                    },
                }),
        );
        const clonedModel = await tf.loadLayersModel({
            load: async () => await Promise.resolve(modelArtifact),
        });
        return new ModelRegistry(name, clonedModel, this.config);
    }

    /** Saves the neural network to the given url. */
    public async save(url: string): Promise<void> {
        await this.model.save(url);
    }

    /** Safely closes ports and disposes the model. */
    public unload(): void {
        for (const port of this.ports) {
            port.close();
        }
        this.model.dispose();
    }

    /** Locks the model under a scope name and step number. */
    public lock(name: string, step: number): void {
        if (this.scopeName === name && this.scopeStep === step) {
            return;
        }
        if (this.isLocked) {
            throw new Error(
                `Already locked under scope '${name}' (step=${step})`,
            );
        }
        this.scopeName = name;
        this.scopeStep = step;
        this.scopeMetrics = Metrics.get(`${name}/model/${this.name}`);
    }

    /**
     * Whether {@link lock} was called and {@link unlock} hasn't yet been
     * called.
     */
    public get isLocked(): boolean {
        return this.scopeName !== null && this.scopeStep !== null;
    }

    /** Unlocks the scope and compiles summary logs. */
    public unlock(): void {
        if (!this.isLocked) {
            return;
        }
        this.scopeMetrics?.histogram(
            `predict_latency_ms`,
            tf.tensor1d(this.predictLatency),
            this.scopeStep!,
        );
        this.predictLatency.length = 0;
        this.scopeMetrics?.histogram(
            `predict_request_latency_ms`,
            tf.tensor1d(this.predictRequestLatency),
            this.scopeStep!,
        );
        this.predictRequestLatency.length = 0;
        this.scopeMetrics?.histogram(
            `predict_size`,
            tf.tensor1d(this.predictSize, "int32"),
            this.scopeStep!,
            this.config.maxSize,
        );
        this.predictSize.length = 0;
        this.scopeName = null;
        this.scopeStep = null;
        this.scopeMetrics = null;
    }

    /**
     * Indicates that a game worker is subscribing to a model.
     *
     * @returns A port for queueing predictions that the game worker will use.
     */
    public subscribe(): MessagePort {
        const {port1, port2} = new MessageChannel();
        this.ports.add(port1);
        port1.on(
            "message",
            (msg: PredictMessage) =>
                void this.predict(msg)
                    .then(prediction => {
                        const result: PredictWorkerResult = {
                            type: "predict",
                            rid: msg.rid,
                            done: true,
                            ...prediction,
                        };
                        port1.postMessage(result, [result.output.buffer]);
                    })
                    .catch(err => {
                        const result: RawPortResultError = {
                            type: "error",
                            rid: msg.rid,
                            done: true,
                            err: serialize(err),
                        };
                        port1.postMessage(result, [result.err.buffer]);
                    }),
        );
        // Remove this port from the recorded references after close.
        port1.on("close", () => this.ports.delete(port1));
        return port2;
    }

    /** Copies the weights of the current model to the given model. */
    public copyTo(other: ModelRegistry): void {
        other.model.setWeights(this.model.getWeights());
    }

    /** Queues a prediction for the neural network. */
    private async predict(msg: PredictMessage): Promise<PredictResult> {
        const result = new Promise<PredictResult>(res =>
            this.predictBatch.add(msg.state, res),
        );
        await this.checkPredictBatch();
        return await result;
    }

    /**
     * Checks batch size and timer to see if the predict batch should be
     * executed.
     */
    private async checkPredictBatch(): Promise<void> {
        if (this.predictBatch.length >= this.config.maxSize) {
            // Full batch.
            await this.executeBatch();
            return;
        }

        // Setup batch timer.
        if (this.timeoutPromise) {
            return;
        }
        this.timeoutPromise = new Promise<boolean>(
            res =>
                (this.cancelTimer = setTimeoutNs(res, this.config.timeoutNs)),
        ).finally(() => {
            this.timeoutPromise = null;
            this.cancelTimer = null;
        });
        if (!(await this.timeoutPromise)) {
            // Batch timer expired on its own.
            await this.executeBatch();
        }
    }

    /** Flushes the predict buffer and executes the batch. */
    private async executeBatch(): Promise<void> {
        if (this.predictBatch.length <= 0) {
            return;
        }
        this.cancelTimer?.();

        const batch = this.predictBatch;
        this.predictBatch = new PredictBatch(modelInputShapes);

        const startTime = process.hrtime.bigint();
        await batch.resolve(
            tf.tidy(() =>
                (this.model.predictOnBatch(batch.toTensors()) as tf.Tensor)
                    .as2D(batch.length, intToChoice.length)
                    .unstack<tf.Tensor1D>(),
            ),
        );
        const endTime = process.hrtime.bigint();

        if (this.isLocked) {
            this.predictLatency.push(Number(endTime - startTime) / 1e6 /*ms*/);
            this.predictRequestLatency.push(
                ...batch.times.map(t => Number(startTime - t) / 1e6 /*ms*/),
            );
            this.predictSize.push(batch.length);
        }
    }
}
