import { join } from "path";
import ProgressBar from "progress";
import * as stream from "stream";
import * as util from "util";
import { LogFunc, Logger } from "../../Logger";
import { AdvantageConfig } from "../nn/learn/LearnArgs";
import { NetworkProcessor } from "../nn/worker/NetworkProcessor";
import { SimName } from "../sim/simulators";
import { GamePool, GamePoolAgentConfig, GamePoolArgs, GamePoolResult } from
    "./GamePool";
import { GamePoolStream } from "./GamePoolStream";

const pipeline = util.promisify(stream.pipeline);

/** Opponent data for `playGames()`. */
export interface Opponent
{
    /**
     * Name of the opponent for logging. Must be different than other opponents.
     */
    readonly name: string;
    /** Config for the BattleAgent. */
    readonly agentConfig: GamePoolAgentConfig;
    /** Number of games that this opponent will play. */
    readonly numGames: number;
}

/** Args for `playGames()`. */
export interface PlayGamesArgs
{
    /** Used to request game worker ports from the neural networks. */
    readonly processor: NetworkProcessor;
    /** Config for the BattleAgent that will participate in each game. */
    readonly agentConfig: GamePoolAgentConfig;
    /** Opponents to play against. */
    readonly opponents: readonly Opponent[];
    /** Simulator to use during training. */
    readonly simName: SimName;
    /** Number of turns before a game is considered a tie. */
    readonly maxTurns: number;
    /** Logger object. */
    readonly logger: Logger;
    /** Path to the folder to store game logs in. Omit to not store logs. */
    readonly logPath?: string;
    /** Advantage estimation config for AugmentedExperiences. */
    readonly rollout?: AdvantageConfig;
    /**
     * Function that generates valid paths to files in which to store
     * AugmentedExperiences as TFRecords (i.e., if any agent configs contain
     * `exp=true`). If not specified, any experiences will be discarded.
     */
    getExpPath?(): Promise<string>;
}

/**
 * Manages the playing of multiple games in parallel.
 * @returns The number of AugmentedExperiences generated, if any.
 */
export async function playGames(
    {
        processor, agentConfig, opponents, simName, maxTurns, logger, logPath,
        rollout, getExpPath
    }:
        PlayGamesArgs): Promise<number>
{
    const totalGames = opponents.reduce((n, op) => n + op.numGames, 0);
    const progress =
        new ProgressBar(`${logger.prefix}eta=:etas :bar wlt=:wlt`,
        {
            total: totalGames, head: ">", clear: true,
            width: Math.floor((process.stderr.columns ?? 80) / 2)
        });
    progress.render({wlt: "0-0-0"});
    const progressLogFunc: LogFunc = msg => progress.interrupt(msg);
    const progressLog = new Logger(progressLogFunc, progressLogFunc,
        logger.prefix, logger.postfix);

    // iterator-like stream for piping GamePoolArgs to the GamePool stream
    const poolArgs = stream.Readable.from(function* generateArgs()
    {
        for (const opponent of opponents)
        {
            for (let i = 0; i < opponent.numGames; ++i)
            {
                const gameLogPath = logPath &&
                    join(logPath, `${opponent.name}/game-${i + 1}`)
                const args: GamePoolArgs =
                {
                    simName, maxTurns, logPath: gameLogPath, rollout,
                    agents: [agentConfig, opponent.agentConfig], processor
                }
                yield args;
            }
        }
    }(), {objectMode: true});

    // stream for summarizing the game results
    let numAExps = 0;
    let wins = 0;
    let losses = 0;
    let ties = 0;
    const processResults = new stream.Writable(
    {
        objectMode: true,
        write(result: GamePoolResult, encoding: BufferEncoding,
            callback: (error?: Error | null) => void): void
        {
            numAExps += result.numAExps;

            if (result.err)
            {
                progressLog.error("Game threw an error: " +
                    (result.err.stack ?? result.err));
            }

            if (result.winner === 0) ++wins;
            else if (result.winner === 1) ++losses;
            else ++ties;

            progress.tick({wlt: `${wins}-${losses}-${ties}`});

            callback();
        }
    });

    // TODO: move pool to index.ts for reuse
    const pool = new GamePool(getExpPath);
    await pipeline(
        poolArgs,
        new GamePoolStream(pool),
        processResults);
    await pool.close();

    progress.terminate();
    // TODO: also display separate records for each opponent
    logger.debug(`Record: ${wins}-${losses}-${ties}`)

    return numAExps;
}
