import * as fs from "fs";
import * as os from "os";
import * as path from "path";
// @ts-ignore
import s = require("../../../../pokemon-showdown/.sim-dist/battle-stream");
import { BattleAgent } from "../../../battle/agent/BattleAgent";
import { BattleDriver } from "../../../battle/driver/BattleDriver";
import { LogFunc, Logger } from "../../../Logger";
import { PlayerID } from "../../../psbot/helpers";
import { AnyBattleEvent, TieEvent, TurnEvent, WinEvent } from
    "../../../psbot/parser/BattleEvent";
import { Iter } from "../../../psbot/parser/Iter";
import { parsePSMessage } from "../../../psbot/parser/parsePSMessage";
import { PSBattle } from "../../../psbot/PSBattle";
import { PSEventHandler, PSResult } from "../../../psbot/PSEventHandler";
import { ensureDir } from "../../helpers/ensureDir";

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
    /** Override BattleDriver if needed. */
    readonly driverCtor?: typeof BattleDriver;
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
    // setup logfile
    let logPath: string;
    if (options.logPath)
    {
        await ensureDir(path.dirname(options.logPath));
        logPath = options.logPath
    }
    else
    {
        // create a temporary file so logs can still be recovered
        logPath = await fs.promises.mkdtemp(
            path.join(os.tmpdir(), "psbattle-"));
    }
    const file = fs.createWriteStream(logPath);

    // setup logger
    const logFunc: LogFunc = msg => file.write(msg);
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
        const driverCtor = options[id].driverCtor ?? BattleDriver;

        // setup one side of the battle
        const battle = new psBattleCtor(id, options[id].agent, sender,
            innerLog.addPrefix("PSBattle: "), driverCtor, eventHandlerCtor);
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
                    innerLog.error(e && e.stack || e);
                    throw new Error("startPSBattle() encountered an error. " +
                        `Check ${logPath} for details.`);
                }
            }
            // signal to other event loop of game over
            done = true;
        }());
    }

    // wait for the game to finish before closing the logfile
    await Promise.all(eventLoops)
        .finally(() => new Promise(res => file.end(res)));

    return winner;
}
