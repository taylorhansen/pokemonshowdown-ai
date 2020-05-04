/**
 * Defines the message interfaces for the protocol between the NetworkProcessor
 * thread and its dedicated TFJS worker.
 */
import { MessagePort } from "worker_threads";
import { AugmentedExperience } from "../../learn/AugmentedExperience";
import { AlgorithmArgs } from "../../learn/LearnArgs";
import { PortMessageBase, PortResultBase } from "./AsyncPort";

/** Mapped type for request types. */
export type NetworkProcessorRequestMap =
{
    load:
    {
        message: NetworkProcessorLoadMessage,
        result: NetworkProcessorLoadResult
    },
    save:
    {
        message: NetworkProcessorSaveMessage,
        result: NetworkProcessorSaveResult
    },
    unload:
    {
        message: NetworkProcessorUnloadMessage,
        result: NetworkProcessorUnloadResult
    },
    subscribe:
    {
        message: NetworkProcessorSubscribeMessage,
        result: NetworkProcessorSubscribeResult
    },
    learn:
    {
        message: NetworkProcessorLearnMessage,
        result: NetworkProcessorLearnResult
    }
};

/** The types of requests that can be made to the network processor. */
export type NetworkProcessorRequestType = keyof NetworkProcessorRequestMap;

/** Base interface for NetworkProcessor messages. */
type NetworkProcessorMessageBase<T extends NetworkProcessorRequestType> =
    PortMessageBase<T>;

/** Loads a neural network and registers it for the worker. */
export interface NetworkProcessorLoadMessage extends
    NetworkProcessorMessageBase<"load">
{
    /** URL to the `model.json` to load. If omitted, create a default model. */
    readonly url?: string;
}

/** Saves a neural network to a given URL. */
export interface NetworkProcessorSaveMessage extends
    NetworkProcessorMessageBase<"save">
{
    /** ID of the model to save. */
    readonly uid: number;
    /** URL to the model folder to save to. */
    readonly url: string;
}

/** Disposes a model from the worker. */
export interface NetworkProcessorUnloadMessage extends
    NetworkProcessorMessageBase<"unload">
{
    /** ID of the model to dispose. */
    readonly uid: number;
}

/**
 * Requests a game worker port from a registered neural network.
 */
export interface NetworkProcessorSubscribeMessage extends
    NetworkProcessorMessageBase<"subscribe">
{
    /** ID of the neural network. */
    readonly uid: number;
}

/** Queues a learning episode. */
export interface NetworkProcessorLearnMessage extends
    NetworkProcessorMessageBase<"learn">, NetworkProcessorLearnConfig
{
    /** ID of the neural network. */
    readonly uid: number;
    /** Processed Experience tuples to sample from. */
    readonly samples: AugmentedExperience[];
}

/** Config for the learning algorithm. */
export interface NetworkProcessorLearnConfig
{
    /** Learning algorithm config. */
    readonly algorithm: Readonly<AlgorithmArgs>;
    /** Number of epochs to run training. */
    readonly epochs: number;
    /** Mini-batch size. */
    readonly batchSize: number;
    /**
     * Path to the folder to store TensorBoard logs in. Omit to not store logs.
     */
    readonly logPath?: string;
}


/** Types of messages that the NetworkProcessor can send. */
export type NetworkProcessorMessage =
    NetworkProcessorRequestMap[NetworkProcessorRequestType]["message"];

/** Base interface for NetworkProcessor message results. */
type NetworkProcessorResultBase<T extends NetworkProcessorRequestType> =
    PortResultBase<T>;

/** Result of loading and registering a network. */
export interface NetworkProcessorLoadResult extends
    NetworkProcessorResultBase<"load">
{
    /** Unique identifier for the model that was registered. */
    uid: number;
}

/** Result of saving a network. */
export interface NetworkProcessorSaveResult extends
    NetworkProcessorResultBase<"save">
{
    /** @override */
    done: true;
}

/** Result of deleting a network. */
export interface NetworkProcessorUnloadResult extends
    NetworkProcessorResultBase<"unload">
{
    /** @override */
    done: true;
}

/** Result of requesting a game worker port. */
export interface NetworkProcessorSubscribeResult extends
    NetworkProcessorResultBase<"subscribe">
{
    /** @override */
    done: true;
    /** Port for requesting predictions from a neural network. */
    port: MessagePort;
}

interface NetworkProcessorLearnDataBase<T extends string>
{
    type: T;
}

/** Reports that the training episode is just starting. */
export interface NetworkProcessorLearnStart extends
    NetworkProcessorLearnDataBase<"start">
{
    /** Total amount of batches for each epoch. */
    numBatches: number;
}

/** Data that gets reported after each batch in the learning step. */
export interface NetworkProcessorLearnBatch extends
    NetworkProcessorLearnDataBase<"batch">
{
    /** Current epoch (1-based). */
    epoch: number;
    /** Current batch index (0-based). */
    batch: number;
    /** Average loss for the entire batch. */
    loss: number;
}

/** Data that gets reported after each epoch in the learning step. */
export interface NetworkProcessorLearnEpoch extends
    NetworkProcessorLearnDataBase<"epoch">
{
    /** Current epoch (1-based). */
    epoch: number;
    /** Average loss for the entire epoch. */
    loss: number;
}

/** Data that gets reported for each batch and epoch in the learning step. */
export type NetworkProcessorLearnData = NetworkProcessorLearnStart |
    NetworkProcessorLearnBatch | NetworkProcessorLearnEpoch;

/**
 * Result of queueing a learning episode. This is sent multiple times so the
 * master NetworkProcessor thread can track its progress.
 */
export interface NetworkProcessorLearnResult extends
    NetworkProcessorResultBase<"learn">
{
    /** Logging data for tracking learning progress. */
    data?: NetworkProcessorLearnData;
}

/** The types of results that can be given to the network processor. */
export type NetworkProcessorResult =
    NetworkProcessorRequestMap[NetworkProcessorRequestType]["result"];
