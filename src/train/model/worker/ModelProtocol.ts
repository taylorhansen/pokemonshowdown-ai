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
}

/** ModelWorker request protocol typings. */
export interface ModelProtocol
    extends WorkerProtocol<
        "load" | "save" | "unload" | "subscribe" | "learn" | "copy"
    > {
    load: {message: ModelLoadMessage; result: ModelLoadResult};
    save: {message: ModelSaveMessage; result: ModelSaveResult};
    unload: {message: ModelUnloadMessage; result: ModelUnloadResult};
    subscribe: {message: ModelSubscribeMessage; result: ModelSubscribeResult};
    learn: {message: ModelLearnMessage; result: ModelLearnResult};
    copy: {message: ModelCopyMessage; result: ModelCopyResult};
}

/** The types of requests that can be made to the model worker. */
export type ModelRequestType = keyof ModelProtocol;

/** Base interface for ModelThread messages. */
type ModelMessageBase<T extends ModelRequestType> = PortMessageBase<T>;

/** Loads a model and registers it for the worker. */
export interface ModelLoadMessage
    extends ModelMessageBase<"load">,
        BatchPredictConfig {
    /** URL to the `model.json` to load. If omitted, create a default model. */
    readonly url?: string;
}

/** Saves a model to a given URL. */
export interface ModelSaveMessage extends ModelMessageBase<"save"> {
    /** ID of the model to save. */
    readonly uid: number;
    /** URL to the model folder to save to. */
    readonly url: string;
}

/** Disposes a model from the worker. */
export interface ModelUnloadMessage extends ModelMessageBase<"unload"> {
    /** ID of the model to dispose. */
    readonly uid: number;
}

/** Requests a game worker port from a registered model. */
export interface ModelSubscribeMessage extends ModelMessageBase<"subscribe"> {
    /** ID of the model. */
    readonly uid: number;
}

/** Queues a learning episode. */
export interface ModelLearnMessage
    extends ModelMessageBase<"learn">,
        ModelLearnConfig {
    /** ID of the model. */
    readonly uid: number;
}

/** Config for the learning algorithm. */
export type ModelLearnConfig = LearnArgsPartial;

/** Copies weights from one model to another. */
export interface ModelCopyMessage extends ModelMessageBase<"copy"> {
    /** ID of the model to copy weights from. */
    readonly uidFrom: number;
    /** ID of the model to copy weights to. */
    readonly uidTo: number;
}

/** Types of messages that the Model can send. */
export type ModelMessage = ModelProtocol[ModelRequestType]["message"];

/** Base interface for Model message results. */
type ModelResultBase<T extends ModelRequestType> = PortResultBase<T>;

/** Result of loading and registering a model. */
export interface ModelLoadResult extends ModelResultBase<"load"> {
    /** Unique identifier for the model that was registered. */
    uid: number;
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
