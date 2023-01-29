import * as os from "os";
import * as path from "path";
import {Verbose} from "../util/logging/Verbose";
import {Config} from "./types";

// Note: Multithreaded training can introduce nondeterminism that can't be
// easily reproduced. Setting numThreads to 1 and specifying the random seeds in
// the training script should make the whole process fully deterministic.
const numThreads = os.cpus().length;

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
    // Should set below to true if you have a compatible GPU.
    tf: {gpu: false},
    train: {
        name: "train",
        steps: maxTurns * 2 * 50 /*enough for at least 50 games*/,
        batchPredict: {
            maxSize: numThreads,
            timeoutNs: 10_000_000n /*10ms*/,
        },
        model: {
            dueling: true,
            aggregate: {
                move: {type: "mean", attention: true},
                pokemon: {type: "mean", attention: true},
            },
        },
        rollout: {
            pool: {
                numThreads,
                maxTurns,
                reduceLogs: true,
            },
            policy: {
                exploration: 1.0,
                explorationDecay: 0.999,
                minExploration: 0.1,
            },
            prev: 0.1,
        },
        experience: {
            rewardDecay: 0.99,
            bufferSize: maxTurns * 2 * 25 /*enough for at least 25 games*/,
            prefill: maxTurns * 2 * numThreads /*at least one complete game*/,
        },
        learn: {
            learningRate: 0.0001,
            batchSize: 32,
            target: "double",
            targetInterval: 500,
            metricsInterval: 100,
        },
        eval: {
            numGames: 32,
            pool: {
                numThreads,
                maxTurns,
                reduceLogs: true,
            },
            interval: 1000,
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
        progress: true,
        verbose: Verbose.Info,
    },
    compare: {
        name: "latest-original-random",
        models: ["train", "train/checkpoints/original", "random"],
        numGames: 256,
        threshold: 0.55,
        batchPredict: {
            maxSize: numThreads,
            timeoutNs: 10_000_000n /*10ms*/,
        },
        pool: {
            numThreads,
            maxTurns: 100,
            reduceLogs: true,
        },
        seeds: {
            battle: "stu",
            team: "vwx",
            explore: "yz!",
        },
    },
};
