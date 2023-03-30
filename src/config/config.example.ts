import * as os from "os";
import * as path from "path";
import {Verbose} from "../util/logging/Verbose";
import {Config} from "./types";

// Note: Use the profiling scripts and monitor CPU usage to help inform these
// values.
const numThreads = os.cpus().length;
const rolloutThreads = Math.ceil(numThreads / 2);
const evalThreads = Math.ceil(numThreads / 4);
const rolloutPerThread = 32;
const evalPerThread = 32;
const comparePerThread = 32;

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
        // Note: Change gpu=true if you have a CUDA-enabled GPU.
        tf: {backend: "tensorflow", gpu: false},
        // 1M steps will process at least 5000 rollout games.
        steps: maxTurns * 2 * 5000,
        model: {
            // Dueling deep Q network.
            dueling: true,
            // Distributional RL.
            dist: 51,
        },
        rollout: {
            pool: {
                numThreads: rolloutThreads,
                gamesPerThread: rolloutPerThread,
                maxTurns,
                reduceLogs: true,
                resourceLimits: {maxOldGenerationSizeMb: 512},
                tf: {backend: "tensorflow", gpu: false},
            },
            policy: {
                exploration: 1.0,
                minExploration: 0.01,
                // Reach minimum exploration by the middle of training.
                interpolate: maxTurns * 2 * 2500,
            },
            serve: {
                type: "distributed",
                maxSize: rolloutPerThread,
                // Note: Should tune these based on performance profiling.
                timeoutNs: 1_000_000n /*1ms*/,
            },
            servePrev: {
                type: "distributed",
                maxSize: Math.ceil(rolloutPerThread * 0.2),
                timeoutNs: 1_000_000n /*1ms*/,
            },
            prevRatio: 0.2,
            updateInterval: 100,
            metricsInterval: 1000,
        },
        experience: {
            rewardDecay: 0.99,
            steps: 1,
            // Store at least 250 games' worth of experience in the buffer.
            bufferSize: maxTurns * 2 * 250,
            // Ensure at least one complete game.
            prefill: maxTurns * 2 * rolloutThreads * rolloutPerThread,
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
            targetInterval: 10_000,
            metricsInterval: 1000,
            histogramInterval: 100_000,
            reportInterval: 100,
        },
        eval: {
            numGames: 100,
            pool: {
                numThreads: evalThreads,
                gamesPerThread: evalPerThread,
                maxTurns,
                reduceLogs: true,
                resourceLimits: {maxOldGenerationSizeMb: 256},
                tf: {backend: "tensorflow", gpu: false},
            },
            serve: {
                type: "distributed",
                maxSize: evalPerThread,
                timeoutNs: 1_000_000n /*1ms*/,
            },
            servePrev: {
                type: "distributed",
                maxSize: evalPerThread,
                timeoutNs: 1_000_000n /*1ms*/,
            },
            interval: 100_000,
            // Note: Currently only applicable if serve.type=batched
            predictMetricsInterval: 0,
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
            maxSize: numThreads * comparePerThread,
            timeoutNs: 1_000_000n /*1ms*/,
        },
        pool: {
            numThreads,
            gamesPerThread: comparePerThread,
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
