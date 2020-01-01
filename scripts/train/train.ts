import * as tf from "@tensorflow/tfjs-node";
import { join } from "path";
// @ts-ignore
import { Network } from "../../src/ai/Network";
import { Logger } from "../../src/Logger";
import { cycle } from "./cycle";
import { ensureDir } from "./ensureDir";
import { compileModel, createModel } from "./model";

/**
 * Trains the latest network for a given number of cycles.
 * @param cycles Amount of cycles to train for.
 * @param games Amount of games per cycle for training and evaluation.
 * @param maxTurns Max amount of turns before a game is considered a tie.
 * @param modelsPath Path to the folder to store neural networks in.
 * @param selfPlayPath Path to the folder to store self-play logs in.
 * @param evaluatePath Path to the folder to store evaluation logs in.
 */
export async function train(cycles: number, games: number, maxTurns: number,
    modelsPath: string, selfPlayPath: string, evaluatePath: string):
    Promise<void>
{
    const logger = Logger.stderr.prefix("Train: ");

    const modelJsonUrl = `file://${join(modelsPath, "model.json")}`;

    let toTrain: tf.LayersModel;
    try { toTrain = await Network.loadModel(modelJsonUrl); }
    catch (e)
    {
        logger.error(`Error opening model: ${e}`);
        logger.debug("Creating default model");

        toTrain = createModel();
        await ensureDir(modelsPath);
        await toTrain.save(modelsPath);
    }
    compileModel(toTrain);

    // this seems to be the only way to easily clone a tf.LayersModel
    let model = await Network.loadModel(modelJsonUrl);

    for (let i = 0; i < cycles; ++i)
    {
        logger.debug(`Starting training cycle ${i + 1}/${cycles}`);

        const bestModel = await cycle(toTrain, model, games, maxTurns,
            selfPlayPath, evaluatePath,
            logger.prefix(`Cycle(${i + 1}/${cycles}): `));

        // the model that's better will be used to complete the next cycle
        if (bestModel === toTrain)
        {
            logger.debug("Saving model");
            await bestModel.save(modelsPath);
            // update adversary model
            // in the last cycle we don't need to do this though
            if (i + 1 < cycles)
            {
                model.dispose();
                model = await Network.loadModel(modelJsonUrl);
            }
            logger.debug("Done");
        }
        else
        {
            // failed to learn, rollback to previous version
            toTrain.dispose();
            toTrain = await Network.loadModel(modelJsonUrl);
            compileModel(toTrain);
        }
    }
}
