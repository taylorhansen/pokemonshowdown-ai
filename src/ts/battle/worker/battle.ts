import * as stream from "stream";
import {TeamGenerators} from "@pkmn/randoms";
import {BattleStreams, PRNGSeed, Teams} from "@pkmn/sim";
import {SideID} from "@pkmn/types";
import {HaltEvent, RoomEvent} from "../../protocol/Event";
import {EventParser} from "../../protocol/EventParser";
import {Sender} from "../../psbot/PsBot";
import {DeferredFile} from "../../utils/DeferredFile";
import {LogFunc, Logger} from "../../utils/logging/Logger";
import {Verbose} from "../../utils/logging/Verbose";
import {wrapTimeout} from "../../utils/timeout";
import {BattleDriver} from "../BattleDriver";
import {BattleAgent} from "../agent";
import {BattleParser} from "../parser/BattleParser";

Teams.setGeneratorFactory(TeamGenerators);

/** Identifier type for the sides of a battle. */
export type PlayerSide = Exclude<SideID, "p3" | "p4">;

/**
 * Options for {@link simulateBattle}.
 *
 * @param TResult Result from each player's {@link BattleParser}.
 */
export interface BattleOptions<
    TResult extends {[P in PlayerSide]: unknown} = {[P in PlayerSide]: unknown},
> {
    /** Player configs. */
    readonly players: {readonly [P in PlayerSide]: PlayerOptions<TResult[P]>};
    /**
     * Maximum amount of turns until the game is truncated. The
     * {@link PlayerOptions.agent BattleAgents} will not be called at the end of
     * the `maxTurns`th turn. If this is not set, it's possible for both agents
     * to force an endless game.
     */
    readonly maxTurns?: number;
    /**
     * Path to the file to store game logs in. If not specified, and the
     * simulator encounters an error, then the logs will be stored in a temp
     * file.
     */
    readonly logPath?: string;
    /**
     * If true, logs should only be written to disk (when {@link logPath} is
     * provided if an error is encountered, and discarded if no error. If
     * `logPath` is not provided, regardless of the value of this option, the
     * battle log will be stored in a temp file.
     */
    readonly onlyLogOnError?: boolean;
    /** Seed for the battle PRNG. */
    readonly seed?: PRNGSeed;
}

/**
 * Player options for {@link simulateBattle}.
 *
 * @template TResult Parser result type.
 */
export interface PlayerOptions<TResult = unknown> {
    /** Player name. */
    readonly name: string;
    /** Battle decision-maker. */
    readonly agent: BattleAgent;
    /** Battle event parser. Responsible for calling the {@link agent}. */
    readonly parser: BattleParser<BattleAgent, [], TResult>;
    /** Seed for generating the random team. */
    readonly seed?: PRNGSeed;
}

/**
 * Result from playing a PS game.
 *
 * @template TResult Result from each player's {@link BattleParser}.
 */
export interface BattleResult<
    TResult extends {[P in PlayerSide]: unknown} = {[P in PlayerSide]: unknown},
> {
    /** Side of the winner if it's not a tie. */
    winner?: PlayerSide;
    /**
     * Results from each player's {@link PlayerOptions.parser BattleParser}. May
     * not be fully defined if an {@link err error} was encountered.
     */
    players: {[P in PlayerSide]?: TResult[P]};
    /** Whether the game was truncated due to max turn limit. */
    truncated?: boolean;
    /**
     * If an exception was thrown during the game, store it here instead of
     * propagating it through the pipeline.
     */
    err?: Error;
}

/** Temp log file template. */
const template = "psbattle-XXXXXX";

/** Timeout for catching rare hanging promise bugs. */
const timeoutMs = 600_000; /*10min*/

/**
 * Runs a simulated PS battle.
 *
 * @template TResult Result from each player's {@link BattleParser}.
 */
export async function simulateBattle<
    TResult extends {[P in PlayerSide]: unknown} = {[P in PlayerSide]: unknown},
>(options: BattleOptions<TResult>): Promise<BattleResult<TResult>> {
    const file = new DeferredFile();
    if (options.logPath && !options.onlyLogOnError) {
        await file.ensure(options.logPath, template);
    }

    // Setup logger.
    const logFunc: LogFunc = msg => file.stream.write(msg);
    const logger = new Logger(logFunc, Verbose.Debug, "Battle: ");

    // Start simulating a battle.
    const battleStream = new BattleStreams.BattleStream({keepAlive: false});
    const streams = BattleStreams.getPlayerStreams(battleStream);
    const startOptions = {
        formatid: "gen4randombattle",
        ...(options.seed && {seed: options.seed}),
    };
    void streams.omniscient.write(`>start ${JSON.stringify(startOptions)}`);
    logger.debug(
        `Starting battle with options: ${JSON.stringify(startOptions)}`,
    );

    const gamePromises: Promise<void>[] = [];
    let truncated: boolean | undefined;
    let winner: PlayerSide | undefined;

    const players: {[P in PlayerSide]?: TResult[P]} = {};
    for (const id of ["p1", "p2"] as const) {
        const playerLog = logger.addPrefix(
            `${id}(${options.players[id].name}): `,
        );

        const sender: Sender = (...responses) => {
            for (const res of responses) {
                // Extract choice from args.
                // Format: |/choose <choice>
                if (res.startsWith("|/choose ")) {
                    const choice = res.substring("|/choose ".length);
                    if (!battleStream.atEOF) {
                        void streams[id].write(choice);
                    } else {
                        playerLog.error("Can't send choice: At end of stream");
                        return false;
                    }
                }
            }
            return true;
        };

        const driver = new BattleDriver({
            username: options.players[id].name,
            agent: options.players[id].agent,
            parser: options.players[id].parser,
            sender,
            logger: playerLog,
        });

        // Setup battle event pipeline.

        const battleTextStream = streams[id];
        const eventParser = new EventParser(
            playerLog.addPrefix("EventParser: "),
        );

        gamePromises.push(
            stream.promises.pipeline(battleTextStream, eventParser),
        );

        // Start event loop for this side of the battle.

        // Note: Keep this separate from the above pipeline promise since for
        // some reason it causes the whole worker process to crash when an
        // error is encountered due to the underlying handler.finish() promise
        // rejecting before the method itself can be called/caught.
        gamePromises.push(
            (async function playerLoop() {
                let loopErr: Error | undefined;
                try {
                    for await (const event of eventParser) {
                        if (truncated) {
                            break;
                        }
                        const e = event as RoomEvent | HaltEvent;
                        if (e.args[0] === "turn") {
                            if (
                                options.maxTurns &&
                                Number(e.args[1]) >= options.maxTurns
                            ) {
                                playerLog.info("Max turns reached; truncating");
                                if (!battleStream.atEOF) {
                                    await battleStream.writeEnd();
                                }
                                truncated = true;
                                break;
                            }
                        } else if (e.args[0] === "win") {
                            const [, winnerName] = e.args;
                            if (winnerName === options.players[id].name) {
                                winner = id;
                            }
                        } else if (e.args[0] === "halt") {
                            driver.halt();
                            continue;
                        }
                        await wrapTimeout(
                            async () => await driver.handle(e as RoomEvent),
                            timeoutMs,
                        );
                    }
                } catch (e) {
                    // Log game errors and leave a new exception specifying
                    // where to find it.
                    loopErr = e as Error;
                    logError(playerLog, battleStream, loopErr);
                    throwLog(await file.ensure(options.logPath, template));
                } finally {
                    playerLog.info("Finishing");
                    try {
                        await wrapTimeout(async () => {
                            if (loopErr ?? truncated) {
                                players[id] = await driver.forceFinish();
                            } else {
                                players[id] = await driver.finish();
                            }
                        }, timeoutMs);
                    } catch (e) {
                        if (loopErr !== e) {
                            logError(playerLog, battleStream, e as Error);
                        } else {
                            playerLog.debug(
                                "Same error encountered while finishing",
                            );
                        }
                        if (!loopErr) {
                            throwLog(
                                await file.ensure(options.logPath, template),
                            );
                        }
                    }
                }
            })(),
        );

        const playerOptions = {
            name: options.players[id].name,
            ...(options.players[id].seed && {seed: options.players[id].seed}),
        };
        await battleStream.write(
            `>player ${id} ${JSON.stringify(playerOptions)}`,
        );
        playerLog.debug(
            `Setting up player with options: ${JSON.stringify(playerOptions)}`,
        );
    }

    // Capture the first game error so we can notify the main thread.
    let err: Error | undefined;
    try {
        await Promise.all(gamePromises);
    } catch (e) {
        err = e as Error;
    }

    // Should probably never happen, but not a big deal if it does.
    if (!battleStream.atEOF) {
        logger.info("Destroying battle stream");
        void battleStream.destroy();
    }

    // Make sure the game completely ends so that the logs are complete.
    // Note: Subsequent errors are swallowed since they've already been logged
    // and we already captured one from the earlier Promise.all() to notify the
    // main thread.
    logger.info("Settling");
    await Promise.allSettled(gamePromises);

    // Close the log file and return.
    file.stream.write("Done\n");
    await file.finish();
    return {
        winner,
        players,
        ...(truncated && {truncated: true}),
        ...(err && {err}),
    };
}

/** Swallows an error into the logger then stops the BattleStream. */
function logError(
    logger: Logger,
    battleStream: BattleStreams.BattleStream,
    err?: Error,
): void {
    if (err) {
        logger.error(err.stack ?? err.toString());
    }
    logger.info("Error encountered; truncating");
    if (!battleStream.atEOF) {
        void battleStream.writeEnd();
    }
}

function throwLog(logPath?: string): never {
    throw new Error(
        "simulateBattle() encountered an error" +
            (logPath ? `; check ${logPath} for details` : ""),
    );
}
