import * as path from "path";
import * as stream from "stream";
import ProgressBar from "progress";
import {LogFunc, Logger} from "../../util/logging/Logger";
import {AdvantageConfig} from "../learn";
import {ModelWorker} from "../model/worker";
import {
    GamePool,
    GamePoolAgentConfig,
    GamePoolArgs,
    GamePoolResult,
} from "./pool/GamePool";
import {GamePoolStream} from "./pool/GamePoolStream";

/** Opponent data for {@link playGames}. */
export interface Opponent {
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
export interface PlayGamesArgs {
    /** Used to request model ports for the game workers. */
    readonly models: ModelWorker;
    /** Config for the BattleAgent that will participate in each game. */
    readonly agentConfig: GamePoolAgentConfig;
    /** Opponents to play against. */
    readonly opponents: readonly Opponent[];
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
export async function playGames({
    models,
    agentConfig,
    opponents,
    numThreads,
    maxTurns,
    logger,
    logPath,
    rollout,
    getExpPath,
}: PlayGamesArgs): Promise<number> {
    let numAExps = 0;
    for (const opponent of opponents) {
        const innerLog = logger.addPrefix(`Versus ${opponent.name}: `);
        const totalGames = opponent.numGames;
        const prefixWidth = innerLog.prefix.length;
        const postfixWidth =
            " wlt=--".length + 3 * Math.ceil(Math.log10(totalGames));
        const padding = 2;
        const barWidth =
            (process.stdout.columns || 80) -
            prefixWidth -
            postfixWidth -
            padding;
        const progress = new ProgressBar(`${innerLog.prefix}:bar wlt=:wlt`, {
            total: totalGames,
            head: ">",
            clear: true,
            width: barWidth,
        });
        progress.render({wlt: "0-0-0"});
        const progressLogFunc: LogFunc = msg => progress.interrupt(msg);
        const progressLog = new Logger(
            progressLogFunc,
            progressLogFunc,
            innerLog.prefix,
            innerLog.postfix,
        );

        // Iterator-like stream for piping GamePoolArgs to the GamePool stream.
        const poolArgs = stream.Readable.from(
            (function* generateArgs() {
                for (let i = 0; i < opponent.numGames; ++i) {
                    const gameLogPath =
                        logPath &&
                        path.join(logPath, `${opponent.name}/game-${i + 1}`);
                    const args: GamePoolArgs = {
                        id: i + 1,
                        maxTurns,
                        logPath: gameLogPath,
                        rollout,
                        agents: [agentConfig, opponent.agentConfig],
                        models,
                    };
                    yield args;
                }
            })(),
            {objectMode: true},
        );

        // Stream for summarizing the game results.
        let wins = 0;
        let losses = 0;
        let ties = 0;
        const processResults = new stream.Writable({
            objectMode: true,
            write(
                result: GamePoolResult,
                encoding: BufferEncoding,
                callback: stream.TransformCallback,
            ): void {
                if (result.err) {
                    progressLog.error(
                        `Game ${result.id} threw an error: ` +
                            `${result.err.stack ?? result.err.toString()}`,
                    );
                }

                numAExps += result.numAExps;

                if (result.winner === 0) {
                    ++wins;
                } else if (result.winner === 1) {
                    ++losses;
                } else {
                    ++ties;
                }

                progress.tick({wlt: `${wins}-${losses}-${ties}`});

                callback();
            },
        });

        // TODO: Move pool outside for reuse?
        const pool = new GamePool(numThreads, getExpPath);
        try {
            await stream.promises.pipeline(
                poolArgs,
                new GamePoolStream(pool),
                processResults,
            );
        } finally {
            await pool.close();
        }

        progress.terminate();
        innerLog.debug(`Record: ${wins}-${losses}-${ties}`);
    }

    return numAExps;
}
