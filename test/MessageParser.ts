import { expect } from "chai";
import "mocha";
import { ChallengesFrom, PlayerID, PokemonDetails, PokemonID, PokemonStatus,
    RequestData, RoomType, stringifyRequest } from "../src/parser/MessageData";
import { MessageParser } from "../src/parser/MessageParser";

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
        describe("challstr", function()
        {
            it("Should parse challstr", function(done)
            {
                // not an actual challstr
                const givenChallstr = "4|12352361236737sdagwflk";
                parser.on("", "challstr", (challstr: string) =>
                {
                    expect(challstr).to.equal(givenChallstr);
                    done();
                })
                .parse(`|challstr|${givenChallstr}`);
            });
        });

        describe("error", function()
        {
            it("Should parse error", function(done)
            {
                const givenReason = "because i said so";
                parser.on("", "error", (reason: string) =>
                {
                    expect(reason).to.equal(givenReason);
                    done();
                })
                .parse(`|error|${givenReason}`);
            });
        });

        describe("init", function()
        {
            const initTypes: RoomType[] = ["chat", "battle"];
            for (const initType of initTypes)
            {
                it(`Should parse ${initType} init message`, function(done)
                {
                    parser.on("", "init", (type: RoomType) =>
                    {
                        expect(type).to.equal(initType);
                        done();
                    })
                    .parse(`|init|${initType}`);
                });
            }

            it("Should not parse empty init", function()
            {
                parser.on("", "init", () =>
                {
                    throw new Error("Parsed empty init");
                })
                .parse("|init|");
            });
        });

        describe("player", function()
        {
            const givenIds: PlayerID[] = ["p1", "p2"];
            const givenUser = "somebody";
            const givenAvatar = 100;
            for (const givenId of givenIds)
            {
                it(`Should parse player ${givenId}`, function(done)
                {
                    parser.on("", "player", (id: PlayerID, username: string,
                        avatarId: number) =>
                    {
                        expect(id).to.equal(givenId);
                        expect(username).to.equal(givenUser);
                        expect(avatarId).to.equal(givenAvatar);
                        done();
                    })
                    .parse(`|player|${givenId}|${givenUser}|${givenAvatar}`);
                });
            }

            // TODO: need more functions like this to reduce code duplication
            function shouldntParse(phrase: string, ...args: any[])
            {
                it(`Should not parse ${phrase}`, function()
                {
                    parser.on("", "player", () =>
                    {
                        throw new Error(`Parsed ${phrase}`);
                    })
                    .parse(`|player|${args.join("|")}`);
                });
            }
            shouldntParse("empty id", "", givenUser, givenAvatar);
            shouldntParse("empty user", "p1", "", givenAvatar);
            shouldntParse("empty avatar", "p1", givenUser, "");
        });

        describe("request", function()
        {
            it("Should not parse empty request", function()
            {
                parser.on("", "request", () =>
                {
                    throw new Error("Parsed empty request");
                })
                .parse("|request|");
            });

            it("Should parse request", function(done)
            {
                const givenData: RequestData =
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
                parser.on("", "request", (data: RequestData) =>
                {
                    expect(data).to.deep.equal(givenData);
                    done();
                })
                .parse(`|request|${stringifyRequest(givenData)}`);
            });
        });

        describe("switch", function()
        {
            // message can be switch or drag, depending on whether the switch
            //  was intentional or unintentional
            const prefixes = ["switch", "drag"];
            // expected value when the corresponding switchInfo is parsed
            const givenInfos =
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
            // unparsed givenInfos
            let switchInfos: string[][];

            beforeEach(function()
            {
                // these values can be sabotaged in some later test cases to
                //  observe how the parser handles it
                switchInfos =
                [
                    ["p1a: Lucky", "Magikarp, shiny, M", "65/200 par"],
                    ["p2b: Rage", "Gyarados, F, L50", "1/1"],
                    ["p1c: Mew2", "Mewtwo", "100/100 slp"]
                ];
            });

            for (const prefix of prefixes)
            {
                // try parsing with each set of switch info
                for (let i = 0; i < givenInfos.length; ++i)
                {
                    it(`Should parse ${prefix} with valid info ${i + 1}`,
                    function(done)
                    {
                        parser.on("", "switch", (id: PokemonID,
                            details: PokemonDetails, status: PokemonStatus) =>
                        {
                            // match each id/details/status object
                            const info = [id, details, status];
                            for (let j = 0; j < givenInfos[i].length; ++j)
                            {
                                expect(info[j]).to.deep.equal(givenInfos[i][j]);
                            }
                            done();
                        })
                        .parse(`|switch|${switchInfos[i].join("|")}`);
                    });
                }

                // only need to test sabotage values for one set
                for (const infoName in infoNames)
                {
                    if (!infoNames.hasOwnProperty(infoName)) continue;
                    it(`Should not parse ${prefix} with invalid ${infoName}`,
                    function()
                    {
                        // if any one of PokemonID, PokemonDetails, or
                        //  PokemonStatus are omitted or invalid, the entire
                        //  message can't be parsed
                        switchInfos[0][infoNames[infoName]] = "";

                        parser.on("", "switch", () =>
                        {
                            throw new Error(`Parsed with invalid ${infoName}`);
                        })
                        .parse(`|switch|${switchInfos[0].join("|")}`);
                    });
                }
            }
        });

        describe("teamsize", function()
        {
            const givenIds = ["p1", "p2"];
            const givenSize = 1;
            for (const givenId of givenIds)
            {
                it(`Should parse teamsize ${givenId}`, function(done)
                {
                    parser.on("", "teamsize", (id: PlayerID, size: number) =>
                    {
                        expect(id).to.equal(givenId);
                        expect(size).to.equal(givenSize);
                        done();
                    })
                    .parse(`|teamsize|${givenId}|${givenSize}`);
                });
            }

            it("Should not parse empty player", function()
            {
                parser.on("", "teamsize", (id: PlayerID, size: number) =>
                {
                    throw new Error("Parsed with empty player");
                })
                .parse(`|teamsize||${givenSize}`);
            });

            it("Should not parse empty size", function()
            {
                parser.on("", "teamsize", (id: PlayerID, size: number) =>
                {
                    throw new Error("Parsed with empty size");
                })
                .parse(`|teamsize|${givenIds[0]}|`);
            });
        });

        describe("turn", function()
        {
            it("Should parse turn", function(done)
            {
                const givenTurn = 1;
                parser.on("", "turn", (turn: number) =>
                {
                    expect(turn).to.equal(givenTurn);
                    done();
                })
                .parse(`|turn|${givenTurn}`);
            });
        });

        describe("updatechallenges", function()
        {
            it("Should parse updatechallenges", function(done)
            {
                const givenChallengesFrom: ChallengesFrom =
                    { somebody: "gen4ou" };
                parser.on("", "updatechallenges",
                    (challengesFrom: ChallengesFrom) =>
                {
                    expect(challengesFrom).to.deep.equal(givenChallengesFrom);
                    done();
                })
                .parse(`|updatechallenges|{"challengesFrom":\
${JSON.stringify(givenChallengesFrom)}}`);
            });
        });

        describe("updateuser", function()
        {
            it("Should parse updateuser", function(done)
            {
                const givenUsername = "somebody";
                const guest = 0;
                const avatarId = 21;
                parser.on("", "updateuser",
                    (username: string, isGuest: boolean) =>
                {
                    expect(username).to.equal(givenUsername);
                    expect(isGuest).to.equal(!guest);
                    done();
                })
                .parse(`|updateuser|${givenUsername}|${guest}|${avatarId}`);
            });

            for (const msg of ["updateuser", "updateuser|user"])
            {
                it(`Should not parse empty ${msg}`, function()
                {
                    parser.on("", "updateuser", () =>
                    {
                        throw new Error("Parsed empty updateuser");
                    })
                    .parse(`|${msg}`);
                });
            }
        });

        describe("upkeep", function()
        {
            it("Should parse upkeep", function(done)
            {
                parser.on("", "upkeep", done).parse("|upkeep");
            });
        });
    });
});
