import {Protocol} from "@pkmn/protocol";
import {expect} from "chai";
import "mocha";
import {
    benchInfo,
    ditto,
    eevee,
    requestEvent,
    smeargle,
} from "../state/switchOptions.test";
import {
    createInitialContext,
    ParserContext,
    setupOverrideAgent,
    setupOverrideSender,
} from "./Context.test";
import {ParserHelpers} from "./ParserHelpers.test";
import {
    initParser,
    toID,
    toMoveName,
    toRequestJSON,
    toUsername,
} from "./helpers.test";
import {request} from "./request";

export const test = () =>
    describe("request", function () {
        const ictx = createInitialContext();
        const {sh} = ictx;

        let pctx: ParserContext<void> | undefined;
        const ph = new ParserHelpers(() => pctx);

        beforeEach("Initialize request BattleParser", function () {
            pctx = initParser(ictx.startArgs, request);
        });

        afterEach("Close ParserContext", async function () {
            await ph.close().finally(() => (pctx = undefined));
        });

        const agent = setupOverrideAgent(ictx);
        const sender = setupOverrideSender(ictx);

        it("Should throw if mismatched type", async function () {
            pctx = initParser(
                ictx.startArgs,
                async ctx => await request(ctx, "move"),
            );
            await ph.rejectError(
                {
                    args: [
                        "request",
                        toRequestJSON({
                            requestType: "wait",
                            side: undefined,
                            rqid: 2,
                        }),
                    ],
                    kwArgs: {},
                },
                Error,
                "Expected |request| type 'move' but got 'wait'",
            );
        });

        describe("requestType = team", function () {
            it("Should throw", async function () {
                await ph.rejectError(
                    {
                        args: [
                            "request",
                            toRequestJSON({
                                requestType: "team",
                                side: {
                                    id: "p1",
                                    name: toUsername("username"),
                                    pokemon: [],
                                },
                                rqid: 1,
                            }),
                        ],
                        kwArgs: {},
                    },
                    Error,
                    "Team preview not supported",
                );
            });
        });

        describe("requestType = move", function () {
            it("Should update moves and send choice", async function () {
                const [, , mon] = sh.initTeam("p1", [eevee, ditto, smeargle]);
                expect(mon.moveset.reveal("ember").pp).to.equal(40);
                expect(mon.moveset.get("tackle")).to.be.null;

                const p = ph.handle(
                    requestEvent(
                        "move",
                        [
                            {
                                ...benchInfo[0],
                                moves: [toID("tackle"), toID("ember")],
                            },
                            ...benchInfo.slice(1),
                        ],
                        {
                            moves: [
                                {
                                    id: toID("tackle"),
                                    name: toMoveName("tackle"),
                                    pp: 32,
                                    maxpp: 32,
                                    target: "normal",
                                },
                                {
                                    id: toID("ember"),
                                    name: toMoveName("ember"),
                                    pp: 10,
                                    maxpp: 40,
                                    target: "normal",
                                },
                            ],
                        },
                    ),
                );

                await expect(agent.choices()).to.eventually.have.members([
                    "move 1",
                    "move 2",
                    "switch 2",
                    "switch 3",
                ]);
                agent.resolve();
                await expect(sender.sent()).to.eventually.equal("move 1");
                sender.resolve(false /*i.e., accept the choice*/);

                await p;
                await ph.return();
                expect(mon.moveset.get("ember")!.pp).to.equal(10);
                expect(mon.moveset.get("tackle")).to.not.be.null;
            });

            it("Should handle lockedmove pp", async function () {
                const [, , mon] = sh.initTeam("p1", [eevee, ditto, smeargle]);
                expect(mon.moveset.reveal("outrage").pp).to.equal(24);
                expect(mon.moveset.reveal("ember").pp).to.equal(40);

                const p = ph.handle(
                    requestEvent(
                        "move",
                        [
                            {
                                ...benchInfo[0],
                                moves: [toID("outrage"), toID("ember")],
                            },
                            ...benchInfo.slice(1),
                        ],
                        {
                            moves: [
                                {
                                    id: toID("outrage"),
                                    name: toMoveName("outrage"),
                                    // TODO: Fix protocol typings.
                                } as Protocol.Request.ActivePokemon["moves"][0],
                            ],
                            trapped: true,
                        },
                    ),
                );

                // Note: Only 1 choice so no agent call is expected.
                await expect(sender.sent()).to.eventually.equal("move 1");
                sender.resolve(false /*i.e., accept the choice*/);

                await p;
                await ph.return();
                expect(mon.moveset.get("outrage")!.pp).to.equal(24);
                expect(mon.moveset.get("ember")!.pp).to.equal(40);
            });

            it("Should handle switch rejection via trapping ability", async function () {
                sh.initTeam("p1", [eevee, ditto, smeargle]);

                const mon = sh.initActive("p2");
                mon.setAbility("shadowtag", "illuminate");

                const p = ph.handle(
                    requestEvent("move", benchInfo, {
                        moves: [
                            {
                                id: toID("tackle"),
                                name: toMoveName("tackle"),
                                pp: 32,
                                maxpp: 32,
                                target: "normal",
                            },
                            {
                                id: toID("ember"),
                                name: toMoveName("ember"),
                                pp: 10,
                                maxpp: 40,
                                target: "normal",
                            },
                        ],
                    }),
                );

                // Make a switch choice.
                const c = await agent.choices();
                expect(c).to.have.members([
                    "move 1",
                    "move 2",
                    "switch 2",
                    "switch 3",
                ]);
                [c[2], c[0]] = [c[0], c[2]];
                expect(c).to.have.members([
                    "switch 2",
                    "move 2",
                    "move 1",
                    "switch 3",
                ]);
                expect(agent.resolve).to.not.be.null;
                agent.resolve();
                // Switch choice was rejected due to a trapping ability.
                await expect(sender.sent()).to.eventually.equal("switch 2");
                sender.resolve("trapped");

                // Make a new choice.
                await expect(agent.choices()).to.eventually.have.members([
                    "move 2",
                    "move 1",
                ]);
                agent.resolve();
                // Switch choice was accepted now.
                await expect(sender.sent()).to.eventually.equal("move 2");
                sender.resolve(false /*i.e., accept the choice*/);

                await p;
                await ph.return();
                expect(mon.traits.ability.possibleValues).to.have.keys(
                    "shadowtag",
                );
            });

            it("Should send last choice if all choices were rejected", async function () {
                const [, , mon] = sh.initTeam("p1", [eevee, ditto, smeargle]);
                expect(mon.moveset.reveal("ember").pp).to.equal(40);
                expect(mon.moveset.get("tackle")).to.be.null;

                const p = ph.handle(
                    requestEvent(
                        "move",
                        [
                            {
                                ...benchInfo[0],
                                moves: [toID("tackle"), toID("ember")],
                            },
                            ...benchInfo.slice(1),
                        ],
                        {
                            moves: [
                                {
                                    id: toID("tackle"),
                                    name: toMoveName("tackle"),
                                    pp: 32,
                                    maxpp: 32,
                                    target: "normal",
                                },
                                {
                                    id: toID("ember"),
                                    name: toMoveName("ember"),
                                    pp: 10,
                                    maxpp: 40,
                                    target: "normal",
                                },
                            ],
                        },
                    ),
                );

                const choices = await agent.choices();
                expect(choices).to.have.members([
                    "move 1",
                    "move 2",
                    "switch 2",
                    "switch 3",
                ]);
                [choices[1], choices[3]] = [choices[3], choices[1]];
                expect(choices).to.have.members([
                    "move 1",
                    "switch 3",
                    "switch 2",
                    "move 2",
                ]);
                agent.resolve();
                await expect(sender.sent()).to.eventually.equal("move 1");
                sender.resolve(true /*i.e., reject the choice*/);
                await expect(sender.sent()).to.eventually.equal("switch 3");
                expect(choices).to.have.members([
                    "switch 3",
                    "switch 2",
                    "move 2",
                ]);
                sender.resolve(true);
                await expect(sender.sent()).to.eventually.equal("switch 2");
                expect(choices).to.have.members(["switch 2", "move 2"]);
                sender.resolve(true);
                // Send last remaining choice.
                await expect(sender.sent()).to.eventually.equal("move 2");
                expect(choices).to.have.members(["move 2"]);
                sender.resolve(false /*i.e., accept the choice*/);

                await p;
                await ph.return();
            });

            it("Should throw if all choices are rejected", async function () {
                const [, , mon] = sh.initTeam("p1", [eevee, ditto, smeargle]);
                expect(mon.moveset.reveal("ember").pp).to.equal(40);
                expect(mon.moveset.get("tackle")).to.be.null;

                const p = ph.rejectError(
                    requestEvent(
                        "move",
                        [
                            {
                                ...benchInfo[0],
                                moves: [toID("tackle"), toID("ember")],
                            },
                            ...benchInfo.slice(1),
                        ],
                        {
                            moves: [
                                {
                                    id: toID("tackle"),
                                    name: toMoveName("tackle"),
                                    pp: 32,
                                    maxpp: 32,
                                    target: "normal",
                                },
                                {
                                    id: toID("ember"),
                                    name: toMoveName("ember"),
                                    pp: 10,
                                    maxpp: 40,
                                    target: "normal",
                                },
                            ],
                        },
                    ),
                    Error,
                    "Last choice 'move 2' was rejected as 'true'",
                );

                const choices = await agent.choices();
                expect(choices).to.have.members([
                    "move 1",
                    "move 2",
                    "switch 2",
                    "switch 3",
                ]);
                [choices[1], choices[3]] = [choices[3], choices[1]];
                expect(choices).to.have.members([
                    "move 1",
                    "switch 3",
                    "switch 2",
                    "move 2",
                ]);
                agent.resolve();
                await expect(sender.sent()).to.eventually.equal("move 1");
                sender.resolve(true /*i.e., reject the choice*/);
                await expect(sender.sent()).to.eventually.equal("switch 3");
                expect(choices).to.have.members([
                    "switch 3",
                    "switch 2",
                    "move 2",
                ]);
                sender.resolve(true);
                await expect(sender.sent()).to.eventually.equal("switch 2");
                expect(choices).to.have.members(["switch 2", "move 2"]);
                sender.resolve(true);
                // Send last remaining choice.
                await expect(sender.sent()).to.eventually.equal("move 2");
                expect(choices).to.have.members(["move 2"]);
                sender.resolve(true);

                await p;
            });
        });

        describe("requestType = switch", function () {
            it("Should consider only switch choices", async function () {
                sh.initTeam("p1", [eevee, ditto, smeargle]);

                const p = ph.handle(requestEvent("switch", benchInfo));

                await expect(agent.choices()).to.eventually.have.members([
                    "switch 2",
                    "switch 3",
                ]);
                agent.resolve();
                await expect(sender.sent()).to.eventually.equal("switch 2");
                sender.resolve(false /*i.e., accept the choice*/);

                await p;
                await ph.return();
            });
        });

        describe("requestType = wait", function () {
            it("Should do nothing", async function () {
                await ph.handle({
                    args: [
                        "request",
                        toRequestJSON({
                            requestType: "wait",
                            side: undefined,
                            rqid: 5,
                        }),
                    ],
                    kwArgs: {},
                });
                await ph.return();
            });
        });
    });
