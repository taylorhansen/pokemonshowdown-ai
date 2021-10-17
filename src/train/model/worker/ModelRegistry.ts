import * as tf from "@tensorflow/tfjs";
import { EventEmitter } from "stream";
import { ListenerSignature, TypedEmitter } from "tiny-typed-emitter";
import { serialize } from "v8";
import { MessageChannel, MessagePort, workerData } from "worker_threads";
import { formats } from "../../../psbot/handlers/battle";
import { intToChoice } from "../../../psbot/handlers/battle/agent";
import { verifyModel } from "../../../psbot/handlers/battle/ai/networkAgent";
import { importTfn } from "../../../tfn";
import { ensureDir } from "../../helpers/ensureDir";
import { learn, LearnConfig } from "../../learn";
import { RawPortResultError } from "../../port/PortProtocol";
import { PredictMessage, PredictResult, PredictWorkerResult } from
    "./ModelPortProtocol";
import { BatchPredictOptions, ModelLearnData } from "./ModelProtocol";
import { setTimeoutNs } from "./nanosecond";

// select native backend, defaulting to cpu if not told to use gpu
const tfn = importTfn(!!workerData.gpu);

const format: formats.FormatType = workerData.format;

/** State+callback entry for a NetworkRegistry's batch queue. */
interface BatchEntry
{
    /** Encoded battle state. */
    state: Float32Array;
    /** Callback after getting the prediction for the given state. */
    res(result: PredictResult): void;
}

/** Event for when the current batch should be executed. */
const batchExecute = Symbol("batchExecute");

/** Describes the events emitted by {@link ModelRegistry.batchEvents}. */
interface BatchEvents extends ListenerSignature<{[batchExecute]: true}>
{
    [batchExecute](): void;
}

/** Manages a neural network registry. */
export class ModelRegistry
{
    /** Neural network object. */
    private readonly model: tf.LayersModel;
    /** Currently held game worker ports. */
    private readonly ports = new Set<MessagePort>();

    /** Prediction request buffer. */
    private readonly nextBatch: BatchEntry[] = [];
    /** Event listener for batch entries. */
    private readonly batchEvents =
        // note: TypedEmitter doesn't contain option typings
        new EventEmitter({captureRejections: true}) as
            TypedEmitter<BatchEvents>;
    /** Resolves once the current batch timer expires. */
    private timeoutPromise: Promise<void> | null = null;
    /** Function to cancel the current timer. */
    private cancelTimer: (() => void) | null = null;
    /** Lock promise for managing the neural network resource. */
    private inUse: Promise<any>;

    /**
     * Creates a NetworkRegistry.
     * @param model Neural network object.
     * @param batchOptions Options for batching predict requests.
     */
    constructor(model: tf.LayersModel,
        private readonly batchOptions: BatchPredictOptions)
    {
        try { verifyModel(model, formats.encoder[format].size); }
        catch (e)
        {
            // cleanup model so it doesn't cause a memory leak
            model.dispose();
            throw e;
        }
        this.model = model;

        this.batchOptions =
        {
            ...batchOptions,
            // min 1ns, max 1s
            timeoutNs: Math.max(1, Math.min(batchOptions.timeoutNs, 999999999))
        };

        // setup batch event listener
        this.batchEvents.on(batchExecute, () => this.executeBatch());

        // warmup the model using fake data
        // only useful with gpu backend
        if (workerData.gpu)
        {
            const fakeInput = tf.zeros([1, formats.encoder[format].size]);
            const fakeResult = model.predict(fakeInput) as tf.Tensor[];
            this.inUse = Promise.all(
                    fakeResult.map(r => r.data().finally(() => r.dispose())))
                .finally(() => fakeInput.dispose());
        }
        else this.inUse = Promise.resolve();
    }

    /** Saves the neural network to the given url. */
    public async save(url: string): Promise<void>
    {
        await this.inUse;
        await this.model.save(url);
    }

    /** Deletes everything in this registry. */
    public async unload(): Promise<void>
    {
        await this.inUse;
        for (const port of this.ports) port.close();
        this.model.dispose();
    }

    /**
     * Indicates that a game worker is subscribing to a model.
     * @param uid ID of the model.
     * @returns A port for queueing predictions that the game worker will use.
     */
    public subscribe(): MessagePort
    {
        const {port1, port2} = new MessageChannel();
        this.ports.add(port1);
        port1.on("message", (msg: PredictMessage) =>
            this.predict(msg)
            .then(prediction =>
            {
                const result: PredictWorkerResult =
                    {type: "predict", rid: msg.rid, done: true, ...prediction};
                port1.postMessage(result, [result.probs.buffer]);
            })
            .catch(err =>
            {
                const result: RawPortResultError =
                {
                    type: "error", rid: msg.rid, done: true, err: serialize(err)
                };
                port1.postMessage(result, [result.err.buffer]);
            }));
        // remove this port from the recorded references after close
        port1.on("close", () => this.ports.delete(port1));
        return port2;
    }

    /**
     * Queues a learning episode.
     * @param config Learning config.
     * @param callback Callback for tracking the training process.
     * @param logPath Path to the folder to store TensorBoard logs in. Omit to
     * not store logs.
     */
    public learn(config: LearnConfig, callback?: (data: ModelLearnData) => void,
        logPath?: string): Promise<void>
    {
        let trainCallback: tf.CustomCallback | undefined;
        this.inUse = Promise.allSettled(
        [
            this.inUse,
            ...(logPath ?
                [ensureDir(logPath).then(
                    // can change updateFreq to batch to track epoch progress,
                    //  but will make the learning algorithm slower
                    () => tfn.node.tensorBoard(logPath, {updateFreq: "epoch"}))]
                : [])
        ])
            .then(([_, p]) =>
                p.status === "fulfilled" ? trainCallback = p.value
                    : Promise.reject(p.reason));

        return this.inUse = this.inUse.then(() =>learn(
        {
            model: this.model, ...config,
            ...(callback && {callback}),
            ...(trainCallback && {trainCallback})
        }));
    }

    /** Queues a prediction for the neural network. */
    private async predict(msg: PredictMessage): Promise<PredictResult>
    {
        return new Promise(res =>
        {
            this.nextBatch.push({state: msg.state, res});
            this.checkPredictBatch();
        });
    }

    /**
     * Checks batch size and timer to see if the predict batch should be
     * executed.
     */
    private checkPredictBatch(): void
    {
        if (this.nextBatch.length >= this.batchOptions.maxSize)
        {
            // full batch
            this.batchEvents.emit(batchExecute);
            return;
        }

        // batch timer is already setup
        if (this.timeoutPromise) return;

        // setup batch timer
        this.timeoutPromise =
            new Promise<void>(res =>
                this.cancelTimer =
                    setTimeoutNs(res, this.batchOptions.timeoutNs))
            .finally(() =>
            {
                this.timeoutPromise = null;
                this.cancelTimer = null;
            });

        // if the timer expires before the batch filled up, execute the batch as
        //  it is
        let didTimeout = false;
        Promise.race(
        [
            this.timeoutPromise.then(() => didTimeout = true),
            new Promise<void>(res =>
                    this.batchEvents.prependOnceListener(batchExecute, res))
                .finally(this.cancelTimer)
        ])
            .finally(() => didTimeout && this.batchEvents.emit(batchExecute));
    }

    /** Flushes the predict buffer and executes the batch. */
    private async executeBatch(): Promise<void>
    {
        if (this.nextBatch.length <= 0) return;

        // allow for the next batch to start filling up
        const batch = [...this.nextBatch];
        this.nextBatch.length = 0;

        // batch and execute model

        const [batchedProbs, batchedValues] = tf.tidy(() =>
        {
            const batchStates = tf.stack(batch.map(req => req.state));
            const [batchProbs, batchValues] =
                this.model.predictOnBatch(batchStates) as tf.Tensor[];
            return [
                batchProbs.as2D(batch.length, intToChoice.length)
                    .unstack<tf.Tensor1D>(),
                batchValues.as1D()
            ];
        });

        // unpack and distribute batch entries

        const [probsData, valueData] = await Promise.all(
        [
            Promise.all(batchedProbs.map(
                t => t.data() as Promise<Float32Array>)),
            batchedValues.data() as Promise<Float32Array>
        ]);
        batchedProbs.forEach(t => t.dispose())
        batchedValues.dispose();

        for (let i = 0; i < batch.length; ++i)
        {
            batch[i].res({probs: probsData[i], value: valueData[i]});
        }
    }
}
