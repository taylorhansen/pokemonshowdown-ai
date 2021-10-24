/** @file Sets up a training session for the neural network. */
import * as os from "os";
import {join} from "path";
import {setGracefulCleanup} from "tmp-promise";
import {Logger} from "../Logger";
// For some reason eslint doesn't like gitignored source files.
// eslint-disable-next-line node/no-unpublished-import
import {latestModelFolder, logPath, modelsFolder} from "../config";
import {episode} from "./episode";
import {ensureDir} from "./helpers/ensureDir";
import {BatchPredictOptions, ModelWorker} from "./model/worker";
import {Opponent} from "./play";

(setGracefulCleanup as () => void)();

/** Number of training episodes to complete. */
const numEpisodes = 4;
/** Max amount of evaluation games against one ancestor. */
const numEvalGames = 32;

/** Main Logger object. */
const logger = Logger.stderr.addPrefix("Train: ");

const format = "gen4";

/** Manages the worker thread for Tensorflow ops. */
const models = new ModelWorker(/*Gpu*/ process.argv[2] === "--gpu");
/** Options for predict batching. */
const batchOptions: BatchPredictOptions = {
    // When running games on multiple threads, the GamePool workers can tend to
    // "spam" the TF worker with messages, forcing the worker to queue them all
    // into a batch before the timer has a chance to update.
    // Waiting for the next "wave" of messages could take several ms, around the
    // time it would take to execute the currently sitting batch (assuming gpu,
    // most likely), so it's best to cut it off nearly as soon as the timer
    // updates.
    // TODO: Tuning.
    maxSize: os.cpus().length * 2,
    timeoutNs: /*50us*/ 50000n,
};

(async function () {
    // Create or load neural network.
    let model: number;
    const latestModelUrl = `file://${latestModelFolder}`;
    const loadUrl = `file://${join(latestModelFolder, "model.json")}`;
    logger.debug("Loading latest model");
    try {
        model = await models.load(batchOptions, format, loadUrl);
    } catch (e) {
        logger.error(`Error opening model: ${e}`);
        logger.debug("Creating default model instead");
        model = await models.load(batchOptions, format);

        logger.debug("Saving");
        await ensureDir(latestModelFolder);
        await models.save(model, latestModelUrl);
    }

    // Save a copy of the original model for evaluating the trained model later.
    logger.debug("Saving copy of original for reference");
    const originalModel = await models.load(batchOptions, format, loadUrl);
    const originalModelFolder = join(modelsFolder, "original");
    await models.save(originalModel, `file://${originalModelFolder}`);

    const evalOpponents: Opponent[] = [
        {
            name: "original",
            agentConfig: {model: originalModel, exp: false},
            numGames: numEvalGames,
        },
    ];

    // Train network.
    for (let i = 0; i < numEpisodes; ++i) {
        const episodeLog = logger.addPrefix(
            `Episode(${i + 1}/${numEpisodes}): `,
        );

        // TODO: Should opponents be stored as file urls to conserve memory?
        await episode({
            models,
            model,
            trainOpponents: [
                {
                    name: "self",
                    agentConfig: {model, exp: true},
                    numGames: 128,
                },
            ],
            evalOpponents,
            format,
            numThreads: os.cpus().length,
            maxTurns: 128,
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
            epochs: 8,
            numDecoderThreads: Math.ceil(os.cpus().length / 2),
            batchSize: 16,
            shufflePrefetch: 16 * 128,
            logger: episodeLog,
            logPath: join(logPath, `episode-${i + 1}`),
        });

        // Save the model for evaluation at the end of the next episode.
        episodeLog.debug("Saving");
        const episodeFolderName = `episode-${i + 1}`;
        const episodeModelFolder = join(modelsFolder, episodeFolderName);
        await models.save(model, `file://${episodeModelFolder}`);

        // Re-load it so we have a copy.
        const modelCopy = await models.load(
            batchOptions,
            format,
            `file://${join(episodeModelFolder, "model.json")}`,
        );
        evalOpponents.push({
            name: episodeFolderName,
            agentConfig: {model: modelCopy, exp: false},
            numGames: numEvalGames,
        });
    }

    logger.debug("Saving latest model");
    await models.save(model, latestModelUrl);

    // Unload all the models and then the ModelWorker itself.
    const promises = [models.unload(model)];
    for (const opponent of evalOpponents) {
        if (opponent.agentConfig.model === model) continue;
        promises.push(models.unload(opponent.agentConfig.model));
    }
    await Promise.all(promises);
})()
    .catch((e: Error) =>
        console.log(
            "\nTraining script threw an error: " + (e.stack ?? e.toString()),
        ),
    )
    .finally(() => void models.close());
