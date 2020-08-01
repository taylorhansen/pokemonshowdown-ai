import { join } from "path";
import ProgressBar from "progress";
import { Logger } from "../Logger";
import { AlgorithmArgs } from "./nn/learn/LearnArgs";
import { NetworkProcessor } from "./nn/worker/NetworkProcessor";
import { GamePool } from "./play/GamePool";
import { Opponent, playGames } from "./play/playGames";
import { SimName } from "./sim/simulators";

/** Args for `episode()`. */
export interface EpisodeArgs
{
    /** Thread pool for playing games in parallel. */
    readonly pool: GamePool;
    /** Used to request game worker ports from the neural networks. */
    readonly processor: NetworkProcessor;
    /** ID of the model to train. */
    readonly model: number;
    /** Opponent data for training the model. */
    readonly trainOpponents: readonly Opponent[];
    /** Opponent data for evaluating the model. */
    readonly evalOpponents: readonly Opponent[];
    /** Name of the simulator to use for each game. */
    readonly simName: SimName;
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
        pool, processor, model, trainOpponents, evalOpponents, simName,
        maxTurns, algorithm, epochs, batchSize, logger, logPath
    }: EpisodeArgs): Promise<void>
{
    // play some games semi-randomly, building batches of Experience for each
    //  game
    logger.debug("Collecting training data via policy rollout");
    const samples = await playGames(
    {
        pool, processor, agentConfig: {model, exp: true},
        opponents: trainOpponents, simName, maxTurns,
        logger: logger.addPrefix("Rollout: "),
        ...(logPath && {logPath: join(logPath, "rollout")}),
        rollout: algorithm.advantage
    });

    // summary statement after rollout games
    const numGames = trainOpponents.reduce((n, op) => n + op.numGames, 0);
    logger.debug(`Played ${numGames} games total, yielding ${samples.length} ` +
        `experiences (avg ${(samples.length / numGames).toFixed(2)} per game)`);

    if (samples.length <= 0)
    {
        logger.error("No games to train over");
        return;
    }

    // train over the experience gained from each game
    logger.debug("Training over experience");
    let progress: ProgressBar | undefined;
    let numBatches: number | undefined;
    function startProgress()
    {
        if (!numBatches) throw new Error("numBatches not initialized");
        progress = new ProgressBar(
            `Batch :current/:total: eta=:etas :bar loss=:loss`,
            {
                total: numBatches, head: ">", clear: true,
                width: Math.floor(
                    (process.stderr.columns ?? 80) / 3)
            });
        progress.render({loss: "n/a"});
    }
    await processor.learn(model,
        {samples, algorithm, epochs, batchSize, logPath},
        function(data)
        {
            switch (data.type)
            {
                case "start":
                    numBatches = data.numBatches;
                    startProgress();
                    break;

                case "epoch":
                    // ending summary statement for the current epoch
                    progress?.terminate();
                    logger.debug(`Epoch ${data.epoch}/${epochs}: Avg loss = ` +
                        data.loss);

                    // restart progress bar for the next epoch
                    if (data.epoch < epochs) startProgress();
                    break;
                case "batch":
                    progress?.tick(data);
                    break;
            }
        });
    progress?.terminate();

    // evaluation games
    logger.debug("Evaluating new network against benchmarks");
    await playGames(
    {
        pool, processor, agentConfig: {model, exp: false},
        opponents: evalOpponents, simName, maxTurns,
        logger: logger.addPrefix("Eval: "),
        ...(logPath && {logPath: join(logPath, "eval")})
    });
}
