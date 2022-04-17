import * as fs from "fs";
import {join} from "path";
import ProgressBar from "progress";
import * as tmp from "tmp-promise";
import {
    EvalTestConfig,
    ExperienceConfig,
    GameConfig,
    LearnConfig,
} from "../config/types";
import {Logger} from "../util/logging/Logger";
import {Verbose} from "../util/logging/Verbose";
import {ModelWorker} from "./model/worker";
import {Opponent, OpponentResult, playGames} from "./play";
import {GamePool} from "./play/pool";
import {AgentExploreConfig} from "./play/pool/worker/GameProtocol";

/** Args for {@link episode}. */
export interface EpisodeArgs {
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
    /** Exploration policy for the rollout phase. */
    readonly explore: AgentExploreConfig;
    /** Configuration for generating experience from rollout games. */
    readonly experienceConfig: ExperienceConfig;
    /** Opponent data for training the model. */
    readonly trainOpponents: readonly Opponent[];
    /** Opponent data for evaluating the model. */
    readonly evalOpponents: readonly Opponent[];
    /** Configuration for setting up rollout/eval games. */
    readonly gameConfig: GameConfig;
    /** Configuration for the learning process. */
    readonly learnConfig: LearnConfig;
    /** Configuration for testing the evaluation step results. */
    readonly evalConfig?: EvalTestConfig;
    /** Logger object. */
    readonly logger: Logger;
    /** Path to the folder to store episode logs in. Omit to not store logs. */
    readonly logPath?: string;
    /** Random seed generators. */
    readonly seed?: EpisodeSeedRandomArgs;
    /** Whether to show progress bars. */
    readonly progress?: boolean;
    /** Function to rollback the model to what it was pre-`episode()`. */
    readonly retry: () => Promise<void>;
}

/** Random seed generators used by the training algorithm. */
export interface EpisodeSeedRandomArgs {
    /** Random seed generator for the battle PRNGs. */
    readonly battle?: () => string;
    /** Random seed generator for the random team PRNGs. */
    readonly team?: () => string;
    /** Random seed generator for the random exploration policy. */
    readonly explore?: () => string;
    /**
     * Random seed generator for learning algorithm's training example shuffler.
     */
    readonly learn?: () => string;
}

/** Result from running a training {@link episode}. */
export interface EpisodeResult {
    /** Final model loss after training. */
    loss?: number;
    /** Evaluation results for each opponent. */
    eval: OpponentResult[];
}

interface EpisodeContext {
    readonly expFiles: tmp.FileResult[];
    cleanupPromise?: Promise<unknown>;
}

/** Runs a training episode. */
export async function episode(args: EpisodeArgs): Promise<EpisodeResult> {
    let numRetries = 0;
    let result: EpisodeResult | undefined;
    do {
        if (result) {
            // Note: When retrying, all logs for this step are overwritten.
            ++numRetries;
            args.logger
                .addPrefix("Eval: ")
                .info(`Model did not improve, retrying (${numRetries})`);
            await args.retry();
        }
        const p = args.models.log(`${args.name}/num_retries`, args.step, {
            numRetries,
        });

        const context: EpisodeContext = {expFiles: []};
        try {
            result = await episodeImpl(context, args);
        } finally {
            context.cleanupPromise ??= Promise.all(
                context.expFiles.map(async f => await f.cleanup()),
            );
            await Promise.all([context.cleanupPromise, p]);
        }
    } while (
        args.evalConfig &&
        !testEval(
            result.eval,
            args.evalConfig,
            args.logger.addPrefix("Eval: Test: "),
        )
    );
    return result;
}

async function episodeImpl(
    context: EpisodeContext,
    {
        name,
        step,
        models,
        games,
        model,
        explore,
        experienceConfig,
        trainOpponents,
        evalOpponents,
        gameConfig,
        learnConfig,
        logger,
        logPath,
        seed,
        progress,
    }: EpisodeArgs,
): Promise<EpisodeResult> {
    // Play some games semi-randomly, building batches of Experience for each
    // game.
    const rolloutLog = logger.addPrefix("Rollout: ");
    rolloutLog.info(
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
        opponents: trainOpponents,
        gameConfig,
        logger: rolloutLog,
        ...(logPath && {logPath: join(logPath, "rollout")}),
        experienceConfig,
        async getExpPath(): Promise<string> {
            const expFile = await tmp.file({
                template: "psai-example-XXXXXX.tfrecord",
            });
            context.expFiles.push(expFile);
            return expFile.path;
        },
        ...(seed && {seed}),
        progress,
    });
    // Summary statement after rollout games.
    if (rolloutLog.verbose >= Verbose.Debug) {
        const numGames = trainOpponents.reduce((n, opp) => n + opp.numGames, 0);
        const avgExpPerGame = numExamples / numGames;
        rolloutLog.debug(
            `Played ${numGames} games total, yielding ${numExamples} ` +
                `experiences (avg ${avgExpPerGame.toFixed(2)} per game)`,
        );

        const totalSizeBytes = (
            await Promise.all(
                context.expFiles.map(
                    async file => (await fs.promises.stat(file.path)).size,
                ),
            )
        ).reduce((a, b) => a + b, 0);

        const totalSizeMiB = totalSizeBytes / 1024 / 1024;
        rolloutLog.debug(
            `Total game experience file size: ` +
                `${totalSizeMiB.toFixed(2)} MiB`,
        );

        const avgSizeMiB = totalSizeMiB / numGames;
        rolloutLog.debug(
            "Average game experience file size: " +
                `${avgSizeMiB.toFixed(2)} MiB `,
        );
    }

    // Train over the experience gained from each game.
    const learnLog = logger.addPrefix("Learn: ");
    learnLog.info("Training over experience");
    if (numExamples <= 0) {
        learnLog.error("No experience to train over");
        return {eval: []};
    }

    let finalLoss: number | undefined;
    let progressBar: ProgressBar | undefined;
    let numBatches: number | undefined;
    function startProgress() {
        if (!numBatches) {
            throw new Error("numBatches not initialized");
        }
        const prefixWidth =
            learnLog.prefix.length +
            "Batch /: ".length +
            2 * Math.ceil(Math.log10(numBatches));
        const postFixWidth = " loss=-0.00000000".length;
        const padding = 2;
        const barWidth =
            (process.stderr.columns || 80) -
            prefixWidth -
            postFixWidth -
            padding;
        progressBar = new ProgressBar(
            `${learnLog.prefix}Batch :current/:total: :bar loss=:loss`,
            {
                total: numBatches,
                head: ">",
                clear: true,
                width: barWidth,
            },
        );
        progressBar.render({loss: "n/a"});
    }
    await models.learn(
        model,
        {
            ...learnConfig,
            name,
            step,
            examplePaths: context.expFiles.map(f => f.path),
            numExamples,
            ...(seed?.learn && {seed: seed.learn()}),
        },
        function onStep(data) {
            switch (data.type) {
                case "start":
                    if (progress) {
                        ({numBatches} = data);
                        startProgress();
                    }
                    break;
                case "epoch":
                    finalLoss = data.loss;

                    // Ending summary statement for the current epoch.
                    progressBar?.terminate();
                    learnLog
                        .addPrefix(
                            `Epoch(${String(data.epoch).padStart(
                                Math.max(
                                    1,
                                    Math.ceil(Math.log10(learnConfig.epochs)),
                                ),
                            )}/${learnConfig.epochs}): `,
                        )
                        .info(`Loss = ${data.loss}`);

                    // Restart progress bar for the next epoch.
                    if (data.epoch < learnConfig.epochs) {
                        startProgress();
                    }
                    break;
                case "batch":
                    progressBar?.tick({
                        batch: data.batch + 1,
                        loss: data.loss.toFixed(8),
                    });
                    break;
            }
        },
    );
    progressBar?.terminate();
    context.cleanupPromise = Promise.all(
        context.expFiles.map(async f => await f.cleanup()),
    );

    // Evaluation games.
    const evalLog = logger.addPrefix("Eval: ");
    evalLog.info("Evaluating new network against benchmarks");
    const evalResults = await playGames({
        name,
        step,
        stage: "eval",
        models,
        games,
        agentConfig: {exploit: {type: "model", model}},
        opponents: evalOpponents,
        gameConfig,
        logger: evalLog,
        ...(logPath && {logPath: join(logPath, "eval")}),
        ...(seed && {seed}),
        progress,
    });

    return {
        ...(finalLoss !== undefined && {loss: finalLoss}),
        eval: evalResults.opponents,
    };
}

/**
 * Runs a statistical test on the evaluation results to see if the model is
 * improving.
 *
 * @param evalResults Evaluation results.
 * @param testConfig Configuration for the statistical test.
 * @param logger Logger object.
 * @returns `true` if the model likely improved, `false` otherwise.
 */
function testEval(
    evalResults: readonly Readonly<OpponentResult>[],
    testConfig: EvalTestConfig,
    logger: Logger,
): boolean {
    logger.debug("Running a statistical test to see if the model is improving");

    let {against} = testConfig;
    if (!Array.isArray(against)) {
        against = [against];
    }
    if (against.length <= 0) {
        logger.error("No opponents to test against");
        logger.debug("Assuming the model is improving for now");
        return true;
    }
    const vs = evalResults.filter(opp => against.includes(opp.name));
    if (vs.length <= 0) {
        logger.error(
            `Could not find opponents [${against.join(", ")}] in eval results`,
        );
        logger.info("Assuming the model is improving for now");
        return true;
    }

    logger.debug(`Min score: ${testConfig.minScore}`);

    let conclusion = true;
    for (const opp of vs) {
        const vsLogger = logger.addPrefix(`Versus ${opp.name}: `);

        const total = opp.wins + opp.losses + opp.ties;
        const successes = testConfig.includeTies
            ? opp.wins + opp.ties
            : opp.wins;
        const score = successes / total;
        vsLogger.debug(
            `Score: ${successes} / ${total} = ${score.toFixed(2)} ` +
                `(counting wins${
                    testConfig.includeTies ? " and ties" : " only"
                })`,
        );

        conclusion &&= score >= testConfig.minScore;
    }

    logger.debug(
        `Conclusion: ${conclusion ? "Accept" : "Reject"} updated model`,
    );
    return conclusion;
}
