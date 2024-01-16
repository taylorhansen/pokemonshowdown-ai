import {Protocol} from "@pkmn/protocol";
import {ID} from "@pkmn/types";
import {expect} from "chai";
import "mocha";
import {IUtf8Message} from "websocket";
import {Logger} from "../utils/logging/Logger";
import {Verbose} from "../utils/logging/Verbose";
import {FakeRoomHandler} from "./FakeRoomHandler.test";
import {MockPsServer} from "./MockPsServer.test";
import {PsBot} from "./PsBot";

export const test = () =>
    describe("PsBot", function () {
        const username = "someuser";
        const format = "gen4randombattle";
        const assertion = "someassertion";
        const port = 8000;
        const websocketRoute = `ws://localhost:${port}/`;

        let bot: PsBot;
        let server: MockPsServer;

        before("Initialize mock server", function () {
            server = new MockPsServer(assertion, port);
        });

        beforeEach("Initialize and connect PsBot", async function () {
            bot = new PsBot(new Logger(Logger.null, Verbose.None));
            await bot.connect(websocketRoute);
            expect(server.isConnected).to.be.true;
        });

        afterEach("Disconnect PsBot from server", function () {
            server.disconnect();
        });

        after("Shutdown mock server", function () {
            server.shutdown();
        });

        describe("#acceptChallenges()", function () {
            beforeEach("Setup listener", function () {
                bot.acceptChallenges(format, () => new FakeRoomHandler());
            });

            it(`Should accept ${format} challenges`, async function () {
                const challenges = {
                    challengesFrom: {[username as ID]: format},
                    challengeTo: null,
                } as Protocol.Challenges;
                server.sendToClient(
                    `|updatechallenges|${JSON.stringify(challenges)}`,
                );

                const msg = await server.nextMessage();
                expect(msg.type).to.equal("utf8");
                expect((msg as IUtf8Message).utf8Data).to.equal(
                    `|/accept ${username}`,
                );
            });

            it(`Should not accept unsupported challenges`, async function () {
                const challenges = {
                    challengesFrom: {[username as ID]: "notarealformat"},
                    challengeTo: null,
                } as Protocol.Challenges;
                server.sendToClient(
                    `|updatechallenges|${JSON.stringify(challenges)}`,
                );

                const msg = await server.nextMessage();
                expect(msg.type).to.equal("utf8");
                expect((msg as IUtf8Message).utf8Data).to.equal(
                    `|/reject ${username}`,
                );
            });
        });

        describe("#setAvatar()", function () {
            it("Should set avatar", async function () {
                const avatar = "supernerd";
                bot.setAvatar(avatar);
                const msg = await server.nextMessage();
                expect(msg.type).to.equal("utf8");
                expect((msg as IUtf8Message).utf8Data).to.equal(
                    `|/avatar ${avatar}`,
                );
            });
        });
    });
