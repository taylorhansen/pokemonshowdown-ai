import { expect } from "chai";
import "mocha";
import { MessageArgs, Prefix, SwitchArgs, UpdateChallengesArgs } from
    "../../src/AnyMessageListener";
import { MajorStatus, PlayerID, PokemonID, PokemonStatus, RoomType,
    stringifyDetails, stringifyID, stringifyRequest, stringifyStatus } from
    "../../src/messageData";
import { MessageParser } from "../../src/parser/MessageParser";
import { requestTestArgs } from "../RequestTestArgs";

// TODO: generalize test case patterns
describe("MessageParser", function()
{
    let parser: MessageParser;

    beforeEach("Initialize MessageParser", function()
    {
        parser = new MessageParser();
    });

    it("Should handle multiple messages", function()
    {
        let count = 2;
        parser.on("", "challstr", () => --count).on("", "init", () => --count)
            .parse("|challstr|1234\n|init|battle");
        expect(count).to.equal(0);
    });

    describe("Room name", function()
    {
        const room = "myroomname";

        it("Should handle empty string", function()
        {
            parser.parse("");
            expect(parser.room).to.equal("");
        });

        it("Should parse room name without messages", function()
        {
            parser.parse(`>${room}`);
            expect(parser.room).to.equal(room);
        });

        it("Should parse room name with messages", function()
        {
            parser.parse(`>${room}\n|init|battle`);
            expect(parser.room).to.equal(room);
        });

        it("Should handle unfamiliar rooms", function(done)
        {
            parser.on(null, "init", () =>
            {
                done();
            })
            .parse(">some-random-room\n|init|chat");
        });
    });

    describe("Message types", function()
    {
        /**
         * Creates a server message.
         * @param prefix Message prefix.
         * @param argStrs String arguments for the message.
         * @returns A composed message.
         */
        function composeMessage(prefix: Prefix, argStrs: string[]): string
        {
            return `|${prefix}\
${argStrs.length > 0 ? `|${argStrs.join("|")}` : ""}`;
        }

        /**
         * Adds a test case that should be correctly parsed.
         * @param prefix Message prefix.
         * @param argStrs String arguments.
         * @param givenArgs Expected message handler arguments.
         */
        function shouldParse<P extends Prefix>(prefix: P, argStrs: string[],
            givenArgs: MessageArgs<P>): void
        {
            it(`Should parse ${prefix}`, function(done)
            {
                parser.on("", prefix, args =>
                {
                    expect(args).to.deep.equal(givenArgs);
                    done();
                })
                .parse(composeMessage(prefix, argStrs));
            });
        }

        /**
         * Adds a test case that should not be correctly parsed.
         * @param prefix Message prefix.
         * @param argStrs String arguments.
         */
        function shouldntParse(prefix: Prefix, argStrs: string[]): void
        {
            it(`Should not parse ${prefix}`, function()
            {
                parser.on("", prefix, (...args: any[]) =>
                {
                    throw new Error(`Parsed an invalid ${prefix}`);
                })
                .parse(composeMessage(prefix, argStrs));
            });
        }

        for (const prefix of ["-curestatus", "-status"] as
                ("-curestatus" | "-status")[])
        {
            describe(prefix, function()
            {
                const id: PokemonID =
                    {owner: "p1", position: "a", nickname: "nou"};
                const condition: MajorStatus = "psn";
                shouldParse(prefix, [stringifyID(id), condition],
                    {id, condition});
            });
        }

        describe("-cureteam", function()
        {
            const id: PokemonID = {owner: "p1", position: "a", nickname: "nou"};
            shouldParse("-cureteam", [stringifyID(id)], {id});
        });

        for (const prefix of ["-damage", "-heal"] as ("-damage" | "-heal")[])
        {
            describe(prefix, function()
            {
                const id: PokemonID =
                    {owner: "p1", position: "a", nickname: "nou"};
                const status: PokemonStatus =
                    {hp: 100, hpMax: 100, condition: "psn"};
                shouldParse(prefix, [stringifyID(id), stringifyStatus(status)],
                    {id, status});
            });
        }

        describe("challstr", function()
        {
            const challstr = "4|12352361236737sdagwflk";
            shouldParse("challstr", [challstr], {challstr});
        });

        describe("error", function()
        {
            const reason = "because i said so";
            shouldParse("error", [reason], {reason});
        });

        describe("faint", function()
        {
            const id: PokemonID = {owner: "p1", position: "a", nickname: "hi"};
            shouldParse("faint", [stringifyID(id)], {id});
            shouldntParse("faint", []);
        });

        describe("init", function()
        {
            const initTypes: RoomType[] = ["chat", "battle"];
            for (const type of initTypes)
            {
                shouldParse("init", [type], {type});
            }
            shouldntParse("init", []);
        });

        describe("move", function()
        {
            const id: PokemonID = {owner: "p1", position: "a", nickname: "hi"};
            const move = "Splash";
            const target: PokemonID =
                {owner: "p2", position: "a", nickname: "nou"};
            const effects = ["", "lockedmove"];
            const missed = true;

            for (const effect of effects)
            {
                const argStrs = [stringifyID(id), move, stringifyID(target)];
                if (effect) argStrs.push(`[from]${effect}`);
                if (missed) argStrs.push("[miss]");
                shouldParse("move", argStrs,
                    {id, move, target, effect, missed});
            }
        });

        describe("player", function()
        {
            const ids: PlayerID[] = ["p1", "p2"];
            const username = "somebody";
            const avatarId = 100;
            for (const id of ids)
            {
                shouldParse("player", [id, username, avatarId.toString()],
                    {id, username, avatarId});
            }

            shouldntParse("player", ["", username, avatarId.toString()]);
            shouldntParse("player", ["p1", "", avatarId.toString()]);
            shouldntParse("player", ["p1", username, ""]);
        });

        describe("request", function()
        {
            const args = requestTestArgs[0];
            shouldParse("request", [stringifyRequest(args)], args);
            shouldntParse("request", []);
        });

        describe("switch", function()
        {
            // expected value when the corresponding switchInfo is parsed
            const switchData: SwitchArgs[] =
            [
                {
                    id: {owner: "p1", position: "a", nickname: "Lucky"},
                    details:
                    {
                        species: "Magikarp", shiny: true, gender: "M",
                        level: 100
                    },
                    status: {hp: 65, hpMax: 200, condition: "par"}
                },
                {
                    id: {owner: "p2", position: "b", nickname: "Rage"},
                    details:
                    {
                        species: "Gyarados", shiny: false, gender: "F",
                        level: 50
                    },
                    status: {hp: 1, hpMax: 1, condition: ""}
                },
                {
                    id: {owner: "p1", position: "c", nickname: "Mew2"},
                    details:
                    {
                        species: "Mewtwo", shiny: false, gender: null,
                        level: 100
                    },
                    status: {hp: 100, hpMax: 100, condition: "slp"}
                }
            ];
            // contains the indexes of each switch parameter
            const infoNames: {[T in keyof SwitchArgs]: number} =
                {id: 0, details: 1, status: 2};

            // switch args in string form
            const switchStrs = switchData.map(args =>
            [
                stringifyID(args.id),
                stringifyDetails(args.details),
                stringifyStatus(args.status)
            ]);

            let i: number;
            // try parsing with each set of switch info
            for (i = 0; i < switchData.length; ++i)
            {
                shouldParse("switch", switchStrs[i].slice(0), switchData[i]);
            }

            // only need to test sabotage values for one set each
            i = 0;
            for (const infoName in infoNames)
            {
                if (!infoNames.hasOwnProperty(infoName)) continue;

                // if any one of PokemonID, PokemonDetails, or
                //  PokemonStatus are omitted or invalid, the entire
                //  message shouldn't be parsed
                switchStrs[i][infoNames[infoName as keyof SwitchArgs]] = "";
                shouldntParse("switch", switchStrs[i]);
                ++i;
            }
        });

        describe("teamsize", function()
        {
            const playerIds: PlayerID[] = ["p1", "p2"];
            const size = 1;
            for (const id of playerIds)
            {
                shouldParse("teamsize", [id, size.toString()], {id, size});
            }
            shouldntParse("teamsize", ["", size.toString()]);
            shouldntParse("teamsize", [playerIds[0], ""]);
        });

        describe("turn", function()
        {
            const turn = 1;
            shouldParse("turn", [turn.toString()], {turn});
        });

        describe("updatechallenges", function()
        {
            const args: UpdateChallengesArgs =
                {challengesFrom: {somebody: "gen4ou"}, challengeTo: {}};
            shouldParse("updatechallenges", [JSON.stringify(args)], args);
        });

        describe("updateuser", function()
        {
            const username = "somebody";
            const guest = 0;
            // required by the message type but not by message handler
            const avatar = 21;
            shouldParse("updateuser",
                [username, guest.toString(), avatar.toString()],
                {username, isGuest: !guest});
            shouldntParse("updateuser", []);
            shouldntParse("updateuser", [username]);
        });

        describe("upkeep", function()
        {
            shouldParse("upkeep", [], {});
        });
    });
});
