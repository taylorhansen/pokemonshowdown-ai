import * as tf from "@tensorflow/tfjs-node";
import { Logger } from "../../src/Logger";
import { AugmentedExperience } from "./learn/AugmentedExperience";
import { augmentExperiences } from "./learn/augmentExperiences";
import { AdvantageConfig } from "./learn/learn";
import { BattleSim } from "./sim/simulators";
import { Opponent, playGames } from "./playGames";
import { Experience } from "./sim/helpers/Experience";

/** Args for `rollout()`. */
export interface RolloutArgs
{
    /** Model to train. */
    readonly model: tf.LayersModel;
    /** Opponents to play against. */
    readonly opponents: readonly Opponent[]
    /** Simulator to use for each training game. */
    readonly sim: BattleSim;
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
    {model, opponents, sim, maxTurns, advantage, logger, logPath}:
        RolloutArgs): Promise<AugmentedExperience[]>
{
    const samples: AugmentedExperience[] = [];
    await playGames(
    {
        model, opponents, sim, maxTurns, logger, logPath,
        async experienceCallback(experiences: Experience[][]): Promise<void>
        {
            samples.push(...(await Promise.all(experiences.map(game =>
                    augmentExperiences(game, advantage))))
                .reduce((a, b) => a.concat(b), []));
        }
    });

    // summary statement at the end
    const numGames = opponents.reduce((n, op) => n + op.numGames, 0);
    logger.debug(`Played ${numGames} games total, yielding ${samples.length} ` +
        `experiences (avg ${(samples.length / numGames).toFixed(2)} per game)`);

    return samples;
}
