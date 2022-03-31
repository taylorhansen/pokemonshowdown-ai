/** @file Sets up a training session for the neural network. */
import * as path from "path";
import {setGracefulCleanup} from "tmp-promise";
import {config} from "../config";
import {Logger} from "../util/logging/Logger";
import {ModelWorker} from "./model/worker";
import {train} from "./train";

// Used for debugging.
Error.stackTraceLimit = Infinity;

(setGracefulCleanup as () => void)();
// Still terminate normally on ctrl-c so that tmp files can be cleaned up.
// eslint-disable-next-line no-process-exit
process.once("SIGINT", () => process.exit(1));

/** Main Logger object. */
const logger = Logger.stderr.addPrefix("Train: ");

/** Manages the worker thread for Tensorflow ops. */
const models = new ModelWorker(
    config.tf.gpu,
    path.join(config.paths.logs, "tensorboard/"),
);

void (async function () {
    try {
        await train({name: "train", config, models, logger});
    } catch (e) {
        logger.error(
            "Training script threw an error: " +
                ((e as Error).stack ?? (e as Error).toString()),
        );
    } finally {
        await models.close();
    }
    logger.debug("Done");
})();
