import * as tf from "@tensorflow/tfjs-node";
import { join } from "path";
import ProgressBar from "progress";
import { Logger } from "../../src/Logger";
import { Experience } from "./battle/Experience";
import { play } from "./play";

/**
 * Plays the neural network against itself to generate Experience objects.
 * @param model Model to use.
 * @param games Amount of games to play.
 * @param maxTurns Max amount of turns before a game is considered a tie.
 * @param selfPlayPath Path to the folder to store logs in.
 */
export async function selfPlay(model: tf.LayersModel, games: number,
    maxTurns: number, selfPlayPath: string, logger = Logger.null):
    Promise<Experience[]>
{
    const result: Experience[] = [];

    logger.debug("Beginning self-play");
    const bar = new ProgressBar("Self-play games: [:bar] :current/:total",
        {total: games, clear: true});
    bar.update(0);

    logger = logger.progressDebug(bar).progressError(bar);

    for (let i = 0; i < games; ++i)
    {
        const innerLog = logger.prefix(`Game(${i + 1}/${games}): `);
        innerLog.debug("Start");

        // start a game and extract experiences/winner
        const {experiences, winner} = await play(
        {
            p1: model, p2: model, maxTurns, emitExperiences: true,
            logPath: join(selfPlayPath, `game-${i + 1}`), logger: innerLog
        });

        result.push(...experiences);

        if (winner) innerLog.debug(`Winner: ${winner}`);
        else innerLog.debug("Tie");
        bar.tick();
    }

    bar.terminate();
    return result;
}
