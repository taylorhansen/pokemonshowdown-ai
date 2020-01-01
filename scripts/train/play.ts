import * as tf from "@tensorflow/tfjs-node";
import * as fs from "fs";
import { dirname } from "path";
// @ts-ignore
import s = require("../../pokemon-showdown/.sim-dist/battle-stream");
import { Logger } from "../../src/Logger";
import { PlayerID } from "../../src/psbot/helpers";
import { parsePSMessage } from "../../src/psbot/parser/parsePSMessage";
import { Experience } from "./battle/Experience";
import { TrainNetwork } from "./battle/TrainNetwork";
import { TrainPSBattle } from "./battle/TrainPSBattle";
import { ensureDir } from "./ensureDir";

/** Models to represent p1 and p2. */
type Models = {readonly [P in PlayerID]: tf.LayersModel};

export interface GameOptions extends Models
{
    /** Maximum amount of turns before the game is considered a tie. */
    readonly maxTurns: number;
    /**
     * Whether to emit Experience objects, which will be used for learning
     * later.
     */
    readonly emitExperiences?: boolean;
    /** Path to the file in which to store debug info. */
    readonly logPath?: string;
    /** Logger object. */
    readonly logger?: Logger;
}

/** Result object returned from `play()`. */
export interface GameResult
{
    /**
     * Paths to emitted Experience objects. Empty if
     * `GameOptions#emitExperiences` was false.
     */
    experiences: Experience[];
    /** The winner of the game. Null if tied. */
    winner: PlayerID | null;
}

/**
 * Starts a game between two neural networks, returning the winner and the
 * generated Experience objects.
 */
export async function play(options: GameOptions): Promise<GameResult>
{
    const logger = options.logger || Logger.null;

    const streams = s.getPlayerStreams(new s.BattleStream());
    streams.omniscient.write(`>start {"formatid":"gen4randombattle"}`);

    let winner: PlayerID | null = null;
    const eventLoops: Promise<void>[] = [];
    const experiences: Experience[] = [];

    // setup log file
    let file: fs.WriteStream | null;
    if (options.logPath)
    {
        await ensureDir(dirname(options.logPath));
        file = fs.createWriteStream(options.logPath);
    }
    else file = null;

    let done = false;

    for (const id of ["p1", "p2"] as PlayerID[])
    {
        const innerLog =
            (file ? logger.pipeDebug(msg => file?.write(msg)) : logger)
            .addPrefix(`Play(${id}): `);

        const agent = new TrainNetwork(options[id],
            innerLog.addPrefix("Network: "));

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

        const battle = new TrainPSBattle(id, agent, sender,
            innerLog.addPrefix("PSBattle: "));
        streams.omniscient.write(`>player ${id} {"name":"${id}"}`);

        // only need one player to track these
        if (id === "p1")
        {
            battle.eventHandler.onTurn(function(num: number)
            {
                if (num >= options.maxTurns) done = true;
            });
            battle.eventHandler.onGameOver(function(w?: string)
            {
                // since the usernames passed into the Network
                //  constructors are the same was their PlayerID, we can
                //  safely typecast the username
                winner = w as PlayerID;
                done = true;
            });
        }

        // start parser event loop
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

            done = true;
            if (options.emitExperiences)
            {
                experiences.push(...battle.experiences);
            }
        }());
    }

    await Promise.all(eventLoops);

    if (file) file.close();

    return {experiences, winner};
}
