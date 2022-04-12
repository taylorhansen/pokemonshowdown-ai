import {join} from "path";
import ProgressBar from "progress";
import * as tmp from "tmp-promise";
import {ExperienceConfig, GameConfig, LearnConfig} from "../config/types";
import {Logger} from "../util/logging/Logger";
import {ModelWorker} from "./model/worker";
import {Opponent, playGames} from "./play";
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
    /** Logger object. */
    readonly logger: Logger;
    /** Path to the folder to store episode logs in. Omit to not store logs. */
    readonly logPath?: string;
    /** Random seed generators. */
    readonly seed?: EpisodeSeedRandomArgs;
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

interface EpisodeContext {
    readonly expFiles: tmp.FileResult[];
    cleanupPromise?: Promise<unknown>;
}

/** Runs a training episode. */
export async function episode(args: EpisodeArgs): Promise<void> {
    const context: EpisodeContext = {
        expFiles: [],
    };

    try {
        await episodeImpl(context, args);
    } finally {
        context.cleanupPromise ??= Promise.all(
            context.expFiles.map(async f => await f.cleanup()),
        );
        await context.cleanupPromise;
    }
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
    }: EpisodeArgs,
): Promise<void> {
    // Play some games semi-randomly, building batches of Experience for each
    // game.
    const rolloutLog = logger.addPrefix("Rollout: ");
    rolloutLog.debug(
        "Collecting training data via policy rollout " +
            `(exploration factor = ${Math.round(explore.factor * 100)}%)`,
    );
    const numExamples = await playGames({
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
    });
    // Summary statement after rollout games.
    const numGames = trainOpponents.reduce((n, opp) => n + opp.numGames, 0);
    rolloutLog.debug(
        `Played ${numGames} games total, yielding ${numExamples} experiences ` +
            `(avg ${(numExamples / numGames).toFixed(2)} per game)`,
    );

    // Train over the experience gained from each game.
    const learnLog = logger.addPrefix("Learn: ");
    learnLog.debug("Training over experience");
    if (numExamples <= 0) {
        learnLog.error("No experience to train over");
        return;
    }

    let progress: ProgressBar | undefined;
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
        progress = new ProgressBar(
            `${learnLog.prefix}Batch :current/:total: :bar loss=:loss`,
            {
                total: numBatches,
                head: ">",
                clear: true,
                width: barWidth,
            },
        );
        progress.render({loss: "n/a"});
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
                    ({numBatches} = data);
                    startProgress();
                    break;

                case "epoch":
                    // Ending summary statement for the current epoch.
                    progress?.terminate();
                    learnLog.debug(
                        `Epoch ${data.epoch}/${learnConfig.epochs}: ` +
                            `Avg loss = ${data.loss}`,
                    );

                    // Restart progress bar for the next epoch.
                    if (data.epoch < learnConfig.epochs) {
                        startProgress();
                    }
                    break;
                case "batch":
                    progress?.tick({
                        batch: data.batch + 1,
                        loss: data.loss.toFixed(8),
                    });
                    break;
            }
        },
    );
    progress?.terminate();
    context.cleanupPromise = Promise.all(
        context.expFiles.map(async f => await f.cleanup()),
    );

    // Evaluation games.
    // TODO: Make a decision as to whether to accept the updated model based on
    // these results.
    const evalLog = logger.addPrefix("Eval: ");
    evalLog.debug("Evaluating new network against benchmarks");
    await playGames({
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
    });
}
