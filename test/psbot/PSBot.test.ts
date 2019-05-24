import { expect } from "chai";
import { createServer, Server } from "http";
import "mocha";
import { connection as WSConnection, IMessage, server as WSServer } from
    "websocket";
import { Logger } from "../../src/Logger";
import { PSBot } from "../../src/psbot/PSBot";
import { MockBattleAgent } from "../battle/agent/MockBattleAgent";

describe("PSBot", function()
{
    const username = "someuser";
    const format = "gen4randombattle";

    let bot: PSBot;
    let httpServer: Server;
    let server: WSServer;
    /** Current connection from server to client. */
    let connection: WSConnection;
    /** Promise to get the next message from the current connection. */
    let message: Promise<IMessage>;

    before("Initialize websocket server", function()
    {
        httpServer = createServer(function(req, res)
        {
            res.writeHead(404);
            res.end();
        });
        httpServer.listen(8000);

        server = new WSServer({httpServer});
        server.on("request", req =>
        {
            if (req.httpRequest.url === "/showdown/websocket")
            {
                connection = req.accept();
                message = new Promise(res => connection.on("message", res));
            }
        });
    });

    beforeEach("Initialize and connect PSBot", async function()
    {
        bot = new PSBot(Logger.null);
        await bot.connect("ws://localhost:8000/showdown/websocket");
        expect(connection).to.exist;
    });

    describe("updatechallenges", function()
    {
        beforeEach("Setup listener", function()
        {
            bot.acceptChallenges(format, new MockBattleAgent());
        });

        it(`Should accept ${format} challenges`, async function()
        {
            connection.sendUTF(`|updatechallenges|\
{"challengesFrom":{"${username}":"${format}"},"challengeTo":null}`);

            const msg = await message;
            expect(msg.type).to.equal("utf8");
            expect(msg.utf8Data).to.equal(`|/accept ${username}`);
        });

        it(`Should not accept unsupported challenges`, async function()
        {
            connection.sendUTF(`|updatechallenges|\
{"challengesFrom":{"${username}":"notarealformat"},"challengeTo":null}`);

            const msg = await message;
            expect(msg.type).to.equal("utf8");
            expect(msg.utf8Data).to.equal(`|/reject ${username}`);
        });
    });

    describe("#setAvatar()", function()
    {
        it("Should set avatar", async function()
        {
            const avatar = 1;
            bot.setAvatar(avatar);
            const msg = await message;
            expect(msg.type).to.equal("utf8");
            expect(msg.utf8Data).to.equal(`|/avatar ${avatar}`);
        });
    });

    afterEach("Disconnect PSBot from server", function()
    {
        connection.removeAllListeners();
        connection.close();
    });

    after("Shutdown websocket server", function()
    {
        httpServer.close();
        server.removeAllListeners();
        server.shutDown();
    });
});
