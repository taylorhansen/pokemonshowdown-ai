import {join} from "path";
import ProgressBar from "progress";
import * as tmp from "tmp-promise";
import {Logger} from "../Logger";
import {formats} from "../psbot/handlers/battle";
import {AlgorithmArgs} from "./learn";
import {ModelWorker} from "./model/worker";
import {Opponent, playGames} from "./play";

/** Args for {@link episode}. */
export interface EpisodeArgs {
    /** Used to request model ports for the game workers. */
    readonly models: ModelWorker;
    /** ID of the model to train. */
    readonly model: number;
    /** Opponent data for training the model. */
    readonly trainOpponents: readonly Opponent[];
    /** Opponent data for evaluating the model. */
    readonly evalOpponents: readonly Opponent[];
    /** Name of the simulator to use for each game. */
    readonly format: formats.FormatType;
    /** Number of games to play in parallel. */
    readonly numThreads: number;
    /** Number of turns before a game is considered a tie. */
    readonly maxTurns: number;
    /** Learning algorithm config. */
    readonly algorithm: AlgorithmArgs;
    /** Number of epochs to run training. */
    readonly epochs: number;
    /** Number of experience file decoders to run in parallel. */
    readonly numDecoderThreads: number;
    /** Mini-batch size. */
    readonly batchSize: number;
    /** Prefetch buffer size for shuffling during training. */
    readonly shufflePrefetch: number;
    /** Logger object. */
    readonly logger: Logger;
    /** Path to the folder to store episode logs in. Omit to not store logs. */
    readonly logPath?: string;
}

/** Runs a training episode. */
export async function episode({
    models,
    model,
    trainOpponents,
    evalOpponents,
    format,
    numThreads,
    maxTurns,
    algorithm,
    epochs,
    numDecoderThreads,
    batchSize,
    shufflePrefetch,
    logger,
    logPath,
}: EpisodeArgs): Promise<void> {
    // Play some games semi-randomly, building batches of Experience for each
    // game.
    logger.debug("Collecting training data via policy rollout");

    const expFiles: tmp.FileResult[] = [];
    async function getExpPath(): Promise<string> {
        const expFile = await tmp.file({template: "psai-aexp-XXXXXX.tfrecord"});
        expFiles.push(expFile);
        return expFile.path;
    }

    const numAExps = await playGames({
        models,
        agentConfig: {model, exp: true},
        opponents: trainOpponents,
        format,
        numThreads,
        maxTurns,
        logger: logger.addPrefix("Rollout: "),
        ...(logPath && {logPath: join(logPath, "rollout")}),
        rollout: algorithm.advantage,
        getExpPath,
    });

    // Summary statement after rollout games.
    const numGames = trainOpponents.reduce((n, opp) => n + opp.numGames, 0);
    logger.debug(
        `Played ${numGames} games total, yielding ${numAExps} ` +
            `experiences (avg ${(numAExps / numGames).toFixed(2)} per game)`,
    );

    if (numAExps <= 0) {
        logger.error("No experience to train over");
        return;
    }

    // Train over the experience gained from each game.
    logger.debug("Training over experience");
    let progress: ProgressBar | undefined;
    let numBatches: number | undefined;
    function startProgress() {
        if (!numBatches) throw new Error("numBatches not initialized");
        progress = new ProgressBar(
            `Batch :current/:total: eta=:etas :bar loss=:loss`,
            {
                total: numBatches,
                head: ">",
                clear: true,
                width: Math.floor((process.stderr.columns ?? 80) / 3),
            },
        );
        progress.render({loss: "n/a"});
    }
    await models.learn(
        model,
        {
            aexpPaths: expFiles.map(f => f.path),
            numAExps,
            algorithm,
            epochs,
            numDecoderThreads,
            batchSize,
            shufflePrefetch,
            logPath,
        },
        function (data) {
            switch (data.type) {
                case "start":
                    ({numBatches} = data);
                    startProgress();
                    break;

                case "epoch":
                    // Ending summary statement for the current epoch.
                    progress?.terminate();
                    logger.debug(
                        `Epoch ${data.epoch}/${epochs}: Avg loss = ` +
                            `${data.loss}`,
                    );

                    // Restart progress bar for the next epoch.
                    if (data.epoch < epochs) startProgress();
                    break;
                case "batch":
                    progress?.tick(data);
                    break;
            }
        },
    );
    progress?.terminate();
    const cleanupPromise = expFiles.map(async f => await f.cleanup());

    // Evaluation games.
    logger.debug("Evaluating new network against benchmarks");
    const evalPromise = playGames({
        models,
        agentConfig: {model, exp: false},
        opponents: evalOpponents,
        format,
        numThreads,
        maxTurns,
        logger: logger.addPrefix("Eval: "),
        ...(logPath && {logPath: join(logPath, "eval")}),
    });

    await Promise.all([cleanupPromise, evalPromise]);
}
