import * as fs from "fs";
import { join } from "path";
// @ts-ignore
import s = require("../../pokemon-showdown/.sim-dist/battle-stream");
import { BattleAgent } from "../../src/battle/agent/BattleAgent";
import { AnyDriverEvent } from "../../src/battle/driver/DriverEvent";
import { LogFunc, Logger } from "../../src/Logger";
import { PlayerID } from "../../src/psbot/helpers";
import { AnyBattleEvent, TieEvent, WinEvent } from
    "../../src/psbot/parser/BattleEvent";
import { parsePSMessage } from "../../src/psbot/parser/parsePSMessage";
import { PSBattle } from "../../src/psbot/PSBattle";
import { PSEventHandler } from "../../src/psbot/PSEventHandler";
import { ensureDir } from "./ensureDir";

/** Player options for `startBattle()`. */
export interface PlayerOptions
{
    /** Battle decision-maker. */
    readonly agent: BattleAgent;
    /**
     * Override PSBattle if needed.  The subclass should not override
     * PSEventHandler, since `startBattle()` already does that, so attempts to
     * do so will be overridden.
     */
    readonly psBattleCtor?: typeof PSBattle;
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
    /** Path to the folder to store game logs in. Optional. */
    readonly logPath?: string;
    /** Prefix for file names, or `battle` if omitted. */
    readonly filename?: string;
    /** Prefix for logs. Default `Battle: `. */
    readonly logPrefix?: string;
}

/** Completes a simulated battle. */
export async function startBattle(options: GameOptions): Promise<void>
{
    // setup logger
    let buffer = "";
    const logFunc: LogFunc = msg => buffer += msg;
    const logger = new Logger(logFunc, logFunc,
        options.logPrefix ?? "Battle: ");

    // start simulating a battle
    const streams = s.getPlayerStreams(new s.BattleStream());
    streams.omniscient.write(`>start {"formatid":"gen4randombattle"}`);

    const eventLoops: Promise<void>[] = [];
    let done = false;

    for (const id of ["p1", "p2"] as PlayerID[])
    {
        const innerLog = logger.addPrefix(`Play(${id}): `);

        // sends player choices to the battle stream
        function sender(...args: string[]): void
        {
            for (const arg of args)
            {
                // extract choice from args
                // format: |/choose <choice>
                if (arg.startsWith("|/choose "))
                {
                    const choice = arg.substr("|/choose ".length);
                    innerLog.debug(`Sending choice '${choice}'`);
                    streams[id].write(choice);
                }
            }
        }

        // additionally stop the battle once a game-over event is emitted
        // only one player needs to track this
        const eventHandlerCtor = id === "p1" ? class extends PSEventHandler
        {
            /** @override */
            protected handleGameOver(event: TieEvent | WinEvent,
                events: readonly AnyBattleEvent[], i: number):
                AnyDriverEvent[]
            {
                done = true;
                return super.handleGameOver(event, events, i);
            }
        } : PSEventHandler;

        const psBattleCtor = options[id].psBattleCtor ?? PSBattle;

        // setup one side of the battle
        const battle = new psBattleCtor(id, options[id].agent, sender,
            innerLog.addPrefix("PSBattle: "), undefined, eventHandlerCtor);
        streams.omniscient.write(`>player ${id} {"name":"${id}"}`);

        // start event loop for this side of the battle
        const stream = streams[id];
        const parserLog = innerLog.addPrefix("Parser: ");
        eventLoops.push(async function()
        {
            let output: string;
            while (!done && (output = await stream.read()))
            {
                innerLog.debug(`received:\n${output}`);
                try
                {
                    const {messages} = parsePSMessage(output, parserLog);
                    for (const msg of messages)
                    {
                        switch (msg.type)
                        {
                            case "battleinit": await battle.init(msg); break;
                            case "battleprogress":
                                await battle.progress(msg);
                                break;
                            case "request": await battle.request(msg); break;
                            case "error": await battle.error(msg); break;
                        }
                    }
                }
                catch (e) { innerLog.error(`${e}\n${(e as Error).stack}`); }
            }
            // signal to other event loop of game over
            done = true;
        }());
    }

    // wait for the game to finish
    await Promise.all(eventLoops);

    // write logs to the log file
    if (options.logPath)
    {
        await ensureDir(options.logPath);
        const file = fs.createWriteStream(
            join(options.logPath, options.filename || "game"));
        return new Promise(function(res, rej)
        {
            file.write(buffer, function(err)
            {
                if (err) rej(err);
                else res();
            });
        });
    }
}
