import { join } from "path";
import ProgressBar from "progress";
import { pipeline, Readable, Writable } from "stream";
import { promisify } from "util";
import { LogFunc, Logger } from "../../Logger";
import { AugmentedExperience } from "../nn/learn/AugmentedExperience";
import { AdvantageConfig } from "../nn/learn/LearnArgs";
import { NetworkProcessor } from "../nn/worker/NetworkProcessor";
import { SimName } from "../sim/simulators";
import { GamePool, GamePoolAgentConfig, GamePoolArgs } from
    "./GamePool";
import { AugmentedSimResult } from "./helpers/playGame";

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
    /**
     * Advantage estimation config. If defined, the returned GameResult object
     * will contain AugmentedExperiences.
     */
    readonly rollout?: AdvantageConfig;
}

/**
 * Manages the playing of multiple games in parallel.
 * @returns If `rollout`, returns all the AugmentedExperiences gathered from
 * each game, else an empty array.
 */
export async function playGames(
    {
        processor, agentConfig, opponents, simName, maxTurns, logger, logPath,
        rollout
    }:
        PlayGamesArgs): Promise<AugmentedExperience[]>
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
        logger.prefix, "");

    // iterator-like stream for piping GamePoolArgs to the GamePool stream
    const poolArgs = Readable.from(function* generateArgs()
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

    // stream for handling the GameResults
    const aexps: AugmentedExperience[] = [];
    let wins = 0;
    let losses = 0;
    let ties = 0;
    const processResults = new Writable(
    {
        objectMode: true, highWaterMark: 8, // backpressure to limit mem usage
        write(result: AugmentedSimResult, encoding: BufferEncoding,
            callback: (err?: Error | null) => void): void
        {
            aexps.push(...result.experiences);

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

    await promisify(pipeline)(poolArgs, new GamePool(), processResults);

    progress.terminate();
    // TODO: also display separate records for each opponent
    logger.debug(`Record: ${wins}-${losses}-${ties}`)

    return aexps;
}
