import { TeamGenerators } from "@pkmn/randoms";
import { BattleStreams, Teams } from "@pkmn/sim";
import { SideID } from "@pkmn/types";
import * as fs from "fs";
import * as path from "path";
import * as stream from "stream";
import * as tmp from "tmp-promise";
import { LogFunc, Logger } from "../../../../Logger";
import { BattleHandler } from "../../../../psbot/handlers/battle";
import { BattleAgent } from "../../../../psbot/handlers/battle/agent";
import { FormatType } from "../../../../psbot/handlers/battle/formats";
import { BattleParser } from "../../../../psbot/handlers/battle/parser";
import { Event, MessageParser } from "../../../../psbot/parser";
import { ensureDir } from "../../../helpers/ensureDir";
import { SimResult } from "../playGame";

Teams.setGeneratorFactory(TeamGenerators);

/**
 * Player options for `startPSBattle()`.
 * @template T Game format type.
 */
export interface PlayerOptions<T extends FormatType = FormatType>
{
    /** Battle decision-maker. */
    readonly agent: BattleAgent<T>;
    /** Override BattleParser if needed. */
    readonly parser?: BattleParser<T>;
}

/**
 * Options for `startBattle()`.
 * @template T Game format type.
 */
export interface GameOptions<T extends FormatType = FormatType>
{
    /** Game format type. */
    readonly format: T;
    /** Player configs. */
    readonly players:
        {readonly [P in Exclude<SideID, "p3" | "p4">]: PlayerOptions<T>};
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
export interface PSGameResult extends Omit<SimResult, "winner">
{
    /** ID of the winner if it's not a tie. */
    winner?: SideID;
}

/** Runs a simulated PS battle. */
export async function startPSBattle(options: GameOptions): Promise<PSGameResult>
{
    // setup logfile
    let logPath: string;
    if (options.logPath)
    {
        await ensureDir(path.dirname(options.logPath));
        logPath = options.logPath
    }
    else
    {
        // create a temp file so logs can still be recovered
        logPath = (await tmp.file(
            {template: "psbattle-XXXXXX", keep: true})).path;
    }
    const file = fs.createWriteStream(logPath);

    // setup logger
    const logFunc: LogFunc = msg => file.write(msg);
    const logger = new Logger(logFunc, logFunc,
        options.logPrefix ?? "Battle: ");

    // start simulating a battle
    const battleStream = new BattleStreams.BattleStream({keepAlive: false});
    const streams = BattleStreams.getPlayerStreams(battleStream);
    streams.omniscient.write(`>start {"formatid":"gen4randombattle"}`);

    const eventLoops: Promise<void>[] = [];

    let winner: SideID | undefined;
    for (const id of ["p1", "p2"] as const)
    {
        const innerLog = logger.addPrefix(`${id}: `);

        // sends player choices to the battle stream
        function sender(...args: string[]): boolean
        {
            for (const arg of args)
            {
                // extract choice from args
                // format: |/choose <choice>
                if (arg.startsWith("|/choose "))
                {
                    const choice = arg.substr("|/choose ".length);
                    innerLog.debug(`Sending choice '${choice}'`);
                    if (!battleStream.atEOF) streams[id].write(choice);
                    else
                    {
                        innerLog.error("Can't send: At end of stream");
                        return false;
                    }
                }
            }
            return true;
        }

        let handlerCtor: typeof BattleHandler;
        // add game-over checks to one side
        if (id === "p1")
        {
            handlerCtor =
                class<T extends FormatType, TAgent extends BattleAgent<T>>
                extends BattleHandler<T, TAgent>
            {
                public override async handle(event: Event): Promise<void>
                {
                    try { return await super.handle(event); }
                    catch (e) { throw e; }
                    finally
                    {
                        if (event.args[0] === "turn")
                        {
                            if (options.maxTurns &&
                                Number(event.args[1]) >= options.maxTurns)
                            {
                                innerLog.debug(
                                    "Max turns reached, force tie");
                                streams.omniscient.write(">forcetie");
                            }
                        }
                        else if (event.args[0] === "win")
                        {
                            winner = event.args[1] as SideID;
                        }
                    }
                }
            };
        }
        else handlerCtor = BattleHandler;

        const handler = new handlerCtor(
        {
            format: options.format, username: id,
            agent: options.players[id].agent, sender,
            logger: innerLog.addPrefix("BattleHandler: ")
        });

        // setup battle event pipeline
        const battleTextStream = streams[id];
        const messageParser =
            new MessageParser(innerLog.addPrefix("MessageParser: "));

        eventLoops.push(
            stream.promises.pipeline(battleTextStream, messageParser));

        // start event loop for this side of the battle
        // note: keep this separate from the pipeline streams since for some
        //  reason it causes the whole worker process to crash when an error is
        //  encountered due to the underlying handler.finish() promise rejecting
        //  before the method itself can be called/caught
        eventLoops.push(async function()
        {
            let loopErr: Error | undefined;
            try
            {
                for await (const event of messageParser)
                {
                    if (event.args[0] === "halt" as any) handler.halt();
                    else await handler.handle(event);
                }
            }
            catch (e: any)
            {
                // log game errors and leave a new exception specifying
                //  where to find it
                logError(innerLog, battleStream, loopErr = e);
                throwLog(logPath);
            }
            finally
            {
                innerLog.debug("Finishing");
                try
                {
                    if (loopErr) await handler.forceFinish();
                    else await handler.finish();
                }
                catch (e: any)
                {
                    if (loopErr !== e) logError(innerLog, battleStream, e);
                    else
                    {
                        innerLog.debug(
                            "Same error encountered while finishing");
                    }
                    if (!loopErr) throwLog(logPath);
                }
            }
        }());

        streams.omniscient.write(`>player ${id} {"name":"${id}"}`);
    }

    // don't let game errors propagate, instead capture it for logging later
    let err: Error | undefined;
    try { await Promise.all(eventLoops); }
    catch (e: any) { err = e; }

    // should probably never happen, but not a big deal if it does
    if (!battleStream.atEOF)
    {
        logger.debug("Killing battle stream");
        battleStream.destroy();
    }

    // make sure the game completely ends so that the logs are complete
    logger.debug("Settling");
    await Promise.allSettled(eventLoops);

    // close the log file and return
    await new Promise<void>(res => file.end("Done\n", "utf8", res));
    return {winner, ...err && {err}};
}

/**
 * Swallows an error into the logger, stops the BattleStream, then throws a
 * display error pointing to the log file.
 */
function logError(logger: Logger, battleStream: BattleStreams.BattleStream,
    error?: Error): void
{
    if (error) logger.error(error.stack ?? error.toString());
    logger.debug("Error encountered, force tie and discard game");
    battleStream.write(">forcetie");
    if (!battleStream.atEOF) battleStream.destroy();
}

function throwLog(logPath: string): never
{
    throw new Error("startPSBattle() encountered an " +
        `error. Check ${logPath} for details.`);
}
