/** @file Sets up a training session for the neural network. */
import * as os from "os";
import { join } from "path";
import { setGracefulCleanup } from "tmp-promise";
import { latestModelFolder, logPath, modelsFolder } from "../config";
import { Logger } from "../Logger";
import { episode } from "./episode";
import { ensureDir } from "./helpers/ensureDir";
import { BatchOptions } from "./nn/worker/helpers/NetworkProcessorRequest";
import { NetworkProcessor } from "./nn/worker/NetworkProcessor";
import { Opponent } from "./play/playGames";

setGracefulCleanup();

/** Number of training episodes to complete. */
const numEpisodes = 4;
/** Max amount of evaluation games against one ancestor. */
const numEvalGames = 32;

/** Main Logger object. */
const logger = Logger.stderr.addPrefix("Train: ");

/** Manages the worker thread for Tensorflow ops. */
const processor = new NetworkProcessor(/*gpu*/ process.argv[2] === "--gpu");
/** Options for predict batching. */
const batchOptions: BatchOptions =
{
    // when running games on multiple threads, the GamePool workers can tend to
    //  "spam" the TF worker with messages, forcing the worker to queue them all
    //  into a batch before the timer has a chance to update
    // waiting for the next "wave" of messages could take several ms, around the
    //  time it would take to execute the currently sitting batch (assuming
    //  gpu), so it's best to cut it off nearly as soon as the timer updates
    maxSize: os.cpus().length * 2, timeoutNs: /*50us*/50000
};

(async function()
{
    // create or load neural network
    let model: number;
    const latestModelUrl = `file://${latestModelFolder}`;
    const loadUrl = `file://${join(latestModelFolder, "model.json")}`;
    logger.debug("Loading latest model");
    try { model = await processor.load(loadUrl, batchOptions); }
    catch (e)
    {
        logger.error(`Error opening model: ${e.stack ?? e}`);
        logger.debug("Creating default model");
        model = await processor.load(undefined, batchOptions);

        logger.debug("Saving");
        await ensureDir(latestModelFolder);
        await processor.save(model, latestModelUrl);
    }

    // save a copy of the original model for evaluating the trained model later
    logger.debug("Saving copy of original for reference");
    const originalModel = await processor.load(loadUrl, batchOptions);
    const originalModelFolder = join(modelsFolder, "original");
    await processor.save(originalModel, `file://${originalModelFolder}`);

    const evalOpponents: Opponent[] =
    [{
        name: "original",
        agentConfig: {model: originalModel, exp: false},
        numGames: numEvalGames
    }];

    // train network
    for (let i = 0; i < numEpisodes; ++i)
    {
        const episodeLog = logger.addPrefix(
            `Episode(${i + 1}/${numEpisodes}): `);

        // TODO: should opponents be stored as urls to conserve memory?
        await episode(
        {
            processor, model,
            trainOpponents:
            [{
                name: "self", agentConfig: {model, exp: true}, numGames: 128
            }],
            evalOpponents, simName: "ps", maxTurns: 128,
            algorithm:
            {
                type: "ppo", variant: "clipped", epsilon: 0.2,
                advantage: {type: "reinforce", gamma: 1},
                valueCoeff: 0.55, entropyCoeff: 0.9
            },
            epochs: 8, batchSize: 16,
            logger: episodeLog, logPath: join(logPath, `episode-${i + 1}`)
        });

        // save the model for evaluation at the end of the next episode
        episodeLog.debug("Saving");
        const episodeFolderName = `episode-${i + 1}`;
        const episodeModelFolder = join(modelsFolder, episodeFolderName);
        await processor.save(model, `file://${episodeModelFolder}`);

        // re-load it so we have a copy
        const modelCopy = await processor.load(
            `file://${join(episodeModelFolder, "model.json")}`, batchOptions);
        evalOpponents.push(
        {
            name: episodeFolderName,
            agentConfig: {model: modelCopy, exp: false}, numGames: numEvalGames
        });
    }

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
})()
    .catch((e: Error) =>
        console.log("\nTraining script threw an error: " +
            (e.stack ?? e.toString())))
    .finally(() => processor.close());
