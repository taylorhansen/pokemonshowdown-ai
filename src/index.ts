/* istanbul ignore file */
import { client as WebSocketClient } from "websocket";
import { Network } from "./bot/battle/Network";
import { Bot } from "./bot/Bot";
import * as logger from "./bot/logger";
import { MessageParser } from "./bot/parser/MessageParser";

const ws = new WebSocketClient();
ws.on("connect", connection =>
{
    logger.debug("connected");

    const parser = new MessageParser();
    function send(response: string): void { connection.sendUTF(response); }

    const bot = new Bot(parser, send);
    bot.addFormat("gen4randombattle", Network);

    connection.on("error", error =>
    {
        logger.error(error.toString());
    })
    .on("close", (code, reason) =>
    {
        logger.debug(`closing ${code}, reason: ${reason}`);
    })
    .on("message", unparsedPacket =>
    {
        if (unparsedPacket.type === "utf8" && unparsedPacket.utf8Data)
        {
            logger.debug(`received: ${unparsedPacket.utf8Data}`);
            parser.parse(unparsedPacket.utf8Data);
        }
    });
});
ws.connect("ws://localhost:8000/showdown/websocket");
