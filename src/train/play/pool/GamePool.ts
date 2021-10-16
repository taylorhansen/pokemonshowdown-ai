import { resolve } from "path";
import { formats } from "../../../psbot/handlers/battle";
import { AdvantageConfig } from "../../learn";
import { ModelWorker } from "../../model/worker";
import { ThreadPool } from "../../pool";
import { SimResult } from "../sim/playGame";
import { GameProtocol } from "./worker/GameProtocol";
import { GameWorker } from "./worker/GameWorker";

/** Config for starting a game. */
export interface GameConfig
{
    /** Game format type. */
    readonly format: formats.FormatType,
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

/** Config for {@link GamePool.addGame} agents. */
export interface GamePoolAgentConfig
{
    /** Model id from the ModelWorker. */
    readonly model: number;
    /** Whether to process Experiences emitted by the network. */
    readonly exp?: boolean;
}

/** Args for {@link GamePool.addGame}. */
export interface GamePoolArgs extends GameConfig
{
    /** Unique identifier for logging. */
    readonly id: number;
    /** Config for the models that will play against each other. */
    readonly agents: readonly [GamePoolAgentConfig, GamePoolAgentConfig];
    /** Used to request model ports for the game workers. */
    readonly models: ModelWorker;
}

/** GamePool stream output type. */
export interface GamePoolResult extends SimResult
{
    /** Unique identifier for logging. */
    readonly id: number;
    /** Number of AugmentedExperience objects saved, if enabled. Otherwise 0. */
    numAExps: number;
}

/** Path to the GameWorker script. */
const workerScriptPath = resolve(__dirname, "worker", "worker.js");

/** Uses a thread pool to dispatch parallel games. */
export class GamePool
{
    /** Number of threads in the thread pool. */
    public get numThreads(): number { return this.pool.numThreads; }

    /** Wrapped thread pool for managing game workers. */
    private readonly pool:
        ThreadPool<GameWorker, GameProtocol, keyof GameProtocol>;

    /**
     * Creates a GamePool.
     *
     * @param numThreads Number of workers to create.
     * @param getExpPath Optional getter function for experience files. Called
     * once per worker.
     */
    constructor(numThreads: number, getExpPath?: () => Promise<string>)
    {
        this.pool = new ThreadPool(numThreads, workerScriptPath, GameWorker,
            getExpPath && (async () => ({expPath: await getExpPath()})));
    }

    /**
     * Queues a game to be played.
     *
     * @param args Game args.
     * @param callback Called when a worker has been assigned to the game.
     * @returns A Promise to get the results of the game. Also returns any
     * errors.
     */
    public async addGame(args: GamePoolArgs, callback?: () => void):
        Promise<GamePoolResult>
    {
        // grab a free worker
        const port = await this.pool.takePort();
        callback?.();

        try
        {
            try { return await port.playGame(args); }
            finally { this.pool.givePort(port); }
        }
        catch (err: any)
        {
            const result: GamePoolResult = {id: args.id, numAExps: 0, err};
            return result;
        }
    }

    /** Closes the thread pool. */
    public async close(): Promise<void>
    {
        return await this.pool.close();
    }
}
