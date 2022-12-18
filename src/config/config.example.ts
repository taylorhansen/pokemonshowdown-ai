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
        verbose: Verbose.Info,
    },
    paths: {
        models: path.join(__dirname, "../../models/"),
        logs: path.join(__dirname, "../../logs/"),
    },
    // Should set below to true if you have a compatible GPU.
    tf: {gpu: false},
    train: {
        numEpisodes: 16,
        batchPredict: {
            maxSize: numThreads,
            timeoutNs: 5000000n /*5ms*/,
        },
        game: {
            numThreads,
            maxTurns: 100,
            highWaterMark: 4,
        },
        model: {
            dueling: true,
        },
        rollout: {
            // Warning: The numGames and game.maxTurns settings here can end up
            // making the program consume ~20GB disk space and 8-10GB RAM. This
            // is necessary for effective learning.
            numGames: 1024,
            policy: {
                exploration: 1.0,
                explorationDecay: 0.9,
                minExploration: 0.1,
            },
            experience: {rewardDecay: 0.99},
        },
        eval: {
            numGames: 127,
            // Uncomment to use the evaluation results to discard bad learning
            // steps. Be careful though as this can cause overfitting.
            //test: {
            //    against: ["random", "previous"],
            //    minScore: 0.55,
            //    includeTies: true,
            //},
        },
        learn: {
            epochs: 1,
            numDecoderThreads: Math.ceil(numThreads / 2),
            batchSize: 32,
            shufflePrefetch: 100 * 2 * 8 /*at least 8 game's worth*/,
            learningRate: 0.01,
        },
        seeds: {
            model: "abc",
            battle: "def",
            team: "ghi",
            explore: "jkl",
            learn: "mno",
        },
        savePreviousVersions: true,
        verbose: Verbose.Info,
    },
    compare: {
        models: ["latest", "original", "random"],
        numThreads,
        maxTurns: 100,
        numGames: 127,
        threshold: 0.55,
        batchPredict: {
            maxSize: numThreads,
            timeoutNs: 5000000n /*5ms*/,
        },
        seeds: {
            battle: "pqr",
            team: "stu",
            explore: "vwx",
        },
    },
};
