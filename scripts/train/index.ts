/** @file Sets up a training session for the neural network. */
import { join } from "path";
import { latestModelFolder, logPath, modelsFolder } from "../../src/config";
import { Logger } from "../../src/Logger";
import { ensureDir } from "./helpers/ensureDir";
import { episode } from "./episode";
import { GamePool } from "./play/GamePool";
import { Opponent } from "./play/playGames";
import { NetworkProcessor } from "./nn/worker/NetworkProcessor";

/** Number of training episodes to complete. */
const numEpisodes = 2;
/** Max amount of evaluation games against one ancestor. */
const numEvalGames = 3;

(async function()
{
    const logger = Logger.stderr.addPrefix("Train: ");

    const processor = new NetworkProcessor();

    // create or load neural network
    let model: number;
    const latestModelUrl = `file://${latestModelFolder}`;
    const loadUrl = `file://${join(latestModelFolder, "model.json")}`;
    logger.debug("Loading latest model");
    try { model = await processor.load(loadUrl); }
    catch (e)
    {
        logger.error(`Error opening model: ${e}`);
        logger.debug("Creating default model");
        model = await processor.load();

        logger.debug("Saving");
        await ensureDir(latestModelFolder);
        await processor.save(model, latestModelUrl);
    }

    // save a copy of the original model for evaluating the trained model later
    logger.debug("Saving copy of original for reference");
    const originalModel = await processor.load(loadUrl);
    const originalModelFolder = join(modelsFolder, "original");
    await processor.save(originalModel, `file://${originalModelFolder}`);

    const evalOpponents: Opponent[] =
    [{
        name: "original",
        agentConfig: {model: originalModel, exp: false},
        numGames: numEvalGames
    }];

    // used for parallel games
    const pool = new GamePool();

    // train network
    for (let i = 0; i < numEpisodes; ++i)
    {
        const episodeLog = logger.addPrefix(
            `Episode(${i + 1}/${numEpisodes}): `);

        // TODO: should opponents be stored as urls to conserve memory?
        await episode(
        {
            pool, processor, model,
            trainOpponents:
            [{
                name: "self", agentConfig: {model, exp: true}, numGames: 3
            }],
            evalOpponents, simName: "ps", maxTurns: 100,
            algorithm:
            {
                type: "ppo", variant: "clipped", epsilon: 0.2,
                advantage:
                {
                    type: "generalized", lambda: 0.95, gamma: 0.95,
                    standardize: true
                },
                valueCoeff: 0.6, entropyCoeff: 0.8
            },
            epochs: 3, batchSize: 32,
            logger: episodeLog, logPath: join(logPath, `episode-${i + 1}`)
        });

        // save the model for evaluation at the end of the next episode
        episodeLog.debug("Saving");
        const episodeFolderName = `episode-${i + 1}`;
        const episodeModelFolder = join(modelsFolder, episodeFolderName);
        await processor.save(model, `file://${episodeModelFolder}`);

        // re-load it so we have a copy
        const modelCopy = await processor.load(
            `file://${join(episodeModelFolder, "model.json")}`);
        evalOpponents.push(
        {
            name: episodeFolderName,
            agentConfig: {model: modelCopy, exp: false}, numGames: numEvalGames
        });
    }

    pool.close();

    logger.debug("Saving latest model");
    await processor.save(model, latestModelUrl);

    // unload all the models and the NetworkProcessosr
    const promises = [processor.unload(model)];
    for (const opponent of evalOpponents)
    {
        if (opponent.agentConfig.model === model) continue;
        promises.push(processor.unload(opponent.agentConfig.model));
    }
    await Promise.all(promises);
    processor.close();
})()
    .catch((e: Error) =>
        console.log("\nTraining script threw an error: " +
            (e.stack ?? e.toString())));
