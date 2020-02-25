import * as tf from "@tensorflow/tfjs-node";
import { join } from "path";
import { Logger } from "../../src/Logger";
import { BattleSim } from "./sim/simulators";
import { AlgorithmArgs, learn } from "./learn/learn";
import { rollout } from "./rollout";
import { Opponent, playGames } from "./playGames";

/** Args for `episode()`. */
export interface EpisodeArgs
{
    /** Model to train. */
    readonly model: tf.LayersModel;
    /** Opponent data for training the model. */
    readonly trainOpponents: readonly Opponent[];
    /** Opponent data for evaluating the model. */
    readonly evalOpponents: readonly Opponent[];
    /** Simulator to use for each game. */
    readonly sim: BattleSim;
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
        model, trainOpponents, evalOpponents, sim, maxTurns, algorithm, epochs,
        batchSize, logger, logPath
    }: EpisodeArgs): Promise<void>
{
    // play some games semi-randomly, building batches of Experience for each
    //  game
    logger.debug("Collecting training data");

    const samples = await rollout(
    {
        model, sim, opponents: trainOpponents, maxTurns,
        advantage: algorithm.advantage,
        logger: logger.addPrefix("Rollout: "),
        ...(logPath && {logPath: join(logPath, "rollout")})
    });

    // train over the experience gained from each game
    logger.debug("Training over experience");
    await learn(
    {
        model, samples, algorithm, epochs, batchSize,
        logger: logger.addPrefix("Learn: "),
        ...(logPath && {logPath: join(logPath, "learn")})
    });

    // evaluation games
    logger.debug("Evaluating new network against benchmarks");
    await playGames(
    {
        model, opponents: evalOpponents, sim, maxTurns,
        logger: logger.addPrefix("Eval: "),
        ...(logPath && {logPath: join(logPath, "eval")})
    });
}
