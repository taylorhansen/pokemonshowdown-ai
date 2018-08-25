import { Bot } from "./bot/Bot";
import { Logger } from "./logger/Logger";
import { client as WebSocketClient } from "websocket";

const ws = new WebSocketClient();
ws.on("connect", connection =>
{
    Logger.debug("connected");
    const bot = new Bot((response: string) => connection.sendUTF(response));

    connection.on("error", error =>
    {
        Logger.error(error.toString());
    })
    .on("close", (code, reason) =>
    {
        Logger.debug(`closing ${code}, reason: ${reason}`);
    })
    .on("message", unparsedPacket =>
    {
        if (unparsedPacket.type === "utf8" && unparsedPacket.utf8Data)
        {
            Logger.debug(`received: ${unparsedPacket.utf8Data}`);
            bot.consumePacket(unparsedPacket.utf8Data);
        }
    });
});
ws.connect("ws://sim.smogon.com:8000/showdown/websocket");
