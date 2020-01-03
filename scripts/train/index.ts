/**
 * @file Plays the neural network against itself for several times before
 * training and evaluation.
 *
 * The algorithm is as follows:
 * 1. Construct a neural network.
 * 2. Play the network against itself, storing Experience objects during play to
 *    be used for learning later.
 * 3. After a number of games, train a copy of the neural network using all of
 *    the stored Experiences.
 * 4. Evaluate the newly trained network against the old one to see if the old
 *    one should be replaced on the next training cycle. This is done by playing
 *    some number of games and seeing if the new network generally beats the
 *    old one.
 * 5. Repeat steps 2-4 as desired.
 */
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
        games: 5,
        gamma: 0.8,
        explore: {start: 1, stop: 0.01, decay: 0.001},
        batchSize: 16, memorySize: 256,
        logPath
    });
})();
