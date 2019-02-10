/* istanbul ignore file */
import { client as WebSocketClient } from "websocket";
import { DefaultNetwork } from "./bot/battle/Network";
import { Bot } from "./bot/Bot";
import { MessageParser } from "./bot/parser/MessageParser";
import { Logger } from "./Logger";

const ws = new WebSocketClient();
ws.on("connect", connection =>
{
    const logger = Logger.stdout;
    logger.debug("connected");

    const parser = new MessageParser(logger);
    function send(response: string): void
    {
        connection.sendUTF(response);
        logger.debug(`sent: ${response}`);
    }

    const bot = new Bot(parser, send, logger);
    bot.addFormat("gen4randombattle", DefaultNetwork);

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
            parser.parse(unparsedPacket.utf8Data)
                .catch(reason => logger.error(reason));
        }
    });
});
ws.connect("ws://localhost:8000/showdown/websocket");
