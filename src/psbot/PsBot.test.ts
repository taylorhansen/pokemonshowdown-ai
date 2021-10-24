import { expect } from "chai";
import "mocha";
import { IUtf8Message } from "websocket";
import { PsBot } from "../../src/psbot/PsBot";
import { Logger } from "../Logger";
import { FakeRoomHandler } from "./FakeRoomHandler.test";
import { MockPsServer } from "./MockPsServer.test";

export const test = () => describe("PsBot", function()
{
    const username = "someuser";
    const password = "somepassword";
    const challstr = "some-challstr";
    const format = "gen4randombattle";
    const assertion = "someassertion";
    const port = 8000;
    const loginServer = `http://localhost:${port}/~~showdown/action.php`;
    const playServer = `ws://localhost:${port}/showdown/websocket`;

    let bot: PsBot;
    let server: MockPsServer;

    before("Initialize mock server", function()
    {
        server = new MockPsServer(assertion, port);
    });

    beforeEach("Initialize and connect PsBot", async function()
    {
        bot = new PsBot(Logger.null);
        await bot.connect(playServer);
        expect(server.isConnected).to.be.true;
    });

    afterEach("Disconnect PsBot from server", function()
    {
        server.disconnect();
    });

    after("Shutdown mock server", function()
    {
        server.shutdown();
    });

    describe("#acceptChallenges()", function()
    {
        beforeEach("Setup listener", function()
        {
            bot.acceptChallenges(format, () => new FakeRoomHandler());
        });

        it(`Should accept ${format} challenges`, async function()
        {
            server.sendToClient(`|updatechallenges|\
{"challengesFrom":{"${username}":"${format}"},"challengeTo":null}`);

            const msg = await server.nextMessage();
            expect(msg.type).to.equal("utf8");
            expect((msg as IUtf8Message).utf8Data)
                .to.equal(`|/accept ${username}`);
        });

        it(`Should not accept unsupported challenges`, async function()
        {
            server.sendToClient(`|updatechallenges|\
{"challengesFrom":{"${username}":"notarealformat"},"challengeTo":null}`);

            const msg = await server.nextMessage();
            expect(msg.type).to.equal("utf8");
            expect((msg as IUtf8Message).utf8Data)
                .to.equal(`|/reject ${username}`);
        });
    });

    describe("#setAvatar()", function()
    {
        it("Should set avatar", async function()
        {
            const avatar = 1;
            bot.setAvatar(avatar);
            const msg = await server.nextMessage();
            expect(msg.type).to.equal("utf8");
            expect((msg as IUtf8Message).utf8Data)
                .to.equal(`|/avatar ${avatar}`);
        });
    });

    describe("#login()", function()
    {
        it("Should login without password", async function()
        {
            server.username = username;
            server.password = undefined;
            const promise = bot.login({username, loginServer});
            server.sendToClient(`|challstr|${challstr}`);
            await promise;

            const msg = await server.nextMessage();
            expect(server.lastQuery).to.not.be.null;
            expect([...server.lastQuery!.entries()])
                .to.have.deep.members(
                [
                    ["act", "getassertion"],
                    ["userid", username],
                    ["challstr", challstr]
                ]);
            expect(msg.type).to.equal("utf8");
            expect((msg as IUtf8Message).utf8Data)
                .to.equal(`|/trn ${username},0,${assertion}`);
        });

        it("Should reject login without password if registered",
        async function()
        {
            server.username = username;
            server.password = password;
            const promise = bot.login({username, loginServer});
            server.sendToClient(`|challstr|${challstr}`);

            try { await promise; throw new Error("Login didn't reject"); }
            catch (e)
            {
                expect(e).to.be.instanceOf(Error)
                    .and.have.property("message",
                        `A password is required for user '${username}'`);
            }
        });

        it("Should login with password", async function()
        {
            server.username = username;
            server.password = password;
            const promise = bot.login({username, password, loginServer});
            server.sendToClient(`|challstr|${challstr}`);
            await promise;

            const msg = await server.nextMessage();
            expect(server.lastQuery).to.not.be.null;
            expect([...server.lastQuery!.entries()])
                .to.have.deep.members(
                [
                    ["act", "login"],
                    ["name", username],
                    ["pass", password],
                    ["challstr", challstr]
                ]);
            expect(msg.type).to.equal("utf8");
            expect((msg as IUtf8Message).utf8Data)
                .to.equal(`|/trn ${username},0,${assertion}`);
        });

        it("Should reject login with invalid password", async function()
        {
            server.username = username;
            server.password = password + "1";
            const promise = bot.login({username, password, loginServer});
            server.sendToClient(`|challstr|${challstr}`);

            try { await promise; throw new Error("Login didn't reject"); }
            catch (e)
            {
                expect(e).to.be.instanceOf(Error)
                    .and.have.property("message", "Invalid password");
            }
        });
    });
});
