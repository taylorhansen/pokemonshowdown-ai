import { join } from "path";
import * as stream from "stream";
import ProgressBar from "progress";
import { LogFunc, Logger } from "../../Logger";
import { formats } from "../../psbot/handlers/battle";
import { AdvantageConfig } from "../learn";
import { ModelWorker } from "../model/worker";
import { GamePool, GamePoolAgentConfig, GamePoolArgs, GamePoolResult } from
    "./pool/GamePool";
import { GamePoolStream } from "./pool/GamePoolStream";

/** Opponent data for {@link playGames}. */
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

/** Args for {@link playGames}. */
export interface PlayGamesArgs
{
    /** Used to request model ports for the game workers. */
    readonly models: ModelWorker;
    /** Config for the BattleAgent that will participate in each game. */
    readonly agentConfig: GamePoolAgentConfig;
    /** Opponents to play against. */
    readonly opponents: readonly Opponent[];
    /** Game format type. */
    readonly format: formats.FormatType;
    /** Number of games to play in parallel. */
    readonly numThreads: number;
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
    readonly getExpPath?: () => Promise<string>;
}

/**
 * Manages the playing of multiple games in parallel.
 *
 * @returns The number of AugmentedExperiences generated, if any.
 */
export async function playGames(
    {
        models, agentConfig, opponents, format, numThreads, maxTurns, logger,
        logPath, rollout, getExpPath
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

    // Iterator-like stream for piping GamePoolArgs to the GamePool stream.
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
                    id: i + 1, format, maxTurns, logPath: gameLogPath, rollout,
                    agents: [agentConfig, opponent.agentConfig], models
                }
                yield args;
            }
        }
    }(), {objectMode: true});

    // Stream for summarizing the game results.
    let numAExps = 0;
    let wins = 0;
    let losses = 0;
    let ties = 0;
    const processResults = new stream.Writable(
    {
        objectMode: true,
        write(result: GamePoolResult, encoding: BufferEncoding,
            callback: stream.TransformCallback): void
        {
            numAExps += result.numAExps;

            if (result.err)
            {
                progressLog.error(
                    `Game ${result.id} threw an error: ` +
                        `${(result.err.stack ?? result.err.toString())}`);
            }

            if (result.winner === 0) ++wins;
            else if (result.winner === 1) ++losses;
            else ++ties;

            progress.tick({wlt: `${wins}-${losses}-${ties}`});

            callback();
        }
    });

    // TODO: Move pool outside for reuse?
    const pool = new GamePool(numThreads, getExpPath);
    await stream.promises.pipeline(
        poolArgs,
        new GamePoolStream(pool),
        processResults);
    await pool.close();

    progress.terminate();
    // TODO: Also display separate records for each opponent.
    logger.debug(`Record: ${wins}-${losses}-${ties}`);

    return numAExps;
}
