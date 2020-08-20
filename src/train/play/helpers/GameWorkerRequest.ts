import { MessagePort } from "worker_threads";
import { PortMessageBase, PortResultBase } from
    "../../nn/worker/helpers/AsyncPort";
import { GameConfig } from "../GamePool";
import { AugmentedSimResult } from "./playGame";

/** Config for game worker agents. */
export interface GameWorkerAgentConfig
{
    /** Neural network port from the NetworkProcessor. */
    readonly port: MessagePort;
    /** Whether to process Experiences emitted by the network. */
    readonly exp: boolean;
}

/** Game request message format. */
export interface GameWorkerMessage extends PortMessageBase<"game">, GameConfig
{
    /** Model ports that will play against each other. */
    readonly agents: [GameWorkerAgentConfig, GameWorkerAgentConfig];
}

/** Result of a game after it has been completed and processed by the worker. */
export interface GameWorkerResult extends PortResultBase<"game">,
    Omit<AugmentedSimResult, "err">
{
    /**
     * If an exception was thrown during the game, store it here instead of
     * propagating it through the pipeline. The exception here is serialized
     * into a Buffer
     */
    err?: Buffer;
    /**
     * Guaranteed one reply per message.
     * @override
     */
    done: true;
}
