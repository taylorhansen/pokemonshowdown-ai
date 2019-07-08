import { expect } from "chai";
import "mocha";
import { Logger } from "../../src/Logger";
import { PSBot } from "../../src/psbot/PSBot";
import { FakeRoomHandler } from "./FakeRoomHandler";
import { MockPSServer } from "./MockPSServer";

describe("PSBot", function()
{
    const username = "someuser";
    const password = "somepassword";
    const challstr = "some-challstr";
    const format = "gen4randombattle";
    const assertion = "someassertion";
    const port = 8000;
    const loginServer = `http://localhost:${port}/~~showdown/action.php`;
    const playServer = `ws://localhost:${port}/showdown/websocket`;

    let bot: PSBot;
    let server: MockPSServer;

    before("Initialize mock server", function()
    {
        server = new MockPSServer(assertion, port);
    });

    beforeEach("Initialize and connect PSBot", async function()
    {
        bot = new PSBot(Logger.null);
        await bot.connect(playServer);
        expect(server.isConnected).to.be.true;
    });

    afterEach("Disconnect PSBot from server", function()
    {
        server.disconnect();
    });

    after("Shutdown websocket server", function()
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
            expect(msg.utf8Data).to.equal(`|/accept ${username}`);
        });

        it(`Should not accept unsupported challenges`, async function()
        {
            server.sendToClient(`|updatechallenges|\
{"challengesFrom":{"${username}":"notarealformat"},"challengeTo":null}`);

            const msg = await server.nextMessage();
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
            const msg = await server.nextMessage();
            expect(msg.type).to.equal("utf8");
            expect(msg.utf8Data).to.equal(`|/avatar ${avatar}`);
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
            expect(server.lastQuery).to.deep.equal(
                {act: "getassertion", userid: username, challstr});
            expect(msg.type).to.equal("utf8");
            expect(msg.utf8Data).to.equal(`|/trn ${username},0,${assertion}`);
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
                        "A password is required for this account");
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
            expect(server.lastQuery).to.deep.equal(
                {act: "login", name: username, pass: password, challstr});
            expect(msg.type).to.equal("utf8");
            expect(msg.utf8Data).to.equal(`|/trn ${username},0,${assertion}`);
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
