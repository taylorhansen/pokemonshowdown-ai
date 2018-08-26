import { expect } from "chai";
import "mocha";
import { RoomType, ChallengesFrom } from "../src/bot/MessageListener";
import { MessageParser } from "../src/bot/MessageParser";
import { doesNotReject } from "assert";
import { PokemonStatus, PokemonID, PokemonDetails } from "../src/BattleState/Pokemon";

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
        parser.on("", "init", () =>
        {
            --count;
        })
        .parse("|init|chat\n|init|chat");
        expect(count).to.equal(0);
    });

    describe("Room name", function()
    {
        const room = "myroomname"

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
        describe("init", function()
        {
            const initTypes: RoomType[] = ["chat", "battle"];
            for (const initType of initTypes)
            {
                it(`Should handle ${initType} init message`, function(done)
                {
                    parser.on("", "init", (type: RoomType) =>
                    {
                        expect(type).to.equal(initType);
                        done();
                    })
                    .parse(`|init|${initType}`);
                });
            };
        });

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
                const givenTeam: object = {}; // TODO
                parser.on("", "request", (team: object) =>
                {
                    expect(team).to.deep.equal(givenTeam);
                    done();
                })
                .parse(`|request|${JSON.stringify(givenTeam)}`);
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

        describe("switch", function()
        {
            const prefixes = ["switch", "drag"];
            const givenInfo =
            [
                { owner: "p1", position: "a", nickname: "Lucky" },
                { species: "Magikarp", shiny: true, gender: "M", level: 50 },
                { hp: 65, hpMax: 200, condition: "par" }
            ];
            const infoNames: {[infoName: string]: number} =
                { id: 0, details: 1, status: 2 };
            const switchInfo: string[] = [];

            beforeEach(function()
            {
                // these values can be sabotaged in some later test cases to
                //  observe how the parser handles it
                switchInfo[0] = "p1a: Lucky";
                switchInfo[1] = "Magikarp, shiny, M, L50";
                switchInfo[2] = "65/200 par";
            });

            for (const prefix of prefixes)
            {
                it(`Should parse ${prefix} with valid info`, function(done)
                {
                    parser.on("", "switch", (id: PokemonID,
                        details: PokemonDetails, status: PokemonStatus) =>
                    {
                        const info = [id, details, status];
                        for (let i = 0; i < 3; ++i)
                        {
                            expect(info[i]).to.deep.equal(givenInfo[i]);
                        }
                        done();
                    })
                    .parse(`|switch|${switchInfo.join("|")}`);
                });

                for (const infoName in infoNames)
                {
                    it(`Should not parse ${prefix} with invalid ${infoName}`,
                    function()
                    {
                        // if any one of PokemonID, PokemonDetails, or
                        //  PokemonStatus are omitted or invalid, the entire
                        //  message can't be parsed
                        switchInfo[infoNames[infoName]] = "";

                        parser.on("", "switch", () =>
                        {
                            throw new Error(`Parsed with invalid id`);
                        })
                        .parse(`|switch|${switchInfo.join("|")}`);
                    });
                }
            }
        });
    });
});
