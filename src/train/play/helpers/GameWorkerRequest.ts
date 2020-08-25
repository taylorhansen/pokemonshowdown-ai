import { MessagePort } from "worker_threads";
import { WorkerCloseProtocol } from "../../helpers/workers/WorkerRequest";
import { PortMessageBase, PortResultBase } from
    "../../nn/worker/helpers/AsyncPort";
import { SimResult } from "../../sim/simulators";
import { GameConfig } from "../GamePool";

/** Mapped type for request types. */
export type GameWorkerRequestMap =
{
    play: {message: GameWorkerPlay, result: GameWorkerPlayResult}
} & WorkerCloseProtocol;

/** The types of requests that can be made to the game worker. */
export type GameWorkerRequestType = keyof GameWorkerRequestMap;

/** Types of messages that the GamePool can send. */
export type GameWorkerMessage =
    GameWorkerRequestMap[GameWorkerRequestType]["message"];

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
    /** Neural network port from the NetworkProcessor. */
    readonly port: MessagePort;
    /** Whether to process Experiences emitted by the network. */
    readonly exp: boolean;
}

/** Types of messages that the GamePool can receive. */
export type GameWorkerResult =
    GameWorkerRequestMap[GameWorkerRequestType]["result"];

/** Base interface for game worker message results. */
type GameWorkerResultBase<T extends GameWorkerRequestType> = PortResultBase<T>;

/** Result of a game after it has been completed and processed by the worker. */
export interface GameWorkerPlayResult extends GameWorkerResultBase<"play">,
    Omit<SimResult, "experiences" | "err">
{
    /** Number of AugmentedExperience objects saved, if enabled. Otherwise 0. */
    numAExps: number;
    /**
     * If an exception was thrown during the game, store it here for logging
     * instead of propagating it through the pipeline. The exception here is
     * serialized into a Buffer.
     */
    err?: Buffer;
    /**
     * Guaranteed one reply per message.
     * @override
     */
    done: true;
}
