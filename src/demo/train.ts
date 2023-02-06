/** @file Sets up a training session for the model. */
import {join} from "path";
import {setGracefulCleanup} from "tmp-promise";
import {config} from "../config";
import {ModelWorker} from "../model/worker";
import {TrainingProgress} from "../train/TrainingProgress";
import {formatUptime} from "../util/format";
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

// Can replace this with a pre-trained model to resume training.
const resume: string | undefined = undefined;

/** Main Logger object. */
const logger = new Logger(
    Logger.stderr,
    config.train.verbose ?? Verbose.Debug,
    "Train: ",
);

void (async function () {
    const modelPath = join(config.paths.models, config.train.name);
    const logPath = join(config.paths.logs, config.train.name);
    const metricsPath = join(config.paths.metrics, config.train.name);
    await Promise.all([modelPath, logPath, metricsPath].map(ensureDir));

    /** Manages the worker thread for Tensorflow ops. */
    const models = new ModelWorker(config.tf.gpu, metricsPath);

    // Create or load neural network.
    let model: string;
    if (resume) {
        const resumeFolder = join(config.paths.models, resume);
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
                config.train.seeds?.model,
            );
        }
    } else {
        logger.info("Creating default model");
        model = await models.load(
            "model",
            config.train.batchPredict,
            undefined /*url*/,
            config.train.seeds?.model,
        );
    }

    const trainProgress = new TrainingProgress(config.train, logger);
    try {
        await models.train(
            model,
            config.train,
            {models: modelPath, logs: logPath, metrics: metricsPath},
            data => trainProgress.callback(data),
        );
    } catch (e) {
        logger.error((e as Error).stack ?? (e as Error).toString());
    } finally {
        await models.unload(model);
        await models.close();
        trainProgress.done();
        logger.info("Uptime: " + formatUptime(process.uptime()));
        logger.info("Done");
    }
})();
