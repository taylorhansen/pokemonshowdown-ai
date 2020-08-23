import * as fs from "fs";
import { join } from "path";
import ProgressBar from "progress";
import { pipeline, Readable, Transform, TransformCallback } from "stream";
import { promisify } from "util";
import { LogFunc, Logger } from "../../Logger";
import { AExpToTFRecord } from "../helpers/AExpToTFRecord";
import { AdvantageConfig } from "../nn/learn/LearnArgs";
import { NetworkProcessor } from "../nn/worker/NetworkProcessor";
import { SimName } from "../sim/simulators";
import { GamePool, GamePoolAgentConfig, GamePoolArgs } from "./GamePool";
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
    /** Advantage estimation config for AugmentedExperiences. */
    readonly rollout?: AdvantageConfig;
    /**
     * Path to the file to store AugmentedExperiences in, if any agent configs
     * contain `exp=true`. If not specified, any experiences will be discarded.
     */
    readonly expPath?: string;
}

/**
 * Manages the playing of multiple games in parallel.
 * @returns The number of AugmentedExperiences generated, if any.
 */
export async function playGames(
    {
        processor, agentConfig, opponents, simName, maxTurns, logger, logPath,
        rollout, expPath
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
    let numAExps = 0;
    let wins = 0;
    let losses = 0;
    let ties = 0;
    const processResults = new Transform(
    {
        objectMode: true,
        transform(result: AugmentedSimResult, encoding: BufferEncoding,
            callback: TransformCallback): void
        {
            for (const aexp of result.experiences) this.push(aexp);
            numAExps += result.experiences.length;

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

    await promisify(pipeline)(
        poolArgs,
        new GamePool(),
        processResults,
        ...(expPath ?
        [
            new AExpToTFRecord(/*maxExp*/ 8 * 128),
            fs.createWriteStream(expPath, {encoding: "binary"})
        ] : []));

    progress.terminate();
    // TODO: also display separate records for each opponent
    logger.debug(`Record: ${wins}-${losses}-${ties}`)

    return numAExps;
}
