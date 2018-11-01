/** @file Trains the Network AI against itself. */
import { Network } from "../src/bot/battle/Network";
import * as logger from "../src/bot/logger";
import { PlayerID } from "../src/bot/messageData";
import { MessageParser } from "../src/bot/parser/MessageParser";
// @ts-ignore
import s = require("./Pokemon-Showdown/sim/battle-stream");

const streams = s.getPlayerStreams(new s.BattleStream());
streams.omniscient.write(`>start {"formatid":"gen4randombattle"}`);

for (const id of ["p1", "p2"] as PlayerID[])
{
    // setup each player
    const parser = new MessageParser();
    const listener = parser.getListener("");
    const ai = new Network(id, listener,
            /*sender*/ choice => streams[id].write(choice));
    ai.saveAlways = false;
    streams.omniscient.write(`>player ${id} {"name":"${id}"}`);

    // parser event loop
    const stream = streams[id];
    (async () =>
    {
        let output;
        while (output = await stream.read())
        {
            logger.debug(`${id} received:\n${output}`);
            parser.parse(output);
            // await keypress();
        }
    })();
}

/** Waits for a keypress to continue. */
async function keypress(): Promise<void>
{
    return new Promise<void>(resolve => process.stdin.once("data", resolve));
}
