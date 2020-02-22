/** @file Sets up a training session for the neural network. */
import * as tf from "@tensorflow/tfjs-node";
import { join } from "path";
import { NetworkAgent } from "../../src/ai/NetworkAgent";
import { latestModelFolder, logPath } from "../../src/config";
import { Logger } from "../../src/Logger";
import { ensureDir } from "./ensureDir";
import { createModel } from "./model";
import { train } from "./train";

(async function()
{
    const logger = Logger.stderr.addPrefix("Train: ");

    // create or load neural network
    let model: tf.LayersModel | undefined;
    const modelUrl = `file://${latestModelFolder}`;
    const modelJsonUrl = `file://${join(latestModelFolder, "model.json")}`;
    logger.debug("Loading network");
    try
    {
        model = await tf.loadLayersModel(modelJsonUrl);
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
        await model.save(modelUrl);
    }

    // train network
    await train(
    {
        model, saveUrl: modelUrl,
        numGames: 2, maxTurns: 100,
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
        epochs: 3,
        logPath
    });
    model.dispose();
})();
