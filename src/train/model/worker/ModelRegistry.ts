import {EventEmitter} from "stream";
import {serialize} from "v8";
import {MessageChannel, MessagePort, workerData} from "worker_threads";
import * as tf from "@tensorflow/tfjs";
import {ListenerSignature, TypedEmitter} from "tiny-typed-emitter";
import {intToChoice} from "../../../psbot/handlers/battle/agent";
import {importTfn} from "../../../tfn";
import {ensureDir} from "../../../util/paths/ensureDir";
import {learn, LearnConfig} from "../../learn";
import {RawPortResultError} from "../../port/PortProtocol";
import {modelInputShapes, verifyModel} from "../shapes";
import {
    PredictMessage,
    PredictResult,
    PredictWorkerResult,
} from "./ModelPortProtocol";
import {
    ModelWorkerData,
    BatchPredictOptions,
    ModelLearnData,
} from "./ModelProtocol";
import {setTimeoutNs} from "./nanosecond";

const {gpu} = workerData as ModelWorkerData;
const tfn = importTfn(gpu);

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
     * Creates a NetworkRegistry.
     *
     * @param model Neural network object.
     * @param batchOptions Options for batching predict requests.
     */
    public constructor(
        model: tf.LayersModel,
        private readonly batchOptions: BatchPredictOptions,
    ) {
        try {
            verifyModel(model);
        } catch (e) {
            // Cleanup model so it doesn't cause a memory leak.
            model.dispose();
            throw e;
        }
        this.model = model;

        this.batchOptions = {
            ...batchOptions,
            timeoutNs: batchOptions.timeoutNs,
        };

        // Setup batch event listener.
        this.batchEvents.on(batchExecute, () => void this.executeBatch());

        this.inUse = Promise.resolve();
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
     * @param uid ID of the model.
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
                        port1.postMessage(result, [result.probs.buffer]);
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
     * @param logPath Path to the folder to store TensorBoard logs in. Omit to
     * not store logs.
     */
    public async learn(
        config: LearnConfig,
        callback?: (data: ModelLearnData) => void,
        logPath?: string,
    ): Promise<void> {
        let trainCallback: tf.CustomCallback | undefined;
        this.inUse = Promise.allSettled([
            this.inUse,
            ...(logPath
                ? [
                      ensureDir(logPath).then(
                          // Note: Can change updateFreq to batch to track epoch
                          // progress, but will make the learning algorithm
                          // slower.
                          () =>
                              tfn.node.tensorBoard(logPath, {
                                  updateFreq: "epoch",
                              }),
                      ),
                  ]
                : []),
        ]).then(([, p]) =>
            p.status === "fulfilled"
                ? (trainCallback = p.value)
                : Promise.reject(p.reason),
        );

        this.inUse = this.inUse.then(
            async () =>
                await learn({
                    model: this.model,
                    ...config,
                    ...(callback && {callback}),
                    ...(trainCallback && {trainCallback}),
                }),
        );
        await this.inUse;
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
        if (this.nextBatch.length >= this.batchOptions.maxSize) {
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
                (this.cancelTimer = setTimeoutNs(
                    res,
                    this.batchOptions.timeoutNs,
                )),
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
    private async executeBatch(): Promise<void> {
        if (this.nextBatch.length <= 0) {
            return;
        }

        // Allow for the next batch to start filling up.
        const batch = [...this.nextBatch];
        this.nextBatch.length = 0;

        // Batch and execute model.

        // Here the batchStates array is a 2D array of encoded Float32Arrays of
        // shape [batch, num_arrays].
        // We then need to transpose it to [num_arrays, batch] in order to stack
        // the arrays into batch tensors for the neural network.
        const batchStates = batch.map(({state}) => state);
        const batchStatesT = batchStates[0].map((_, colIndex) =>
            batchStates.map(row => row[colIndex]),
        );

        const [batchedProbs, batchedValues] = tf.tidy(() => {
            const batchInput = modelInputShapes.map((shape, i) =>
                tf.stack(batchStatesT[i]).reshape([batch.length, ...shape]),
            );

            const [batchProbs, batchValues] = this.model.predictOnBatch(
                batchInput,
            ) as tf.Tensor[];
            return [
                batchProbs
                    .as2D(batch.length, intToChoice.length)
                    .unstack<tf.Tensor1D>(),
                batchValues.as1D(),
            ];
        });

        // Unpack and distribute batch entries.

        const [probsData, valueData] = await Promise.all([
            Promise.all(
                batchedProbs.map(async t => (await t.data()) as Float32Array),
            ),
            batchedValues.data() as Promise<Float32Array>,
        ]);
        batchedProbs.forEach(t => t.dispose());
        batchedValues.dispose();

        for (let i = 0; i < batch.length; ++i) {
            batch[i].res({probs: probsData[i], value: valueData[i]});
        }
    }
}
