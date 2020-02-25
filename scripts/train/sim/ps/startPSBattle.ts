import * as fs from "fs";
import { dirname } from "path";
// @ts-ignore
import s = require("../../../../pokemon-showdown/.sim-dist/battle-stream");
import { BattleAgent } from "../../../../src/battle/agent/BattleAgent";
import { LogFunc, Logger } from "../../../../src/Logger";
import { PlayerID } from "../../../../src/psbot/helpers";
import { AnyBattleEvent, TieEvent, TurnEvent, WinEvent } from
    "../../../../src/psbot/parser/BattleEvent";
import { Iter } from "../../../../src/psbot/parser/Iter";
import { parsePSMessage } from "../../../../src/psbot/parser/parsePSMessage";
import { PSBattle } from "../../../../src/psbot/PSBattle";
import { PSEventHandler, PSResult } from "../../../../src/psbot/PSEventHandler";
import { ensureDir } from "../../ensureDir";

/** Writes a string into a file. */
async function writeFile(filePath: string, buffer: string): Promise<void>
{
    await ensureDir(dirname(filePath));
    const file = fs.createWriteStream(filePath);
    await new Promise((res, rej) =>
        file.write(buffer, err => err ? rej(err) : res()));
    file.close();
}

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

/** Completes a simulated battle, returning the winner if any. */
export async function startPSBattle(options: GameOptions):
    Promise<PlayerID | undefined>
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

    let winner: PlayerID | undefined;
    for (const id of ["p1", "p2"] as PlayerID[])
    {
        const innerLog = logger.addPrefix(`${id}: `);

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
        let eventHandlerCtor = PSEventHandler;
        if (id === "p1")
        {
            let turns = 0;
            eventHandlerCtor = class extends PSEventHandler
            {
                /** @override */
                protected handleTurn(event: TurnEvent,
                    it: Iter<AnyBattleEvent>): PSResult
                {
                    // also make sure the battle doesn't go too long
                    if (options.maxTurns && ++turns >= options.maxTurns)
                    {
                        done = true;
                    }
                    return super.handleTurn(event, it);
                }

                /** @override */
                protected handleGameOver(event: TieEvent | WinEvent,
                    it: Iter<AnyBattleEvent>): PSResult
                {
                    if (event.type === "win") winner = event.winner as PlayerID;
                    done = true;
                    return super.handleGameOver(event, it);
                }
            };
        }

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
                // should NEVER happen
                catch (e)
                {
                    innerLog.error(`${e}\n${(e as Error).stack}`);

                    let msg = "Fatal: startBattle() encountered an error.";
                    if (options.logPath)
                    {
                        await writeFile(options.logPath, buffer);
                        msg += ` Check ${options.logPath} for details.`;
                    }
                    else msg += ` Log buffer:\n${buffer}`;
                    throw new Error(msg);
                }
            }
            // signal to other event loop of game over
            done = true;
        }());
    }

    // wait for the game to finish
    await Promise.all(eventLoops);

    // write logs to the log file
    if (options.logPath) await writeFile(options.logPath, buffer);

    return winner;
}
