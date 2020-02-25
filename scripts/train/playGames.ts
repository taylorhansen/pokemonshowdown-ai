import * as tf from "@tensorflow/tfjs-node";
import { join } from "path";
import ProgressBar from "progress";
import { LogFunc, Logger } from "../../src/Logger";
import { BattleSim } from "./sim/simulators";
import { Experience } from "./sim/helpers/Experience";

/** Opponent data for `playGames()`. */
export interface Opponent
{
    /**
     * Name of the opponent for logging. Must be different than other opponents.
     */
    readonly name: string;
    /** URL or loaded model that will play a set of games. */
    readonly model: string | tf.LayersModel;
    /** Number of games that this opponent will play. */
    readonly numGames: number;
}

/** Args for `playGames()`. */
export interface PlayGamesArgs
{
    /** Model that will participate in each game. */
    readonly model: tf.LayersModel;
    /** Opponents to play against. */
    readonly opponents: readonly Opponent[];
    /** Simulator to use during training. */
    readonly sim: BattleSim;
    /** Number of turns before a game is considered a tie. */
    readonly maxTurns: number;
    /** Logger object. */
    readonly logger: Logger;
    /** Path to the folder to store game logs in. Omit to not store logs. */
    readonly logPath?: string;
    /**
     * If defined, make each game emit Experience objects and call this function
     * for each game using those Experiences.
     */
    experienceCallback?(experiences: Experience[][]): Promise<void>;
}

/** Manages the playing of multiple games. */
export async function playGames(
    {model, opponents, sim, maxTurns, logger, logPath, experienceCallback}:
        PlayGamesArgs): Promise<void>
{
    for (const opponent of opponents)
    {
        const innerLog = logger.addPrefix(`VS ${opponent.name}: `);
        const progress =
            new ProgressBar(
                `VS ${opponent.name}: eta=:etas :bar wlt=:wlt`,
            {
                total: opponent.numGames, head: ">", clear: true,
                width: Math.floor((process.stderr.columns ?? 80) / 2)
            });
        const progressLogFunc: LogFunc = msg => progress.interrupt(msg);
        const progressLog = new Logger(progressLogFunc, progressLogFunc,
            innerLog.prefix, "");

        const opponentModel = typeof opponent.model === "string" ?
            await tf.loadLayersModel(opponent.model) : opponent.model;
        let wins = 0;
        let losses = 0;
        let ties = 0;
        for (let i = 0; i < opponent.numGames; ++i)
        {
            try
            {
                const {experiences, winner} = await sim(
                {
                    models: [model, opponentModel], maxTurns,
                    emitExperience: !!experienceCallback,
                    ...(logPath &&
                    {
                        logPath: join(logPath, `${opponent.name}/game-${i + 1}`)
                    })
                });

                if (winner === 0) ++wins;
                else if (winner === 1) ++losses;
                else ++ties;

                if (experienceCallback) await experienceCallback(experiences);
            }
            catch (e)
            {
                let msg: string;
                if (e instanceof Error) msg = e.stack ?? e.toString();
                else msg = e;
                progressLog.error(`Sim threw an error: ${msg}`);
            }
            progress.tick({wlt: `${wins}-${losses}-${ties}`});
        }
        progress.terminate();
        if (opponentModel !== model) opponentModel.dispose();
        innerLog.debug(`Record: ${wins}-${losses}-${ties}`)
    }
}
