import {resolve} from "path";
import {isArrayBuffer} from "util/types";
import {MessagePort} from "worker_threads";
import {PRNGSeed} from "@pkmn/sim";
import type * as tf from "@tensorflow/tfjs";
import {
    BatchPredictConfig,
    ExperienceConfig,
    GamePoolConfig,
} from "../../config/types";
import {ThreadPool} from "../../util/pool/ThreadPool";
import {Experience} from "../experience";
import {SimResult} from "../sim/playGame";
import {
    GameAgentConfig,
    GameProtocol,
    GameWorkerData,
    GameWorker,
} from "./worker";

/** Args for {@link GamePool.add}. */
export interface GamePoolArgs {
    /** Unique identifier for logging. */
    readonly id: number;
    /** Config for the models that will play against each other. */
    readonly agents: readonly [GameAgentConfig, GameAgentConfig];
    /** Args for starting the game. */
    readonly play: PlayArgs;
}

/** Args for starting a game. */
export interface PlayArgs {
    /**
     * Path to the file to store game logs in. If not specified, and the
     * simulator encounters an error, then the logs will be stored in a temp
     * file.
     */
    readonly logPath?: string;
    /**
     * If true, logs should only be written to disk (either to {@link logPath}
     * or a tmp file) if an error is encountered, and discarded if no error.
     */
    readonly onlyLogOnError?: true;
    /** Seed for the battle PRNG. */
    readonly seed?: PRNGSeed;
    /**
     * Configuration to process any Experiences that get generated by agents. If
     * omitted, experience is discarded.
     */
    readonly experienceConfig?: ExperienceConfig;
}

/** {@link GamePool} stream output type. */
export interface GamePoolResult extends SimResult {
    /** Unique identifier for logging. */
    readonly id: number;
}

/** Path to the GameWorker script. */
const workerScriptPath = resolve(__dirname, "worker", "worker.js");

/** Uses a thread pool to dispatch parallel games. */
export class GamePool {
    /** Number of threads in the thread pool. */
    public get numThreads(): number {
        return this.pool.numThreads;
    }

    /** Wrapped thread pool for managing game workers. */
    private readonly pool: ThreadPool<
        GameWorker,
        GameProtocol,
        keyof GameProtocol,
        GameWorkerData
    >;

    /**
     * Creates a GamePool.
     *
     * @param name Name prefix for threads.
     * @param config Config for creating the thread pool.
     */
    public constructor(name: string, config: GamePoolConfig) {
        this.pool = new ThreadPool(
            config.numThreads,
            config.gamesPerThread,
            workerScriptPath,
            GameWorker,
            i => ({
                name: `${name}-${i}`,
                ...(config.maxTurns && {maxTurns: config.maxTurns}),
                ...(config.tf && {tf: config.tf}),
            }) /*workerData*/,
            config.resourceLimits,
        );
    }

    /**
     * Makes each game thread register a unique port for requesting inferences
     * during games. Any changes to the model after calling this method are
     * already reflected through the port.
     *
     * @param name Name under which to refer to the port during calls to
     * {@link add}.
     * @param modelPort Function to create a unique message port that will be
     * held by one of the game pool workers. Must implement the ModelPort
     * protocol.
     */
    public async registerModelPort(
        name: string,
        modelPort: () => MessagePort | Promise<MessagePort>,
    ): Promise<void> {
        await this.pool.map(
            async port =>
                await port.load(name, {type: "port", port: await modelPort()}),
        );
    }

    /**
     * Makes each game thread load a serialized TensorFlow model for making
     * inferences during games. This can be called multiple times to update the
     * version of the model being stored in each of the game threads.
     *
     * @param name Name under which to refer to the model during calls to
     * {@link add}.
     * @param artifact Serialized TensorFlow model artifacts.
     * @param config Batch predict config for the model on each thread.
     */
    public async loadModel(
        name: string,
        artifact: tf.io.ModelArtifacts,
        config: BatchPredictConfig,
    ): Promise<void> {
        // Convert to shared buffers for broadcasting to multiple workers
        // without excessive copying.
        for (const key of [
            "modelTopology",
            "weightData",
        ] as (keyof tf.io.ModelArtifacts)[]) {
            const buf = artifact[key];
            if (isArrayBuffer(buf)) {
                const sharedBuf = new SharedArrayBuffer(buf.byteLength);
                new Float32Array(sharedBuf).set(new Float32Array(buf));
                artifact = {...artifact, [key]: sharedBuf};
            }
        }

        await this.pool.map(
            async port =>
                await port.load(name, {type: "artifact", artifact, config}),
        );
    }

    /**
     * Launches a game and awaits the result.
     *
     * In order to launch several parallel games, this should be called multiple
     * times without awaiting, then deferring the await step until later.
     *
     * @param args Game args.
     * @param callback Called when a worker has been assigned to the game.
     * @returns A Promise to get the results of the game. Also wraps and returns
     * any errors.
     */
    public async add(
        args: GamePoolArgs,
        callback?: () => void,
    ): Promise<GamePoolResult> {
        // Grab a free worker.
        const port = await this.pool.takePort();
        try {
            callback?.();
            return await port.play(args);
        } catch (e) {
            return {
                id: args.id,
                agents: [args.agents[0].name, args.agents[1].name],
                err: e as Error,
            };
        } finally {
            this.pool.givePort(port);
        }
    }

    /**
     * Collects generated experience from game workers if any games and agents
     * were configured for it.
     */
    public async *collectExperience(): AsyncGenerator<Experience> {
        const portExps: {res: () => void; exp: Experience[]}[] = [];
        let notifyExp: (() => void) | null = null;

        void this.pool.mapAsync(async port => {
            while (!this.pool.isClosed) {
                const exp = await port.collect();
                if (exp.length > 0) {
                    await new Promise<void>(res => {
                        portExps.push({res, exp});
                        notifyExp?.();
                    });
                }
            }
            notifyExp?.();
        });
        while (!this.pool.isClosed) {
            if (portExps.length <= 0) {
                await new Promise<void>(res => (notifyExp = res)).finally(
                    () => (notifyExp = null),
                );
            }
            const exps = portExps.map(({res, exp}) => (res(), exp)).flat();
            portExps.length = 0;
            for (const exp of exps) {
                yield exp;
            }
        }
    }

    /** Waits for in-progress games to complete then closes the thread pool. */
    public async close(): Promise<void> {
        return await this.pool.close();
    }

    /** Terminates in-progress games and closes the thread pool. */
    public async terminate(): Promise<void> {
        return await this.pool.terminate();
    }
}
