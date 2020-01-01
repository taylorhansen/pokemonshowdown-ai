import * as tf from "@tensorflow/tfjs-node";
import ProgressBar from "progress";
import { Logger } from "../../src/Logger";
import { play } from "./play";

/**
 * Evaluates a trained LayersModel to see if it is superior to the old model.
 * @param trained Trained network.
 * @param old Previous untrained network.
 * @param games Number of games to play.
 * @param maxTurns Max amount of turns before a game is considered a tie.
 * @param evaluatePath Path to the folder to store logs in.
 * @param logger Logger object.
 * @returns `trained` if it is proved to be better, or `old` if the `trained`
 * model failed.
 */
export async function evaluate(trained: tf.LayersModel, old: tf.LayersModel,
    games: number, maxTurns: number, evaluatePath: string,
    logger = Logger.null): Promise<tf.LayersModel>
{
    logger.debug("Evaluating new network (p1=new, p2=old)");
    const wins = {p1: 0, p2: 0};
    const bar = new ProgressBar("Evaluation games: [:bar] :current/:total",
        {total: games, clear: true});
    bar.update(0);

    logger = logger.progressDebug(bar).progressError(bar);

    for (let i = 0; i < games; ++i)
    {
        const innerLog = logger.prefix(`Game(${i + 1}/${games}): `);
        innerLog.debug("Start");

        const {winner} = await play(
        {
            p1: trained, p2: old, maxTurns,
            logPath: `${evaluatePath}/game-${i + 1}`, logger: innerLog
        });

        if (winner)
        {
            ++wins[winner];
            innerLog.debug(`Winner: ${winner}`);
        }
        else innerLog.debug("Tie");
        bar.tick();
    }
    bar.terminate();

    logger.debug(`Wins: p1=${wins.p1}, p2=${wins.p2}`);
    if (wins.p1 > wins.p2)
    {
        logger.debug("New model (p1) wins, replace old model");
        return trained;
    }
    else if (wins.p1 < wins.p2)
    {
        logger.debug("Old model (p2) wins, not replaced");
    }
    else logger.debug("Tie, old model not replaced");
    return old;
}
