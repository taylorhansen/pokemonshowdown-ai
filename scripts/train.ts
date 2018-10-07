/** @file Trains the battle AI. */
import { Network } from "../src/bot/battle/ai/Network";
import { Battle } from "../src/bot/battle/Battle";
import { Bot } from "../src/bot/Bot";
import { PlayerID } from "../src/messageData";
import { MessageParser } from "../src/parser/MessageParser";
import { Parser } from "../src/parser/Parser";
// @ts-ignore
import Sim = require("./Pokemon-Showdown/sim");

const stream = new Sim.BattleStream();
(async function()
{
    let output;
    while (output = await stream.read())
    {
        console.log(`received: ${output}`);
    }
})();

/**
 * Creates a function that sends responses to the battle stream.
 * @param playerId ID of the player
 * sending the messages.
 * @returns Function that sends responses to the battle stream.
 */
function responseSender(playerId: PlayerID): (...responses: string[]) => void
{
    return function(...responses: string[])
    {
        for (const response of responses)
        {
            stream.write(`${playerId} ${response}`);
        }
    };
}

/** Player data. */
interface Player
{
    /** Battle AI manager. */
    battle: Battle;
    /** Message parser. */
    parser: Parser;
}

/**
 * Initializes a Player object.
 * @param playerId ID of the player
 * sending the messages.
 * @returns A Player object.
 */
function initPlayer(playerId: PlayerID): Player
{
    const parser = new MessageParser();
    const listener = parser.getListener("");
    const battle = new Battle(Network, playerId, /*saveAlways*/ false, listener,
        responseSender(playerId));
    stream.write(`>player ${playerId} {"name":"${playerId}"}`);
    return {battle, parser};
}

stream.write(`>start {"formatid":"${Bot.format}"}`);
const player1 = initPlayer("p1");
const player2 = initPlayer("p2");
