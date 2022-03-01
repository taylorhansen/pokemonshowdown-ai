import * as os from "os";
import * as path from "path";
import {Config} from "./types";

const modelsPath = path.join(__dirname, "../../models/");
const numThreads = os.cpus().length;

export const config: Config = {
    psbot: {
        loginUrl: "https://play.pokemonshowdown.com/",
        // Refers to locally-hosted PS instance. Can be overridden to
        // "ws://sim.smogon.com:8000/" or "wss://sim.smogon.com/" to connect to
        // the official PS server.
        websocketRoute: "ws://localhost:8000/",
    },
    paths: {
        models: modelsPath,
        latestModel: path.join(modelsPath, "latest/"),
        logs: path.join(__dirname, "../../logs/"),
    },
    tf: {gpu: false},
    train: {
        numEpisodes: 4,
        batchPredict: {maxSize: numThreads * 2, timeoutNs: 50000n /*50us*/},
        game: {numThreads, maxTurns: 128},
        rollout: {numGames: 128},
        eval: {numGames: 32},
        learn: {
            epochs: 8,
            numDecoderThreads: Math.ceil(numThreads / 2),
            batchSize: 16,
            shufflePrefetch: 16 * 128,
            algorithm: {
                type: "ppo",
                variant: "clipped",
                epsilon: 0.2,
                advantage: {
                    type: "generalized",
                    gamma: 0.99,
                    lambda: 0.9,
                    standardize: true,
                },
                valueCoeff: 0.55,
                entropyCoeff: 0.1,
            },
        },
    },
};
