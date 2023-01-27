import * as os from "os";
import * as path from "path";
import {Verbose} from "../util/logging/Verbose";
import {Config} from "./types";

// Note: Multithreaded training can introduce nondeterminism that can't be
// easily reproduced. Setting numThreads to 1 and specifying the random seeds in
// the training script should make the whole process fully deterministic.
const numThreads = os.cpus().length;

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
        model: "train/latest",
        verbose: Verbose.Info,
    },
    paths: {
        models: path.join(__dirname, "../../models/"),
        logs: path.join(__dirname, "../../logs/"),
    },
    // Should set below to true if you have a compatible GPU.
    tf: {gpu: false},
    train: {
        name: "train",
        episodes: 16,
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
                maxTurns: 100,
                reduceLogs: true,
            },
            policy: {
                exploration: 1.0,
                explorationDecay: 0.9,
                minExploration: 0.1,
            },
            prev: 0.1,
        },
        eval: {
            numGames: 128,
            pool: {
                numThreads,
                maxTurns: 100,
                reduceLogs: true,
            },
        },
        learn: {
            updates: 1024,
            learningRate: 0.0001,
            buffer: {
                shuffle: 100 * 2 * 8 /*at least 8 game's worth*/,
                batch: 32,
                prefetch: 4,
            },
            experience: {
                rewardDecay: 0.99,
            },
            target: "double",
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
        verbose: Verbose.Info,
    },
    compare: {
        name: "latest-original-random",
        models: ["train/latest", "train/original", "random"],
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
