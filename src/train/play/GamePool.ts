// tslint:disable: max-classes-per-file
import { cpus } from "os";
import { resolve } from "path";
import { Transform, TransformCallback } from "stream";
import { deserialize } from "v8";
import { MessagePort, Worker } from "worker_threads";
import { AdvantageConfig } from "../nn/learn/LearnArgs";
import { AsyncPort, PortResultError } from "../nn/worker/helpers/AsyncPort";
import { NetworkProcessor } from "../nn/worker/NetworkProcessor";
import { SimName } from "../sim/simulators";
import { GameWorkerAgentConfig, GameWorkerMessage, GameWorkerResult } from
    "./helpers/GameWorkerRequest";
import { AugmentedSimResult } from "./helpers/playGame";

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
    public async close(): Promise<void> { await this.worker.terminate(); }

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

/** Uses a `worker_threads` pool to dispatch parallel games. */
export class GamePool extends Transform
{
    /** Event for when a GameWorker is freed. */
    private static readonly workerFreedEvent = Symbol("workerFreedEvent");

    /** Complete worker port pool. */
    private readonly ports = new Set<GamePort>();
    /** Total worker ports available. */
    private readonly freePorts: GamePort[] = [];

    /**
     * Creates a GamePool.
     * @param numThreads Number of workers to create. Defaults to the number of
     * CPUs on the current system.
     */
    constructor(public readonly numThreads = cpus().length)
    {
        super({objectMode: true, highWaterMark: numThreads});

        if (numThreads <= 0)
        {
            throw new Error("Expected positive numThreads but got " +
                numThreads);
        }

        for (let i = 0; i < numThreads; ++i) this.addWorker();
    }

    /** @override */
    public async _transform(args: GamePoolArgs, encoding: BufferEncoding,
        callback: TransformCallback): Promise<void>
    {
        if (this.freePorts.length <= 0)
        {
            this.once(GamePool.workerFreedEvent,
                () => this._transform(args, encoding, callback));
            return;
        }

        // grab a free worker
        const gamePort = this.freePorts.pop()!;

        // get the next _transform input at earliest convenience
        callback();

        // request neural network ports
        const agentsPromise = Promise.all(
            args.agents.map(
                async config =>
                ({
                    port: await args.processor.subscribe(config.model),
                    exp: config.exp
                }))) as
                    Promise<[GameWorkerAgentConfig, GameWorkerAgentConfig]>;

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
                let result: AugmentedSimResult;
                if (workerResult.type !== "error")
                {
                    // convert back to an AugmentedSimResult by deserializing
                    //  the error if needed
                    result =
                    {
                        experiences: workerResult.experiences,
                        winner: workerResult.winner,
                        ...(workerResult.err &&
                            {err: deserialize(workerResult.err)})
                    };
                }
                else
                {
                    result =
                    {
                        experiences: [],
                        err: workerResult.err instanceof Buffer ?
                            deserialize(workerResult.err) : workerResult.err
                    };
                }
                this.push(result);

                // port is now ready for the next game
                this.freePorts.push(gamePort);
                this.emit(GamePool.workerFreedEvent);
            });
    }

    /** @override */
    public _flush(callback: TransformCallback): void
    {
        if (this.freePorts.length < this.ports.size)
        {
            // wait for the last games to finish
            this.once(GamePool.workerFreedEvent, () => this._flush(callback));
            return;
        }

        // close all ports
        const closePromises: Promise<void>[] = [];
        for (const gamePort of this.ports) closePromises.push(gamePort.close());
        Promise.all(closePromises).then(() => callback()).catch(callback);
    }

    /** Adds a new GameWorker to the pool. */
    private addWorker(): void
    {
        const worker = new Worker(workerScriptPath);
        const port = new GamePort(worker);
        worker.on("error", err => this.handleWorkerError(port));

        this.ports.add(port);
        this.freePorts.push(port);
    }

    /** Handles an error thrown or returned by a GamePort. */
    private handleWorkerError(port: GamePort): void
    {
        // remove this worker and create a new one to replace it
        this.ports.delete(port);
        port.worker.terminate();
        this.addWorker();
    }
}
