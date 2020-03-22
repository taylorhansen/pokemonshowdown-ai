import { join } from "path";
import ProgressBar from "progress";
import { LogFunc, Logger } from "../../../src/Logger";
import { SimName } from "../sim/simulators";
import { AugmentedExperience } from "../nn/learn/AugmentedExperience";
import { AdvantageConfig } from "../nn/learn/LearnArgs";
import { GamePool, GamePoolAgentConfig, GamePoolArgs } from "./GamePool";
import { NetworkProcessor } from "../nn/worker/NetworkProcessor";

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
    /** Thread pool for playing games in parallel. */
    readonly pool: GamePool;
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
        pool, processor, agentConfig, opponents, simName, maxTurns, logger,
        logPath, rollout
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

    const aexps: AugmentedExperience[] = [];
    let wins = 0;
    let losses = 0;
    let ties = 0;
    const queuedGames: Promise<void>[] = [];
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

            const promise = pool.addGame(args)
            .then(function(result)
            {
                if (result.winner === 0) ++wins;
                else if (result.winner === 1) ++losses;
                else ++ties;

                aexps.push(...result.experiences);
            })
            .catch(function(e)
            {
                let msg: string;
                if (e instanceof Error) msg = e.stack ?? e.toString();
                else msg = e.toString();
                progressLog.error(`Game threw an error: ${msg}`);

                // count the errored game as a tie
                ++ties;
            })
            .finally(() =>
                progress.tick({wlt: `${wins}-${losses}-${ties}`}));

            queuedGames.push(promise)
        }
    }

    if (queuedGames.length > 0) await Promise.all(queuedGames);

    progress.terminate();
    // TODO: also display separate records for each opponent
    logger.debug(`Record: ${wins}-${losses}-${ties}`)

    return aexps;
}
