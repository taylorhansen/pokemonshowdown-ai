/** @file Defines the protocol typings for GameWorkers. */
import {MessagePort} from "worker_threads";
import {PRNGSeed} from "@pkmn/sim";
import type * as tf from "@tensorflow/tfjs";
import {BatchPredictConfig, TensorflowConfig} from "../../../config/types";
import {PortMessageBase, PortResultBase} from "../../../util/port/PortProtocol";
import {WorkerProtocol} from "../../../util/worker/WorkerProtocol";
import {Experience} from "../../experience";
import {SimResult} from "../../sim/playGame";
import {PlayArgs} from "../GamePool";

/** Typings for the `workerData` object given to the game worker. */
export interface GameWorkerData {
    /** Name of the worker for logging/debugging. */
    readonly name: string;
    /**
     * Maximum amount of turns until the game is considered a tie. Games can go
     * on forever if this is not set and both players only decide to switch.
     */
    readonly maxTurns?: number;
    /**
     * Tensorflow config for the game thread. Required if a
     * {@link GameLoadMessage} intends to send model artifacts.
     */
    readonly tf?: TensorflowConfig;
}

/** GameWorker request protocol typings. */
export interface GameProtocol
    extends WorkerProtocol<"load" | "reload" | "play" | "collect"> {
    load: {message: GameLoadMessage; result: GameLoadResult};
    reload: {message: GameReloadMessage; result: GameReloadResult};
    play: {message: GamePlayMessage; result: GamePlayResult};
    collect: {message: GameCollectMessage; result: GameCollectResult};
}

/** The types of requests that can be made to the game worker. */
export type GameRequestType = keyof GameProtocol;

/** Types of messages that the GamePool can send. */
export type GameMessage = GameProtocol[GameRequestType]["message"];

/** Base interface for game worker messages. */
type GameMessageBase<T extends GameRequestType> = PortMessageBase<T>;

/** Loads and registers a model for inference during games. */
export interface GameLoadMessage extends GameMessageBase<"load"> {
    /** Name under which to reference the model. */
    readonly name: string;
    /** Config for loading the model. */
    readonly model: GameLoadModel;
}

interface GameLoadModelBase<T extends string> {
    readonly type: T;
}

/** Load model by reconstructing it on the worker's main memory. */
export interface GameLoadModelArtifact extends GameLoadModelBase<"artifact"> {
    /**
     * Serialized model topology and weights to reconstruct the model on this
     * worker.
     */
    readonly artifact: tf.io.ModelArtifacts;
    /** Config for batching predictions on this thread. */
    readonly config: BatchPredictConfig;
}

/** Register model by accessing a port into a dedicated thread. */
export interface GameLoadModelPort extends GameLoadModelBase<"port"> {
    /**
     * Handle for requesting predictions from a model hosted in a separate
     * service such as a dedicated thread.
     */
    readonly port: MessagePort;
}

/** Config for loading and registering models for a game worker. */
export type GameLoadModel = GameLoadModelArtifact | GameLoadModelPort;

/** Replaces a local model copy. */
export interface GameReloadMessage extends GameMessageBase<"reload"> {
    /** Name of model. */
    readonly name: string;
    /** Serialized model to use as replacement. */
    readonly artifact: tf.io.ModelArtifacts;
}

/** Game request message format. */
export interface GamePlayMessage extends GameMessageBase<"play"> {
    /** Model ports that will play against each other. */
    readonly agents: readonly [GameAgentConfig, GameAgentConfig];
    /** Args for starting the game. */
    readonly play: PlayArgs;
}

/** Config for game worker agents. */
export interface GameAgentConfig {
    /** Name of agent. Must be different from opponent(s). */
    readonly name: string;
    /** Exploitation policy. */
    readonly exploit: AgentExploitConfig;
    /** Exploration policy. */
    readonly explore?: AgentExploreConfig;
    /** Whether to emit Experience objs after each decision. */
    readonly emitExperience?: true;
    /** Seed used to generate the random team. */
    readonly seed?: PRNGSeed;
}

interface AgentExploitConfigBase<T extends string> {
    readonly type: T;
}

/** Exploit using a neural network model. */
export interface AgentExploitModel extends AgentExploitConfigBase<"model"> {
    /**
     * Name of the model to use. Must be registered from previous
     * {@link GameLoadMessage}.
     */
    readonly model: string;
}

/** Exploit using a random agent. */
export interface AgentExploitRandom extends AgentExploitConfigBase<"random"> {
    /** Seed for choosing random actions. */
    readonly seed?: string;
    /**
     * Whether to prefer moves in random actions. If `"damage"`, also
     * prioritizes moves with the most expected damage against the opposing
     * active pokemon.
     */
    readonly moveOnly?: true | "damage";
}

/** Config describing how the agent should behave when exploiting reward. */
export type AgentExploitConfig = AgentExploitModel | AgentExploitRandom;

/** Config for agent exploration. */
export interface AgentExploreConfig {
    /**
     * Exploration factor. Proportion of actions to take randomly rather than
     * consulting the model.
     */
    readonly factor: number;
    /** Seed for the random number generator. */
    readonly seed?: string;
}

/** Collects buffered experience from the worker. */
export type GameCollectMessage = GameMessageBase<"collect">;

/** Types of messages that the GamePool can receive. */
export type GameResult = GameProtocol[GameRequestType]["result"];

/** Base interface for game worker message results. */
type GameResultBase<T extends GameRequestType> = PortResultBase<T>;

/** Result of loading model. */
export interface GameLoadResult extends GameResultBase<"load"> {
    /** @override */
    readonly done: true;
}

/** Result of reloading model. */
export interface GameReloadResult extends GameResultBase<"reload"> {
    /** @override */
    readonly done: true;
}

/** Result of a game after it has been completed and processed by the worker. */
export interface GamePlayResult
    extends GameResultBase<"play">,
        Omit<SimResult, "err"> {
    /**
     * If an exception was thrown during the game, store it here for logging
     * instead of propagating it through the pipeline. The exception here is
     * serialized into a Buffer.
     */
    err?: Buffer;
    /** @override */
    done: true;
}

/** Result of collecting bufferd experience from the worker. */
export interface GameCollectResult extends GameResultBase<"collect"> {
    /** Experience collected from the worker. */
    experience: Experience[];
    /** @override */
    done: true;
}
