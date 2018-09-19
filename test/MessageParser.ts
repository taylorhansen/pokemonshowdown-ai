import { expect } from "chai";
import "mocha";
import { MajorStatusName } from "../src/bot/battle/state/Pokemon";
import { ChallengesFrom, PlayerID, PokemonDetails, PokemonID, PokemonStatus,
    RequestData, RoomType, stringifyDetails, stringifyID, stringifyRequest,
    stringifyStatus } from "../src/parser/MessageData";
import { Prefix } from "../src/parser/MessageListener";
import { MessageParser } from "../src/parser/MessageParser";

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
        function shouldParse(prefix: Prefix, argStrs: string[],
            givenArgs: any[]): void
        {
            it(`Should parse ${prefix}`, function(done)
            {
                parser.on("", prefix, (...args: any[]) =>
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

        for (const prefix of ["-curestatus", "-status"] as Prefix[])
        {
            describe(prefix, function()
            {
                const id: PokemonID =
                    {owner: "p1", position: "a", nickname: "nou"};
                const condition: MajorStatusName = "psn";
                shouldParse(prefix, [stringifyID(id), condition],
                    [id, condition]);
            });
        }

        describe("-cureteam", function()
        {
            const id: PokemonID = {owner: "p1", position: "a", nickname: "nou"};
            shouldParse("-cureteam", [stringifyID(id)], [id]);
        });

        for (const prefix of ["-damage", "-heal"] as Prefix[])
        {
            describe(prefix, function()
            {
                const id: PokemonID =
                    {owner: "p1", position: "a", nickname: "nou"};
                const status: PokemonStatus =
                    {hp: 100, hpMax: 100, condition: "psn"};
                shouldParse(prefix, [stringifyID(id), stringifyStatus(status)],
                    [id, status]);
            });
        }

        describe("challstr", function()
        {
            const challstr = "4|12352361236737sdagwflk";
            shouldParse("challstr", [challstr], [challstr]);
        });

        describe("error", function()
        {
            const reason = "because i said so";
            shouldParse("error", [reason], [reason]);
        });

        describe("faint", function()
        {
            const id: PokemonID = {owner: "p1", position: "a", nickname: "hi"};
            shouldParse("faint", [stringifyID(id)], [id]);
            shouldntParse("faint", []);
        });

        describe("init", function()
        {
            const initTypes: RoomType[] = ["chat", "battle"];
            for (const initType of initTypes)
            {
                shouldParse("init", [initType], [initType]);
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
                shouldParse("move", argStrs, [id, move, effect, missed]);
            }
        });

        describe("player", function()
        {
            const ids: PlayerID[] = ["p1", "p2"];
            const user = "somebody";
            const avatar = 100;
            for (const id of ids)
            {
                shouldParse("player", [id, user, avatar.toString()],
                    [id, user, avatar]);
            }

            shouldntParse("player", ["", user, avatar.toString()]);
            shouldntParse("player", ["p1", "", avatar.toString()]);
            shouldntParse("player", ["p1", user, ""]);
        });

        describe("request", function()
        {
            const request: RequestData =
            {
                active:
                [
                    {
                        moves:
                        [
                            {
                                move: "Splash", id: "splash", pp: 24,
                                maxpp: 24, target: "self", disabled: false
                            }
                        ]
                    }
                ],
                side:
                {
                    name: "somebody", id: "p1",
                    pokemon:
                    [
                        {
                            ident:
                            {
                                owner: "p1", position: "a", nickname: "hi"
                            },
                            details:
                            {
                                species: "Magikarp", shiny: true,
                                gender: "M", level: 50
                            },
                            condition:
                            {
                                hp: 100, hpMax: 100, condition: "par"
                            },
                            active: true,
                            stats: {atk: 1, def: 1, spa: 1, spd: 1, spe: 1},
                            moves: ["splash"], baseAbility: "swiftswim",
                            item: "choiceband", pokeball: "masterball"
                        },
                        {
                            ident:
                            {
                                owner: "p1", position: "a", nickname: "hi"
                            },
                            details:
                            {
                                species: "Mewtwo", shiny: false,
                                gender: null, level: 100
                            },
                            condition:
                            {
                                hp: 9001, hpMax: 9001, condition: ""
                            },
                            active: false,
                            stats: {atk: 1, def: 1, spa: 1, spd: 1, spe: 1},
                            moves: ["hyperbeam"], baseAbility: "pressure",
                            item: "choicespecs", pokeball: "nestball"
                        },
                        {
                            ident:
                            {
                                owner: "p1", position: "a",
                                nickname: "Pentagon"
                            },
                            details:
                            {
                                species: "Porygon", shiny: false,
                                gender: null, level: 100
                            },
                            condition:
                            {
                                hp: 0, hpMax: 0, condition: ""
                            },
                            active: false,
                            stats: {atk: 1, def: 1, spa: 1, spd: 1, spe: 1},
                            moves: ["tackle"], baseAbility: "trace",
                            item: "choicescarf", pokeball: "greatball"
                        }
                    ]
                },
                rqid: 10
            };
            shouldParse("request", [stringifyRequest(request)], [request]);

            shouldntParse("request", []);
        });

        describe("switch", function()
        {
            // expected value when the corresponding switchInfo is parsed
            const switchData: [PokemonID, PokemonDetails, PokemonStatus][] =
            [
                [
                    {owner: "p1", position: "a", nickname: "Lucky"},
                    {species: "Magikarp", shiny: true, gender: "M", level: 100},
                    {hp: 65, hpMax: 200, condition: "par"}
                ],
                [
                    {owner: "p2", position: "b", nickname: "Rage"},
                    {species: "Gyarados", shiny: false, gender: "F", level: 50},
                    {hp: 1, hpMax: 1, condition: ""}
                ],
                [
                    {owner: "p1", position: "c", nickname: "Mew2"},
                    {species: "Mewtwo", shiny: false, gender: null, level: 100},
                    {hp: 100, hpMax: 100, condition: "slp"}
                ]
            ];
            // contains the indexes of each switch parameter
            const infoNames: {[infoName: string]: number} =
                { id: 0, details: 1, status: 2 };
            // switch data in string form
            const switchStrs: string[][] = switchData.map(a =>
            [
                stringifyID(a[0]),
                stringifyDetails(a[1]),
                stringifyStatus(a[2])
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
                switchStrs[i][infoNames[infoName]] = "";
                shouldntParse("switch", switchStrs[i]);
                ++i;
            }
        });

        describe("teamsize", function()
        {
            const playerIds = ["p1", "p2"];
            const size = 1;
            for (const playerId of playerIds)
            {
                shouldParse("teamsize", [playerId, size.toString()],
                    [playerId, size]);
            }
            shouldntParse("teamsize", ["", size.toString()]);
            shouldntParse("teamsize", [playerIds[0], ""]);
        });

        describe("turn", function()
        {
            const turn = 1;
            shouldParse("turn", [turn.toString()], [turn]);
        });

        describe("updatechallenges", function()
        {
            const challengesFrom: ChallengesFrom = { somebody: "gen4ou" };
            shouldParse("updatechallenges",
                [`{"challengesFrom":${JSON.stringify(challengesFrom)}}`],
                [challengesFrom]);
        });

        describe("updateuser", function()
        {
            const username = "somebody";
            const guest = 0;
            // required by the message type but not by message handler
            const avatar = 21;
            shouldParse("updateuser",
                [username, guest.toString(), avatar.toString()],
                [username, !guest]);
            shouldntParse("updateuser", []);
            shouldntParse("updateuser", [username]);
        });

        describe("upkeep", function()
        {
            shouldParse("upkeep", [], []);
        });
    });
});
