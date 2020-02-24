import * as tf from "@tensorflow/tfjs-node";
import { join } from "path";
import ProgressBar from "progress";
import { LogFunc, Logger } from "../../src/Logger";
import { AugmentedExperience } from "./learn/AugmentedExperience";
import { augmentExperiences } from "./learn/augmentExperiences";
import { AdvantageConfig } from "./learn/learn";
import { BattleSim } from "./sim/simulators";

/** Args for `rollout()`. */
export interface RolloutArgs
{
    /** Model to train. */
    readonly model: tf.LayersModel;
    /** Simulator to use during training. */
    readonly sim: BattleSim;
    /** Number of training games to play. */
    readonly numGames: number;
    /** Number of turns before a game is considered a tie. */
    readonly maxTurns: number;
    /** Advantage estimator config. */
    readonly advantage: AdvantageConfig;
    /** Logger object. */
    readonly logger: Logger;
    /** Path to the folder to store game logs in. Omit to not store logs. */
    readonly logPath?: string;
}

/**
 * Executes a policy rollout, generating AugmentedExperience tuples after all
 * the games have finished.
 */
export async function rollout(
    {model, sim, numGames, maxTurns, advantage, logger, logPath}: RolloutArgs):
    Promise<AugmentedExperience[]>
{
    const samples: AugmentedExperience[] = [];
    const progress = new ProgressBar(`eta=:etas :bar games=:current`,
        {
            total: numGames, head: ">", clear: true,
            width: Math.floor((process.stderr.columns ?? 80) / 2)
        });
    const progressLogFunc: LogFunc = msg => progress.interrupt(msg);
    const progressLog = new Logger(progressLogFunc, progressLogFunc,
        logger.prefix, "");
    for (let i = 0; i < numGames; ++i)
    {
        try
        {
            const experiences = await sim(
            {
                models: [model, model], emitExperience: true, maxTurns,
                ...(logPath && {logPath: join(logPath, `game-${i}`)})
            });
            samples.push(...(await Promise.all(experiences.map(game =>
                    augmentExperiences(game, advantage))))
                .reduce((a, b) => a.concat(b), []));
        }
        catch (e)
        {
            let msg: string;
            if (e instanceof Error) msg = e.stack ?? e.toString();
            else msg = e;
            progressLog.error(`Sim threw an error: ${msg}`);
        }
        progress.tick();
    }
    progress.terminate();
    logger.debug(`Played ${numGames} games, with a total of ` +
        `${samples.length} experiences ` +
        `(avg ${samples.length / numGames} per game)`);

    return samples;
}
