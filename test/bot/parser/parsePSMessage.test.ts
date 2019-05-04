import { expect } from "chai";
import "mocha";
import { Callback } from "../../../src/bot/dispatcher/CallbackDispatcher";
import { Message, MessageType, UpdateChallengesMessage } from
    "../../../src/bot/dispatcher/Message";
import { MessageDispatchArgs, MessageListener } from
    "../../../src/bot/dispatcher/MessageListener";
import { RoomType } from "../../../src/bot/helpers";
import { parsePSMessage } from "../../../src/bot/parser/parsePSMessage";
import { Logger } from "../../../src/Logger";
import * as testArgs from "../../helpers/battleTestArgs";
import { buildMessage, composeBattleInit, composeBattleProgress,
    stringifyRequest } from "../../helpers/buildMessage";

describe("parsePSMessage()", function()
{
    let listener: MessageListener;
    const parse = (data: string) => parsePSMessage(data, listener, Logger.null);

    beforeEach("Initialize MessageListener", function()
    {
        listener = new MessageListener();
    });

    it("Should handle empty string", function()
    {
        // shouldn't throw
        return parse("");
    });

    it("Should handle multiple messages", async function()
    {
        let count = 2;
        listener.on("challstr", () => { --count; })
            .on("init", () => { --count; });
        await parse("|challstr|1234\n|init|battle");
        expect(count).to.equal(0);
    });

    describe("Room name", function()
    {
        it("Should parse room name with message", function(done)
        {
            const roomName = "someroom";
            listener.on("init", (msg, room) =>
            {
                expect(room).to.equal(roomName);
                done();
            });
            parse(`>${roomName}\n|init|battle`);
        });
    });

    describe("Message types", function()
    {
        /**
         * Parses a message given the unparsed words and the handler it should
         * invoke.
         * @param type Message type.
         * @param words Words to compose the message.
         * @param handler Message handler that can be invoked.
         * @returns A promise that resolves once the listener is executed.
         */
        function parseWords<T extends MessageType>(type: T, words: string[][],
            handler: Callback<MessageDispatchArgs[T]>): Promise<void>
        {
            listener.on(type, handler);
            return parse(buildMessage(words));
        }

        /**
         * Adds a test case that should be correctly parsed.
         * @param type Message type.
         * @param words String arguments for the message.
         * @param givenArgs Expected message handler arguments.
         */
        function shouldParse<T extends MessageType>(type: T,
            words: string[][], givenArgs: Message<T>): void
        {
            it(`Should parse ${type}`, function(done)
            {
                return parseWords(type, words, (msg, room) =>
                {
                    expect(givenArgs).to.deep.equal(msg);
                    done();
                });
            });
        }

        /**
         * Adds a test case that should not be parsed and should be ignored by
         * the parser.
         * @param type Message type.
         * @param words String arguments for the message.
         */
        function shouldntParse(type: MessageType, words: string[][]): void
        {
            it(`Should not parse ${type}`, function()
            {
                return parseWords(type, words, () =>
                {
                    throw new Error(`Parsed an invalid ${type}! Message:
${buildMessage(words)}`);
                });
            });
        }

        describe("battleinit", function()
        {
            for (const args of testArgs.battleInit)
            {
                shouldParse("battleinit", composeBattleInit(args), args);
            }

            it("Should ignore unexpected message types", function()
            {
                const givenArgs = testArgs.battleInit[0];
                const words = [...composeBattleInit(givenArgs), ["lol"]];
                return parseWords("battleinit", words, args =>
                {
                    expect(args).to.deep.equal(givenArgs);
                });
            });

            it("Should not include invalid events", function()
            {
                const words =
                [
                    ["player", "p2", "someuser"], ["teamsize", "p1", "6"],
                    ["teamsize", "p2", "6"], ["gametype", "singles"],
                    ["gen", "4"], ["switch"]
                ];
                return parseWords("battleinit", words, args =>
                {
                    expect(args.events.length).to.equal(0);
                });
            });
        });

        describe("battleprogress", function()
        {
            for (const args of testArgs.battleProgress)
            {
                shouldParse("battleprogress", composeBattleProgress(args),
                    args);
            }

            it("Should ignore unexpected message types", async function()
            {
                const givenArgs = testArgs.battleProgress[0];
                const words = [...composeBattleProgress(givenArgs), ["lol"]];
                await parseWords("battleprogress", words, args =>
                {
                    expect(givenArgs).to.deep.equal(args);
                });
            });

            it("Should not include invalid events", async function()
            {
                const words = [["move"]];
                await parseWords("battleprogress", words, args =>
                {
                    expect(args.events.length).to.equal(0);
                });
            });
        });

        describe("challstr", function()
        {
            const challstr = "4|12352361236737sdagwflk";
            shouldParse("challstr", [["challstr", challstr]], {challstr});
        });

        describe("deinit", function()
        {
            shouldParse("deinit", [["deinit"]], {});
        });

        describe("error", function()
        {
            const reason = "because i said so";
            shouldParse("error", [["error", reason]], {reason});
        });

        describe("init", function()
        {
            const initTypes: RoomType[] = ["chat", "battle"];
            for (const type of initTypes)
            {
                shouldParse("init", [["init", type]], {type});
            }
            shouldntParse("init", [["init"]]);
        });

        describe("request", function()
        {
            for (const args of testArgs.request)
            {
                shouldParse("request", [["request", stringifyRequest(args)]],
                    args);
            }
            shouldntParse("request", [["request"]]);
        });

        describe("updatechallenges", function()
        {
            const args: UpdateChallengesMessage =
                {challengesFrom: {somebody: "gen4ou"}, challengeTo: null};
            shouldParse("updatechallenges",
                [["updatechallenges", JSON.stringify(args)]], args);

            // in the actual server protocol, challengeTo can be null, which
            //  should be corrected to {} by the parser
            const serverArgs: any = {...args};
            serverArgs.challengeTo = null;
            shouldParse("updatechallenges",
                [["updatechallenges", JSON.stringify(serverArgs)]], args);

            shouldntParse("updatechallenges", [["updatechallenges"]]);
        });

        describe("updateuser", function()
        {
            const username = "somebody";
            const guest = 0;
            // required by the message type but not by message handler
            const avatar = 21;
            shouldParse("updateuser",
                [["updateuser", username, guest.toString(), avatar.toString()]],
                {username, isGuest: !guest});
            shouldntParse("updateuser", [["updateuser"]]);
            shouldntParse("updateuser", [["updateuser", username]]);
        });
    });
});
