/** @file Sets up a training session for the model. */
import * as path from "path";
import {setGracefulCleanup} from "tmp-promise";
import {config} from "../config";
import {ModelWorker} from "../train/model/worker";
import {GamePool} from "../train/play/pool";
import {train} from "../train/train";
import {Logger} from "../util/logging/Logger";
import {Verbose} from "../util/logging/Verbose";

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
    const games = new GamePool(
        config.train.game.numThreads,
        config.train.game.highWaterMark,
    );

    /** Logging verbosity level. Set to Debug for more logs. */
    const verbose = Verbose.Debug;
    /** Main Logger object. */
    const logger = new Logger(Logger.stderr, verbose, "Train: ");

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
            progress: true,
            // Uncomment to repeat training from the latest model.
            // resume: "latest",
        });
    } catch (e) {
        logger.error(
            "Training script threw an error: " +
                ((e as Error).stack ?? (e as Error).toString()),
        );
    } finally {
        await games.close();
        await models.close();
        logger.info("Done");
    }
})();
