import * as stream from "stream";
import {setTimeout} from "timers/promises";
import {TeamGenerators} from "@pkmn/randoms";
import {BattleStreams, PRNGSeed, Teams} from "@pkmn/sim";
import {SideID} from "@pkmn/types";
import {Sender} from "../../../../psbot/PsBot";
import {BattleHandler} from "../../../../psbot/handlers/battle";
import {BattleAgent} from "../../../../psbot/handlers/battle/agent";
import {BattleParser} from "../../../../psbot/handlers/battle/parser/BattleParser";
import {
    Event,
    HaltEvent,
    MessageParser,
    RoomEvent,
} from "../../../../psbot/parser";
import {DeferredFile} from "../../../../util/DeferredFile";
import {LogFunc, Logger} from "../../../../util/logging/Logger";
import {Verbose} from "../../../../util/logging/Verbose";
import {SimArgs, SimResult} from "../playGame";

Teams.setGeneratorFactory(TeamGenerators);

/** Options for {@link startPsBattle}.  */
export interface GameOptions extends Omit<SimArgs, "agents"> {
    /** Player configs. */
    readonly players: {
        readonly [P in Exclude<SideID, "p3" | "p4">]: PlayerOptions;
    };
}

/** Player options for {@link startPsBattle}. */
export interface PlayerOptions {
    /** Player name. */
    readonly name: string;
    /** Battle decision-maker. */
    readonly agent: BattleAgent;
    /** Override BattleParser if needed. */
    readonly parser?: BattleParser<BattleAgent, [], void>;
    /** Seed for generating the random team. */
    readonly seed?: PRNGSeed;
}

/** Result from playing a PS game. */
export interface PsGameResult extends Omit<SimResult, "agents" | "winner"> {
    /** Name of the winner if it's not a tie. */
    winner?: string;
}

/** Temp log file template. */
const template = "psbattle-XXXXXX";

/** Runs a simulated PS battle. */
export async function startPsBattle(
    options: GameOptions,
): Promise<PsGameResult> {
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

    let winner: string | undefined;
    for (const id of ["p1", "p2"] as const) {
        const innerLog = logger.addPrefix(
            `${id}(${options.players[id].name}): `,
        );

        // Setup BattleHandler.

        const sender: Sender = (...args) => {
            for (const arg of args) {
                // Extract choice from args.
                // Format: |/choose <choice>
                if (arg.startsWith("|/choose ")) {
                    const choice = arg.substring("|/choose ".length);
                    if (!battleStream.atEOF) {
                        void streams[id].write(choice);
                    } else {
                        innerLog.error("Can't send choice: At end of stream");
                        return false;
                    }
                }
            }
            return true;
        };

        let handlerCtor: typeof BattleHandler;
        // Add game-over checks to one side.
        if (id === "p1") {
            handlerCtor = class<TAgent extends BattleAgent> extends (
                BattleHandler
            )<TAgent> {
                public override async handle(event: Event): Promise<void> {
                    try {
                        return await super.handle(event);
                    } finally {
                        if (event.args[0] === "turn") {
                            if (
                                options.maxTurns &&
                                Number(event.args[1]) >= options.maxTurns
                            ) {
                                innerLog.info("Max turns reached, force tie");
                                void streams.omniscient.write(">forcetie");
                            }
                        } else if (event.args[0] === "win") {
                            [, winner] = event.args;
                        }
                    }
                }
            };
        } else {
            handlerCtor = BattleHandler;
        }

        const handler = new handlerCtor({
            username: options.players[id].name,
            ...options.players[id],
            sender,
            logger: innerLog.addPrefix("BattleHandler: "),
        });

        // Setup battle event pipeline.

        const battleTextStream = streams[id];
        const messageParser = new MessageParser(
            innerLog.addPrefix("MessageParser: "),
        );

        gamePromises.push(
            stream.promises.pipeline(battleTextStream, messageParser),
        );

        // Start event loop for this side of the battle.

        // Note: keep this separate from the above pipeline streams since for
        // some reason it causes the whole worker process to crash when an
        // error is encountered due to the underlying handler.finish() promise
        // rejecting before the method itself can be called/caught.
        gamePromises.push(
            (async function () {
                let loopErr: Error | undefined;
                try {
                    for await (const event of messageParser) {
                        const e = event as RoomEvent | HaltEvent;
                        if (e.args[0] === "halt") {
                            handler.halt();
                            continue;
                        }
                        await wrapTimeout(
                            async () => await handler.handle(e as RoomEvent),
                            30e3 /*30s*/,
                        );
                    }
                } catch (e) {
                    // Log game errors and leave a new exception specifying
                    // where to find it.
                    logError(innerLog, battleStream, (loopErr = e as Error));
                    throwLog(await file.ensure(options.logPath, template));
                } finally {
                    innerLog.info("Finishing");
                    try {
                        await wrapTimeout(async () => {
                            if (loopErr) {
                                await handler.forceFinish();
                            } else {
                                await handler.finish();
                            }
                        }, 30e3 /*30s*/);
                    } catch (e) {
                        if (loopErr !== e) {
                            logError(innerLog, battleStream, e as Error);
                        } else {
                            innerLog.debug(
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

        gamePromises.push(
            (async function () {
                try {
                    await handler.finish();
                } catch (e) {
                    logError(innerLog, battleStream, e as Error);
                    throwLog(await file.ensure(options.logPath, template));
                }
            })(),
        );

        const playerOptions = {
            name: options.players[id].name,
            ...(options.players[id].seed && {
                seed: options.players[id].seed,
            }),
        };
        void streams.omniscient.write(
            `>player ${id} ${JSON.stringify(playerOptions)}`,
        );
        innerLog.debug(
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
    return {winner, ...(err && {err})};
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
    logger.info("Error encountered, force tie");
    void battleStream.write(">forcetie");
    if (!battleStream.atEOF) {
        void battleStream.destroy();
    }
}

function throwLog(logPath?: string): never {
    throw new Error(
        "startPSBattle() encountered an error." +
            (logPath ? `Check ${logPath} for details.` : ""),
    );
}

async function wrapTimeout<T>(
    f: () => Promise<T>,
    milliseconds: number,
): Promise<T> {
    const ac = new AbortController();
    return (
        await Promise.all([
            f().finally(() => ac.abort()),
            setTimeout(milliseconds, true, {
                signal: ac.signal,
            })
                .catch(err => {
                    if (!(err instanceof Error) || err.name !== "AbortError") {
                        throw err;
                    }
                    return false;
                })
                .then(timedOut => {
                    if (timedOut) {
                        throw new Error("Timeout exceeded");
                    }
                }),
        ])
    )[0];
}
