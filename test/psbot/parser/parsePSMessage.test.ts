import { expect } from "chai";
import "mocha";
import { Logger } from "../../../src/Logger";
import { RoomType } from "../../../src/psbot/helpers";
import { parsePSMessage } from "../../../src/psbot/parser/parsePSMessage";
import * as psmsg from "../../../src/psbot/parser/PSMessage";
import * as testArgs from "../../helpers/battleTestArgs";
import { buildPSMessage, composeBattleInit, composeBattleProgress,
    stringifyRequest } from "../../helpers/buildMessage";

describe("parsePSMessage()", function()
{
    it("Should handle empty string", function()
    {
        expect(() => parsePSMessage("")).to.not.throw();
    });

    it("Should skip unsupported message types", function()
    {
        expect(() => parsePSMessage("|what")).to.not.throw();
    });

    it("Should handle multiple messages", function()
    {
        const {room, messages} = parsePSMessage("|challstr|1234\n|init|battle");
        expect(room).to.be.empty;
        expect(messages).to.have.lengthOf(2);
    });

    describe("Room name", function()
    {
        it("Should parse room name with message", function()
        {
            const roomName = "someroom";
            const {room} = parsePSMessage(`>${roomName}\n|init|battle`);
            expect(room).to.equal(roomName);
        });

        it("Should infer empty room", function()
        {
            const {room} = parsePSMessage(`|init|battle`);
            expect(room).to.be.empty;
        });
    });

    describe("Message types", function()
    {
        /**
         * Parses a message given the unparsed words.
         * @param words Words to compose the message.
         * @param quiet Whether to suppress Logger. Default false.
         * @returns The result of `parsePSMessage()`.
         */
        function parseWords(words: string[][], quiet = false)
        {
            return parsePSMessage(buildPSMessage(words),
                quiet ? Logger.null : Logger.stderr);
        }

        /**
         * Asserts that a message should be correctly parsed.
         * @param words String arguments for the message.
         * @param expected Message objects that the parser should return.
         * @param quiet Whether to suppress Logger. Default false.
         */
        function shouldParse(words: string[][], expected: psmsg.Any[],
            quiet?: boolean): void
        {
            const {messages: actual} = parseWords(words, quiet);
            expect(actual).to.deep.equal(expected);
        }

        /**
         * Asserts that the parser should return null if presented with the
         * given message data.
         * @param words String arguments for the message.
         * @param quiet Whether to suppress Logger. Default true.
         */
        function shouldntParse(words: string[][], quiet = true): void
        {
            const {messages} = parseWords(words, quiet);
            for (const msg of messages) expect(msg).to.be.null;
        }

        describe("battleInit", function()
        {
            for (let i = 0; i < testArgs.battleInit.length; ++i)
            {
                const args = testArgs.battleInit[i];
                it(`Should parse battleInit ${i}`, function()
                {
                    shouldParse(composeBattleInit(args), [args]);
                });
            }

            it("Should not include unsupported events", function()
            {
                const words =
                [
                    ["player", "p2", "someuser"], ["teamsize", "p1", "6"],
                    ["teamsize", "p2", "6"], ["gametype", "singles"],
                    ["gen", "4"], ["lol"]
                ];
                const {messages} = parseWords(words, /*quiet*/true);
                expect(messages[0].type).to.equal("battleInit");
                expect((messages[0] as psmsg.BattleInit).events).to.be.empty;
            });

            it("Should ignore invalid battleInit", function()
            {
                const words =
                [
                    ["player", "p2", "someuser"], ["lol", "p1", "6"],
                    ["teamsize", "p2", "6"], ["gametype", "singles"],
                    ["gen", "4"]
                ];
                const {messages} = parseWords(words, /*quiet*/true);
                expect(messages).to.be.empty;
            });
        });

        describe("battleProgress", function()
        {
            for (let i = 0; i < testArgs.battleProgress.length; ++i)
            {
                const args = testArgs.battleProgress[i];
                it(`Should parse battleProgress ${i}`, function()
                {
                    shouldParse(composeBattleProgress(args), [args]);
                });
            }

            it("Should ignore unexpected message types", async function()
            {
                const expected = testArgs.battleProgress[0];
                const words = [...composeBattleProgress(expected), ["lol"]];
                shouldParse(words, [expected]);
            });

            it("Should not include invalid events", async function()
            {
                const words = [["move"]];
                const {messages} = parseWords(words, /*quiet*/true);
                expect(messages[0].type).to.equal("battleProgress");
                expect((messages[0] as psmsg.BattleProgress).events.length)
                    .to.equal(0);
            });
        });

        describe("challstr", function()
        {
            it("Should parse challstr", function()
            {
                const challstr = "4|12352361236737sdagwflk";
                shouldParse([["challstr", challstr]],
                    [{type: "challstr", challstr}]);
            });
        });

        describe("deinit", function()
        {
            it("Should parse deinit", function()
            {
                shouldParse([["deinit"]], [{type: "deinit"}]);
            });
        });

        describe("error", function()
        {
            it("Should parse error", function()
            {
                const reason = "because i said so";
                shouldParse([["error", reason]], [{type: "error", reason}]);
            });
        });

        describe("init", function()
        {
            const roomTypes: RoomType[] = ["chat", "battle"];
            for (const roomType of roomTypes)
            {
                it(`Should parse init with roomType=${roomType}`, function()
                {
                    shouldParse([["init", roomType]],
                        [{type: "init", roomType}]);
                });
            }

            it("Shouldn't parse init without room type", function()
            {
                shouldntParse([["init"]]);
            });

            it("Shouldn't parse init with invalid room type", function()
            {
                shouldntParse([["init", "x"]]);
            });
        });

        describe("request", function()
        {
            for (let i = 0; i < testArgs.request.length; ++i)
            {
                const args = testArgs.request[i];
                it(`Should parse request ${i}`, function()
                {
                    shouldParse([["request", stringifyRequest(args)]], [args]);
                });
            }

            it("Shouldn't parse request without json", function()
            {
                shouldntParse([["request"]]);
            });
        });

        describe("updateChallenges", function()
        {
            const expected: psmsg.UpdateChallenges =
            {
                type: "updateChallenges", challengesFrom: {somebody: "gen4ou"},
                challengeTo: null
            };
            const json = {...expected};
            delete json.type;

            it("Should parse updateChallenges", function()
            {
                shouldParse([["updatechallenges", JSON.stringify(json)]],
                    [expected]);
            });

            it("Shouldn't parse updateChallenges without json", function()
            {
                shouldntParse([["updatechallenges"]]);
            });
        });

        describe("updateUser", function()
        {
            const username = "somebody";
            const guest = 0;
            // required by the message type but not by message handler
            const avatar = 21;

            it("Should parse updateUser", function()
            {
                shouldParse(
                    [
                        [
                            "updateuser", username, guest.toString(),
                            avatar.toString()
                        ]
                    ],
                    [{type: "updateUser", username, isGuest: !guest}]);
            });

            it("Shouldn't parse updateUser if no args", function()
            {
                shouldntParse([["updateuser"]]);
            });

            it("Shouldn't parse updateUser if no guest indicator", function()
            {
                shouldntParse([["updateuser", username]]);
            });
        });
    });
});
