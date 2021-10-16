/** @file Defines the protocol typings for GameWorkers. */
import { MessagePort } from "worker_threads";
import { PortMessageBase, PortResultBase } from "../../../port/PortProtocol";
import { WorkerProtocol } from "../../../port/WorkerProtocol";
import { SimResult } from "../../sim/playGame";
import { GameConfig } from "../GamePool";

/** GameWorker request protocol typings. */
export interface GameProtocol extends WorkerProtocol<"play">
{
    play: {message: GameWorkerPlay, result: GameWorkerPlayResult}
}

/** The types of requests that can be made to the game worker. */
export type GameWorkerRequestType = keyof GameProtocol;

/** Types of messages that the GamePool can send. */
export type GameWorkerMessage =
    GameProtocol[GameWorkerRequestType]["message"];

/** Base interface for game worker messages. */
type GameWorkerMessageBase<T extends GameWorkerRequestType> =
    PortMessageBase<T>;

/** Game request message format. */
export interface GameWorkerPlay extends GameWorkerMessageBase<"play">,
    GameConfig
{
    /** Model ports that will play against each other. */
    readonly agents: [GameWorkerAgentConfig, GameWorkerAgentConfig];
    /**
     * Path to store experience objects, if any are configured to be emitted in
     * the agent config. If unspecified, experience objects will be discarded.
     */
    readonly expPath?: string;
}

/** Config for game worker agents. */
export interface GameWorkerAgentConfig
{
    /**
     * Port that uses the `model/ModelPort` protocol for interfacing with a
     * model.
     */
    readonly port: MessagePort;
    /** Whether to process Experiences emitted by the network. */
    readonly exp: boolean;
}

/** Types of messages that the GamePool can receive. */
export type GameWorkerResult =
    GameProtocol[GameWorkerRequestType]["result"];

/** Base interface for game worker message results. */
type GameWorkerResultBase<T extends GameWorkerRequestType> = PortResultBase<T>;

/** Result of a game after it has been completed and processed by the worker. */
export interface GameWorkerPlayResult extends GameWorkerResultBase<"play">,
    Omit<SimResult, "err">
{
    /** Number of AugmentedExperience objects saved, if enabled. Otherwise 0. */
    numAExps: number;
    /**
     * If an exception was thrown during the game, store it here for logging
     * instead of propagating it through the pipeline. The exception here is
     * serialized into a Buffer.
     */
    err?: Buffer;
    /** @override */
    done: true;
}
