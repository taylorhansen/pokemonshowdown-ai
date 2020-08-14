// tslint:disable: max-classes-per-file
import { EventEmitter } from "events";
import { cpus } from "os";
import { resolve } from "path";
import { deserialize } from "v8";
import { MessagePort, Worker } from "worker_threads";
import { AdvantageConfig } from "../nn/learn/LearnArgs";
import { AsyncPort, PortResultError } from "../nn/worker/helpers/AsyncPort";
import { NetworkProcessor } from "../nn/worker/NetworkProcessor";
import { SimName } from "../sim/simulators";
import { GameWorkerAgentConfig, GameWorkerMessage, GameWorkerResult } from
    "./helpers/GameWorkerRequest";
import { GameResult } from "./helpers/playGame";

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

/** Path to the GameWorker script. */
const workerScriptPath = resolve(__dirname, "helpers", "worker.js");

/** Wraps a GameWorker to provide callback functionality. */
class GamePort extends
    AsyncPort<
        {game: {message: GameWorkerMessage, result: GameWorkerResult}},
        Worker>
{
    /** The underlying worker attached to this object. */
    public get worker(): Worker { return this.port; };

    /** @override */
    public close(): void { this.worker.terminate(); }

    /** @override */
    public postMessage(msg: GameWorkerMessage,
        transferList: (MessagePort | ArrayBuffer)[],
        callback: (result: GameWorkerResult | PortResultError) => void): void
    {
        super.postMessage(msg, transferList, callback);
    }

    /** @override */
    public generateRID(): number { return super.generateRID(); }
}

interface QueuedGame
{
    readonly args: GamePoolArgs;
    res(result: GameResult): void;
    rej(reason: Error): void;
}

/** Uses `worker_threads` pools to dispatch parallel games. */
export class GamePool extends EventEmitter
{
    /** Event for when a GameWorker is freed. */
    private static readonly workerFreedEvent = Symbol("workerFreedEvent");

    /** Complete worker port pool. */
    private readonly ports: Set<GamePort> = new Set();
    /** Total worker ports available. */
    private readonly freePorts: GamePort[] = [];
    /** Queued game promises. */
    private readonly queuedGames: QueuedGame[] = [];

    /**
     * Creates a GamePool.
     * @param numThreads Number of workers to create. Defaults to the number of
     * CPUs on the current system.
     */
    constructor(public readonly numThreads = cpus().length)
    {
        super();

        if (numThreads <= 0)
        {
            throw new Error("Expected positive numThreads but got " +
                numThreads);
        }

        for (let i = 0; i < numThreads; ++i) this.addWorker();

        this.on(GamePool.workerFreedEvent, () => this.unqueueGame());
    }

    /** Queues a game to be played. */
    public async addGame(args: GamePoolArgs): Promise<GameResult>
    {
        // queue game
        const promise = new Promise<GameResult>((res, rej) =>
            this.queuedGames.push({args, res, rej}));

        // if free port available, unqueue a game (possibly this one)
        if (this.freePorts.length > 0) await this.unqueueGame();

        return promise;
    }

    /** Requests a queued game to be played. */
    private async unqueueGame(): Promise<void>
    {
        if (this.queuedGames.length <= 0 || this.freePorts.length <= 0) return;
        const {args, res, rej} = this.queuedGames.shift()!;

        // request neural network ports
        const agentsPromise = Promise.all(
            args.agents.map(
                async function(config)
                {
                    return {
                        port: await args.processor.subscribe(config.model),
                        exp: config.exp
                    };
                })) as Promise<[GameWorkerAgentConfig, GameWorkerAgentConfig]>;

        // get the next free worker port
        const gamePort = this.freePorts.pop()!;

        // setup the game worker
        const msg: GameWorkerMessage =
        {
            type: "game", rid: gamePort.generateRID(),
            simName: args.simName, agents: await agentsPromise,
            ...(args.maxTurns && {maxTurns: args.maxTurns}),
            ...(args.logPath && {logPath: args.logPath}),
            ...(args.rollout && {rollout: args.rollout})
        };
        gamePort.postMessage(msg, msg.agents.map(config => config.port),
            workerResult =>
            {
                // downcast GameWorkerResult to GameResult
                if (workerResult.type !== "error") res(workerResult);
                else rej(deserialize(workerResult.errBuf));
            });

        this.freePorts.push(gamePort);
        this.emit(GamePool.workerFreedEvent);
    }

    /**
     * Closes this GamePool. This has to be called at the end or the process
     * will hang.
     */
    public close()
    {
        for (const gamePort of this.ports) gamePort.close();
    }

    /** Adds a new GameWorker to the pool. */
    private addWorker(): void
    {
        const worker = new Worker(workerScriptPath);
        const port = new GamePort(worker);
        worker.on("error", err => this.handleWorkerError(port, err));

        this.ports.add(port);
        this.freePorts.push(port);
    }

    /** Handles an error thrown or returned by a GamePort. */
    private handleWorkerError(port: GamePort, err: Error): void
    {
        this.emit("error", err);

        // remove this worker and create a new one to replace it
        this.ports.delete(port);
        port.worker.terminate();
        this.addWorker();
    }
}
