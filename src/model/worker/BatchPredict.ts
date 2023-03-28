import {serialize} from "v8";
import {MessageChannel, MessagePort} from "worker_threads";
import * as tf from "@tensorflow/tfjs";
import {ListenerSignature, TypedEmitter} from "tiny-typed-emitter";
import {BatchPredictConfig} from "../../config/types";
import {setTimeoutNs} from "../../util/nanosecond";
import {RawPortResultError} from "../../util/port/PortProtocol";
import {
    ModelPortMessage,
    PredictResult,
    PredictWorkerResult,
} from "../port/ModelPortProtocol";
import {
    flattenedInputShapes,
    modelInputNames,
    modelInputShapes,
} from "../shapes";
import {Metrics} from "./Metrics";
import {ModelRegistry} from "./ModelRegistry";

/** Event for when the model is able to take more batch predict requests. */
const predictReady = Symbol("predictReady");

interface Events extends ListenerSignature<{[predictReady]: true}> {
    readonly [predictReady]: () => void;
}

/** Batch predict profile for a neural network model. */
export class BatchPredict {
    /** Active ports that receive predict requests. */
    private readonly ports = new Set<MessagePort>();
    /** Event manager for syncing and throttling batch predict requests. */
    private readonly events = new TypedEmitter<Events>();

    /** Name of current metrics profile. */
    private profileName: string | null = null;
    /** Step number for metrics profile. */
    private profileStep: number | null = null;
    /** Metrics logger for metrics profile. */
    private profileMetrics: Metrics | null = null;
    /** Time it takes for the model to process a batch, in milliseconds. */
    private readonly predictLatency: number[] = [];
    /** Time it takes for requests to arrive at the model, in milliseconds. */
    private readonly predictRequestLatency: number[] = [];
    /** Number of requests getting batched and sent to the model at once. */
    private readonly predictSize: number[] = [];

    /**
     * List of batched input arrays for each of the inputs that the model
     * receives.
     *
     * The outer array corresponds to each of the model's inputs, whereas the
     * inner array corresponds to each individual request that we're batching
     * (corresponds to {@link callbacks}).
     */
    private inputs: Float32Array[][] = Array.from(modelInputShapes, () => []);
    /** Resolver callbacks for each request within the batch. */
    private callbacks: ((result: PredictResult) => void)[] = [];
    /** Corresponding times that the requests were {@link add added}. */
    private times: bigint[] = [];

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
     * Creates a BatchPredict profile.
     *
     * @param name Name of the profile.
     * @param model Neural network object for serving predictions.
     * @param config Configuration for automatically batching and executing
     * predict requests.
     */
    public constructor(
        public readonly name: string,
        public readonly model: ModelRegistry,
        private readonly config: BatchPredictConfig,
    ) {
        this.events.setMaxListeners(config.maxSize);
    }

    /**
     * Safely closes ports and destroys this profile.
     *
     * After calling (*not* after resolving), {@link predict} should not be
     * called.
     */
    public async destroy(): Promise<void> {
        for (const port of this.ports) {
            port.close();
        }

        while (this.callbacks.length > 0) {
            await new Promise<void>(res => this.events.once(predictReady, res));
            // Hope that pending predict() calls will queue up before we fully
            // close the profile.
            await tf.nextFrame();
        }
        await this.predictPromise;

        this.endMetrics(false /*storeMetrics*/);
    }

    /** Starts a metrics profile under the given name and step number. */
    public startMetrics(name: string, step: number): void {
        if (this.profileName === name && this.profileStep === step) {
            return;
        }
        if (this.isCollectingMetrics) {
            throw new Error(
                `Already locked under scope '${name}' (step=${step})`,
            );
        }
        this.profileName = name;
        this.profileStep = step;
        this.profileMetrics = Metrics.get(
            `${name}/model/${this.model.name}/${this.name}`,
        );
        this.predictLatency.length = 0;
        this.predictRequestLatency.length = 0;
        this.predictSize.length = 0;
    }

    /**
     * Whether {@link startMetrics} was called and {@link endMetrics} hasn't yet
     * been called.
     */
    public get isCollectingMetrics(): boolean {
        return this.profileName !== null && this.profileStep !== null;
    }

    /** Ends the metrics profile and compiles summary logs. */
    public endMetrics(storeMetrics = true): void {
        if (!this.isCollectingMetrics) {
            return;
        }
        if (storeMetrics && this.profileMetrics) {
            tf.tidy(() => {
                if (this.predictLatency.length > 0) {
                    const predictLatency = tf.tensor1d(
                        this.predictLatency,
                        "float32",
                    );
                    this.profileMetrics!.histogram(
                        "predict_latency_ms",
                        predictLatency,
                        this.profileStep!,
                    );
                    // TODO: Use median instead, more robust to outliers.
                    this.profileMetrics!.scalar(
                        "predict_latency_ms/mean",
                        tf.mean(predictLatency).asScalar(),
                        this.profileStep!,
                    );
                    predictLatency.dispose();
                }

                if (this.predictRequestLatency.length > 0) {
                    const predictRequestLatency = tf.tensor1d(
                        this.predictRequestLatency,
                        "float32",
                    );
                    this.profileMetrics!.histogram(
                        "predict_request_latency_ms",
                        predictRequestLatency,
                        this.profileStep!,
                    );
                    this.profileMetrics!.scalar(
                        "predict_request_latency_ms/mean",
                        tf.mean(predictRequestLatency).asScalar(),
                        this.profileStep!,
                    );
                    predictRequestLatency.dispose();
                }

                if (this.predictSize.length > 0) {
                    const predictSize = tf.tensor1d(this.predictSize, "int32");
                    this.profileMetrics!.histogram(
                        "predict_size",
                        predictSize,
                        this.profileStep!,
                    );
                    this.profileMetrics!.scalar(
                        "predict_size/mean",
                        tf.mean(predictSize).asScalar(),
                        this.profileStep!,
                    );
                    predictSize.dispose();
                }
            });
        }
        this.profileName = null;
        this.profileStep = null;
        this.profileMetrics = null;
        this.predictLatency.length = 0;
        this.predictRequestLatency.length = 0;
        this.predictSize.length = 0;
    }

    /**
     * Creates a unique message port for requesting predictions. Requests from
     * multiple ports are batched and executed as one inference. Obeys the
     * ModelPort protocol.
     */
    public subscribe(): MessagePort {
        const {port1, port2} = new MessageChannel();
        this.ports.add(port1);
        port1.on(
            "message",
            (msg: ModelPortMessage) =>
                msg.type === "predict" &&
                void this.predict(msg.state)
                    .then(result => {
                        const workerResult: PredictWorkerResult = {
                            type: "predict",
                            rid: msg.rid,
                            done: true,
                            ...result,
                        };
                        // Note: Prediction buffers can't be transfered since
                        // the results each share a slice of it within the total
                        // batch.
                        port1.postMessage(workerResult);
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
    public async predict(state: Float32Array[]): Promise<PredictResult> {
        if (state.length !== modelInputShapes.length) {
            throw new Error(
                `Expected ${modelInputShapes.length} inputs but found ` +
                    `${state.length}`,
            );
        }
        for (let i = 0; i < modelInputShapes.length; ++i) {
            if (state[i].length !== flattenedInputShapes[i]) {
                throw new Error(
                    `Model input ${i} (${modelInputNames[i]}) requires ` +
                        `${flattenedInputShapes[i]} elements but got ` +
                        `${state[i].length}`,
                );
            }
        }

        while (this.callbacks.length >= this.config.maxSize) {
            await new Promise<void>(res => this.events.once(predictReady, res));
        }

        for (let i = 0; i < modelInputShapes.length; ++i) {
            this.inputs[i].push(state[i]);
        }
        if (this.isCollectingMetrics) {
            this.times.push(process.hrtime.bigint());
        }

        const result = new Promise<PredictResult>(res =>
            this.callbacks.push(res),
        );
        await this.checkPredictBatch();
        return await result;
    }

    /**
     * Checks batch size and timer to see if the predict batch should be
     * executed.
     */
    private async checkPredictBatch(): Promise<void> {
        if (this.callbacks.length >= this.config.maxSize) {
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
        if (this.callbacks.length <= 0) {
            return;
        }
        this.cancelTimer?.();

        if (this.predictPromise) {
            await this.predictPromise;
        }

        const {inputs, callbacks, times} = this;
        this.inputs = Array.from(modelInputShapes, () => []);
        this.callbacks = [];
        this.times = [];
        this.events.emit(predictReady);

        const startTime = this.isCollectingMetrics && process.hrtime.bigint();

        const results = await (this.predictPromise = this.model
            .predictOnBatch(inputs)
            .finally(() => (this.predictPromise = null)));
        for (let i = 0; i < callbacks.length; ++i) {
            callbacks[i]({output: results[i]});
        }

        const endTime = this.isCollectingMetrics && process.hrtime.bigint();

        if (startTime && endTime) {
            this.predictLatency.push(Number(endTime - startTime) / 1e6 /*ms*/);
            this.predictRequestLatency.push(
                ...times.map(t => Number(startTime - t) / 1e6),
            );
            this.predictSize.push(callbacks.length);
        }
    }
}
