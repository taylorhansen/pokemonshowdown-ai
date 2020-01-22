/** @file Sets up a training session for the neural network. */
import * as tf from "@tensorflow/tfjs-node";
import { join } from "path";
import { Network } from "../../src/ai/Network";
import { latestModelFolder, logPath } from "../../src/config";
import { Logger } from "../../src/Logger";
import { ensureDir } from "./ensureDir";
import { createModel } from "./model";
import { train } from "./train";

(async function()
{
    const logger = Logger.stderr.addPrefix("Train: ");

    // create or load neural network
    let model: tf.LayersModel;
    const modelUrl = `file://${latestModelFolder}`;
    const modelJsonUrl = `file://${join(latestModelFolder, "model.json")}`;
    logger.debug("Loading network");
    try { model = await Network.loadModel(modelJsonUrl); }
    catch (e)
    {
        logger.error(`Error opening model: ${e}`);
        logger.debug("Creating default model");

        model = createModel();
        await ensureDir(latestModelFolder);
        await model.save(modelUrl);
    }

    // train network
    await train(
    {
        model, saveUrl: modelUrl,
        games: 25,
        gamma: 0.95,
        explore: {start: 1, stop: 0.01, decay: 0.001},
        batchSize: 64, memorySize: 1024,
        logPath
    });
})();
