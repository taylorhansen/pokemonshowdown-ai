import {Protocol} from "@pkmn/protocol";
import {expect} from "chai";
import "mocha";
import {GlobalHandler} from "./GlobalHandler";

export const test = () =>
    describe("GlobalHandler", function () {
        const user1 = "user1" as Protocol.Username;
        const user2 = "user2" as Protocol.Username;

        let gh: GlobalHandler;

        beforeEach("Initialize GlobalHandler", function () {
            gh = new GlobalHandler();
            gh.updateUser = () => {
                throw new Error("Expected updateUser to not be called");
            };
            gh.respondToChallenge = () => {
                throw new Error("Expected respondToChallenge to not be called");
            };
        });

        describe("#halt()", function () {
            it("Should do nothing", function () {
                gh.halt();
            });
        });

        describe("|popup|", function () {
            it("Should do nothing", function () {
                gh.handle({
                    args: ["popup", "msg" as Protocol.Message],
                    kwArgs: {},
                });
            });
        });

        describe("|pm|", function () {
            it("Should do nothing if ordinary message", function () {
                gh.handle({
                    args: ["pm", user1, user2, "msg" as Protocol.Message],
                    kwArgs: {},
                });
            });
            it("Should respond to challenge", function (done) {
                gh.updateUser = () => {};
                gh.handle({
                    args: [
                        "updateuser",
                        user1,
                        "0",
                        "" as Protocol.AvatarIdent,
                        "{}" as Protocol.JSON,
                    ],
                    kwArgs: {},
                });

                gh.respondToChallenge = function (user, format) {
                    expect(user).to.equal(user2);
                    expect(format).to.equal("gen4randombattle");
                    done();
                };
                gh.handle({
                    args: [
                        "pm",
                        user2,
                        user1,
                        "/challenge gen4randombattle|" as Protocol.Message,
                    ],
                    kwArgs: {},
                });
            });

            it("Should not respond to challenge if no username", function () {
                gh.handle({
                    args: [
                        "pm",
                        user1,
                        user2,
                        "/challenge gen4randombattle|" as Protocol.Message,
                    ],
                    kwArgs: {},
                });
            });

            it("Should not respond to challenge if invalid username", function () {
                gh.updateUser = () => {};
                gh.handle({
                    args: [
                        "updateuser",
                        user1,
                        "0",
                        "" as Protocol.AvatarIdent,
                        "{}" as Protocol.JSON,
                    ],
                    kwArgs: {},
                });

                gh.handle({
                    args: [
                        "pm",
                        user1,
                        user2,
                        "/challenge gen4randombattle|" as Protocol.Message,
                    ],
                    kwArgs: {},
                });
            });

            it("Should not respond to challenge if invalid format", function () {
                gh.updateUser = () => {};
                gh.handle({
                    args: [
                        "updateuser",
                        user1,
                        "0",
                        "" as Protocol.AvatarIdent,
                        "{}" as Protocol.JSON,
                    ],
                    kwArgs: {},
                });

                gh.handle({
                    args: [
                        "pm",
                        user1,
                        user2,
                        "/challenge" as Protocol.Message,
                    ],
                    kwArgs: {},
                });
            });
        });

        describe("|usercount|", function () {
            it("Should do nothing", function () {
                gh.handle({
                    args: ["usercount", "1" as Protocol.Num],
                    kwArgs: {},
                });
            });
        });

        describe("|nametaken|", function () {
            it("Should do nothing", function () {
                gh.handle({
                    args: ["nametaken", user1, "msg" as Protocol.Message],
                    kwArgs: {},
                });
            });
        });

        describe("|challstr|", function () {
            it("Should receive challstr", async function () {
                gh.handle({args: ["challstr", "x"], kwArgs: {}});
                await expect(gh.challstr).to.eventually.equal("x");
            });

            it("Should throw if 2 challstrs received", async function () {
                gh.handle({args: ["challstr", "x"], kwArgs: {}});
                await expect(gh.challstr).to.eventually.equal("x");

                expect(() =>
                    gh.handle({args: ["challstr", "y"], kwArgs: {}}),
                ).to.throw(Error, "Received a second challstr");
            });
        });

        describe("|updateuser|", function () {
            it("Should update username", function (done) {
                gh.updateUser = function (user) {
                    expect(user).to.equal(user1);
                    done();
                };
                gh.handle({
                    args: [
                        "updateuser",
                        user1,
                        "0",
                        "" as Protocol.AvatarIdent,
                        "{}" as Protocol.JSON,
                    ],
                    kwArgs: {},
                });
            });
        });

        describe("|formats|", function () {
            it("Should do nothing", function () {
                gh.handle({
                    args: [
                        "formats",
                        "gen4randombattle,#" as Protocol.FormatsList,
                    ],
                    kwArgs: {},
                });
            });
        });

        describe("|updatesearch|", function () {
            it("Should do nothing", function () {
                gh.handle({
                    args: ["updatesearch", "{}" as Protocol.SearchStateJSON],
                    kwArgs: {},
                });
            });
        });

        describe("|updatechallenges|", function () {
            it("Should respond to challenge", function (done) {
                gh.respondToChallenge = function (user, format) {
                    expect(user).to.equal(user2);
                    expect(format).to.equal("gen4randombattle");
                    done();
                };
                gh.handle({
                    args: [
                        "updatechallenges",
                        JSON.stringify({
                            challengesFrom: {[user2]: "gen4randombattle"},
                        }) as Protocol.ChallengesJSON,
                    ],
                    kwArgs: {},
                });
            });
        });

        describe("|queryresponse|", function () {
            it("Should do nothing", function () {
                gh.handle({
                    args: ["queryresponse", "roomlist", "{}" as Protocol.JSON],
                    kwArgs: {},
                });
            });
        });
    });
