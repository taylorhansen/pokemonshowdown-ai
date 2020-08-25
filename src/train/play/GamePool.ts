import { resolve } from "path";
import { ThreadPool } from "../helpers/workers/ThreadPool";
import { AdvantageConfig } from "../nn/learn/LearnArgs";
import { NetworkProcessor } from "../nn/worker/NetworkProcessor";
import { SimName } from "../sim/simulators";
import { GamePort } from "./helpers/GamePort";
import { GameWorkerRequestMap } from "./helpers/GameWorkerRequest";
import { AugmentedSimResult } from "./helpers/playGame";

/** Config for starting a game. */
export interface GameConfig
{
    /** Name of the simulator to use. */
    readonly simName: SimName,
    /**
     * Maximum amount of turns until the game is considered a tie. Games can go
     * on forever if this is not set and both agents only decide to switch.
     */
    readonly maxTurns?: number;
    /** Path to the file to store logs in. */
    readonly logPath?: string;
    /**
     * Advantage estimation config. If defined, AugmentedExperiences will be
     * generated from any Experience batches that are found.
     */
    readonly rollout?: AdvantageConfig
}

/** Config for `GamePool#addGame()` agents. */
export interface GamePoolAgentConfig
{
    /** Neural network id from the NetworkProcessor. */
    readonly model: number;
    /** Whether to process Experiences emitted by the network. */
    readonly exp?: boolean;
}

/** Args for `GamePool#addGame()`. */
export interface GamePoolArgs extends GameConfig
{
    /** Config for the models that will play against each other. */
    readonly agents: readonly [GamePoolAgentConfig, GamePoolAgentConfig];
    /** Used to request game worker ports from the neural networks. */
    readonly processor: NetworkProcessor;
}

/** GamePool stream output type. */
export interface GamePoolResult extends AugmentedSimResult {}

/** Path to the GameWorker script. */
const workerScriptPath = resolve(__dirname, "helpers", "worker.js");

/** Uses a `worker_threads` pool to dispatch parallel games. */
export class GamePool extends ThreadPool<GamePort, GameWorkerRequestMap>
{
    /**
     * Creates a GamePool.
     * @param numThreads Number of workers to create. Defaults to the number of
     * CPUs on the current system.
     */
    constructor(numThreads?: number)
    {
        super(workerScriptPath, GamePort, /*workerData*/ undefined, numThreads);
    }

    /**
     * Queues a game to be played.
     * @param args Game args.
     * @param callback Called when a worker has been assigned to the game.
     * @returns A Promise to get the results of the game.
     */
    public async addGame(args: GamePoolArgs, callback?: () => void):
        Promise<GamePoolResult>
    {
        // grab a free worker
        const port = await this.takePort();
        callback?.();

        // queue the game and wait for it to complete, returning the port
        //  afterwards
        return port.playGame(args)
            .catch(err => { throw err; })
            .finally(() => this.givePort(port))
            .catch((err: Error) =>
            {
                const result: GamePoolResult = {experiences: [], err};
                return result;
            });
    }
}
