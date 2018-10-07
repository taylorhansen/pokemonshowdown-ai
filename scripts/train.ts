/** @file Trains the Network AI against itself. */
import { Choice } from "../src/bot/battle/ai/Choice";
import { Network } from "../src/bot/battle/ai/Network";
import { Battle, ChoiceSender } from "../src/bot/battle/Battle";
import { Bot } from "../src/bot/Bot";
import * as logger from "../src/logger";
import { PlayerID } from "../src/messageData";
import { MessageParser } from "../src/parser/MessageParser";
import { Parser } from "../src/parser/Parser";
// @ts-ignore
import Sim = require("./Pokemon-Showdown/sim");

// main event loop
const stream = new Sim.BattleStream();
(async function()
{
    let output: string;
    while (output = await stream.read())
    {
        console.log(`received: ${output}`);
        parse(output);
        // await keypress();
    }
})();

/** Waits for a keypress to continue. */
async function keypress(): Promise<void>
{
    return new Promise<void>(resolve =>
    {
        process.stdin.once("data", resolve);
    });
}

/**
 * Writes a response to the stream.
 * @param response Response to send.
 */
function writeStream(response: string): void
{
    console.log(`sent: ${response}`);
    stream.write(response);
}

/**
 * Creates a function that sends the AI's response to the battle stream.
 * @param playerId ID of the player sending the messages.
 * @returns Function that sends responses to the battle stream.
 */
function createChoiceSender(playerId: PlayerID): ChoiceSender
{
    return function(choice: Choice)
    {
        writeStream(`>${playerId} ${choice}`);
    };
}

/** Player data. */
interface Player
{
    /** Player ID and username for the battle. */
    id: PlayerID;
    /** Battle AI manager. */
    battle: Battle;
    /** Message parser. */
    parser: Parser;
}

/**
 * Initializes a Player object.
 * @param id ID of the player sending the messages.
 * @returns A Player object.
 */
function initPlayer(id: PlayerID): Player
{
    const parser = new MessageParser();
    const listener = parser.getListener("");
    const battle = new Battle(Network, id, /*saveAlways*/ false, listener,
        createChoiceSender(id));
    writeStream(`>player ${id} {"name":"${id}"}`);
    return {id, battle, parser};
}

writeStream(`>start {"formatid":"${Bot.format}"}`);
const players: {[ID in PlayerID]: Player} =
    {p1: initPlayer("p1"), p2: initPlayer("p2")};

/**
 * Parses messages from the BattleStream.
 * @param data Message string data.
 */
function parse(data: string): void
{
    const lines = data.split("\n");
    const [command] = data.split("\n", 1);
    switch (command)
    {
        case "update":
        {
            parseUpdate(lines);
            break;
        }
        case "sideupdate":
        {
            // send messages exclusively to this player
            const id = lines[1] as PlayerID;
            players[id].parser.parse(lines.slice(2).join("\n"));
            break;
        }
        case "end":
        {
            // json logdata
            const logData = JSON.parse(lines[1]);
            break;
        }
    }
}

/**
 * Parses an `update` stream message.
 * @param lines Messages that need to be parsed.
 */
function parseUpdate(lines: string[]): void
{
    for (let i = 1; i < lines.length; ++i)
    {
        const line = lines[i];
        if (line === "|split")
        {
            // different versions of the message are sent to different observers
            // 1st: spectator, 2nd: p1, 3rd: p2, 4th: omniscient
            players.p1.parser.parse(lines[i + 2]);
            players.p2.parser.parse(lines[i + 3]);
            i += 4;
        }
        else
        {
            // both players parse the message like normal
            (Object.keys(players) as PlayerID[]).forEach(
                id => players[id].parser.parse(line));
        }
    }
}
