/** @file Sets up a training session for the neural network. */
import * as path from "path";
import {setGracefulCleanup} from "tmp-promise";
import {config} from "../config";
import {Logger} from "../util/logging/Logger";
import {ModelWorker} from "./model/worker";
import {GamePool} from "./play/pool";
import {train} from "./train";

// Used for debugging.
Error.stackTraceLimit = Infinity;

(setGracefulCleanup as () => void)();
// Still terminate normally on ctrl-c so that tmp files can be cleaned up.
// eslint-disable-next-line no-process-exit
process.once("SIGINT", () => process.exit(1));

void (async function () {
    /** Manages the worker thread for Tensorflow ops. */
    const models = new ModelWorker(
        config.tf.gpu,
        path.join(config.paths.logs, "tensorboard/"),
    );

    // No-op in order to ensure the model worker and TF instance are
    // initialized. Can crash if the GamePool spawns threads while this is
    // happening.
    await models.log("start", 0, {});

    /** Manages a thread pool for playing multiple parallel games. */
    const games = new GamePool(config.train.game.numThreads);

    /** Main Logger object. */
    const logger = Logger.stderr.addPrefix("Train: ");

    try {
        await train({
            name: "train",
            config,
            models,
            games,
            logger,
            seeds: {
                model: "abc",
                battle: "def",
                team: "ghi",
                explore: "jkl",
                learn: "mno",
            },
        });
    } catch (e) {
        logger.error(
            "Training script threw an error: " +
                ((e as Error).stack ?? (e as Error).toString()),
        );
    } finally {
        await games.close();
        await models.close();
        logger.debug("Done");
    }
})();
