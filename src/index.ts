import { Bot } from "./bot/Bot";
import { Logger } from "./logger/Logger";
import { client as WebSocketClient } from "websocket";

const ws = new WebSocketClient();
ws.on("connect", connection =>
{
    Logger.debug("connected");

    let bot = new Bot();

    connection.on("error", error =>
    {
        Logger.error(error.toString());
    });
    connection.on("close", (code, reason) =>
    {
        Logger.debug(`closing ${code}, reason: ${reason}`);
    });
    connection.on("message", unparsedPacket =>
    {
        if (unparsedPacket.type === "utf8" && unparsedPacket.utf8Data)
        {
            Logger.debug(`received: ${unparsedPacket.utf8Data}`);
            const responses = bot.consumePacket(unparsedPacket.utf8Data);

            if (responses.length)
            {
                Logger.debug(`sent: ${responses}`);
                responses.forEach(response => connection.sendUTF(response));
            }
        }
    });
});
ws.connect("ws://sim.smogon.com:8000/showdown/websocket");
