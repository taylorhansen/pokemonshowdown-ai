/** @file Defines the protocol typings for ModelWorkers. */
import {MessagePort} from "worker_threads";
import {BatchPredictConfig} from "../../../config/types";
import {LearnArgsPartial} from "../../learn";
import {PortMessageBase, PortResultBase} from "../../port/PortProtocol";
import {WorkerProtocol} from "../../port/WorkerProtocol";

/** Typings for the `workerData` object given to the ModelWorker. */
export interface ModelWorkerData {
    /** Whether to enable GPU support. */
    gpu?: boolean;
    /** Path to store logs in. */
    logPath?: string;
    /**
     * Number of threads to use for decoding TrainingExamples during training.
     */
    numDecoderThreads: number;
}

/** ModelWorker request protocol typings. */
export interface ModelProtocol
    extends WorkerProtocol<
        "load" | "save" | "unload" | "subscribe" | "learn" | "copy" | "log"
    > {
    load: {message: ModelLoadMessage; result: ModelLoadResult};
    save: {message: ModelSaveMessage; result: ModelSaveResult};
    unload: {message: ModelUnloadMessage; result: ModelUnloadResult};
    subscribe: {message: ModelSubscribeMessage; result: ModelSubscribeResult};
    learn: {message: ModelLearnMessage; result: ModelLearnResult};
    copy: {message: ModelCopyMessage; result: ModelCopyResult};
    log: {message: ModelLogMessage; result: ModelLogResult};
}

/** The types of requests that can be made to the model worker. */
export type ModelRequestType = keyof ModelProtocol;

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
    /**
     * Seed for the random number generator when initializing the model. Only
     * applicable if {@link url} is omitted.
     */
    readonly seed?: string;
}

/** Saves a model to a given URL. */
export interface ModelSaveMessage extends ModelMessageBase<"save"> {
    /** Name of the model to save. */
    readonly model: string;
    /** URL to the model folder to save to. */
    readonly url: string;
}

/** Disposes a model from the worker. */
export interface ModelUnloadMessage extends ModelMessageBase<"unload"> {
    /** Name of the model to dispose. */
    readonly model: string;
}

/** Requests a game worker port from a registered model. */
export interface ModelSubscribeMessage extends ModelMessageBase<"subscribe"> {
    /** Name of the model. */
    readonly model: string;
}

/** Queues a learning episode. */
export interface ModelLearnMessage extends ModelMessageBase<"learn"> {
    /** Name of the model. */
    readonly model: string;
    /** Config for the learning algorithm. */
    readonly config: ModelLearnConfig;
}

/** Config for the learning algorithm. */
export type ModelLearnConfig = LearnArgsPartial;

/** Copies weights from one model to another. */
export interface ModelCopyMessage extends ModelMessageBase<"copy"> {
    /** Name of the model to copy weights from. */
    readonly from: string;
    /** Name of the model to copy weights to. */
    readonly to: string;
}

/** Logs metrics to Tensorboard. */
export interface ModelLogMessage extends ModelMessageBase<"log"> {
    /** Name of the current training run, under which to store logs. */
    readonly name: string;
    /** Current episode iteration of the training run. */
    readonly step: number;
    /** Dictionary of metrics to log. */
    readonly logs: {readonly [key: string]: number};
}

/** Types of messages that the Model can send. */
export type ModelMessage = ModelProtocol[ModelRequestType]["message"];

/** Base interface for Model message results. */
type ModelResultBase<T extends ModelRequestType> = PortResultBase<T>;

/** Result of loading and registering a model. */
export interface ModelLoadResult extends ModelResultBase<"load"> {
    /** Name under which the model was registered. */
    name: string;
}

/** Result of saving a model. */
export interface ModelSaveResult extends ModelResultBase<"save"> {
    /** @override */
    done: true;
}

/** Result of deleting a model. */
export interface ModelUnloadResult extends ModelResultBase<"unload"> {
    /** @override */
    done: true;
}

/** Result of requesting a game worker port. */
export interface ModelSubscribeResult extends ModelResultBase<"subscribe"> {
    /** @override */
    done: true;
    /** Port for requesting predictions from a model. */
    port: MessagePort;
}

interface ModelLearnDataBase<T extends string> {
    type: T;
}

/** Reports that the training episode is just starting. */
export interface ModelLearnStart extends ModelLearnDataBase<"start"> {
    /** Total amount of batches for each epoch. */
    numBatches: number;
}

/** Data that gets reported after each batch in the learning step. */
export interface ModelLearnBatch extends ModelLearnDataBase<"batch"> {
    /** Current epoch (1-based). */
    epoch: number;
    /** Current batch index (0-based). */
    batch: number;
    /** Average loss for the entire batch. */
    loss: number;
}

/** Data that gets reported after each epoch in the learning step. */
export interface ModelLearnEpoch extends ModelLearnDataBase<"epoch"> {
    /** Current epoch (1-based). */
    epoch: number;
    /** Average loss for the entire epoch. */
    loss: number;
}

/** Data that gets reported for each batch and epoch in the learning step. */
export type ModelLearnData =
    | ModelLearnStart
    | ModelLearnBatch
    | ModelLearnEpoch;

/**
 * Result of queueing a learning episode. This is sent multiple times so the
 * master Model thread can track its progress.
 */
export interface ModelLearnResult extends ModelResultBase<"learn"> {
    /** Logging data for tracking learning progress. */
    data?: ModelLearnData;
}

/** The types of results that can be given to the model worker. */
export type ModelResult = ModelProtocol[ModelRequestType]["result"];

/** Result of copying a model. */
export interface ModelCopyResult extends ModelResultBase<"copy"> {
    /** @override */
    done: true;
}

/** Result of logging metrics. */
export interface ModelLogResult extends ModelResultBase<"log"> {
    /** @override */
    done: true;
}
