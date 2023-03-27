import * as os from "os";
import * as path from "path";
import {Verbose} from "../util/logging/Verbose";
import {Config} from "./types";

// Note: Multithreaded training can introduce nondeterminism that can't be
// easily reproduced. Setting numThreads to 1 and specifying the random seeds in
// the training script should make the whole process fully deterministic.
const numThreads = os.cpus().length;
const evalThreads = Math.ceil(numThreads / 4);

const maxTurns = 100;

/**
 * Top-level config. Should only be accessed by the top-level.
 *
 * @see {@link Config} for documentation.
 */
export const config: Config = {
    psbot: {
        loginUrl: "https://play.pokemonshowdown.com/",
        // Refers to locally-hosted PS instance. Can just change this to
        // "ws://sim.smogon.com:8000/" or "wss://sim.smogon.com/" to connect to
        // the official PS server.
        websocketRoute: "ws://localhost:8000/",
        tf: {backend: "tensorflow", gpu: false},
        model: "train",
        batchPredict: {
            // Can be tuned based on expected load.
            maxSize: 1,
            timeoutNs: 10_000_000n /*10ms*/,
        },
        verbose: Verbose.Info,
    },
    paths: {
        models: path.join(__dirname, "../../models/"),
        logs: path.join(__dirname, "../../logs/"),
        metrics: path.join(__dirname, "../../metrics"),
    },
    train: {
        name: "train",
        tf: {backend: "tensorflow", gpu: false},
        steps: maxTurns * 2 * 500 /*enough for at least 500 games*/,
        model: {
            dueling: true,
            dist: 51,
        },
        rollout: {
            pool: {
                numThreads,
                maxTurns,
                reduceLogs: true,
                resourceLimits: {maxOldGenerationSizeMb: 512},
            },
            policy: {
                exploration: 1.0,
                minExploration: 0.01,
                interpolate: maxTurns * 2 * 250,
            },
            serve: {
                type: "batched",
                maxSize: numThreads,
                timeoutNs: 5_000_000n /*5ms*/,
            },
            servePrev: {
                type: "batched",
                maxSize: Math.ceil(numThreads * 0.2),
                timeoutNs: 5_000_000n /*5ms*/,
            },
            prevRatio: 0.2,
            metricsInterval: 1000,
        },
        experience: {
            rewardDecay: 0.99,
            steps: 1,
            bufferSize: maxTurns * 2 * 250 /*enough for at least 250 games*/,
            prefill: maxTurns * 2 * numThreads /*at least one complete game*/,
            metricsInterval: 1000,
        },
        learn: {
            optimizer: {
                type: "adam",
                learningRate: 1e-5,
            },
            batchSize: 32,
            target: "double",
            interval: 2,
            targetInterval: 5000,
            metricsInterval: 100,
            histogramInterval: 10_000,
            reportInterval: 100,
        },
        eval: {
            numGames: 100,
            pool: {
                numThreads: evalThreads,
                maxTurns,
                reduceLogs: true,
                resourceLimits: {maxOldGenerationSizeMb: 256},
                tf: {backend: "wasm", numThreads: 2},
            },
            // Use a separate TensorFlow instance on each thread to run
            // inferences so that they don't block the main learner thread.
            serve: {type: "distributed", maxSize: 1, timeoutNs: 0n},
            servePrev: {type: "distributed", maxSize: 1, timeoutNs: 0n},
            interval: 5_000,
            predictMetricsInterval: 10_000,
            report: true,
        },
        seeds: {
            model: "abc",
            battle: "def",
            team: "ghi",
            rollout: "jkl",
            explore: "mno",
            learn: "pqr",
        },
        savePreviousVersions: true,
        checkpointInterval: 1000,
        metricsInterval: 1000,
        progress: true,
        verbose: Verbose.Info,
        resourceLimits: {maxOldGenerationSizeMb: 1024},
    },
    compare: {
        name: "latest-original",
        tf: {backend: "tensorflow", gpu: false},
        models: [
            // Previously-trained agent models.
            "train",
            "train/checkpoints/step-0",
            // Custom baseline agents.
            "damage",
            "randmove",
            "random",
        ],
        numGames: 1000,
        threshold: 0.55,
        batchPredict: {
            maxSize: numThreads,
            timeoutNs: 5_000_000n /*5ms*/,
        },
        pool: {
            numThreads,
            maxTurns: 100,
            reduceLogs: true,
            resourceLimits: {maxOldGenerationSizeMb: 256},
        },
        seeds: {
            battle: "stu",
            team: "vwx",
            explore: "yz!",
        },
    },
};
