import * as os from "os";
import * as path from "path";
import {Verbose} from "../util/logging/Verbose";
import {Config} from "./types";

// Note: Multithreaded training can introduce nondeterminism that can't be
// easily reproduced. Setting numThreads to 1 and specifying the random seeds in
// the training script should make the program fully deterministic.
const numThreads = os.cpus().length;

/**
 * Top-level config. Should only be accessed by the top-level.
 *
 * @see {@link Config} for documentation.
 */
export const config: Config = {
    psbot: {
        loginUrl: "https://play.pokemonshowdown.com/",
        // Refers to locally-hosted PS instance. Can be overridden to
        // "ws://sim.smogon.com:8000/" or "wss://sim.smogon.com/" to connect to
        // the official PS server.
        websocketRoute: "ws://localhost:8000/",
        verbose: Verbose.Info,
    },
    paths: {
        models: path.join(__dirname, "../../models/"),
        logs: path.join(__dirname, "../../logs/"),
    },
    tf: {gpu: false},
    train: {
        numEpisodes: 4,
        batchPredict: {
            maxSize: numThreads * 2,
            timeoutNs: 50000n /*50us*/,
        },
        game: {
            numThreads,
            maxTurns: 100,
            highWaterMark: 4,
        },
        rollout: {
            numGames: 128,
            policy: {
                exploration: 1.0,
                explorationDecay: 0.9,
                minExploration: 0.1,
            },
            experience: {rewardDecay: 0.99},
        },
        eval: {
            // Note: Make sure numGames is high enough to reduce noise.
            numGames: 64,
            test: {
                against: ["random", "previous"],
                minScore: 0.55,
                includeTies: true,
            },
        },
        learn: {
            epochs: 4,
            numDecoderThreads: Math.ceil(numThreads / 2),
            batchSize: 16,
            shufflePrefetch: 16 * 128,
            learningRate: 0.001,
        },
        savePreviousVersions: true,
        verbose: Verbose.Info,
    },
};
