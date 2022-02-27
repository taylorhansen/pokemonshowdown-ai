/** @file Sets up a training session for the neural network. */
import * as path from "path";
import {setGracefulCleanup} from "tmp-promise";
import {config} from "../config";
import {Logger} from "../util/logging/Logger";
import {ensureDir} from "../util/paths/ensureDir";
import {episode} from "./episode";
import {ModelWorker} from "./model/worker";
import {Opponent} from "./play";

// Used for debugging.
Error.stackTraceLimit = Infinity;

(setGracefulCleanup as () => void)();
// Still terminate normally on ctrl-c so that tmp files can be cleaned up.
// eslint-disable-next-line no-process-exit
process.once("SIGINT", () => process.exit(1));

/** Main Logger object. */
const logger = Logger.stderr.addPrefix("Train: ");

/** Manages the worker thread for Tensorflow ops. */
const models = new ModelWorker(config.tf.gpu);

(async function () {
    // Create or load neural network.
    let model: number;
    // TODO: Use url.pathToFileURL() and pass actual URL objects instead.
    const latestModelUrl = `file://${config.paths.latestModel}`;
    const loadUrl = `file://${path.join(
        config.paths.latestModel,
        "model.json",
    )}`;
    logger.debug("Loading latest model");
    try {
        model = await models.load(config.train.batchPredict, loadUrl);
    } catch (e) {
        logger.error(`Error opening model: ${e}`);
        logger.debug("Creating default model instead");
        model = await models.load(config.train.batchPredict);

        logger.debug("Saving");
        await ensureDir(config.paths.latestModel);
        await models.save(model, latestModelUrl);
    }

    // Save a copy of the original model for evaluating the trained model later.
    logger.debug("Saving copy of original for reference");
    const originalModel = await models.load(config.train.batchPredict, loadUrl);
    const originalModelFolder = path.join(config.paths.models, "original");
    await models.save(originalModel, `file://${originalModelFolder}`);

    const evalOpponents: Opponent[] = [
        {
            name: "original",
            agentConfig: {model: originalModel, exp: false},
            numGames: config.train.eval.numGames,
        },
    ];

    // Train network.
    for (let i = 0; i < config.train.numEpisodes; ++i) {
        const episodeLog = logger.addPrefix(
            `Episode(${i + 1}/${config.train.numEpisodes}): `,
        );

        // TODO: Reference models by file urls to conserve memory.
        await episode({
            models,
            model,
            trainOpponents: [
                {
                    name: "self",
                    agentConfig: {model, exp: true},
                    numGames: config.train.rollout.numGames,
                },
            ],
            evalOpponents,
            numThreads: config.train.game.numThreads,
            maxTurns: config.train.game.maxTurns,
            // TODO: Move algorithm to config.
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
            epochs: config.train.learn.epochs,
            numDecoderThreads: config.train.learn.numDecoderThreads,
            batchSize: config.train.learn.batchSize,
            shufflePrefetch: config.train.learn.shufflePrefetch,
            logger: episodeLog,
            logPath: path.join(config.paths.logs, `episode-${i + 1}`),
        });

        // Save the model for evaluation at the end of the next episode.
        episodeLog.debug("Saving");
        const episodeFolderName = `episode-${i + 1}`;
        const episodeModelFolder = path.join(
            config.paths.models,
            episodeFolderName,
        );
        await models.save(model, `file://${episodeModelFolder}`);

        // Re-load it so we have a copy.
        const modelCopy = await models.load(
            config.train.batchPredict,
            `file://${path.join(episodeModelFolder, "model.json")}`,
        );
        evalOpponents.push({
            name: episodeFolderName,
            agentConfig: {model: modelCopy, exp: false},
            numGames: config.train.eval.numGames,
        });
    }

    logger.debug("Saving latest model");
    await models.save(model, latestModelUrl);

    // Unload all the models and then the ModelWorker itself.
    const promises = [models.unload(model)];
    for (const opponent of evalOpponents) {
        if (opponent.agentConfig.model === model) {
            continue;
        }
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
