/* istanbul ignore file */
import { client as WebSocketClient } from "websocket";
import { Bot } from "./bot/Bot";
import * as logger from "./logger";

const ws = new WebSocketClient();
ws.on("connect", connection =>
{
    logger.debug("connected");
    const bot = new Bot((response: string) => connection.sendUTF(response));

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
            bot.consumePacket(unparsedPacket.utf8Data);
        }
    });
});
ws.connect("ws://localhost:8000/showdown/websocket");
