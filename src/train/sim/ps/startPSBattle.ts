import * as fs from "fs";
import * as path from "path";
import * as tmp from "tmp-promise";
// @ts-ignore
import s = require("../../../../pokemon-showdown/.sim-dist/battle-stream");
import { BattleAgent } from "../../../battle/agent/BattleAgent";
import * as events from "../../../battle/parser/BattleEvent";
import { BattleParserFunc } from "../../../battle/parser/BattleParser";
import { LogFunc, Logger } from "../../../Logger";
import { PlayerID } from "../../../psbot/helpers";
import { parsePSMessage } from "../../../psbot/parser/parsePSMessage";
import * as psevent from "../../../psbot/parser/PSBattleEvent";
import { PSBattle } from "../../../psbot/PSBattle";
import { PSEventHandler } from "../../../psbot/PSEventHandler";
import { ensureDir } from "../../helpers/ensureDir";
import { SimResult } from "../simulators";

/** Player options for `startBattle()`. */
export interface PlayerOptions
{
    /** Battle decision-maker. */
    readonly agent: BattleAgent;
    /**
     * Override PSBattle if needed. The subclass should not override
     * PSEventHandler, since `startPSBattle()` already does that, so attempts to
     * do so will be overridden.
     *
     * `username` parameter in constructor will always be the PlayerID.
     */
    readonly psBattleCtor?: typeof PSBattle;
    /** Override BattleParser if needed. */
    readonly parserFunc?: BattleParserFunc;
}

type Players = {[P in PlayerID]: PlayerOptions};

/** Options for `startBattle()`. */
export interface GameOptions extends Players
{
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
export interface PSGameResult extends Omit<SimResult, "winner" | "experiences">
{
    /** ID of the winner if it's not a tie. */
    winner?: PlayerID;
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
    const battleStream = new s.BattleStream({keepAlive: false});
    const streams = s.getPlayerStreams(battleStream);
    streams.omniscient.write(`>start {"formatid":"gen4randombattle"}`);

    const eventLoops: Promise<void>[] = [];

    let winner: PlayerID | undefined;
    for (const id of ["p1", "p2"] as PlayerID[])
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

        // additionally stop the battle once a game-over event is emitted
        // only one player needs to track this
        let eventHandlerCtor: typeof PSEventHandler | undefined;
        if (id === "p1")
        {
            eventHandlerCtor = class extends PSEventHandler
            {
                /** @override */
                protected handleTurn(event: psevent.Turn): events.Any[]
                {
                    const result = super.handleTurn(event);
                    // also make sure the battle doesn't go too long
                    if (options.maxTurns && event.num >= options.maxTurns)
                    {
                        // tie
                        innerLog.debug("Max turns reached, force tie");
                        streams.omniscient.write(">forcetie");
                    }
                    return result;
                }

                /** @override */
                protected handleGameOver(event: psevent.Tie | psevent.Win):
                    events.Any[]
                {
                    if (event.type === "win") winner = event.winner as PlayerID;
                    return super.handleGameOver(event);
                }
            };
        }

        const psBattleCtor = options[id].psBattleCtor ?? PSBattle;
        const parserFunc = options[id].parserFunc;

        // setup one side of the battle
        const battle = new psBattleCtor(id, options[id].agent, sender,
            innerLog.addPrefix("PSBattle: "), parserFunc, eventHandlerCtor);
        streams.omniscient.write(`>player ${id} {"name":"${id}"}`);

        // start event loop for this side of the battle
        const stream = streams[id];
        const parserLog = innerLog.addPrefix("Parser: ");
        eventLoops.push(async function()
        {
            try
            {
                for await (const output of stream)
                {
                    innerLog.debug(`Received:\n${output}`);
                    const {messages} = parsePSMessage(output, parserLog);
                    for (const msg of messages)
                    {
                        switch (msg.type)
                        {
                            case "battleInit": await battle.init(msg); break;
                            case "battleProgress":
                                await battle.progress(msg);
                                break;
                            case "request": await battle.request(msg); break;
                            case "error": await battle.error(msg); break;
                        }
                    }
                    innerLog.debug("Waiting for next input");
                }
                innerLog.debug("Finishing");
                await battle.finish();
                innerLog.debug("Done");
            }
            catch (e)
            {
                // log game errors and leave a new exception specifying
                //  where to find it
                innerLog.error(e?.stack ? e.stack : e);
                innerLog.debug("Error encountered, discard game");
                if (!battleStream.atEOF) battleStream.destroy();
                throw new Error("startPSBattle() encountered an error. " +
                    `Check ${logPath} for details.`);
            }
        }());
    }

    // don't let game errors propagate, instead capture it for logging later
    let err: Error | undefined;
    try { await Promise.all(eventLoops); }
    catch (e) { err = e; }

    // should probably never happen, but not a big deal if it does
    if (!battleStream.atEOF)
    {
        logger.debug("Killing battle stream");
        battleStream.destroy();
    }
    // make sure the game completely ends so that the logs are complete
    if (err)
    {
        logger.debug("Finishing other side");
        await Promise.allSettled(eventLoops);
    }

    // close the log file and return
    logger.debug("Closing file");
    await new Promise(res => file.end(res));
    return {winner, ...err && {err}};
}
