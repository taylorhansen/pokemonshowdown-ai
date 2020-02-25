/** @file Sets up a training session for the neural network. */
import * as tf from "@tensorflow/tfjs-node";
import { join } from "path";
import { NetworkAgent } from "../../src/ai/NetworkAgent";
import { latestModelFolder, logPath, modelsFolder } from "../../src/config";
import { Logger } from "../../src/Logger";
import { ensureDir } from "./ensureDir";
import { episode } from "./episode";
import { createModel } from "./model";
import { Opponent } from "./playGames";
import { simulators } from "./sim/simulators";

/** Number of training episodes to complete. */
const numEpisodes = 2;
/** Max amount of evaluation games against one ancestor. */
const numEvalGames = 3;

(async function()
{
    const logger = Logger.stderr.addPrefix("Train: ");

    // create or load neural network
    let model: tf.LayersModel | undefined;
    const latestModelUrl = `file://${latestModelFolder}`;
    logger.debug("Loading latest model");
    try
    {
        model = await tf.loadLayersModel(
            `file://${join(latestModelFolder, "model.json")}`);
        NetworkAgent.verifyModel(model);
    }
    catch (e)
    {
        logger.error(`Error opening model: ${e}`);
        logger.debug("Creating default model");

        model?.dispose();
        model = createModel();
        logger.debug("Saving");
        await ensureDir(latestModelFolder);
        await model.save(latestModelUrl);
    }

    // save original model for evaluation of newly trained model later
    logger.debug("Saving original");
    const originalModelFolder = join(modelsFolder, "original");
    await model.save(`file://${originalModelFolder}`);

    const evalOpponents: Opponent[] =
    [{
        name: "original",
        model: `file://${join(originalModelFolder, "model.json")}`,
        numGames: numEvalGames
    }];

    // train network
    for (let i = 0; i < numEpisodes; ++i)
    {
        const episodeLog = logger.addPrefix(
            `Episode(${i + 1}/${numEpisodes}): `);

        await episode(
        {
            model, trainOpponents: [{name: "self", model, numGames: 3}],
            evalOpponents, sim: simulators.ps, maxTurns: 100,
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
        const episodeFolderName = `episode-${i + 1}`;
        episodeLog.debug("Saving");
        const episodeModelFolder = join(modelsFolder, episodeFolderName);
        await model.save(`file://${episodeModelFolder}`);
        evalOpponents.push(
        {
            name: episodeFolderName,
            model: `file://${join(episodeModelFolder, "model.json")}`,
            numGames: numEvalGames
        });
    }

    logger.debug("Saving latest model");
    await model.save(latestModelUrl);
    model.dispose();
})()
    .catch((e: Error) =>
        console.log("\nTraining script threw an error: " +
            (e.stack ?? e.toString())));
