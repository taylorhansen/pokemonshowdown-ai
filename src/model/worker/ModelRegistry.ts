import {serialize} from "v8";
import {MessageChannel, MessagePort} from "worker_threads";
import * as tf from "@tensorflow/tfjs";
import {ListenerSignature, TypedEmitter} from "tiny-typed-emitter";
import {BatchPredictConfig} from "../../config/types";
import {setTimeoutNs} from "../../util/nanosecond";
import {RawPortResultError} from "../../util/port/PortProtocol";
import {createSupport, ModelMetadata, verifyModel} from "../model";
import {
    ModelPortMessage,
    PredictMessage,
    PredictResult,
    PredictWorkerResult,
} from "../port/ModelPortProtocol";
import {Metrics} from "./Metrics";
import {PredictBatch} from "./PredictBatch";

/** Event for when the model is able to take more batch predict requests. */
const predictReady = Symbol("predictReady");

/** Defines events that the ModelRegistry implements. */
interface Events extends ListenerSignature<{[predictReady]: true}> {
    /** When the model is ready to take another batch prediction. */
    readonly [predictReady]: () => void;
}

/** Manages a neural network registry. */
export class ModelRegistry {
    /** Currently held game worker ports. */
    private readonly ports = new Set<MessagePort>();
    /** Event manager for throttling batch predict requests. */
    private readonly events = new TypedEmitter<Events>();

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
    private predictBatch: PredictBatch;
    /**
     * Resolves once the current batch timer expires, returning true if
     * {@link cancelTimer} is called.
     */
    private timeoutPromise: Promise<boolean> | null = null;
    /**
     * Function to cancel the current batch predict timer and resolve
     * {@link timeoutPromise}.
     */
    private cancelTimer: (() => void) | null = null;
    /** Promise to finish the current batch predict request. */
    private predictPromise: Promise<unknown> | null = null;

    /**
     * Support of the Q value distribution. Used for distributional RL if
     * configured.
     */
    private readonly support?: tf.Tensor;

    /**
     * Creates a ModelRegistry.
     *
     * @param name Name of the model.
     * @param model Neural network object.
     * @param config Configuration for batching predict requests.
     * @param support Reference to the support of the Q value distribution, of
     * shape `[1, 1, atoms]`.
     */
    public constructor(
        public readonly name: string,
        public readonly model: tf.LayersModel,
        private readonly config: BatchPredictConfig,
    ) {
        verifyModel(model);

        const metadata = model.getUserDefinedMetadata() as
            | ModelMetadata
            | undefined;
        if (metadata?.config?.dist) {
            this.support = createSupport(metadata.config.dist).reshape([
                1,
                1,
                metadata.config.dist,
            ]);
        }
        this.predictBatch = new PredictBatch(this.support);

        this.events.setMaxListeners(config.maxSize);
    }

    /** Safely closes ports and disposes the model. */
    public unload(): void {
        for (const port of this.ports) {
            port.close();
        }
        this.model.dispose();
        this.support?.dispose();
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
        tf.tidy(() => {
            if (this.predictLatency.length > 0) {
                const predictLatency = tf.tensor1d(
                    this.predictLatency,
                    "float32",
                );
                this.scopeMetrics?.histogram(
                    "predict_latency_ms",
                    predictLatency,
                    this.scopeStep!,
                    100 /*buckets*/,
                );
                // TODO: Use median instead, more robust to outliers.
                this.scopeMetrics?.scalar(
                    "predict_latency_ms/mean",
                    tf.mean(predictLatency).asScalar(),
                    this.scopeStep!,
                );
                this.predictLatency.length = 0;
            }

            if (this.predictRequestLatency.length > 0) {
                const predictRequestLatency = tf.tensor1d(
                    this.predictRequestLatency,
                    "float32",
                );
                this.scopeMetrics?.histogram(
                    "predict_request_latency_ms",
                    predictRequestLatency,
                    this.scopeStep!,
                    100 /*buckets*/,
                );
                this.scopeMetrics?.scalar(
                    "predict_request_latency_ms/mean",
                    tf.mean(predictRequestLatency).asScalar(),
                    this.scopeStep!,
                );
                this.predictRequestLatency.length = 0;
            }

            if (this.predictSize.length > 0) {
                const predictSize = tf.tensor1d(this.predictSize, "int32");
                this.scopeMetrics?.histogram(
                    "predict_size",
                    predictSize,
                    this.scopeStep!,
                    this.config.maxSize /*buckets*/,
                );
                this.scopeMetrics?.scalar(
                    "predict_size/mean",
                    tf.mean(predictSize).asScalar(),
                    this.scopeStep!,
                );
                this.predictSize.length = 0;
            }
        });
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
            (msg: ModelPortMessage) =>
                msg.type === "predict" &&
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
        port1.on("close", () => this.ports.delete(port1));
        return port2;
    }

    /**
     * Queues a prediction for the neural network. Can be called multiple times
     * while other predict requests are still queued.
     */
    private async predict(msg: PredictMessage): Promise<PredictResult> {
        while (this.predictBatch.length >= this.config.maxSize) {
            await new Promise<void>(res => this.events.once(predictReady, res));
        }

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
        if (this.timeoutPromise) {
            return;
        }

        // Setup batch timer.
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

        if (this.predictPromise) {
            await this.predictPromise;
        }

        const batch = this.predictBatch;
        this.predictBatch = new PredictBatch(this.support);
        this.events.emit(predictReady);

        const startTime = process.hrtime.bigint();
        const results = tf.tidy(
            () => this.model.predictOnBatch(batch.toTensors()) as tf.Tensor,
        );
        await (this.predictPromise = batch
            .resolve(results)
            .finally(() => (results.dispose(), (this.predictPromise = null))));
        const endTime = process.hrtime.bigint();

        if (this.isLocked) {
            this.predictLatency.push(Number(endTime - startTime) / 1e6 /*ms*/);
            this.predictRequestLatency.push(
                ...batch.times.map(t => Number(startTime - t) / 1e6),
            );
            this.predictSize.push(batch.length);
        }
    }
}
