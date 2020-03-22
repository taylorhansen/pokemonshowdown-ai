import { MessagePort } from "worker_threads";
import { PortMessageBase, PortResultBase } from
    "../../nn/worker/helpers/AsyncPort";
import { GameConfig } from "../GamePool";
import { GameResult } from "./playGame";

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

/** Game request message result. */
export interface GameWorkerResult extends PortResultBase<"game">, GameResult
{
    /**
     * Guaranteed one reply per message.
     * @override
     */
    done: true;
}
