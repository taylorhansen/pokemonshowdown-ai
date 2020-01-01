import * as tf from "@tensorflow/tfjs-node";
import { Logger } from "../../src/Logger";
import { evaluate } from "./evaluate";
import { learn } from "./learn";
import { selfPlay } from "./selfPlay";

/**
 * Does a training cycle, where a model is trained through self-play then
 * evaluated by playing against a different model.
 * @param toTrain Model to train through self-play.
 * @param model Model to compare against. Must not be the same reference as
 * `toTrain`.
 * @param games Amount of games to play during self-play and evaluation.
 * @param maxTurns Max amount of turns before a game is considered a tie.
 * @param selfPlayPath Path to the folder to store self-play logs in.
 * @param evaluatePath Path to the folder to store evaluation logs in.
 * @param logger Logger object.
 * @returns `toTrain` if it is proved to be better after self-play, or `model`
 * if the newly trained `toTrain` model failed.
 */
export async function cycle(toTrain: tf.LayersModel, model: tf.LayersModel,
    games: number, maxTurns: number, selfPlayPath: string, evaluatePath: string,
    logger = Logger.null): Promise<tf.LayersModel>
{
    const experiences = await selfPlay(toTrain, games, maxTurns, selfPlayPath,
        logger);
    await learn(toTrain, experiences, /*gamma*/0.8, /*epochs*/3, logger);
    return evaluate(toTrain, model, games, maxTurns, evaluatePath, logger);
}
