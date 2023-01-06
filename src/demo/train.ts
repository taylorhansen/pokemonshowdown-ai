/** @file Sets up a training session for the model. */
import {join} from "path";
import {setGracefulCleanup} from "tmp-promise";
import {config} from "../config";
import {TrainingProgress} from "../train/TrainingProgress";
import {ModelWorker} from "../train/model/worker";
import {Logger} from "../util/logging/Logger";
import {Verbose} from "../util/logging/Verbose";
import {ensureDir} from "../util/paths/ensureDir";
import {pathToFileUrl} from "../util/paths/pathToFileUrl";

// Used for debugging.
Error.stackTraceLimit = Infinity;

(setGracefulCleanup as () => void)();
// Still terminate normally on ctrl-c so that tmp files can be cleaned up.
// eslint-disable-next-line no-process-exit
process.once("SIGINT", () => process.exit(1));

const resume: string | undefined = undefined;

// TODO: Move this constant to config.
const name = "train";

/** Main Logger object. */
const logger = new Logger(
    Logger.stderr,
    config.train.verbose ?? Verbose.Debug,
    "Train: ",
);

void (async function () {
    const modelPath = join(config.paths.models, name);
    const logPath = join(config.paths.logs, name);
    await Promise.all([modelPath, logPath].map(ensureDir));

    /** Manages the worker thread for Tensorflow ops. */
    const models = new ModelWorker(
        config.tf.gpu,
        join(config.paths.logs, "tensorboard/"),
    );

    // Create or load neural network.
    let model: string;
    if (resume) {
        const resumeFolder = join(config.paths.models, resume || "");
        const resumeLoadUrl = pathToFileUrl(join(resumeFolder, "model.json"));
        logger.info("Loading model: " + resumeFolder);
        try {
            model = await models.load(
                "model",
                config.train.batchPredict,
                resumeLoadUrl,
            );
        } catch (e) {
            logger.error(`${e}`);
            logger.info("Creating default model instead");
            model = await models.load(
                "model",
                config.train.batchPredict,
                undefined /*url*/,
                config.train.model,
                config.train.seeds?.model,
            );
        }
    } else {
        logger.info("Creating default model");
        model = await models.load(
            "model",
            config.train.batchPredict,
            undefined /*url*/,
            config.train.model,
            config.train.seeds?.model,
        );
    }

    try {
        const trainProgress = new TrainingProgress(config, logger);
        await models.train(
            name,
            model,
            config.train,
            modelPath,
            logPath,
            data => trainProgress.callback(data),
        );
    } catch (e) {
        logger.error((e as Error).stack ?? (e as Error).toString());
    } finally {
        await models.unload(model);
        await models.close();
        logger.info("Done");
    }
})();
