import * as path from "path";
import {pathToFileURL} from "url";
import {Config} from "../config/types";
import {Logger} from "../util/logging/Logger";
import {ensureDir} from "../util/paths/ensureDir";
import {episode} from "./episode";
import {ModelWorker} from "./model/worker";
import {Opponent} from "./play";

/** Args for {@link train}. */
export interface TrainArgs {
    /** Name of this training run. */
    readonly name: string;
    /** Config for training. */
    readonly config: Config;
    /** Object used to manage TensorFlow model ops. */
    readonly models: ModelWorker;
    /** Logger object used to provide console output. */
    readonly logger: Logger;
}

/** Executes the training procedure with the given config. */
export async function train({
    name,
    config,
    models,
    logger,
}: TrainArgs): Promise<void> {
    // Create or load neural network.
    let model: number;
    const latestModelUrl = pathToFileURL(config.paths.latestModel).href;
    const loadUrl = pathToFileURL(
        path.join(config.paths.latestModel, "model.json"),
    ).href;
    logger.debug("Loading latest model: " + config.paths.latestModel);
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
    await models.save(originalModel, pathToFileURL(originalModelFolder).href);

    const evalOpponents: Opponent[] = [
        {
            name: "original",
            agentConfig: {model: originalModel},
            numGames: config.train.eval.numGames,
        },
    ];

    let {exploration} = config.train.rollout.policy;
    const {explorationDecay, minExploration} = config.train.rollout.policy;

    // Train network.
    for (let i = 0; i < config.train.numEpisodes; ++i) {
        const episodeLog = logger.addPrefix(
            `Episode(${i + 1}/${config.train.numEpisodes}): `,
        );

        await episode({
            name,
            step: i + 1,
            models,
            model,
            exploration,
            experienceConfig: config.train.rollout.experience,
            // TODO: Include ancestor opponents to avoid strategy collapse.
            trainOpponents: [
                {
                    name: "self",
                    agentConfig: {
                        model,
                        exploration,
                        emitExperience: true,
                    },
                    numGames: config.train.rollout.numGames,
                },
            ],
            evalOpponents,
            gameConfig: config.train.game,
            learnConfig: config.train.learn,
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
        await models.save(model, pathToFileURL(episodeModelFolder).href);

        // Re-load it so we have a copy.
        const modelCopy = await models.load(
            config.train.batchPredict,
            pathToFileURL(path.join(episodeModelFolder, "model.json")).href,
        );
        evalOpponents.push({
            name: episodeFolderName,
            agentConfig: {model: modelCopy},
            numGames: config.train.eval.numGames,
        });

        // Update epsilon.
        exploration = Math.max(exploration * explorationDecay, minExploration);
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
}
