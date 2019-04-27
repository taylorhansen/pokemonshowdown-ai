import { expect } from "chai";
import { createServer, Server } from "http";
import "mocha";
import { connection as WSConnection, server as WSServer } from "websocket";
import { PSBot } from "../../src/bot/PSBot";
import { Logger } from "../../src/Logger";
import { MockBattleAgent } from "./MockBattleAgent";

describe("PSBot", function()
{
    const username = "someuser";
    const format = "gen4randombattle";

    let bot: PSBot;
    let httpServer: Server;
    let server: WSServer;
    // current connection from server to client
    let connection: WSConnection;

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
            }
        });
    });

    beforeEach("Initialize and connect PSBot", async function()
    {
        bot = new PSBot(Logger.null);
        await bot.connect("ws://localhost:8000/showdown/websocket");
        // tslint:disable-next-line:no-unused-expression
        expect(connection).to.exist;
    });

    describe("updatechallenges", function()
    {
        beforeEach("Setup listener", function()
        {
            bot.acceptChallenges(format, MockBattleAgent);
        });

        it(`Should accept ${format} challenges`, function(done)
        {
            connection.on("message", message =>
            {
                expect(message.type).to.equal("utf8");
                expect(message.utf8Data).to.equal(`|/accept ${username}`);
                done();
            });

            connection.sendUTF(`|updatechallenges|\
{"challengesFrom":{"${username}":"${format}"},"challengeTo":null}`);
        });

        it(`Should not accept unsupported challenges`, function(done)
        {
            connection.on("message", message =>
            {
                expect(message.type).to.equal("utf8");
                expect(message.utf8Data).to.equal(`|/reject ${username}`);
                done();
            });

            connection.sendUTF(`|updatechallenges|\
{"challengesFrom":{"${username}":"notarealformat"},"challengeTo":null}`);
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
