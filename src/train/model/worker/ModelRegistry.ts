import {EventEmitter} from "stream";
import {serialize} from "v8";
import {MessageChannel, MessagePort} from "worker_threads";
import * as tf from "@tensorflow/tfjs";
import {ListenerSignature, TypedEmitter} from "tiny-typed-emitter";
import {BatchPredictConfig} from "../../../config/types";
import {intToChoice} from "../../../psbot/handlers/battle/agent";
import {learn, LearnArgsPartial} from "../../learn";
import {RawPortResultError} from "../../port/PortProtocol";
import {modelInputShapes, verifyModel} from "../shapes";
import {
    PredictMessage,
    PredictResult,
    PredictWorkerResult,
} from "./ModelPortProtocol";
import {ModelLearnData} from "./ModelProtocol";
import {setTimeoutNs} from "./nanosecond";

/** State+callback entry for a {@link ModelRegistry}'s batch queue. */
interface BatchEntry {
    /** Encoded battle state. */
    readonly state: Float32Array[];
    /** Callback after getting the prediction for the given state. */
    readonly res: (result: PredictResult) => void;
}

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

    /** Prediction request buffer. */
    private readonly nextBatch: BatchEntry[] = [];
    /** Event listener for batch entries. */
    private readonly batchEvents =
        // Note: TypedEmitter doesn't contain option typings.
        new EventEmitter({
            captureRejections: true,
        }) as TypedEmitter<BatchEvents>;
    /** Resolves once the current batch timer expires. */
    private timeoutPromise: Promise<void> | null = null;
    /** Function to cancel the current timer. */
    private cancelTimer: (() => void) | null = null;
    /** Lock promise for managing the neural network resource. */
    private inUse: Promise<unknown>;

    /**
     * Creates a ModelRegistry.
     *
     * @param model Neural network object.
     * @param config Configuration for batching predict requests.
     */
    public constructor(
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
        this.batchEvents.on(batchExecute, () => this.executeBatch());

        this.inUse = Promise.resolve();
    }

    /** Clones the current model into a new registry with the same config. */
    public async clone(): Promise<ModelRegistry> {
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
        return new ModelRegistry(clonedModel, this.config);
    }

    /** Saves the neural network to the given url. */
    public async save(url: string): Promise<void> {
        await this.inUse;
        await this.model.save(url);
    }

    /** Deletes everything in this registry. */
    public async unload(): Promise<void> {
        await this.inUse;
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
        port1.on("close", () => this.ports.delete(port1));
        return port2;
    }

    /**
     * Queues a learning episode.
     *
     * @param config Learning config.
     * @param callback Callback for tracking the training process.
     */
    public async learn(
        config: LearnArgsPartial,
        callback?: (data: ModelLearnData) => void,
    ): Promise<void> {
        this.inUse = this.inUse.then(
            async () =>
                await learn({
                    ...config,
                    model: this.model,
                    ...(callback && {callback}),
                }),
        );
        await this.inUse;
    }

    /** Copies the weights of the current model to the given model. */
    public copyTo(other: ModelRegistry): void {
        other.model.setWeights(this.model.getWeights());
    }

    /** Queues a prediction for the neural network. */
    private async predict(msg: PredictMessage): Promise<PredictResult> {
        return await new Promise(res => {
            this.nextBatch.push({state: msg.state, res});
            this.checkPredictBatch();
        });
    }

    /**
     * Checks batch size and timer to see if the predict batch should be
     * executed.
     */
    private checkPredictBatch(): void {
        if (this.nextBatch.length >= this.config.maxSize) {
            // Full batch.
            this.batchEvents.emit(batchExecute);
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
                this.batchEvents.prependOnceListener(batchExecute, res),
            ).finally(this.cancelTimer),
        ]).finally(() => {
            if (didTimeout) {
                this.batchEvents.emit(batchExecute);
            }
        });
    }

    /** Flushes the predict buffer and executes the batch. */
    private executeBatch(): void {
        if (this.nextBatch.length <= 0) {
            return;
        }

        // Allow for the next batch to start filling up.
        const batch = [...this.nextBatch];
        this.nextBatch.length = 0;

        // Batch and execute model.

        // Here the batchStates array is a 2D array of encoded Float32Arrays of
        // shape [batch_size, num_inputs].
        // Since each prediction requires several different input arrays defined
        // by modelInputShapes), we then need to transpose our array into
        // [num_inputs, batch_size] in order to stack them into batch tensor
        // inputs for the neural network's single batch prediction.
        // TODO: Can technically do this while building up the batch array.
        const batchStates = batch.map(({state}) => state);
        const batchStatesT = batchStates[0].map((_, colIndex) =>
            batchStates.map(row => row[colIndex]),
        );

        tf.tidy(() =>
            (
                this.model.predictOnBatch(
                    modelInputShapes.map((shape, i) =>
                        tf
                            .stack(batchStatesT[i])
                            .reshape([batch.length, ...shape]),
                    ),
                ) as tf.Tensor
            )
                .as2D(batch.length, intToChoice.length)
                .unstack<tf.Tensor1D>()
                .forEach((t, i) =>
                    batch[i].res({output: t.dataSync() as Float32Array}),
                ),
        );
    }
}
