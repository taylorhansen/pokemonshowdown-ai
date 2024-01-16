import {TeamGenerators} from "@pkmn/randoms";
import {BattleStreams, PRNGSeed, Streams, Teams} from "@pkmn/sim";
import {SideID} from "@pkmn/types";
import {RoomEvent} from "../../protocol/Event";
import {protocolParser} from "../../protocol/parser";
import {Sender} from "../../psbot/PsBot";
import {DeferredFile} from "../../utils/DeferredFile";
import {WrappedError} from "../../utils/errors/WrappedError";
import {LogFunc, Logger} from "../../utils/logging/Logger";
import {Verbose} from "../../utils/logging/Verbose";
import {wrapTimeout} from "../../utils/timeout";
import {BattleDriver} from "../BattleDriver";
import {BattleAgent} from "../agent";
import {BattleParser} from "../parser/BattleParser";

Teams.setGeneratorFactory(TeamGenerators);

/** Identifier type for the sides of a battle. */
export type PlayerSide = Exclude<SideID, "p3" | "p4">;

/** Options for {@link simulateBattle}. */
export interface BattleOptions {
    /** Player configs. */
    readonly players: {readonly [P in PlayerSide]: PlayerOptions};
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
    /**
     * Timeout in milliseconds for processing battle-related actions and events.
     * Used for catching rare async bugs or timing out BattleAgent
     * communications.
     */
    readonly timeoutMs?: number;
}

/**
 * Player options for {@link simulateBattle}.
 *
 * @template TResult Parser result type.
 */
export interface PlayerOptions {
    /** Player name. */
    readonly name: string;
    /** Battle decision-maker. */
    readonly agent: BattleAgent;
    /** Battle event parser. Responsible for calling the {@link agent}. */
    readonly parser: BattleParser;
    /** Seed for generating the random team. */
    readonly seed?: PRNGSeed;
}

/**
 * Result from playing a PS game.
 *
 * @template TResult Result from each player's {@link BattleParser}.
 */
export interface BattleResult {
    /** Side of the winner if it's not a tie. */
    winner?: PlayerSide;
    /** Whether the game was truncated due to max turn limit. */
    truncated?: boolean;
    /**
     * Path to the file containing game logs if enabled. Should be equal to
     * {@link BattleOptions.logPath} if specified, otherwise points to a temp
     * file.
     */
    logPath?: string;
    /**
     * If an exception was thrown during the game, store it here instead of
     * propagating it through the pipeline.
     */
    err?: Error;
}

/** Temp log file template. */
const template = "psbattle-XXXXXX";

/**
 * Runs a simulated PS battle.
 *
 * @template TResult Result from each player's {@link BattleParser}.
 */
export async function simulateBattle(
    options: BattleOptions,
): Promise<BattleResult> {
    let logPath: string | undefined;
    const file = new DeferredFile();
    if (!options.onlyLogOnError) {
        logPath = await file.ensure(options.logPath, template);
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
    const truncate = async () => {
        truncated = true;
        if (!battleStream.atEOF) {
            await battleStream.writeEnd();
        }
    };

    let winner: PlayerSide | undefined;
    gamePromises.push(
        (async function omniscientStreamHandler() {
            try {
                const winnerName = await omniscientEventPipeline(
                    streams.omniscient,
                    options.timeoutMs,
                );
                for (const id of ["p1", "p2"] as const) {
                    if (winnerName === options.players[id].name) {
                        winner = id;
                    }
                }
            } catch (err) {
                await truncate();
                logPath = await file.ensure(options.logPath, template);
                handleEventPipelineError(err as Error, logger, logPath);
            }
        })(),
    );

    for (const id of ["p1", "p2"] as const) {
        const playerLog = logger.addPrefix(
            `${id}(${options.players[id].name}): `,
        );

        gamePromises.push(
            (async function playerStreamHandler() {
                try {
                    await playerEventPipeline(
                        streams[id],
                        options.players[id],
                        playerLog,
                        options.maxTurns,
                        truncate,
                        options.timeoutMs,
                    );
                } catch (err) {
                    await truncate();
                    logPath = await file.ensure(options.logPath, template);
                    handleEventPipelineError(err as Error, playerLog, logPath);
                }
            })(),
        );

        const playerOptions = {
            name: options.players[id].name,
            ...(options.players[id].seed && {seed: options.players[id].seed}),
        };
        playerLog.debug(
            `Setting up player with options: ${JSON.stringify(playerOptions)}`,
        );
        await battleStream.write(
            `>player ${id} ${JSON.stringify(playerOptions)}`,
        );
    }

    // Capture the first game error so we can notify the main thread.
    let err: Error | undefined;
    try {
        await Promise.all(gamePromises);
        if (!battleStream.atEOF) {
            await battleStream.writeEnd();
        }
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
        ...(truncated && {truncated: true}),
        ...(logPath && {logPath}),
        ...(err && {err}),
    };
}

/** Wraps the error for top-level and/or points to log file in the err msg. */
function handleEventPipelineError(
    err: Error,
    logger: Logger,
    logPath?: string,
): never {
    logger.error(err.stack ?? err.toString());
    logger.info("Error encountered; truncating");
    if (logPath) {
        throw new Error(
            `${simulateBattle.name}() encountered an error; check ${logPath} ` +
                "for details",
        );
    }
    throw new WrappedError(
        err,
        msg => `${simulateBattle.name}() encountered an error: ${msg}`,
    );
}

/**
 * Processes the omniscient battle stream and returns the name of the winner if
 * there was one.
 */
async function omniscientEventPipeline(
    battleTextStream: Streams.ObjectReadWriteStream<string>,
    timeoutMs?: number,
): Promise<string | undefined> {
    const maybeTimeout: <T>(p: () => Promise<T>) => Promise<T> = timeoutMs
        ? async p => await wrapTimeout(p, timeoutMs)
        : async p => await p();

    let winner: string | undefined;
    let chunk: string | null | undefined;
    while (
        (chunk = await maybeTimeout(async () => await battleTextStream.read()))
    ) {
        for (const event of protocolParser(chunk)) {
            if (event.args[0] === "win") {
                [, winner] = event.args;
            }
        }
    }
    return winner;
}

async function playerEventPipeline(
    battleTextStream: Streams.ObjectReadWriteStream<string>,
    options: PlayerOptions,
    logger: Logger,
    maxTurns?: number,
    truncate?: () => Promise<void>,
    timeoutMs?: number,
): Promise<void> {
    const sender = createSender(battleTextStream, logger);
    const driver = new BattleDriver({
        username: options.name,
        agent: options.agent,
        parser: options.parser,
        sender,
        logger,
    });

    const maybeTimeout: <T>(p: () => Promise<T>) => Promise<T> = timeoutMs
        ? async p => await wrapTimeout(p, timeoutMs)
        : async p => await p();

    let truncated = false;
    let loopErr: Error | undefined;
    try {
        let chunk: string | null | undefined;
        while (
            (chunk = await maybeTimeout(
                async () => await battleTextStream.read(),
            ))
        ) {
            logger.debug(`Received:\n${chunk}`);
            for (const event of protocolParser(chunk)) {
                if (event.args[0] === "halt") {
                    driver.halt();
                    continue;
                }
                await maybeTimeout(
                    async () => await driver.handle(event as RoomEvent),
                );
                if (
                    event.args[0] === "turn" &&
                    maxTurns &&
                    Number(event.args[1]) >= maxTurns
                ) {
                    logger.info(`Reached max turn ${maxTurns}; truncating`);
                    truncated = true;
                    break;
                }
            }
            if (truncated) {
                break;
            }
        }
    } catch (err) {
        loopErr = err as Error;
        truncated = true;
        throw err;
    } finally {
        try {
            if (truncated) {
                await maybeTimeout(
                    async () =>
                        await Promise.all([truncate?.(), driver.forceFinish()]),
                );
            } else {
                driver.finish();
            }
        } catch (err) {
            if (loopErr) {
                // Preserve and bubble up original error.
                logger.error(
                    `Error while finishing: ${
                        (err as Error).stack ?? (err as Error).toString()
                    }`,
                );
                // eslint-disable-next-line no-unsafe-finally
                throw loopErr;
            }
            // eslint-disable-next-line no-unsafe-finally
            throw err;
        }
    }
}

function createSender(
    battleTextStream: Streams.ObjectReadWriteStream<string>,
    logger: Logger,
): Sender {
    return (...responses) => {
        for (const res of responses) {
            // Extract choice from args.
            // Format: |/choose <choice>
            if (res.startsWith("|/choose ")) {
                const choice = res.substring("|/choose ".length);
                if (!battleTextStream.atEOF) {
                    void battleTextStream.write(choice);
                } else {
                    logger.error("Can't send choice: At end of stream");
                    return false;
                }
            }
        }
        return true;
    };
}
