/** @file Defines the protocol typings for ModelWorkers. */
import {MessagePort} from "worker_threads";
import {
    BatchPredictConfig,
    ModelConfig,
    PathsConfig,
    TrainConfig,
} from "../../config/types";
import {SimResult} from "../../game/sim/playGame";
import {EvalResult} from "../../train/Evaluate";
import {PortMessageBase, PortResultBase} from "../../util/port/PortProtocol";
import {WorkerProtocol} from "../../util/worker/WorkerProtocol";

/** Typings for the `workerData` object given to the model worker. */
export interface ModelWorkerData {
    /** Name of the worker for logging/debugging. */
    name: string;
    /** Whether to enable GPU support. */
    gpu?: boolean;
    /** Path to store metrics in. */
    metricsPath?: string;
}

/** ModelWorker request protocol typings. */
export interface ModelProtocol
    extends WorkerProtocol<"load" | "unload" | "train" | "subscribe"> {
    load: {message: ModelLoadMessage; result: ModelLoadResult};
    unload: {message: ModelUnloadMessage; result: ModelUnloadResult};
    train: {message: ModelTrainMessage; result: ModelTrainResult};
    subscribe: {message: ModelSubscribeMessage; result: ModelSubscribeResult};
}

/** The types of requests that can be made to the model worker. */
export type ModelRequestType = keyof ModelProtocol;

/** Types of messages that the ModelWorker can send. */
export type ModelMessage = ModelProtocol[ModelRequestType]["message"];

/** Base interface for ModelThread messages. */
type ModelMessageBase<T extends ModelRequestType> = PortMessageBase<T>;

/** Loads a model and registers it for the worker. */
export interface ModelLoadMessage extends ModelMessageBase<"load"> {
    /** Name by which to refer to the model. */
    readonly name: string;
    /** Config for batch predict worker. */
    readonly predict: BatchPredictConfig;
    /** URL to the `model.json` to load. If omitted, create a default model. */
    readonly url?: string;
    /** Config for creating the model if {@link url} is omitted. */
    readonly config?: ModelConfig;
    /**
     * Seed for the random number generator when initializing the model. Only
     * applicable if {@link url} is omitted.
     */
    readonly seed?: string;
}

/** Disposes a model from the worker. */
export interface ModelUnloadMessage extends ModelMessageBase<"unload"> {
    /** Name of the model to dispose. */
    readonly model: string;
}

/** Runs the training loop. */
export interface ModelTrainMessage extends ModelMessageBase<"train"> {
    /** Name of the model to train. */
    readonly model: string;
    /** Config for training. */
    readonly config: TrainConfig;
    /** Optional paths to store model checkpoints, game logs, and metrics. */
    readonly paths?: Partial<PathsConfig>;
}

/** Requests a game worker port from a registered model. */
export interface ModelSubscribeMessage extends ModelMessageBase<"subscribe"> {
    /** Name of the model. */
    readonly model: string;
}

/** The types of results that can be given to the model worker. */
export type ModelResult = ModelProtocol[ModelRequestType]["result"];

/** Base interface for Model message results. */
type ModelResultBase<T extends ModelRequestType> = PortResultBase<T>;

/** Result of loading and registering a model. */
export interface ModelLoadResult extends ModelResultBase<"load"> {
    /** @override */
    done: true;
    /** Name under which the model was registered. */
    name: string;
}

/** Result of deleting a model. */
export interface ModelUnloadResult extends ModelResultBase<"unload"> {
    /** @override */
    done: true;
}

interface ModelTrainDataBase<T extends string> {
    type: T;
}

/** Data that gets reported after completing a training step. */
export interface ModelTrainStep extends ModelTrainDataBase<"step"> {
    /** Step number. */
    step: number;
    /** Training loss for the step. */
    loss?: number;
}

/** Data that gets reported after each rollout game. */
export interface ModelTrainRollout<TSerialized = true>
    extends ModelTrainDataBase<"rollout"> {
    /** Unique identifier for logging. */
    readonly id: number;
    /**
     * If an exception was thrown during the game, store it here for logging
     * instead of propagating it through the pipeline. The exception here is
     * serialized into a Buffer.
     */
    err?: TSerialized extends true ? Buffer : Error;
}

/** Data that gets reported after each evaluation game. */
export interface ModelTrainEval<TSerialized = true>
    extends ModelTrainDataBase<"eval">,
        Omit<SimResult, "err"> {
    /** Step number when eval started. */
    readonly step: number;
    /** Unique identifier for logging. */
    readonly id: number;
    /**
     * If an exception was thrown during the game, store it here for logging
     * instead of propagating it through the pipeline. The exception here is
     * serialized into a Buffer.
     */
    err?: TSerialized extends true ? Buffer : Error;
}

/**
 * Notification that the current evaluation run has been completed for one of
 * the opponents.
 */
export interface ModelTrainEvalDone
    extends ModelTrainDataBase<"evalDone">,
        Readonly<EvalResult> {
    /** Step number when eval started. */
    readonly step: number;
}

/** Data for events that get reported during training. */
export type ModelTrainData<TSerialized = true> =
    | ModelTrainStep
    | ModelTrainRollout<TSerialized>
    | ModelTrainEval<TSerialized>
    | ModelTrainEvalDone;

interface ModelTrainResultWithData extends ModelResultBase<"train"> {
    /** Logging data for tracking progress. */
    data: ModelTrainData;
    /** @override */
    done: false;
}

interface ModelTrainResultDone extends ModelResultBase<"train"> {
    /** @override */
    done: true;
}

/** Result of training a model. */
export type ModelTrainResult = ModelTrainResultWithData | ModelTrainResultDone;

/** Result of requesting a game worker port. */
export interface ModelSubscribeResult extends ModelResultBase<"subscribe"> {
    /** @override */
    done: true;
    /** Port for requesting predictions from a model. */
    port: MessagePort;
}
