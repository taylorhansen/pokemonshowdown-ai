import * as fs from "fs";
import * as path from "path";
import * as tmp from "tmp-promise";
import {ExperienceConfig, GameConfig} from "../../config/types";
import {Logger} from "../../util/logging/Logger";
import {Verbose} from "../../util/logging/Verbose";
import {ModelWorker} from "../model/worker";
import {Opponent, playGames, PlayGamesSeedRandomArgs} from "../play";
import {GamePool} from "../play/pool";
import {AgentExploreConfig} from "../play/pool/worker/GameProtocol";

/** Args for {@link rollout}. */
export interface RolloutArgs {
    /** Name of the current training run, under which to store logs. */
    readonly name: string;
    /** Current episode iteration of the training run. */
    readonly step: number;
    /** Used to request model ports for the game workers. */
    readonly models: ModelWorker;
    /** Used to play parallel games. */
    readonly games: GamePool;
    /** Name of the model to train. */
    readonly model: string;
    /** Exploration policy for the model. */
    readonly explore: AgentExploreConfig;
    /** Configuration for generating experience. */
    readonly experienceConfig: ExperienceConfig;
    /** Opponent args. */
    readonly opponents: readonly Opponent[];
    /** Configuration for setting up rollout/eval games. */
    readonly gameConfig: GameConfig;
    /** Logger object. */
    readonly logger: Logger;
    /** Path to the folder to store episode logs in. Omit to not store logs. */
    readonly logPath?: string;
    /** Random seed generators. */
    readonly seed?: PlayGamesSeedRandomArgs;
    /** Whether to show progress bars. */
    readonly progress?: boolean;
}

/** Result from {@link rollout}. */
export interface RolloutResult {
    /** Number of training examples that were generated. */
    numExamples: number;
    /** Temp file handles for the rollout data. */
    expFiles: tmp.FileResult[];
}

/**
 * Runs the rollout phase of the training script, generating experience for a
 * model.
 *
 * @returns Info about the data that was generated.
 */
export async function rollout({
    name,
    step,
    models,
    games,
    model,
    explore,
    experienceConfig,
    opponents,
    gameConfig,
    logger,
    logPath,
    seed,
    progress,
}: RolloutArgs): Promise<RolloutResult> {
    const expFiles: tmp.FileResult[] = [];

    logger.info(
        "Collecting training data via policy rollout " +
            `(exploration factor = ${Math.round(explore.factor * 100)}%)`,
    );

    const {numExamples} = await playGames({
        name,
        step,
        stage: "rollout",
        models,
        games,
        agentConfig: {
            exploit: {type: "model", model},
            explore,
            emitExperience: true,
        },
        opponents,
        gameConfig,
        logger,
        ...(logPath && {logPath: path.join(logPath, "rollout")}),
        experienceConfig,
        async getExpPath(): Promise<string> {
            const expFile = await tmp.file({
                template: "psai-example-XXXXXX.tfrecord",
            });
            expFiles.push(expFile);
            return expFile.path;
        },
        ...(seed && {seed}),
        progress,
    });

    // Summary statement after rollout games.
    if (logger.verbose >= Verbose.Debug) {
        const numGames = opponents.reduce((n, opp) => n + opp.numGames, 0);
        const avgExpPerGame = numExamples / numGames;
        logger.debug(
            `Played ${numGames} games total, yielding ${numExamples} ` +
                `experiences (avg ${avgExpPerGame.toFixed(2)} per game)`,
        );

        const totalSizeBytes = (
            await Promise.all(
                expFiles.map(
                    async file => (await fs.promises.stat(file.path)).size,
                ),
            )
        ).reduce((a, b) => a + b, 0);

        const totalSizeMiB = totalSizeBytes / 1024 / 1024;
        logger.debug(
            `Total game experience file size: ` +
                `${totalSizeMiB.toFixed(2)} MiB`,
        );

        const avgSizeMiB = totalSizeMiB / numGames;
        logger.debug(
            "Average game experience file size: " +
                `${avgSizeMiB.toFixed(2)} MiB `,
        );
    }

    return {numExamples, expFiles};
}
