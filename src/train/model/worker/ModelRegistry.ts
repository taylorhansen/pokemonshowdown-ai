import {EventEmitter} from "stream";
import {serialize} from "v8";
import {MessageChannel, MessagePort} from "worker_threads";
import * as tf from "@tensorflow/tfjs";
import {ListenerSignature, TypedEmitter} from "tiny-typed-emitter";
import {BatchPredictConfig} from "../../../config/types";
import {intToChoice} from "../../../psbot/handlers/battle/agent";
import {setTimeoutNs} from "../../../util/nanosecond";
import {RawPortResultError} from "../../port/PortProtocol";
import {LearnArgs} from "../learn";
import {learn} from "../learn/learn";
import {
    PredictMessage,
    PredictResult,
    PredictWorkerResult,
} from "../port/ModelPortProtocol";
import {modelInputShapes, verifyModel} from "../shapes";
import {Metrics} from "./Metrics";
import {ModelLearnData} from "./ModelProtocol";
import {PredictBatch} from "./PredictBatch";

/** Event for when the current batch should be executed. */
const batchExecute = Symbol("batchExecute");

/** Describes the events emitted by {@link ModelRegistry.batchEvents}. */
interface BatchEvents extends ListenerSignature<{[batchExecute]: true}> {
    readonly [batchExecute]: () => void;
}

/** Manages a neural network registry. */
export class ModelRegistry {
    /** Neural network object. */
    private readonly model: tf.LayersModel;
    /** Currently held game worker ports. */
    private readonly ports = new Set<MessagePort>();

    /** Event listener for batch entries. */
    private readonly predictBatchEvents =
        // Note: TypedEmitter ctor doesn't contain option typings.
        new EventEmitter({
            captureRejections: true,
        }) as TypedEmitter<BatchEvents>;
    /** Current pending predict request batch. */
    private predictBatch = new PredictBatch(modelInputShapes);
    /** Resolves once the current batch timer expires. */
    private timeoutPromise: Promise<void> | null = null;
    /** Function to cancel the current batch predict timer. */
    private cancelTimer: (() => void) | null = null;

    private firstRequestTime: bigint | null = null;
    /** Metrics logger. */
    private readonly metrics: Metrics | null;

    /**
     * Creates a ModelRegistry.
     *
     * @param name Name of the model.
     * @param model Neural network object. This registry object will own the
     * model as soon as the constructor is called.
     * @param config Configuration for batching predict requests.
     */
    public constructor(
        name: string,
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

        // Setup batch event listener.
        this.predictBatchEvents.on(batchExecute, () => this.executeBatch());

        this.metrics = Metrics.get(`model/${name}`);
        this.logNumSubscribers();
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
        port1.on("close", () => {
            this.ports.delete(port1);
            this.logNumSubscribers();
        });
        this.logNumSubscribers();
        return port2;
    }

    /**
     * Runs a learning episode.
     *
     * @param config Learning config.
     * @param callback Callback for tracking the training process.
     */
    public async learn(
        config: LearnArgs,
        callback?: (data: ModelLearnData) => void,
    ): Promise<void> {
        await learn(config, this.model, callback);
    }

    /** Copies the weights of the current model to the given model. */
    public copyTo(other: ModelRegistry): void {
        other.model.setWeights(this.model.getWeights());
    }

    /** Queues a prediction for the neural network. */
    private async predict(msg: PredictMessage): Promise<PredictResult> {
        if (this.firstRequestTime === null) {
            this.firstRequestTime = process.hrtime.bigint();
        }
        return await new Promise(res => {
            this.predictBatch.add(msg.state, res);
            this.checkPredictBatch();
        });
    }

    /**
     * Checks batch size and timer to see if the predict batch should be
     * executed.
     */
    private checkPredictBatch(): void {
        if (this.predictBatch.length >= this.config.maxSize) {
            // Full batch.
            this.predictBatchEvents.emit(batchExecute);
            return;
        }

        // Batch timer is already setup.
        if (this.timeoutPromise) {
            return;
        }

        // Setup batch timer.
        let didTimeout = false;
        this.timeoutPromise = new Promise<boolean>(
            res =>
                (this.cancelTimer = setTimeoutNs(res, this.config.timeoutNs)),
        )
            .then(canceled => void (didTimeout = !canceled))
            .finally(() => {
                this.timeoutPromise = null;
                this.cancelTimer = null;
            });

        // If the timer expires before the batch filled up, execute the batch as
        // it is.
        Promise.race([
            this.timeoutPromise.then(() => (didTimeout = true)),
            new Promise<void>(res =>
                this.predictBatchEvents.prependOnceListener(batchExecute, res),
            ).finally(this.cancelTimer),
        ]).finally(() => {
            if (didTimeout) {
                this.predictBatchEvents.emit(batchExecute);
            }
        });
    }

    /** Flushes the predict buffer and executes the batch. */
    private executeBatch(): void {
        if (this.predictBatch.length <= 0) {
            return;
        }

        // Consume batch.
        const batch = this.predictBatch;
        this.predictBatch = new PredictBatch(modelInputShapes);

        // Stack batches and execute model.
        const startTime = process.hrtime.bigint();
        batch.resolve(
            tf.tidy(() =>
                (this.model.predictOnBatch(batch.toTensors()) as tf.Tensor)
                    .as2D(batch.length, intToChoice.length)
                    .unstack<tf.Tensor1D>()
                    .map(t => t.dataSync() as Float32Array),
            ),
        );
        const endTime = process.hrtime.bigint();

        const step = ModelRegistry.getLogStep();
        this.metrics?.scalar(
            "predict_latency_us",
            Number(endTime - startTime) / 1e3 /*us*/,
            step,
        );
        this.metrics?.scalar("predict_size", batch.length, step);
        if (this.firstRequestTime !== null) {
            this.metrics?.scalar(
                "predict_request_latency_us",
                Number(startTime - this.firstRequestTime) / 1e3,
                step,
            );
            this.firstRequestTime = null;
        }
    }

    private logNumSubscribers(): void {
        this.metrics?.scalar(
            "num_subscribers",
            this.ports.size,
            ModelRegistry.getLogStep(),
        );
    }

    /** Gets a timestamp for use with Metrics. */
    private static getLogStep(): number {
        // Getting around integer limits. Should be ok as long as uptime doesn't
        // exceed 7 weeks.
        return Math.floor(process.uptime() * 1000 /*ms*/);
    }
}
