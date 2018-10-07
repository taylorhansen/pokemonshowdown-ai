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

const stream = new Sim.BattleStream();
(async function()
{
    let output;
    while (output = await stream.read())
    {
        logger.debug(`received: ${output}`);
    }
})();

/**
 * Creates a function that sends the AI's response to the battle stream.
 * @param playerId ID of the player sending the messages.
 * @returns Function that sends responses to the battle stream.
 */
function createChoiceSender(playerId: PlayerID): ChoiceSender
{
    return function(choice: Choice)
    {
        stream.write(`${playerId} ${choice}`);
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
    stream.write(`>player ${id} {"name":"${id}"}`);
    return {id, battle, parser};
}

stream.write(`>start {"formatid":"${Bot.format}"}`);
const player1 = initPlayer("p1");
const player2 = initPlayer("p2");
