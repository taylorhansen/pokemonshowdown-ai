import * as tf from "@tensorflow/tfjs-node";
import { join } from "path";
import { Logger } from "../../src/Logger";
import { BattleSim } from "./sim/simulators";
import { AlgorithmArgs, learn } from "./learn/learn";
import { rollout } from "./rollout";

/** Args for `episode()`. */
export interface EpisodeArgs
{
    /** Model to train. */
    readonly model: tf.LayersModel;
    /**
     * If provided, save the neural network to this location after this training
     * episode.
     */
    readonly saveUrl?: string;
    /** Simulator to use during training. */
    readonly sim: BattleSim;
    /** Number of training games to play. */
    readonly numGames: number;
    /** Number of turns before a game is considered a tie. */
    readonly maxTurns: number;
    /** Learning algorithm config. */
    readonly algorithm: AlgorithmArgs;
    /** Number of epochs to run training. */
    readonly epochs: number;
    /** Mini-batch size. */
    readonly batchSize: number;
    /** Logger object. */
    readonly logger: Logger;
    /** Path to the folder to store episode logs in. Omit to not store logs. */
    readonly logPath?: string;
}

/** Runs a training episode. */
export async function episode(
    {
        model, saveUrl, sim, numGames, maxTurns, algorithm, epochs, batchSize,
        logger, logPath
    }: EpisodeArgs): Promise<void>
{
    // play some games semi-randomly, building batches of Experience for each
    //  game
    logger.debug("Collecting training data");

    const samples = await rollout(
    {
        model, sim, numGames, maxTurns, advantage: algorithm.advantage,
        logger: logger.addPrefix("Rollout: "),
        ...(logPath && {logPath: join(logPath, "rollout")})
    });

    // train over the experience gained from each game
    await learn(
    {
        model, samples, algorithm, epochs, batchSize,
        ...(logPath && {logPath: join(logPath, "learn")}),
        logger: logger.addPrefix("Learn: ")
    });

    // TODO: play eval games against random player, past self, and current self

    if (saveUrl)
    {
        logger.debug("Saving");
        await model.save(saveUrl);
    }
}
