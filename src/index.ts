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
    connection.on("message", message =>
    {
        if (message.type === "utf8" && message.utf8Data)
        {
            Logger.debug(`received: ${message.utf8Data}`);
            const response = bot.consume(message.utf8Data);

            if (response)
            {
                Logger.debug(`sent: ${response}`);
                connection.sendUTF(response);
            }

            if (message.utf8Data.startsWith("|updatechallenges"))
            {
                connection.sendUTF(`|/useteam Magikarp||Focus Sash||bounce,flail,splash,tackle|Adamant|,252,,,4,252|||||`);
                connection.sendUTF("|/accept taylor108");
            }
        }
    });
});
ws.connect("ws://sim.smogon.com:8000/showdown/websocket");
