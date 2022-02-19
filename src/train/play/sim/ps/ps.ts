import * as fs from "fs";
import * as path from "path";
import * as stream from "stream";
import {TeamGenerators} from "@pkmn/randoms";
import {BattleStreams, Teams} from "@pkmn/sim";
import {SideID} from "@pkmn/types";
import * as tmp from "tmp-promise";
import {Sender} from "../../../../psbot/PsBot";
import {BattleHandler} from "../../../../psbot/handlers/battle";
import {BattleAgent} from "../../../../psbot/handlers/battle/agent";
import {FormatType} from "../../../../psbot/handlers/battle/formats";
import {BattleParser} from "../../../../psbot/handlers/battle/parser";
import {
    Event,
    HaltEvent,
    MessageParser,
    RoomEvent,
} from "../../../../psbot/parser";
import {LogFunc, Logger} from "../../../../util/logging/Logger";
import {ensureDir} from "../../../../util/paths/ensureDir";
import {SimResult} from "../playGame";

Teams.setGeneratorFactory(TeamGenerators);

/**
 * Player options for {@link startPSBattle}.
 *
 * @template T Game format type.
 */
export interface PlayerOptions<T extends FormatType = FormatType> {
    /** Battle decision-maker. */
    readonly agent: BattleAgent<T>;
    /** Override BattleParser if needed. */
    readonly parser?: BattleParser<T>;
}

/**
 * Options for {@link startBattle}.
 *
 * @template T Game format type.
 */
export interface GameOptions<T extends FormatType = FormatType> {
    /** Game format type. */
    readonly format: T;
    /** Player configs. */
    readonly players: {
        readonly [P in Exclude<SideID, "p3" | "p4">]: PlayerOptions<T>;
    };
    /**
     * Maximum amount of turns until the game is considered a tie. Games can go
     * on forever if this is not set and both agents only decide to switch.
     */
    readonly maxTurns?: number;
    /** Path to the file to store game logs in. Optional. */
    readonly logPath?: string;
    /** Prefix for logs. Default `Battle: `. */
    readonly logPrefix?: string;
}

/** Result from playing a PS game. */
export interface PsGameResult extends Omit<SimResult, "winner"> {
    /** ID of the winner if it's not a tie. */
    winner?: SideID;
}

/** Runs a simulated PS battle. */
export async function startPsBattle(
    options: GameOptions,
): Promise<PsGameResult> {
    // Setup logfile.
    let logPath: string;
    if (options.logPath) {
        await ensureDir(path.dirname(options.logPath));
        ({logPath} = options);
    } else {
        // Create a temp file so logs can still be recovered.
        logPath = (await tmp.file({template: "psbattle-XXXXXX", keep: true}))
            .path;
    }
    const file = fs.createWriteStream(logPath);

    // Setup logger.
    const logFunc: LogFunc = msg => file.write(msg);
    const logger = new Logger(
        logFunc,
        logFunc,
        options.logPrefix ?? "Battle: ",
    );

    // Start simulating a battle.
    const battleStream = new BattleStreams.BattleStream({keepAlive: false});
    const streams = BattleStreams.getPlayerStreams(battleStream);
    void streams.omniscient.write(`>start {"formatid":"gen4randombattle"}`);

    const eventLoops: Promise<void>[] = [];

    let winner: SideID | undefined;
    for (const id of ["p1", "p2"] as const) {
        const innerLog = logger.addPrefix(`${id}: `);

        // Setup BattleHandler.

        const sender: Sender = (...args) => {
            for (const arg of args) {
                // Extract choice from args.
                // Format: |/choose <choice>
                if (arg.startsWith("|/choose ")) {
                    const choice = arg.substr("|/choose ".length);
                    innerLog.debug(`Sending choice '${choice}'`);
                    if (!battleStream.atEOF) void streams[id].write(choice);
                    else {
                        innerLog.error("Can't send: At end of stream");
                        return false;
                    }
                }
            }
            return true;
        };

        let handlerCtor: typeof BattleHandler;
        // Add game-over checks to one side.
        if (id === "p1") {
            handlerCtor = class<
                T extends FormatType,
                TAgent extends BattleAgent<T>,
            > extends BattleHandler<T, TAgent> {
                public override async handle(event: Event): Promise<void> {
                    try {
                        return await super.handle(event);
                    } finally {
                        if (event.args[0] === "turn") {
                            if (
                                options.maxTurns &&
                                Number(event.args[1]) >= options.maxTurns
                            ) {
                                innerLog.debug("Max turns reached, force tie");
                                void streams.omniscient.write(">forcetie");
                            }
                        } else if (event.args[0] === "win") {
                            winner = event.args[1] as SideID;
                        }
                    }
                }
            };
        } else handlerCtor = BattleHandler;

        const handler = new handlerCtor({
            format: options.format,
            username: id,
            agent: options.players[id].agent,
            sender,
            logger: innerLog.addPrefix("BattleHandler: "),
        });

        // Setup battle event pipeline.

        const battleTextStream = streams[id];
        const messageParser = new MessageParser(
            innerLog.addPrefix("MessageParser: "),
        );

        eventLoops.push(
            stream.promises.pipeline(battleTextStream, messageParser),
        );

        // Start event loop for this side of the battle.

        // Note: keep this separate from the above pipeline streams since for
        // some reason it causes the whole worker process to crash when an
        // error is encountered due to the underlying handler.finish() promise
        // rejecting before the method itself can be called/caught.
        eventLoops.push(
            (async function () {
                let loopErr: Error | undefined;
                try {
                    for await (const event of messageParser) {
                        const e = event as RoomEvent | HaltEvent;
                        if (e.args[0] === "halt") handler.halt();
                        else await handler.handle(e as RoomEvent);
                    }
                } catch (e) {
                    // Log game errors and leave a new exception specifying
                    // where to find it.
                    logError(innerLog, battleStream, (loopErr = e as Error));
                    throwLog(logPath);
                } finally {
                    innerLog.debug("Finishing");
                    try {
                        if (loopErr) await handler.forceFinish();
                        else await handler.finish();
                    } catch (e) {
                        if (loopErr !== e) {
                            logError(innerLog, battleStream, e as Error);
                        } else {
                            innerLog.debug(
                                "Same error encountered while finishing",
                            );
                        }
                        if (!loopErr) throwLog(logPath);
                    }
                }
            })(),
        );

        void streams.omniscient.write(`>player ${id} {"name":"${id}"}`);
    }

    // Don't let game errors propagate, instead capture it for logging later.
    let err: Error | undefined;
    try {
        await Promise.all(eventLoops);
    } catch (e) {
        err = e as Error;
    }

    // Should probably never happen, but not a big deal if it does.
    if (!battleStream.atEOF) {
        logger.debug("Killing battle stream");
        battleStream.destroy();
    }

    // Make sure the game completely ends so that the logs are complete.
    logger.debug("Settling");
    await Promise.allSettled(eventLoops);

    // Close the log file and return.
    await new Promise<void>(res => file.end("Done\n", "utf8", res));
    return {winner, ...(err && {err})};
}

/** Swallows an error into the logger then stops the BattleStream. */
function logError(
    logger: Logger,
    battleStream: BattleStreams.BattleStream,
    err?: Error,
): void {
    if (err) logger.error(err.stack ?? err.toString());
    logger.debug("Error encountered, force tie and discard game");
    void battleStream.write(">forcetie");
    if (!battleStream.atEOF) battleStream.destroy();
}

function throwLog(logPath: string): never {
    throw new Error(
        "startPSBattle() encountered an " +
            `error. Check ${logPath} for details.`,
    );
}
