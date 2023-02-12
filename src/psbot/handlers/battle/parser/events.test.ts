import {Protocol} from "@pkmn/protocol";
import {SideID} from "@pkmn/types";
import {expect} from "chai";
import "mocha";
import {Event} from "../../../parser";
import * as dex from "../dex";
import {BattleState} from "../state/BattleState";
import {SwitchOptions} from "../state/Team";
import {ReadonlyVolatileStatus} from "../state/VolatileStatus";
import {
    benchInfo,
    castform,
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
import {dispatch} from "./events";
import {
    toAbilityName,
    toBoostIDs,
    toDetails,
    toEffectName,
    toFieldCondition,
    toHPStatus,
    toIdent,
    toItemName,
    toNickname,
    toNum,
    toSide,
    toSideCondition,
    toSpeciesName,
    toTypes,
    toWeather,
    initParser,
    toID,
    toMoveName,
    toRequestJSON,
    toSeed,
    toUsername,
    toRule,
    toFormatName,
    toSearchID,
} from "./helpers.test";

export const test = () =>
    describe("events", function () {
        const ictx = createInitialContext();
        const {sh} = ictx;

        let state: BattleState;

        beforeEach("Extract BattleState", function () {
            state = ictx.getState();
        });

        let pctx:
            | ParserContext<Awaited<ReturnType<typeof dispatch>>>
            | undefined;
        const ph = new ParserHelpers(() => pctx);

        beforeEach("Initialize base BattleParser", function () {
            pctx = initParser(ictx.startArgs, dispatch);
        });

        afterEach("Close ParserContext", async function () {
            await ph.close().finally(() => (pctx = undefined));
        });

        describe("invalid event", function () {
            it("Should reject and return null", async function () {
                await ph.reject({
                    args: ["invalid"],
                    kwArgs: {},
                } as unknown as Event);
                await ph.return(null);
            });
        });

        describe("|init|", function () {
            it("Should do nothing", async function () {
                await ph.handle({args: ["init", "battle"], kwArgs: {}});
                await ph.return();
            });
        });

        describe("|player|", function () {
            it("Should set state.ourSide if username matches", async function () {
                state.ourSide = undefined;
                await ph.handle({
                    args: ["player", "p2", toUsername(state.username), "", ""],
                    kwArgs: {},
                });
                await ph.return();
                expect(state.ourSide).to.equal("p2");
            });

            it("Should skip if mentioning different player", async function () {
                state.ourSide = undefined;
                await ph.handle({
                    args: [
                        "player",
                        "p1",
                        toUsername(state.username + "1"),
                        "",
                        "",
                    ],
                    kwArgs: {},
                });
                await ph.return();
                expect(state.ourSide).to.be.undefined;
            });
        });

        describe("|teamsize|", function () {
            it("Should set team size for opponent", async function () {
                expect(state.getTeam("p2").size).to.equal(0);
                await ph.handle({
                    args: ["teamsize", "p2", toNum(4)],
                    kwArgs: {},
                });
                await ph.return();
                expect(state.getTeam("p2").size).to.equal(4);
            });

            it("Should skip setting team size for client", async function () {
                expect(state.getTeam("p1").size).to.equal(0);
                await ph.handle({
                    args: ["teamsize", "p1", toNum(4)],
                    kwArgs: {},
                });
                await ph.return();
                expect(state.getTeam("p1").size).to.equal(0);
            });

            it("Should throw if state not fully initialized", async function () {
                state.ourSide = undefined;
                await ph.reject({
                    args: ["teamsize", "p1", toNum(3)],
                    kwArgs: {},
                });
                await ph.error(
                    Error,
                    "Expected |player| event for client before |teamsize| " +
                        "event",
                );
            });
        });

        describe("|gametype|", function () {
            it("Should do nothing", async function () {
                await ph.handle({args: ["gametype", "singles"], kwArgs: {}});
                await ph.return();
            });
        });

        describe("|gen|", function () {
            it("Should do nothing", async function () {
                await ph.handle({args: ["gen", 4], kwArgs: {}});
                await ph.return();
            });
        });

        describe("|tier|", function () {
            it("Should do nothing", async function () {
                await ph.handle({
                    args: ["tier", toFormatName("[Gen 4] Random Battle")],
                    kwArgs: {},
                });
                await ph.return();
            });
        });

        describe("|rated|", function () {
            it("Should do nothing", async function () {
                await ph.handle({args: ["rated"], kwArgs: {}});
                await ph.return();
            });
        });

        describe("|seed|", function () {
            it("Should do nothing", async function () {
                await ph.handle({args: ["seed", toSeed("abc")], kwArgs: {}});
                await ph.return();
            });
        });

        describe("|rule|", function () {
            it("Should do nothing", async function () {
                await ph.handle({
                    args: [
                        "rule",
                        toRule("Sleep Clause: Limit one foe put to sleep"),
                    ],
                    kwArgs: {},
                });
                await ph.return();
            });
        });

        describe("|clearpoke|", function () {
            it("Should do nothing since unsupported", async function () {
                await ph.handle({args: ["clearpoke"], kwArgs: {}});
                await ph.return();
            });
        });

        describe("|poke|", function () {
            it("Should do nothing since unsupported", async function () {
                await ph.handle({
                    args: ["poke", "p1", toDetails(), "item"],
                    kwArgs: {},
                });
                await ph.return();
            });
        });

        describe("|teampreview|", function () {
            it("Should do nothing since unsupported", async function () {
                await ph.handle({args: ["teampreview"], kwArgs: {}});
                await ph.return();
            });
        });

        describe("|updatepoke|", function () {
            it("Should do nothing since unsupported", async function () {
                await ph.handle({
                    args: ["updatepoke", toIdent("p1"), toDetails()],
                    kwArgs: {},
                });
                await ph.return();
            });
        });

        describe("|start|", function () {
            it("Should start the battle", async function () {
                state.started = false;
                await ph.handle({args: ["start"], kwArgs: {}});
                await ph.return();
                expect(state.started).to.be.true;
            });

            it("Should throw if state not fully initialized", async function () {
                state.started = false;
                state.ourSide = undefined;
                await ph.reject({args: ["start"], kwArgs: {}});
                await ph.error(
                    Error,
                    "Expected |player| event for client before |start event",
                );
            });
        });

        describe("|done|", function () {
            it("Should do nothing", async function () {
                await ph.handle({args: ["done"], kwArgs: {}});
                await ph.return();
            });
        });

        describe("|request|", function () {
            const agent = setupOverrideAgent(ictx);
            const sender = setupOverrideSender(ictx);

            describe("requestType = team", function () {
                it("Should do nothing since unsupported", async function () {
                    await ph.handle({
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
                    });
                    await ph.return();
                });
            });

            describe("requestType = move", function () {
                it("Should update moves and send choice", async function () {
                    const [, , mon] = sh.initTeam("p1", [
                        eevee,
                        ditto,
                        smeargle,
                    ]);
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
                    const [, , mon] = sh.initTeam("p1", [
                        eevee,
                        ditto,
                        smeargle,
                    ]);
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
                    mon.setAbility("shadowtag");

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

                    // Make a new choice after ruling out switch.
                    await expect(sender.sent()).to.eventually.equal("move 2");
                    sender.resolve(false /*i.e., accept the choice*/);

                    await p;
                    await ph.return();
                });

                it("Should send final choice if all choices were rejected", async function () {
                    const [, , mon] = sh.initTeam("p1", [
                        eevee,
                        ditto,
                        smeargle,
                    ]);
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
                    const [, , mon] = sh.initTeam("p1", [
                        eevee,
                        ditto,
                        smeargle,
                    ]);
                    expect(mon.moveset.reveal("ember").pp).to.equal(40);
                    expect(mon.moveset.get("tackle")).to.be.null;

                    const p = ph
                        .reject(
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
                        )
                        .then(
                            async () =>
                                await ph.error(
                                    Error,
                                    "Final choice 'move 2' was rejected as " +
                                        "'true'",
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
                    sender.resolve(true);

                    await p;
                });

                describe("state.started = false", function () {
                    beforeEach("state.started = false", function () {
                        state.started = false;
                    });

                    it("Should initialize team", async function () {
                        const team = state.getTeam("p1");
                        expect(team.size).to.equal(0);

                        await ph.handle({
                            args: [
                                "request",
                                toRequestJSON({
                                    requestType: "move",
                                    active: [
                                        {
                                            moves: [
                                                {
                                                    id: toID("tackle"),
                                                    name: toMoveName("tackle"),
                                                    pp: 32,
                                                    maxpp: 32,
                                                    target: "normal",
                                                },
                                            ],
                                        },
                                    ],
                                    side: {
                                        name: toUsername("username"),
                                        id: "p1",
                                        pokemon: [
                                            {
                                                active: true,
                                                details: toDetails(smeargle),
                                                ident: toIdent("p1", smeargle),
                                                pokeball: toID("pokeball"),
                                                ability: toID("owntempo"),
                                                baseAbility: toID("owntempo"),
                                                condition: toHPStatus(100, 100),
                                                item: toID("mail"),
                                                moves: [toID("tackle")],
                                                stats: {
                                                    atk: 18,
                                                    def: 29,
                                                    spa: 18,
                                                    spd: 36,
                                                    spe: 58,
                                                },
                                                hp: smeargle.hp,
                                                maxhp: smeargle.hpMax,
                                                hpcolor: "g",
                                                name: toSpeciesName(
                                                    smeargle.species,
                                                ),
                                                speciesForme: toSpeciesName(
                                                    smeargle.species,
                                                ),
                                                level: smeargle.level,
                                                shiny: true,
                                                gender: smeargle.gender,
                                                searchid: toSearchID(
                                                    "p1",
                                                    smeargle,
                                                ),
                                            },
                                        ],
                                    },
                                    rqid: 1,
                                }),
                            ],
                            kwArgs: {},
                        });
                        await ph.return();
                        expect(team.size).to.equal(1);
                        expect(() => team.active).to.not.throw();
                    });

                    it("Should handle |request| with alt form", async function () {
                        const deoxysdefense: SwitchOptions = {
                            species: "deoxysdefense",
                            level: 20,
                            gender: "N",
                            hp: 55,
                            hpMax: 55,
                        };

                        await ph.handle({
                            args: [
                                "request",
                                toRequestJSON({
                                    requestType: "move",
                                    active: [],
                                    side: {
                                        id: "p1",
                                        name: toUsername("username"),
                                        pokemon: [
                                            {
                                                active: true,
                                                details:
                                                    toDetails(deoxysdefense),
                                                // Note: PS can sometimes omit
                                                // the forme name in the ident.
                                                ident: toIdent("p1", {
                                                    ...deoxysdefense,
                                                    species: "deoxys",
                                                }),
                                                pokeball: toID("pokeball"),
                                                ability: toID("pressure"),
                                                baseAbility: toID("pressure"),
                                                condition: toHPStatus(
                                                    deoxysdefense.hp,
                                                    deoxysdefense.hpMax,
                                                ),
                                                item: toID("mail"),
                                                moves: [toID("tackle")],
                                                stats: {
                                                    atk: 30,
                                                    def: 75,
                                                    spa: 30,
                                                    spd: 75,
                                                    spe: 58,
                                                },
                                                hp: deoxysdefense.hp,
                                                maxhp: deoxysdefense.hpMax,
                                                hpcolor: "g",
                                                name: toSpeciesName("deoxys"),
                                                speciesForme:
                                                    toSpeciesName(
                                                        "deoxysdefense",
                                                    ),
                                                level: deoxysdefense.level,
                                                shiny: false,
                                                gender: deoxysdefense.gender,
                                                searchid: toSearchID(
                                                    "p1",
                                                    deoxysdefense,
                                                ),
                                            },
                                        ],
                                    },
                                    rqid: 2,
                                }),
                            ],
                            kwArgs: {},
                        });
                        await ph.return();
                    });
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

        describe("|turn|", function () {
            it("Should handle", async function () {
                await ph.handle({args: ["turn", toNum(2)], kwArgs: {}});
                await ph.return();
            });
        });

        describe("|move|", function () {
            const moveEvent = (
                side: SideID,
                move: string,
                kwArgs: Event<"|move|">["kwArgs"] = {},
            ): Event<"|move|"> => ({
                args: ["move", toIdent(side), toMoveName(move)],
                kwArgs,
            });

            it("Should reveal move and deduct pp", async function () {
                const mon = sh.initActive("p1");
                expect(mon.moveset.get("tackle")).to.be.null;
                expect(mon.volatile.lastMove).to.be.null;
                sh.initActive("p2");

                await ph.handle(moveEvent("p1", "tackle"));
                await ph.return();
                const move = mon.moveset.get("tackle");
                expect(move).to.not.be.null;
                expect(move).to.have.property("pp", 55);
                expect(move).to.have.property("maxpp", 56);
                expect(mon.volatile.lastMove).to.equal("tackle");
            });

            it("Should not reveal move if from lockedmove", async function () {
                const mon = sh.initActive("p1");
                expect(mon.moveset.get("tackle")).to.be.null;
                expect(mon.volatile.lastMove).to.be.null;
                sh.initActive("p2");

                await ph.handle(
                    moveEvent("p1", "tackle", {
                        from: toEffectName("lockedmove"),
                    }),
                );
                await ph.return();
                expect(mon.moveset.get("tackle")).to.be.null;
                expect(mon.volatile.lastMove).to.equal("tackle");
            });

            it("Should not deduct pp if from lockedmove", async function () {
                const mon = sh.initActive("p1");
                const move = mon.moveset.reveal("tackle");
                expect(move).to.have.property("pp", 56);
                expect(move).to.have.property("maxpp", 56);
                expect(mon.volatile.lastMove).to.be.null;
                sh.initActive("p2");

                await ph.handle(
                    moveEvent("p1", "tackle", {
                        from: toEffectName("lockedmove"),
                    }),
                );
                await ph.return();
                expect(move).to.have.property("pp", 56);
                expect(move).to.have.property("maxpp", 56);
                expect(mon.volatile.lastMove).to.equal("tackle");
            });

            it("Should still set last move if from pursuit", async function () {
                const mon = sh.initActive("p1");
                expect(mon.moveset.get("pursuit")).to.be.null;
                expect(mon.volatile.lastMove).to.be.null;
                sh.initActive("p2");

                await ph.handle(
                    moveEvent("p1", "pursuit", {
                        from: toEffectName("pursuit", "move"),
                    }),
                );
                await ph.return();
                expect(mon.moveset.get("pursuit")).to.be.null;
                expect(mon.volatile.lastMove).to.equal("pursuit");
            });

            describe("multi-turn move", function () {
                describe("rampage move", function () {
                    it("Should start rampage move status", async function () {
                        const mon = sh.initActive("p1");
                        expect(mon.volatile.rampage.isActive).to.be.false;
                        sh.initActive("p2");

                        await ph.handle(moveEvent("p1", "outrage"));
                        await ph.return();
                        expect(mon.volatile.rampage.isActive).to.be.true;
                        expect(mon.volatile.rampage.type).to.equal("outrage");
                    });

                    it("Should continue rampage move status", async function () {
                        const mon = sh.initActive("p1");
                        mon.volatile.rampage.start("petaldance");
                        expect(mon.volatile.rampage.isActive).to.be.true;
                        expect(mon.volatile.rampage.type).to.equal(
                            "petaldance",
                        );
                        expect(mon.volatile.rampage.turns).to.equal(0);

                        await ph.handle(
                            moveEvent("p1", "petaldance", {
                                from: toEffectName("lockedmove"),
                            }),
                        );
                        await ph.return();
                        expect(mon.volatile.rampage.isActive).to.be.true;
                        expect(mon.volatile.rampage.type).to.equal(
                            "petaldance",
                        );
                        expect(mon.volatile.rampage.turns).to.equal(1);
                    });

                    it("Should restart rampage if different move", async function () {
                        const mon = sh.initActive("p1");
                        mon.volatile.rampage.start("outrage");
                        expect(mon.volatile.rampage.isActive).to.be.true;
                        expect(mon.volatile.rampage.type).to.equal("outrage");
                        expect(mon.volatile.rampage.turns).to.equal(0);
                        sh.initActive("p2");

                        await ph.handle(moveEvent("p1", "thrash"));
                        await ph.return();
                        expect(mon.volatile.rampage.isActive).to.be.true;
                        expect(mon.volatile.rampage.type).to.equal("thrash");
                        expect(mon.volatile.rampage.turns).to.equal(0);
                    });

                    it("Should reset rampage if unrelated move", async function () {
                        const mon = sh.initActive("p1");
                        mon.volatile.rampage.start("thrash");
                        expect(mon.volatile.rampage.isActive).to.be.true;

                        await ph.handle(moveEvent("p1", "splash"));
                        await ph.return();
                        expect(mon.volatile.rampage.isActive).to.be.false;
                    });

                    it("Should reset rampage if notarget", async function () {
                        const mon = sh.initActive("p1");
                        mon.volatile.rampage.start("outrage");
                        expect(mon.volatile.rampage.isActive).to.be.true;

                        await ph.handle(
                            moveEvent("p1", "outrage", {
                                from: toEffectName("lockedmove"),
                                notarget: true,
                            }),
                        );
                        await ph.return();
                        expect(mon.volatile.rampage.isActive).to.be.false;
                    });

                    it("Should not reset rampage if miss", async function () {
                        const mon = sh.initActive("p1");
                        mon.volatile.rampage.start("petaldance");
                        expect(mon.volatile.rampage.isActive).to.be.true;

                        await ph.handle(
                            moveEvent("p1", "petaldance", {
                                from: toEffectName("lockedmove"),
                                miss: true,
                            }),
                        );
                        await ph.return();
                        expect(mon.volatile.rampage.isActive).to.be.true;
                    });
                });

                describe("momentum move", function () {
                    it("Should start momentum move status", async function () {
                        const mon = sh.initActive("p1");
                        expect(mon.volatile.momentum.isActive).to.be.false;
                        sh.initActive("p2");

                        await ph.handle(moveEvent("p1", "rollout"));
                        await ph.return();
                        expect(mon.volatile.momentum.isActive).to.be.true;
                        expect(mon.volatile.momentum.type).to.equal("rollout");
                    });

                    it("Should continue momentum move status", async function () {
                        const mon = sh.initActive("p1");
                        mon.volatile.momentum.start("iceball");
                        expect(mon.volatile.momentum.isActive).to.be.true;
                        expect(mon.volatile.momentum.type).to.equal("iceball");
                        expect(mon.volatile.momentum.turns).to.equal(0);

                        await ph.handle(
                            moveEvent("p1", "iceball", {
                                from: toEffectName("lockedmove"),
                            }),
                        );
                        await ph.return();
                        expect(mon.volatile.momentum.isActive).to.be.true;
                        expect(mon.volatile.momentum.type).to.equal("iceball");
                        expect(mon.volatile.momentum.turns).to.equal(1);
                    });

                    it("Should restart momentum if different move", async function () {
                        const mon = sh.initActive("p1");
                        mon.volatile.momentum.start("rollout");
                        expect(mon.volatile.momentum.isActive).to.be.true;
                        expect(mon.volatile.momentum.type).to.equal("rollout");
                        expect(mon.volatile.momentum.turns).to.equal(0);
                        sh.initActive("p2");

                        await ph.handle(moveEvent("p1", "iceball"));
                        await ph.return();
                        expect(mon.volatile.momentum.isActive).to.be.true;
                        expect(mon.volatile.momentum.type).to.equal("iceball");
                        expect(mon.volatile.momentum.turns).to.equal(0);
                    });

                    it("Should reset momentum if unrelated move", async function () {
                        const mon = sh.initActive("p1");
                        mon.volatile.momentum.start("iceball");
                        expect(mon.volatile.momentum.isActive).to.be.true;

                        await ph.handle(moveEvent("p1", "splash"));
                        await ph.return();
                        expect(mon.volatile.momentum.isActive).to.be.false;
                    });

                    it("Should reset momentum if notarget", async function () {
                        const mon = sh.initActive("p1");
                        mon.volatile.momentum.start("rollout");
                        expect(mon.volatile.momentum.isActive).to.be.true;

                        await ph.handle(
                            moveEvent("p1", "rollout", {
                                from: toEffectName("lockedmove"),
                                notarget: true,
                            }),
                        );
                        await ph.return();
                        expect(mon.volatile.momentum.isActive).to.be.false;
                    });

                    it("Should reset momentum if miss", async function () {
                        const mon = sh.initActive("p1");
                        mon.volatile.momentum.start("iceball");
                        expect(mon.volatile.momentum.isActive).to.be.true;

                        await ph.handle(
                            moveEvent("p1", "iceball", {
                                from: toEffectName("lockedmove"),
                                miss: true,
                            }),
                        );
                        await ph.return();
                        expect(mon.volatile.momentum.isActive).to.be.false;
                    });
                });

                describe("two-turn move", function () {
                    it("Should release two-turn move", async function () {
                        const mon = sh.initActive("p1");
                        mon.volatile.twoTurn.start("fly");
                        expect(mon.volatile.twoTurn.isActive).to.be.true;
                        expect(mon.volatile.twoTurn.type).to.equal("fly");
                        mon.volatile.twoTurn.tick();

                        await ph.handle(
                            moveEvent("p1", "fly", {
                                from: toEffectName("lockedmove"),
                            }),
                        );
                        await ph.return();
                        expect(mon.volatile.twoTurn.isActive).to.be.false;
                    });
                });
            });

            describe("start implicit move statuses", function () {
                for (const move of ["defensecurl", "minimize"] as const) {
                    it(`Should start ${move}`, async function () {
                        const mon = sh.initActive("p1");
                        expect(mon.volatile[move]).to.be.false;

                        await ph.handle(moveEvent("p1", move));
                        await ph.return();
                        expect(mon.volatile[move]).to.be.true;
                    });
                }

                for (const move of ["healingwish", "lunardance"] as const) {
                    it(`Should start ${move} and set self-switch`, async function () {
                        const team = sh.initActive("p1").team!;
                        expect(team.status[move]).to.be.false;
                        expect(team.status.selfSwitch).to.be.null;

                        await ph.handle(moveEvent("p1", move));
                        await ph.return();
                        expect(team.status[move]).to.be.true;
                        expect(team.status.selfSwitch).to.be.true;
                    });
                }

                it("Should start wish", async function () {
                    const team = sh.initActive("p1").team!;
                    expect(team.status.wish.isActive).to.be.false;

                    await ph.handle(moveEvent("p1", "wish"));
                    await ph.return();
                    expect(team.status.wish.isActive).to.be.true;
                });

                it("Should set self-switch if applicable", async function () {
                    const team = sh.initActive("p1").team!;
                    expect(team.status.selfSwitch).to.be.null;

                    await ph.handle(moveEvent("p1", "batonpass"));
                    await ph.return();
                    expect(team.status.selfSwitch).to.equal("copyvolatile");
                });
            });

            describe("consume implicit move statuses", function () {
                it("Should reset micleberry status", async function () {
                    const mon = sh.initActive("p1");
                    mon.volatile.micleberry = true;

                    await ph.handle(moveEvent("p1", "splash"));
                    await ph.return();
                    expect(mon.volatile.micleberry).to.be.false;
                });

                it("Should reset single-move statuses", async function () {
                    const mon = sh.initActive("p1");
                    mon.volatile.destinybond = true;

                    await ph.handle(moveEvent("p1", "splash"));
                    await ph.return();
                    expect(mon.volatile.destinybond).to.be.false;
                });

                it("Should reset focuspunch status", async function () {
                    const mon = sh.initActive("p1");
                    mon.volatile.focus = true;
                    sh.initActive("p2");

                    await ph.handle(moveEvent("p1", "focuspunch"));
                    await ph.return();
                    expect(mon.volatile.focus).to.be.false;
                });

                it("Should reset stall counter if not a stall move", async function () {
                    const mon = sh.initActive("p1");
                    mon.volatile.stall(true);
                    expect(mon.volatile.stalling).to.be.true;

                    await ph.handle(moveEvent("p1", "splash"));
                    await ph.return();
                    expect(mon.volatile.stalling).to.be.false;
                });

                it("Should not reset stall counter if using stall move", async function () {
                    const mon = sh.initActive("p1");
                    mon.volatile.stall(true);
                    expect(mon.volatile.stalling).to.be.true;

                    await ph.handle(moveEvent("p1", "detect"));
                    await ph.return();
                    expect(mon.volatile.stalling).to.be.true;
                });

                it("Should reset stall counter if stall move failed", async function () {
                    const mon = sh.initActive("p1");
                    mon.volatile.stall(true);
                    expect(mon.volatile.stalling).to.be.true;

                    // Note: Indicates upcoming |-fail| event in this context.
                    await ph.handle(moveEvent("p1", "detect", {still: true}));
                    await ph.return();
                    expect(mon.volatile.stalling).to.be.false;
                });
            });

            describe("pressure", function () {
                it("Should deduct extra pp if targeting pressure ability holder", async function () {
                    const mon = sh.initActive("p1");
                    expect(mon.moveset.get("tackle")).to.be.null;
                    expect(mon.volatile.lastMove).to.be.null;
                    sh.initActive("p2").setAbility("pressure");

                    await ph.handle(moveEvent("p1", "tackle"));
                    await ph.return();
                    const move = mon.moveset.get("tackle");
                    expect(move).to.not.be.null;
                    expect(move).to.have.property("pp", 54);
                    expect(move).to.have.property("maxpp", 56);
                    expect(mon.volatile.lastMove).to.equal("tackle");
                });

                it("Should still not deduct pp if from lockedmove", async function () {
                    const mon = sh.initActive("p1");
                    const move = mon.moveset.reveal("tackle");
                    expect(move).to.have.property("pp", 56);
                    expect(move).to.have.property("maxpp", 56);
                    expect(mon.volatile.lastMove).to.be.null;
                    sh.initActive("p2").setAbility("pressure");

                    await ph.handle(
                        moveEvent("p1", "tackle", {
                            from: toEffectName("lockedmove"),
                        }),
                    );
                    await ph.return();
                    expect(move).to.have.property("pp", 56);
                    expect(move).to.have.property("maxpp", 56);
                    expect(mon.volatile.lastMove).to.equal("tackle");
                });

                it("Should deduct normal pp if not targeting pressure ability holder", async function () {
                    const mon = sh.initActive("p1");
                    expect(mon.moveset.get("splash")).to.be.null;
                    expect(mon.volatile.lastMove).to.be.null;
                    sh.initActive("p2").setAbility("pressure");

                    await ph.handle(moveEvent("p1", "splash"));
                    await ph.return();
                    const move = mon.moveset.get("splash");
                    expect(move).to.not.be.null;
                    expect(move).to.have.property("pp", 63);
                    expect(move).to.have.property("maxpp", 64);
                    expect(mon.volatile.lastMove).to.equal("splash");
                });
            });

            describe("called move", function () {
                it("Should not reveal move", async function () {
                    const mon = sh.initActive("p1");
                    expect(mon.moveset.get("tackle")).to.be.null;

                    await ph.handle(
                        moveEvent("p1", "tackle", {
                            from: toEffectName("metronome", "move"),
                        }),
                    );
                    await ph.return();
                    expect(mon.moveset.get("tackle")).to.be.null;
                });

                it("Should not update single-move, focus, lastMove, or stall", async function () {
                    const mon = sh.initActive("p1");
                    mon.volatile.destinybond = true;
                    mon.volatile.focus = true;
                    expect(mon.volatile.lastMove).to.be.null;
                    mon.volatile.stall(true);
                    expect(mon.volatile.stalling).to.be.true;

                    await ph.handle(
                        moveEvent("p1", "tackle", {
                            from: toEffectName("metronome", "move"),
                        }),
                    );
                    await ph.return();
                    expect(mon.volatile.destinybond).to.be.true;
                    expect(mon.volatile.focus).to.be.true;
                    expect(mon.volatile.lastMove).to.be.null;
                    expect(mon.volatile.stalling).to.be.true;
                });

                it("Should reveal move if calling from user's moveset via sleeptalk", async function () {
                    const mon = sh.initActive("p1");
                    expect(mon.moveset.get("tackle")).to.be.null;

                    await ph.handle(
                        moveEvent("p1", "tackle", {
                            from: toEffectName("sleeptalk", "move"),
                        }),
                    );
                    await ph.return();
                    const move = mon.moveset.get("tackle");
                    expect(move).to.not.be.null;
                    expect(move).to.have.property("pp", 56);
                    expect(move).to.have.property("maxpp", 56);
                });

                it("Should reveal move if calling from target's moveset via mefirst", async function () {
                    const mon1 = sh.initActive("p1");
                    expect(mon1.moveset.get("tackle")).to.be.null;
                    const mon2 = sh.initActive("p2");
                    expect(mon2.moveset.get("tackle")).to.be.null;

                    await ph.handle(
                        moveEvent("p1", "tackle", {
                            from: toEffectName("mefirst", "move"),
                        }),
                    );
                    await ph.return();
                    expect(mon1.moveset.get("tackle")).to.be.null;
                    const move = mon2.moveset.get("tackle");
                    expect(move).to.not.be.null;
                    expect(move).to.have.property("pp", 56);
                    expect(move).to.have.property("maxpp", 56);
                });
            });
        });

        describe("|switch|", function () {
            it("Should handle switch-in", async function () {
                sh.initActive("p1");
                sh.initActive("p2", smeargle, 2 /*size*/);

                await ph.handle({
                    args: [
                        "switch",
                        toIdent("p2", ditto),
                        toDetails(ditto),
                        toHPStatus(100),
                    ],
                    kwArgs: {},
                });
                await ph.return();
            });
        });

        describe("|drag|", function () {
            it("Should handle forced switch-in", async function () {
                sh.initActive("p1");
                sh.initActive("p2", smeargle, 2 /*size*/);

                await ph.handle({
                    args: [
                        "drag",
                        toIdent("p2", ditto),
                        toDetails(ditto),
                        toHPStatus(100),
                    ],
                    kwArgs: {},
                });
                await ph.return();
            });
        });

        describe("|detailschange|", function () {
            it("Should handle permanent form change", async function () {
                const mon = sh.initActive("p1", smeargle);
                expect(mon.species).to.equal("smeargle");
                expect(mon.baseSpecies).to.equal("smeargle");

                await ph.handle({
                    args: [
                        "detailschange",
                        toIdent("p1", ditto),
                        toDetails(ditto),
                    ],
                    kwArgs: {},
                });
                await ph.return();
                expect(mon.species).to.equal("ditto");
                expect(mon.baseSpecies).to.equal("ditto");
            });
        });

        describe("|cant|", function () {
            it("Should handle inactivity and clear single-move statuses", async function () {
                const mon = sh.initActive("p1");
                mon.volatile.destinybond = true;

                await ph.handle({
                    args: ["cant", toIdent("p1"), "flinch"],
                    kwArgs: {},
                });
                await ph.return();
            });

            it("Should reveal move if mentioned", async function () {
                const mon = sh.initActive("p1");
                mon.volatile.destinybond = true;
                expect(mon.moveset.get("tackle")).to.be.null;

                await ph.handle({
                    args: [
                        "cant",
                        toIdent("p1"),
                        "flinch",
                        toMoveName("tackle"),
                    ],
                    kwArgs: {},
                });
                await ph.return();
                expect(mon.moveset.get("tackle")).to.not.be.null;
            });

            describe("reason = Damp ability", function () {
                it("Should reveal blocking ability", async function () {
                    const mon1 = sh.initActive("p1");
                    expect(mon1.moveset.get("selfdestruct")).to.be.null;
                    const mon2 = sh.initActive("p2");
                    expect(mon2.ability).to.be.empty;
                    expect(mon2.baseAbility).to.be.empty;

                    await ph.handle({
                        args: [
                            "cant",
                            toIdent("p1"),
                            toEffectName("damp", "ability"),
                            toMoveName("selfdestruct"),
                        ],
                        kwArgs: {of: toIdent("p2")},
                    });
                    await ph.return();
                    expect(mon1.moveset.get("selfdestruct")).to.not.be.null;
                    expect(mon2.ability).to.equal("damp");
                    expect(mon2.baseAbility).to.equal("damp");
                });
            });

            describe("reason = Focus Punch move", function () {
                it("Should reset focus status", async function () {
                    const mon = sh.initActive("p1");
                    mon.volatile.focus = true;

                    await ph.handle({
                        args: ["cant", toIdent("p1"), toMoveName("focuspunch")],
                        kwArgs: {},
                    });
                    await ph.return();
                    expect(mon.volatile.focus).to.be.false;
                });
            });

            describe("reason = Imprison move", function () {
                it("Should reveal move for both sides", async function () {
                    const us = sh.initActive("p1").moveset;
                    const them = sh.initActive("p2").moveset;
                    expect(us.get("splash")).to.be.null;
                    expect(them.get("splash")).to.be.null;

                    await ph.handle({
                        args: [
                            "cant",
                            toIdent("p2"),
                            toMoveName("imprison"),
                            toMoveName("splash"),
                        ],
                        kwArgs: {},
                    });
                    await ph.return();
                    expect(us.get("splash")).to.not.be.null;
                    expect(them.get("splash")).to.not.be.null;
                });
            });

            describe("reason = nopp", function () {
                it("Should not reveal move", async function () {
                    const mon = sh.initActive("p1");
                    expect(mon.moveset.get("encore")).to.be.null;

                    await ph.handle({
                        args: [
                            "cant",
                            toIdent("p1"),
                            toEffectName("nopp"),
                            toMoveName("encore"),
                        ],
                        kwArgs: {},
                    });
                    await ph.return();
                    expect(mon.moveset.get("encore")).to.be.null;
                });
            });

            describe("reason = recharge", function () {
                it("Should reset mustRecharge status", async function () {
                    const mon = sh.initActive("p1");
                    mon.volatile.mustRecharge = true;

                    await ph.handle({
                        args: ["cant", toIdent("p1"), "recharge"],
                        kwArgs: {},
                    });
                    await ph.return();
                    expect(mon.volatile.mustRecharge).to.be.false;
                });
            });

            describe("reason = slp", function () {
                it("Should tick slp turns", async function () {
                    const mon = sh.initActive("p1");
                    mon.majorStatus.afflict("slp");
                    expect(mon.majorStatus.turns).to.equal(1);

                    await ph.handle({
                        args: ["cant", toIdent("p1"), "slp"],
                        kwArgs: {},
                    });
                    await ph.return();
                    expect(mon.majorStatus.turns).to.equal(2);
                });
            });

            describe("reason = Truant ability", function () {
                it("Should flip Truant state", async function () {
                    // First make sure the pokemon has truant.
                    const mon = sh.initActive("p1");
                    mon.setAbility("truant");
                    expect(mon.volatile.willTruant).to.be.false;

                    // Also flipped back on postTurn to sync with this event.
                    await ph.handle({
                        args: [
                            "cant",
                            toIdent("p1"),
                            toEffectName("truant", "ability"),
                        ],
                        kwArgs: {},
                    });
                    await ph.return();
                    // Note: postTurn() will flip this to properly sync.
                    expect(mon.volatile.willTruant).to.be.true;
                });

                it("Should overlap Truant turn with recharge turn", async function () {
                    // First make sure the pokemon has truant.
                    const mon = sh.initActive("p1");
                    mon.setAbility("truant");
                    expect(mon.volatile.willTruant).to.be.false;
                    mon.volatile.mustRecharge = true;

                    await ph.handle({
                        args: [
                            "cant",
                            toIdent("p1"),
                            toEffectName("truant", "ability"),
                        ],
                        kwArgs: {},
                    });
                    await ph.return();
                    expect(mon.volatile.willTruant).to.be.true;
                    expect(mon.volatile.mustRecharge).to.be.false;
                });
            });
        });

        describe("|faint|", function () {
            it("Should set hp to 0", async function () {
                const mon = sh.initActive("p2");
                expect(mon.hp.current).to.equal(100);

                await ph.handle({args: ["faint", toIdent("p2")], kwArgs: {}});
                await ph.return();
                expect(mon.hp.current).to.equal(0);
            });
        });

        describe("|-formechange|", function () {
            it("Should handle temporary form change", async function () {
                const mon = sh.initActive("p1", smeargle);
                expect(mon.species).to.equal("smeargle");
                expect(mon.baseSpecies).to.equal("smeargle");

                await ph.handle({
                    args: [
                        "-formechange",
                        toIdent("p1", smeargle),
                        toSpeciesName("ditto"),
                    ],
                    kwArgs: {},
                });
                await ph.return();
                expect(mon.species).to.equal("ditto");
                expect(mon.baseSpecies).to.equal("smeargle");
            });

            it("Should reveal forecast", async function () {
                state.status.weather.start("SunnyDay");
                const mon = sh.initActive("p1", castform);
                expect(mon.species).to.equal("castform");
                expect(mon.baseSpecies).to.equal("castform");

                await ph.handle({
                    args: [
                        "-formechange",
                        toIdent("p1", castform),
                        toSpeciesName("castformsunny"),
                    ],
                    kwArgs: {from: toEffectName("forecast", "ability")},
                });
                await ph.return();
                expect(mon.species).to.equal("castformsunny");
                expect(mon.baseSpecies).to.equal("castform");
                expect(mon.ability).to.equal("forecast");
            });
        });

        describe("|-fail|", function () {
            it("Should do nothing", async function () {
                await ph.handle({args: ["-fail", toIdent("p1")], kwArgs: {}});
                await ph.return();
            });

            it("Should reveal ability that caused the move failure", async function () {
                const mon = sh.initActive("p2");
                mon.revealAbility("");
                expect(mon.ability).to.be.empty;
                expect(mon.baseAbility).to.be.empty;

                await ph.handle({
                    args: ["-fail", toIdent("p1"), toEffectName("unboost")],
                    kwArgs: {
                        from: toEffectName("clearbody", "ability"),
                        of: toIdent("p2"),
                    },
                });
                await ph.return();
                expect(mon.ability).to.equal("clearbody");
                expect(mon.baseAbility).to.equal("clearbody");
            });
        });

        describe("|-block|", function () {
            it("Should do nothing since unsupported", async function () {
                await ph.handle({
                    args: ["-block", toIdent("p1"), toEffectName("Dynamax")],
                    kwArgs: {},
                });
                await ph.return();
            });
        });

        describe("|-notarget|", function () {
            it("Should do nothing", async function () {
                await ph.handle({args: ["-notarget"], kwArgs: {}});
                await ph.return();
            });
        });

        describe("|-miss|", function () {
            it("Should do nothing", async function () {
                await ph.handle({args: ["-miss", toIdent("p2")], kwArgs: {}});
                await ph.return();
            });
        });

        describe("|-damage|", function () {
            it("Should set hp", async function () {
                const mon = sh.initActive("p2");
                expect(mon.hp.current).to.equal(100);

                await ph.handle({
                    args: ["-damage", toIdent("p2"), toHPStatus(64)],
                    kwArgs: {},
                });
                await ph.return();
                expect(mon.hp.current).to.equal(64);
            });

            it("Should reveal ability that caused damage to self", async function () {
                const mon = sh.initActive("p2");
                mon.revealAbility("");
                expect(mon.ability).to.be.empty;
                expect(mon.baseAbility).to.be.empty;

                await ph.handle({
                    args: ["-damage", toIdent("p2"), toHPStatus(90)],
                    kwArgs: {from: toEffectName("solarpower", "ability")},
                });
                await ph.return();
                expect(mon.ability).to.equal("solarpower");
                expect(mon.baseAbility).to.equal("solarpower");
            });

            it("Should reveal ability that caused damage to target", async function () {
                sh.initActive("p2");
                const mon = sh.initActive("p1");
                mon.revealAbility("");
                expect(mon.ability).to.be.empty;
                expect(mon.baseAbility).to.be.empty;

                await ph.handle({
                    args: ["-damage", toIdent("p2"), toHPStatus(90)],
                    kwArgs: {
                        from: toEffectName("roughskin", "ability"),
                        of: toIdent("p1"),
                    },
                });
                await ph.return();
                expect(mon.ability).to.equal("roughskin");
                expect(mon.baseAbility).to.equal("roughskin");
            });

            it("Should reveal item that caused damage to self", async function () {
                const mon = sh.initActive("p2");
                expect(mon.item).to.be.empty;

                await ph.handle({
                    args: ["-damage", toIdent("p2"), toHPStatus(90)],
                    kwArgs: {from: toEffectName("lifeorb", "item")},
                });
                await ph.return();
                expect(mon.item).to.equal("lifeorb");
            });
        });

        describe("|-heal|", function () {
            it("Should set hp", async function () {
                const mon = sh.initActive("p2");
                mon.hp.set(43);

                await ph.handle({
                    args: ["-heal", toIdent("p2"), toHPStatus(92)],
                    kwArgs: {},
                });
                await ph.return();
                expect(mon.hp.current).to.equal(92);
            });

            it("Should reveal ability that caused self-heal", async function () {
                state.status.weather.start("Hail");
                const mon = sh.initActive("p2");
                mon.hp.set(90);
                mon.revealAbility("");
                expect(mon.ability).to.be.empty;
                expect(mon.baseAbility).to.be.empty;

                await ph.handle({
                    args: ["-heal", toIdent("p2"), toHPStatus(95)],
                    kwArgs: {from: toEffectName("icebody", "ability")},
                });
                await ph.return();
                expect(mon.ability).to.equal("icebody");
                expect(mon.baseAbility).to.equal("icebody");
            });

            it("Should reveal item that caused self-heal", async function () {
                const mon = sh.initActive("p2");
                mon.hp.set(90);
                expect(mon.item).to.be.empty;

                await ph.handle({
                    args: ["-heal", toIdent("p2"), toHPStatus(95)],
                    kwArgs: {from: toEffectName("leftovers", "item")},
                });
                await ph.return();
                expect(mon.item).to.equal("leftovers");
            });

            it("Should consume lunardance status and restore move pp if mentioned", async function () {
                const mon = sh.initActive("p2");
                mon.team!.status.lunardance = true;
                mon.hp.set(31);
                mon.majorStatus.afflict("slp");
                const move = mon.moveset.reveal("tackle");
                move.pp = 3;

                await ph.handle({
                    args: ["-heal", toIdent("p2"), toHPStatus(100)],
                    kwArgs: {from: toEffectName("lunardance", "move")},
                });
                await ph.return();
                expect(mon.hp.current).to.equal(100);
                expect(mon.majorStatus.current).to.be.null;
                expect(mon.team!.status.lunardance).to.be.false;
                expect(move.pp).to.equal(move.maxpp);
            });

            it("Should consume healingwish status if mentioned", async function () {
                const mon = sh.initActive("p2");
                mon.team!.status.healingwish = true;
                mon.hp.set(31);
                mon.majorStatus.afflict("psn");

                await ph.handle({
                    args: ["-heal", toIdent("p2"), toHPStatus(100)],
                    kwArgs: {from: toEffectName("healingwish", "move")},
                });
                await ph.return();
                expect(mon.hp.current).to.equal(100);
                expect(mon.majorStatus.current).to.be.null;
                expect(mon.team!.status.healingwish).to.be.false;
            });

            it("Should consume wish status if mentioned", async function () {
                const [, mon] = sh.initTeam("p2", [ditto, smeargle]);
                mon.hp.set(2);
                state.getTeam("p2").status.wish.start();

                await ph.handle({
                    args: ["-heal", toIdent("p2"), toHPStatus(100)],
                    kwArgs: {
                        from: toEffectName("wish", "move"),
                        wisher: toNickname("Ditto"),
                    },
                });
                await ph.return();
                expect(mon.hp.current).to.equal(100);
                expect(mon.team!.status.wish.isActive).to.be.false;
            });
        });

        describe("|-sethp|", function () {
            it("Should set hp for one target", async function () {
                const mon = sh.initActive("p2");
                mon.hp.set(11);

                await ph.handle({
                    args: ["-sethp", toIdent("p2"), toHPStatus(1)],
                    kwArgs: {},
                });
                await ph.return();
                expect(mon.hp.current).to.equal(1);
            });

            it("Should set hp for two targets", async function () {
                const mon1 = sh.initActive("p1");
                mon1.hp.set(16);
                const mon2 = sh.initActive("p2");
                mon2.hp.set(11);

                await ph.handle({
                    args: [
                        "-sethp",
                        toIdent("p2"),
                        toNum(19),
                        toIdent("p1"),
                        toNum(13),
                    ],
                    kwArgs: {},
                });
                await ph.return();
                expect(mon1.hp.current).to.equal(13);
                expect(mon2.hp.current).to.equal(19);
            });

            it("Should throw if first health number is invalid", async function () {
                sh.initActive("p1");
                sh.initActive("p2");

                await ph.reject({
                    args: [
                        "-sethp",
                        toIdent("p2"),
                        toNum(NaN),
                        toIdent("p1"),
                        toNum(13),
                    ],
                    kwArgs: {},
                });
                await ph.error(Error, "Invalid health number 'NaN'");
            });

            it("Should throw if second health number is invalid", async function () {
                sh.initActive("p1");
                sh.initActive("p2");

                await ph.reject({
                    args: [
                        "-sethp",
                        toIdent("p2"),
                        toNum(50),
                        toIdent("p1"),
                        toNum(NaN),
                    ],
                    kwArgs: {},
                });
                await ph.error(Error, "Invalid health number 'NaN'");
            });
        });

        describe("|-status|", function () {
            it("Should afflict major status", async function () {
                const mon = sh.initActive("p1");
                expect(mon.majorStatus.current).to.be.null;

                await ph.handle({
                    args: ["-status", toIdent("p1"), "brn"],
                    kwArgs: {},
                });
                await ph.return();
                expect(mon.majorStatus.current).to.equal("brn");
            });

            it("Should reveal ability that caused status", async function () {
                sh.initActive("p1");
                const mon = sh.initActive("p2");
                mon.revealAbility("");
                expect(mon.ability).to.be.empty;
                expect(mon.baseAbility).to.be.empty;

                await ph.handle({
                    args: ["-status", toIdent("p1"), "psn"],
                    kwArgs: {
                        from: toEffectName("poisonpoint", "ability"),
                        of: toIdent("p2"),
                    },
                });
                await ph.return();
                expect(mon.ability).to.equal("poisonpoint");
                expect(mon.baseAbility).to.equal("poisonpoint");
            });

            it("Should reveal item that caused status", async function () {
                const mon = sh.initActive("p1");
                expect(mon.item).to.be.empty;

                await ph.handle({
                    args: ["-status", toIdent("p1"), "tox"],
                    kwArgs: {from: toEffectName("toxicorb", "item")},
                });
                await ph.return();
                expect(mon.item).to.equal("toxicorb");
            });
        });

        describe("|-curestatus|", function () {
            it("Should cure major status", async function () {
                const mon = sh.initActive("p1");
                mon.majorStatus.afflict("frz");

                await ph.handle({
                    args: ["-curestatus", toIdent("p1"), "frz"],
                    kwArgs: {},
                });
                await ph.return();
                expect(mon.majorStatus.current).to.be.null;
            });

            it("Should reveal ability that caused self-cure", async function () {
                const mon = sh.initActive("p1");
                mon.majorStatus.afflict("slp");
                mon.revealAbility("");
                expect(mon.ability).to.be.empty;
                expect(mon.baseAbility).to.be.empty;

                await ph.handle({
                    args: ["-curestatus", toIdent("p1"), "slp"],
                    kwArgs: {from: toEffectName("naturalcure", "ability")},
                });
                await ph.return();
                expect(mon.ability).to.equal("naturalcure");
                expect(mon.baseAbility).to.equal("naturalcure");
            });

            // Note: This usually happens due to healbell/aromatherapy move
            // effect, but the event that announces that effect already takes
            // care of it.
            it("Should ignore bench cure for now", async function () {
                const [benched] = sh.initTeam("p1", [ditto, smeargle]);
                benched.majorStatus.afflict("frz");

                await ph.handle({
                    args: ["-curestatus", toIdent("p1", ditto, null), "frz"],
                    kwArgs: {silent: true},
                });
                await ph.return();
                expect(benched.majorStatus.current).to.equal("frz");
            });
        });

        describe("|-cureteam|", function () {
            it("Should cure major status of every pokemon on the team", async function () {
                const [bench, active] = sh.initTeam("p1", [ditto, smeargle]);
                bench.majorStatus.afflict("slp");
                active.majorStatus.afflict("par");

                await ph.handle({
                    args: ["-cureteam", toIdent("p1")],
                    kwArgs: {},
                });
                await ph.return();
                expect(bench.majorStatus.current).to.be.null;
                expect(active.majorStatus.current).to.be.null;
            });
        });

        describe("|-boost|", function () {
            it("Should add boost", async function () {
                const {boosts} = sh.initActive("p1").volatile;
                boosts.atk = 1;

                await ph.handle({
                    args: ["-boost", toIdent("p1"), "atk", toNum(2)],
                    kwArgs: {},
                });
                await ph.return();
                expect(boosts.atk).to.equal(3);
            });

            it("Should throw if invalid boost number", async function () {
                sh.initActive("p1");

                await ph.reject({
                    args: ["-boost", toIdent("p1"), "atk", toNum(NaN)],
                    kwArgs: {},
                });
                await ph.error(Error, "Invalid boost num 'NaN'");
            });
        });

        describe("|-unboost|", function () {
            it("Should subtract boost", async function () {
                const {boosts} = sh.initActive("p2").volatile;
                boosts.spe = 5;

                await ph.handle({
                    args: ["-unboost", toIdent("p2"), "spe", toNum(4)],
                    kwArgs: {},
                });
                await ph.return();
                expect(boosts.spe).to.equal(1);
            });

            it("Should throw if invalid unboost number", async function () {
                sh.initActive("p1");

                await ph.reject({
                    args: ["-unboost", toIdent("p1"), "atk", toNum(NaN)],
                    kwArgs: {},
                });
                await ph.error(Error, "Invalid unboost num 'NaN'");
            });
        });

        describe("|-setboost|", function () {
            it("Should set boost", async function () {
                const {boosts} = sh.initActive("p2").volatile;
                boosts.evasion = -2;

                await ph.handle({
                    args: ["-setboost", toIdent("p2"), "evasion", toNum(2)],
                    kwArgs: {},
                });
                await ph.return();
                expect(boosts.evasion).to.equal(2);
            });

            it("Should throw if invalid boost number", async function () {
                sh.initActive("p2");

                await ph.reject({
                    args: ["-setboost", toIdent("p2"), "spe", toNum(NaN)],
                    kwArgs: {},
                });
                await ph.error(Error, "Invalid setboost num 'NaN'");
            });
        });

        describe("|-swapboost|", function () {
            it("Should swap boosts", async function () {
                const us = sh.initActive("p1").volatile.boosts;
                const them = sh.initActive("p2").volatile.boosts;
                us.accuracy = 4;
                them.accuracy = 3;
                them.spd = -1;
                them.spe = 2;

                await ph.handle({
                    args: [
                        "-swapboost",
                        toIdent("p1"),
                        toIdent("p2"),
                        toBoostIDs("accuracy", "spe"),
                    ],
                    kwArgs: {},
                });
                await ph.return();
                expect(us.accuracy).to.equal(3);
                expect(us.spd).to.equal(0);
                expect(us.spe).to.equal(2);
                expect(them.accuracy).to.equal(4);
                expect(them.spd).to.equal(-1);
                expect(them.spe).to.equal(0);
            });

            it("Should swap all boosts if none are mentioned", async function () {
                const us = sh.initActive("p1").volatile.boosts;
                const them = sh.initActive("p2").volatile.boosts;
                us.def = 2;
                us.spa = 1;
                us.spd = -5;
                us.evasion = 6;
                them.atk = 4;
                them.spa = -1;
                them.spe = -3;
                them.accuracy = 3;
                const usOld = {...us};
                const themOld = {...them};

                await ph.handle({
                    args: ["-swapboost", toIdent("p1"), toIdent("p2")],
                    kwArgs: {},
                });
                await ph.return();
                expect(us).to.deep.equal(themOld);
                expect(them).to.deep.equal(usOld);
            });
        });

        describe("|-invertboost|", function () {
            it("Should invert boosts", async function () {
                const {boosts} = sh.initActive("p1").volatile;
                boosts.spe = 1;
                boosts.atk = -1;

                await ph.handle({
                    args: ["-invertboost", toIdent("p1")],
                    kwArgs: {},
                });
                await ph.return();
                expect(boosts.spe).to.equal(-1);
                expect(boosts.atk).to.equal(1);
            });
        });

        describe("|-clearboost|", function () {
            it("Should clear boosts", async function () {
                const {boosts} = sh.initActive("p1").volatile;
                boosts.spe = -3;
                boosts.accuracy = 6;

                await ph.handle({
                    args: ["-clearboost", toIdent("p1")],
                    kwArgs: {},
                });
                await ph.return();
                expect(boosts.spe).to.equal(0);
                expect(boosts.accuracy).to.equal(0);
            });
        });

        describe("|-clearallboost|", function () {
            it("Should clear all boosts from both sides", async function () {
                const us = sh.initActive("p1").volatile.boosts;
                const them = sh.initActive("p2").volatile.boosts;
                us.accuracy = 2;
                them.spe = -2;

                await ph.handle({args: ["-clearallboost"], kwArgs: {}});
                await ph.return();
                expect(us.accuracy).to.equal(0);
                expect(them.spe).to.equal(0);
            });
        });

        describe("|-clearpositiveboost|", function () {
            it("Should clear positive boosts", async function () {
                const {boosts} = sh.initActive("p1").volatile;
                boosts.spd = 3;
                boosts.def = -1;

                await ph.handle({
                    args: [
                        "-clearpositiveboost",
                        toIdent("p1"),
                        // Source pokemon/effect (note: unsupported move).
                        toIdent("p2"),
                        toEffectName("move: Spectral Thief"),
                    ],
                    kwArgs: {},
                });
                await ph.return();
                expect(boosts.spd).to.equal(0);
                expect(boosts.def).to.equal(-1);
            });
        });

        describe("|-clearnegativeboost|", function () {
            it("Should clear negative boosts", async function () {
                const {boosts} = sh.initActive("p1").volatile;
                boosts.evasion = 2;
                boosts.spa = -3;

                await ph.handle({
                    args: ["-clearnegativeboost", toIdent("p1")],
                    kwArgs: {},
                });
                await ph.return();
                expect(boosts.evasion).to.equal(2);
                expect(boosts.spa).to.equal(0);
            });
        });

        describe("|-copyboost|", function () {
            it("Should copy boosts", async function () {
                const us = sh.initActive("p1").volatile.boosts;
                const them = sh.initActive("p2").volatile.boosts;
                us.evasion = 3;
                us.def = -1;
                them.def = 4;

                await ph.handle({
                    args: [
                        // Order of idents is [source, target].
                        "-copyboost",
                        toIdent("p1"),
                        toIdent("p2"),
                        toBoostIDs("def"),
                    ],
                    kwArgs: {},
                });
                await ph.return();
                expect(us.evasion).to.equal(3);
                expect(us.def).to.equal(-1);
                expect(them.def).to.equal(-1);
            });

            it("Should copy all boosts if none are mentioned", async function () {
                const us = sh.initActive("p1").volatile.boosts;
                const them = sh.initActive("p2").volatile.boosts;
                us.atk = 2;
                them.atk = -2;

                await ph.handle({
                    args: ["-copyboost", toIdent("p1"), toIdent("p2")],
                    kwArgs: {},
                });
                await ph.return();
                expect(us.atk).to.equal(2);
                expect(them.atk).to.equal(2);
            });
        });

        describe("|-weather|", function () {
            const weatherEvent = (
                type: dex.WeatherType | "none",
                kwArgs: Event<"|-weather|">["kwArgs"] = {},
            ): Event<"|-weather|"> => ({
                args: ["-weather", type === "none" ? type : toWeather(type)],
                kwArgs,
            });

            beforeEach("Assert weather is none initially", function () {
                expect(state.status.weather.type).to.equal("none");
            });

            it("Should set weather", async function () {
                await ph.handle(weatherEvent("Sandstorm"));
                await ph.return();
                expect(state.status.weather.type).to.equal("Sandstorm");
                expect(state.status.weather.duration).to.equal(8);
                expect(state.status.weather.infinite).to.be.false;
            });

            it("Should reveal ability that caused weather and infer infinite duration", async function () {
                const mon = sh.initActive("p2");
                mon.revealAbility("");
                expect(mon.ability).to.be.empty;
                expect(mon.baseAbility).to.be.empty;

                await ph.handle(
                    weatherEvent("SunnyDay", {
                        from: toEffectName("drought", "ability"),
                        of: toIdent("p2"),
                    }),
                );
                await ph.return();
                expect(mon.ability).to.equal("drought");
                expect(mon.baseAbility).to.equal("drought");
                expect(state.status.weather.type).to.equal("SunnyDay");
                expect(state.status.weather.duration).to.equal(8);
                expect(state.status.weather.infinite).to.be.true;
            });

            it("Should reset weather set to 'none'", async function () {
                state.status.weather.start("Hail");
                expect(state.status.weather.type).to.equal("Hail");

                await ph.handle(weatherEvent("none"));
                await ph.return();
                expect(state.status.weather.type).to.equal("none");
            });

            it("Should tick weather if [upkeep] suffix", async function () {
                state.status.weather.start("RainDance");
                expect(state.status.weather.turns).to.equal(0);

                await ph.handle(weatherEvent("RainDance", {upkeep: true}));
                await ph.return();
                expect(state.status.weather.turns).to.equal(1);
            });
        });

        // Tests for fieldstart/fieldend.
        for (const start of [true, false]) {
            const verb = start ? "start" : "end";
            const eventName = `-field${verb}` as const;
            const name = `|${eventName}|`;
            describe(name, function () {
                // Pseudo-weathers
                for (const effect of ["gravity", "trickroom"] as const) {
                    it(`Should ${verb} ${effect}`, async function () {
                        if (!start) {
                            state.status[effect].start();
                        }
                        expect(state.status[effect].isActive).to.be[
                            start ? "false" : "true"
                        ];

                        await ph.handle({
                            args: [eventName, toFieldCondition(effect)],
                            kwArgs: {},
                        });
                        await ph.return();
                        expect(state.status[effect].isActive).to.be[
                            start ? "true" : "false"
                        ];
                    });
                }
            });
        }

        // Tests for sidestart/sideend.
        for (const start of [true, false]) {
            const verb = start ? "start" : "end";
            const eventName = `-side${verb}` as const;
            const name = `|${eventName}|`;
            describe(name, function () {
                for (const effect of [
                    "lightscreen",
                    "luckychant",
                    "mist",
                    "reflect",
                    "safeguard",
                    "tailwind",
                ] as const) {
                    const condition = toSideCondition(effect);
                    it(`Should ${verb} ${effect}`, async function () {
                        const ts = state.getTeam("p1").status;
                        if (!start) {
                            ts[effect].start();
                        }
                        expect(ts[effect].isActive).to.be[
                            start ? "false" : "true"
                        ];

                        await ph.handle({
                            args: [
                                eventName,
                                toSide("p1", "player1"),
                                condition,
                            ],
                            kwArgs: {},
                        });
                        await ph.return();
                        expect(ts[effect].isActive).to.be[
                            start ? "true" : "false"
                        ];
                    });
                }

                for (const effect of [
                    "spikes",
                    "stealthrock",
                    "toxicspikes",
                ] as const) {
                    const condition = toSideCondition(effect);
                    it(`Should ${verb} ${effect}`, async function () {
                        const {status: ts} = state.getTeam("p1");
                        if (!start) {
                            ts[effect] = 1;
                        }
                        expect(ts[effect]).to.equal(start ? 0 : 1);

                        await ph.handle({
                            args: [
                                eventName,
                                toSide("p1", "player1"),
                                condition,
                            ],
                            kwArgs: {},
                        });
                        await ph.return();
                        expect(ts[effect]).to.equal(start ? 1 : 0);
                    });
                }
            });
        }

        describe("|-swapsideconditions|", function () {
            it("Should do nothing since unsupported", async function () {
                await ph.handle({args: ["-swapsideconditions"], kwArgs: {}});
                await ph.return();
            });
        });

        // Tests for start/end.
        for (const start of [true, false]) {
            const verb = start ? "start" : "end";
            const eventName = `-${verb}` as const;
            const name = `|${eventName}|`;
            describe(name, function () {
                if (start) {
                    it("Should start flashfire and reveal ability", async function () {
                        const mon = sh.initActive("p1");
                        mon.revealAbility("");
                        expect(mon.ability).to.be.empty;
                        expect(mon.baseAbility).to.be.empty;
                        expect(mon.volatile.flashfire).to.be.false;

                        await ph.handle({
                            args: [
                                "-start",
                                toIdent("p1"),
                                toEffectName(toAbilityName("flashfire")),
                            ],
                            kwArgs: {},
                        });
                        await ph.return();
                        expect(mon.ability).to.equal("flashfire");
                        expect(mon.baseAbility).to.equal("flashfire");
                        expect(mon.volatile.flashfire).to.be.true;
                    });

                    it("Should start typechange", async function () {
                        const mon = sh.initActive("p1", ditto);
                        expect(mon.types).to.have.members(["normal", "???"]);
                        expect(mon.baseTypes).to.have.members([
                            "normal",
                            "???",
                        ]);

                        await ph.handle({
                            args: [
                                "-start",
                                toIdent("p1"),
                                "typechange",
                                toTypes("dark", "rock"),
                            ],
                            kwArgs: {},
                        });
                        await ph.return();
                        expect(mon.types).to.have.members(["dark", "rock"]);
                        expect(mon.baseTypes).to.have.members([
                            "normal",
                            "???",
                        ]);
                    });

                    it("Should truncate typechange if more than 2 types given", async function () {
                        const mon = sh.initActive("p1", ditto);
                        expect(mon.types).to.have.members(["normal", "???"]);
                        expect(mon.baseTypes).to.have.members([
                            "normal",
                            "???",
                        ]);

                        await ph.handle({
                            args: [
                                "-start",
                                toIdent("p1"),
                                "typechange",
                                toTypes("dragon", "ghost", "psychic"),
                            ],
                            kwArgs: {},
                        });
                        await ph.return();
                        expect(mon.types).to.have.members(["dragon", "ghost"]);
                        expect(mon.baseTypes).to.have.members([
                            "normal",
                            "???",
                        ]);
                    });

                    it("Should expand typechange if 1 type given", async function () {
                        const mon = sh.initActive("p1", ditto);
                        expect(mon.types).to.have.members(["normal", "???"]);
                        expect(mon.baseTypes).to.have.members([
                            "normal",
                            "???",
                        ]);

                        await ph.handle({
                            args: [
                                "-start",
                                toIdent("p1"),
                                "typechange",
                                toTypes("psychic"),
                            ],
                            kwArgs: {},
                        });
                        await ph.return();
                        expect(mon.types).to.have.members(["psychic", "???"]);
                        expect(mon.baseTypes).to.have.members([
                            "normal",
                            "???",
                        ]);
                    });

                    it("Should expand typechange if 0 types given", async function () {
                        const mon = sh.initActive("p1", ditto);
                        expect(mon.types).to.have.members(["normal", "???"]);
                        expect(mon.baseTypes).to.have.members([
                            "normal",
                            "???",
                        ]);

                        await ph.handle({
                            args: ["-start", toIdent("p1"), "typechange"],
                            kwArgs: {},
                        });
                        await ph.return();
                        expect(mon.types).to.have.members(["???", "???"]);
                        expect(mon.baseTypes).to.have.members([
                            "normal",
                            "???",
                        ]);
                    });

                    it("Should count perish", async function () {
                        const mon = sh.initActive("p1", ditto);
                        expect(mon.volatile.perish).to.equal(0);

                        await ph.handle({
                            args: [
                                "-start",
                                toIdent("p1"),
                                toEffectName("perish2"),
                            ],
                            kwArgs: {},
                        });
                        await ph.return();
                        expect(mon.volatile.perish).to.equal(2);
                    });

                    it("Should count stockpile", async function () {
                        const mon = sh.initActive("p1", ditto);
                        expect(mon.volatile.stockpile).to.equal(0);

                        await ph.handle({
                            args: [
                                "-start",
                                toIdent("p1"),
                                toEffectName("stockpile1"),
                            ],
                            kwArgs: {},
                        });
                        await ph.return();
                        expect(mon.volatile.stockpile).to.equal(1);
                    });

                    it("Should reveal ability that caused self-effect", async function () {
                        const mon = sh.initActive("p1", ditto);
                        mon.revealAbility("");
                        expect(mon.ability).to.be.empty;
                        expect(mon.baseAbility).to.be.empty;
                        expect(mon.types).to.have.members(["normal", "???"]);
                        expect(mon.baseTypes).to.have.members([
                            "normal",
                            "???",
                        ]);

                        await ph.handle({
                            args: [
                                "-start",
                                toIdent("p1"),
                                "typechange",
                                toTypes("water"),
                            ],
                            kwArgs: {
                                from: toEffectName("colorchange", "ability"),
                            },
                        });
                        await ph.return();
                        expect(mon.types).to.have.members(["water", "???"]);
                        expect(mon.baseTypes).to.have.members([
                            "normal",
                            "???",
                        ]);
                    });

                    it("Should reveal ability that caused effect on target", async function () {
                        sh.initActive("p1");
                        const mon = sh.initActive("p2");
                        mon.revealAbility("");
                        expect(mon.ability).to.be.empty;
                        expect(mon.baseAbility).to.be.empty;

                        await ph.handle({
                            args: [
                                "-start",
                                toIdent("p1"),
                                toEffectName("attract", "move"),
                            ],
                            kwArgs: {
                                from: toEffectName("cutecharm", "ability"),
                                of: toIdent("p2"),
                            },
                        });
                        await ph.return();
                        expect(mon.ability).to.equal("cutecharm");
                        expect(mon.baseAbility).to.equal("cutecharm");
                    });
                } else {
                    it("Should end stockpile", async function () {
                        const mon = sh.initActive("p1", ditto);
                        mon.volatile.stockpile = 3;

                        await ph.handle({
                            args: [
                                "-end",
                                toIdent("p1"),
                                toEffectName("stockpile"),
                            ],
                            kwArgs: {},
                        });
                        await ph.return();
                        expect(mon.volatile.stockpile).to.equal(0);
                    });
                }

                for (const effect of [
                    "aquaring",
                    "attract",
                    "curse",
                    "focusenergy",
                    "imprison",
                    "ingrain",
                    "mudsport",
                    "leechseed",
                    "nightmare",
                    "powertrick",
                    "substitute",
                    "torment",
                    "watersport",
                ] as const) {
                    it(`Should ${verb} ${effect}`, async function () {
                        const mon = sh.initActive("p1");
                        if (!start) {
                            mon.volatile[effect] = true;
                        }
                        expect(mon.volatile[effect]).to.be[
                            start ? "false" : "true"
                        ];

                        await ph.handle({
                            args: [
                                eventName,
                                toIdent("p1"),
                                toEffectName(effect, "move"),
                            ],
                            kwArgs: {},
                        });
                        await ph.return();
                        expect(mon.volatile[effect]).to.be[
                            start ? "true" : "false"
                        ];
                    });
                }

                for (const [effect, type] of [
                    ["bide", "move"],
                    ["confusion", undefined],
                    ["embargo", "move"],
                    ["healblock", "move"],
                    ["magnetrise", "move"],
                    ["slowstart", "ability"],
                    ["taunt", "move"],
                    ["uproar", "move"],
                    ["yawn", "move"],
                ] as const) {
                    const also =
                        start && effect === "slowstart"
                            ? " and reveal ability"
                            : "";
                    it(`Should ${verb} ${effect}${also}`, async function () {
                        const mon = sh.initActive("p1");
                        if (!start) {
                            mon.volatile[effect].start();
                        } else if (effect === "slowstart") {
                            mon.revealAbility("");
                            expect(mon.ability).to.be.empty;
                            expect(mon.baseAbility).to.be.empty;
                        }
                        expect(mon.volatile[effect].isActive).to.be[
                            start ? "false" : "true"
                        ];

                        await ph.handle({
                            args: [
                                eventName,
                                toIdent("p1"),
                                toEffectName(effect, type),
                            ],
                            kwArgs: {},
                        });
                        await ph.return();
                        if (start && effect === "slowstart") {
                            expect(mon.ability).to.equal("slowstart");
                            expect(mon.baseAbility).to.equal("slowstart");
                        }
                        expect(mon.volatile[effect].isActive).to.be[
                            start ? "true" : "false"
                        ];
                    });

                    if (start && effect === "confusion") {
                        it("Should reset rampage status if starting confusion due to fatigue", async function () {
                            const mon = sh.initActive("p2");
                            mon.volatile.rampage.start("outrage");

                            await ph.handle({
                                args: [
                                    "-start",
                                    toIdent("p2"),
                                    toEffectName(effect, type),
                                ],
                                kwArgs: {fatigue: true},
                            });
                            await ph.return();
                            expect(mon.volatile.rampage.isActive).to.be.false;
                        });
                    }

                    if (start && effect === "uproar") {
                        it("Should tick uproar if upkeep and already active", async function () {
                            const mon = sh.initActive("p1");
                            expect(mon.volatile[effect].isActive).to.be.false;

                            // First start the effect.
                            mon.volatile[effect].start();
                            expect(mon.volatile[effect].isActive).to.be.true;
                            expect(mon.volatile[effect].turns).to.equal(0);

                            // Then update it.
                            await ph.handle({
                                args: [
                                    "-start",
                                    toIdent("p1"),
                                    toEffectName(effect, type),
                                ],
                                kwArgs: {upkeep: true},
                            });
                            await ph.return();
                            expect(mon.volatile[effect].isActive).to.be.true;
                            expect(mon.volatile[effect].turns).to.equal(1);
                        });
                    }
                }

                // Disable move status.
                if (start) {
                    it("Should disable move", async function () {
                        const mon = sh.initActive("p2");

                        await ph.handle({
                            args: [
                                "-start",
                                toIdent("p2"),
                                toEffectName("disable", "move"),
                                toMoveName("tackle"),
                            ],
                            kwArgs: {},
                        });
                        await ph.return();
                        expect(mon.volatile.disabled.move).to.equal("tackle");
                        expect(mon.volatile.disabled.ts.isActive).to.be.true;
                    });
                } else {
                    it("Should re-enable disabled moves", async function () {
                        const mon = sh.initActive("p2");
                        mon.volatile.disableMove("tackle");
                        expect(mon.volatile.disabled.move).to.equal("tackle");
                        expect(mon.volatile.disabled.ts.isActive).to.be.true;

                        await ph.handle({
                            args: [
                                "-end",
                                toIdent("p2"),
                                toEffectName("disable", "move"),
                            ],
                            kwArgs: {},
                        });
                        await ph.return();
                        expect(mon.volatile.disabled.move).to.be.null;
                        expect(mon.volatile.disabled.ts.isActive).to.be.false;
                    });
                }

                it(`Should ${verb} encore`, async function () {
                    const mon = sh.initActive("p1");
                    if (!start) {
                        mon.volatile.encoreMove("tackle");
                        expect(mon.volatile.encore.ts.isActive).to.be.true;
                        expect(mon.volatile.encore.move).to.equal("tackle");
                    } else {
                        mon.volatile.lastMove = "tackle";
                        expect(mon.volatile.encore.ts.isActive).to.be.false;
                        expect(mon.volatile.encore.move).to.be.null;
                    }

                    await ph.handle({
                        args: [
                            eventName,
                            toIdent("p1"),
                            toEffectName("encore", "move"),
                        ],
                        kwArgs: {},
                    });
                    await ph.return();
                    expect(
                        mon.volatile.encore.ts.isActive,
                    ).to.be[start ? "true" : "false"];
                    if (start) {
                        expect(mon.volatile.encore.move).to.equal("tackle");
                    } else {
                        expect(mon.volatile.encore.move).to.be.null;
                    }
                });

                for (const effect of ["foresight", "miracleeye"] as const) {
                    it(`Should ${verb} ${effect}`, async function () {
                        const mon = sh.initActive("p1");
                        if (!start) {
                            mon.volatile.identified = effect;
                        } else {
                            expect(mon.volatile.identified).to.be.null;
                        }

                        await ph.handle({
                            args: [
                                eventName,
                                toIdent("p1"),
                                toEffectName(effect, "move"),
                            ],
                            kwArgs: {},
                        });
                        await ph.return();
                        if (start) {
                            expect(mon.volatile.identified).to.equal(effect);
                        } else {
                            expect(mon.volatile.identified).to.be.null;
                        }
                    });
                }

                it(`Should ${
                    start ? "prepare" : "release"
                } future move`, async function () {
                    sh.initActive("p1");
                    sh.initActive("p2");
                    const team = state.getTeam("p1");
                    if (!start) {
                        team.status.futureMoves.doomdesire.start();
                    }
                    expect(
                        team.status.futureMoves.doomdesire.isActive,
                    ).to.be[start ? "false" : "true"];

                    await ph.handle({
                        args: [
                            // Note: Start mentions user, end mentions target.
                            eventName,
                            toIdent(start ? "p1" : "p2"),
                            toMoveName("doomdesire"),
                        ],
                        kwArgs: {},
                    });
                    await ph.return();
                    expect(
                        team.status.futureMoves.doomdesire.isActive,
                    ).to.be[start ? "true" : "false"];
                });

                it("Should ignore invalid effect", async function () {
                    sh.initActive("p1");

                    await ph.handle({
                        args: [
                            eventName,
                            toIdent("p1"),
                            toEffectName("invalid"),
                        ],
                        kwArgs: {},
                    });
                    await ph.return();
                });
            });
        }

        describe("|-crit|", function () {
            it("Should do nothing", async function () {
                await ph.handle({args: ["-crit", toIdent("p2")], kwArgs: {}});
                await ph.return();
            });
        });

        describe("|-supereffective|", function () {
            it("Should do nothing", async function () {
                await ph.handle({
                    args: ["-supereffective", toIdent("p2")],
                    kwArgs: {},
                });
                await ph.return();
            });
        });

        describe("|-resisted|", function () {
            it("Should do nothing", async function () {
                await ph.handle({
                    args: ["-resisted", toIdent("p2")],
                    kwArgs: {},
                });
                await ph.return();
            });
        });

        describe("|-immune|", function () {
            it("Should do nothing", async function () {
                await ph.handle({args: ["-immune", toIdent("p2")], kwArgs: {}});
                await ph.return();
            });

            it("Should reveal ability that caused immunity", async function () {
                const mon = sh.initActive("p2");
                mon.revealAbility("");
                expect(mon.ability).to.be.empty;
                expect(mon.baseAbility).to.be.empty;

                await ph.handle({
                    args: ["-immune", toIdent("p2")],
                    kwArgs: {from: toEffectName("levitate", "ability")},
                });
                await ph.return();
                expect(mon.ability).to.equal("levitate");
                expect(mon.baseAbility).to.equal("levitate");
            });
        });

        describe("|-item|", function () {
            it("Should set item", async function () {
                const mon = sh.initActive("p1");
                expect(mon.item).to.be.empty;

                await ph.handle({
                    args: ["-item", toIdent("p1"), toItemName("mail")],
                    kwArgs: {},
                });
                await ph.return();
                expect(mon.item).to.equal("mail");
            });

            it("Should handle recycle effect", async function () {
                const mon = sh.initActive("p1");
                mon.removeItem("mail");
                expect(mon.item).to.equal("none");
                expect(mon.lastItem).to.equal("mail");

                await ph.handle({
                    args: ["-item", toIdent("p1"), toItemName("mail")],
                    kwArgs: {from: toEffectName("recycle", "move")},
                });
                await ph.return();
                expect(mon.item).to.equal("mail");
                expect(mon.lastItem).to.equal("none");
            });

            it("Should reveal item due to frisk", async function () {
                const mon1 = sh.initActive("p1");
                expect(mon1.item).to.be.empty;
                const mon2 = sh.initActive("p2");
                mon2.revealAbility("");
                expect(mon2.ability).to.be.empty;
                expect(mon2.baseAbility).to.be.empty;

                await ph.handle({
                    args: ["-item", toIdent("p1"), toItemName("mail")],
                    kwArgs: {
                        from: toEffectName("frisk", "ability"),
                        of: toIdent("p2"),
                    },
                });
                expect(mon1.item).to.equal("mail");
                expect(mon2.ability).to.equal("frisk");
                expect(mon2.baseAbility).to.equal("frisk");
            });
        });

        describe("|-enditem|", function () {
            it("Should consume item", async function () {
                const mon = sh.initActive("p1");
                expect(mon.item).to.be.empty;
                expect(mon.lastItem).to.equal("none");

                await ph.handle({
                    args: ["-enditem", toIdent("p1"), toItemName("focussash")],
                    kwArgs: {},
                });
                await ph.return();
                expect(mon.item).to.equal("none");
                expect(mon.lastItem).to.equal("focussash");
            });

            it("Should eat item", async function () {
                const mon = sh.initActive("p1");
                expect(mon.item).to.be.empty;
                expect(mon.lastItem).to.equal("none");

                await ph.handle({
                    args: ["-enditem", toIdent("p1"), toItemName("lumberry")],
                    kwArgs: {eat: true},
                });
                await ph.return();
                expect(mon.item).to.equal("none");
                expect(mon.lastItem).to.equal("lumberry");
            });

            it("Should ignore resist berry effect", async function () {
                await ph.handle({
                    args: [
                        "-enditem",
                        toIdent("p1"),
                        toItemName("chopleberry"),
                    ],
                    kwArgs: {weaken: true},
                });
                await ph.return();
            });

            it("Should destroy item if from stealeat effect", async function () {
                const mon1 = sh.initActive("p1");
                const mon2 = sh.initActive("p2");
                expect(mon1.item).to.be.empty;
                expect(mon1.lastItem).to.equal("none");
                expect(mon2.item).to.be.empty;
                expect(mon2.lastItem).to.equal("none");

                await ph.handle({
                    args: ["-enditem", toIdent("p1"), toItemName("oranberry")],
                    kwArgs: {
                        from: toEffectName("stealeat"),
                        move: toMoveName("bugbite"),
                        of: toIdent("p2"),
                    },
                });
                await ph.return();
                expect(mon1.item).to.equal("none");
                expect(mon1.lastItem).to.equal("none");
                expect(mon2.item).to.be.empty;
                expect(mon2.lastItem).to.equal("none");
            });

            it("Should destroy item if from item-removal move", async function () {
                const mon1 = sh.initActive("p1");
                const mon2 = sh.initActive("p2");
                expect(mon1.item).to.be.empty;
                expect(mon1.lastItem).to.equal("none");
                expect(mon2.item).to.be.empty;
                expect(mon2.lastItem).to.equal("none");

                await ph.handle({
                    args: ["-enditem", toIdent("p1"), toItemName("oranberry")],
                    kwArgs: {
                        from: toEffectName("knockoff", "move"),
                        of: toIdent("p2"),
                    },
                });
                await ph.return();
                expect(mon1.item).to.equal("none");
                expect(mon1.lastItem).to.equal("none");
                expect(mon2.item).to.be.empty;
                expect(mon2.lastItem).to.equal("none");
            });

            it("Should consume micleberry status", async function () {
                const mon = sh.initActive("p1");
                mon.volatile.micleberry = true;
                expect(mon.item).to.be.empty;
                expect(mon.lastItem).to.equal("none");

                await ph.handle({
                    args: ["-enditem", toIdent("p1"), toItemName("micleberry")],
                    kwArgs: {},
                });
                await ph.return();
                expect(mon.volatile.micleberry).to.be.false;
                expect(mon.item).to.be.empty;
                expect(mon.lastItem).to.equal("none");
            });
        });

        describe("|-ability|", function () {
            it("Should indicate ability activation", async function () {
                const mon = sh.initActive("p1");
                mon.revealAbility("");
                expect(mon.ability).to.be.empty;
                expect(mon.baseAbility).to.be.empty;

                await ph.handle({
                    args: [
                        "-ability",
                        toIdent("p1"),
                        toAbilityName("pressure"),
                    ],
                    kwArgs: {},
                });
                await ph.return();
                expect(mon.ability).to.equal("pressure");
                expect(mon.baseAbility).to.equal("pressure");
            });

            it("Should not set base ability if acquired via effect", async function () {
                const mon = sh.initActive("p1");
                mon.revealAbility("");
                expect(mon.ability).to.be.empty;
                expect(mon.baseAbility).to.be.empty;

                await ph.handle({
                    args: [
                        "-ability",
                        toIdent("p1"),
                        toAbilityName("insomnia"),
                    ],
                    kwArgs: {from: toEffectName("worryseed", "move")},
                });
                await ph.return();
                expect(mon.ability).to.equal("insomnia");
                expect(mon.baseAbility).to.be.empty;
            });

            it("Should set abilities appropriately if acquired via trace", async function () {
                // Note: Traced ability activates before trace event, so here we
                // operate under the false assumption that p1 has the ability
                // directly when it was really traced, and we correct that using
                // the trace event.
                const mon1 = sh.initActive("p1");
                mon1.revealAbility("moldbreaker");
                expect(mon1.ability).to.equal("moldbreaker");
                expect(mon1.baseAbility).to.equal("moldbreaker");
                const mon2 = sh.initActive("p2");
                mon2.revealAbility("");
                expect(mon2.ability).to.be.empty;
                expect(mon2.baseAbility).to.be.empty;

                await ph.handle({
                    args: [
                        "-ability",
                        toIdent("p1"),
                        toAbilityName("moldbreaker"),
                    ],
                    kwArgs: {
                        from: toEffectName("trace", "ability"),
                        of: toIdent("p2"),
                    },
                });
                await ph.return();
                expect(mon1.ability).to.equal("moldbreaker");
                expect(mon1.baseAbility).to.equal("trace");
                expect(mon2.ability).to.equal("moldbreaker");
                expect(mon2.baseAbility).to.equal("moldbreaker");
            });
        });

        describe("|-endability|", function () {
            it("Should start gastroacid status", async function () {
                const mon = sh.initActive("p2");
                expect(mon.volatile.suppressAbility).to.be.false;

                await ph.handle({
                    args: ["-endability", toIdent("p2")],
                    kwArgs: {},
                });
                await ph.return();
                expect(mon.volatile.suppressAbility).to.be.true;
            });

            it("Should also reveal ability if specified", async function () {
                const mon = sh.initActive("p2");
                mon.revealAbility("");
                expect(mon.volatile.suppressAbility).to.be.false;
                expect(mon.ability).to.be.empty;
                expect(mon.baseAbility).to.be.empty;

                await ph.handle({
                    args: [
                        "-endability",
                        toIdent("p2"),
                        toAbilityName("frisk"),
                    ],
                    kwArgs: {},
                });
                await ph.return();
                expect(mon.volatile.suppressAbility).to.be.true;
                expect(mon.ability).to.equal("frisk");
                expect(mon.baseAbility).to.equal("frisk");
            });

            describe("skillswap", function () {
                it("Should reveal and exchange abilities", async function () {
                    const mon1 = sh.initActive("p1");
                    mon1.revealAbility("");
                    expect(mon1.volatile.suppressAbility).to.be.false;
                    expect(mon1.ability).to.be.empty;
                    expect(mon1.baseAbility).to.be.empty;
                    const mon2 = sh.initActive("p2");
                    mon2.revealAbility("");
                    expect(mon2.volatile.suppressAbility).to.be.false;
                    expect(mon2.ability).to.be.empty;
                    expect(mon2.baseAbility).to.be.empty;

                    await ph.handle({
                        args: [
                            "-endability",
                            toIdent("p1"),
                            toAbilityName("swiftswim"),
                        ],
                        kwArgs: {from: toEffectName("skillswap", "move")},
                    });
                    await ph.return();
                    expect(mon1.volatile.suppressAbility).to.be.false;
                    expect(mon1.ability).to.be.empty;
                    expect(mon1.baseAbility).to.equal("swiftswim");
                    expect(mon2.volatile.suppressAbility).to.be.false;
                    // Note: Internal fields are set so that the inference can
                    // be completed on the next skillswap event.
                    expect(mon2.ability).to.be.empty;
                    expect(mon2.baseAbility).to.be.empty;

                    // Restart in order to parse the other skillswap event.
                    await ph.close().finally(() => (pctx = undefined));
                    pctx = initParser(ictx.startArgs, dispatch);

                    await ph.handle({
                        args: [
                            "-endability",
                            toIdent("p2"),
                            toAbilityName("chlorophyll"),
                        ],
                        kwArgs: {from: toEffectName("skillswap", "move")},
                    });
                    await ph.return();
                    expect(mon1.volatile.suppressAbility).to.be.false;
                    expect(mon1.ability).to.equal("chlorophyll");
                    expect(mon1.baseAbility).to.equal("swiftswim");
                    expect(mon2.volatile.suppressAbility).to.be.false;
                    expect(mon2.ability).to.equal("swiftswim");
                    expect(mon2.baseAbility).to.equal("chlorophyll");
                });

                it("Should exchange override abilities", async function () {
                    const mon1 = sh.initActive("p1");
                    mon1.setAbility("swiftswim");
                    expect(mon1.volatile.suppressAbility).to.be.false;
                    expect(mon1.ability).to.equal("swiftswim");
                    expect(mon1.baseAbility).to.be.empty;
                    const mon2 = sh.initActive("p2");
                    mon2.setAbility("chlorophyll");
                    expect(mon2.volatile.suppressAbility).to.be.false;
                    expect(mon2.ability).to.equal("chlorophyll");
                    expect(mon2.baseAbility).to.be.empty;

                    await ph.handle({
                        args: [
                            "-endability",
                            toIdent("p1"),
                            toAbilityName("swiftswim"),
                        ],
                        kwArgs: {from: toEffectName("skillswap", "move")},
                    });
                    await ph.return();
                    expect(mon1.volatile.suppressAbility).to.be.false;
                    expect(mon1.ability).to.equal("swiftswim");
                    expect(mon1.baseAbility).to.be.empty;
                    expect(mon2.volatile.suppressAbility).to.be.false;
                    // Note: Internal fields are set so that the inference can
                    // be completed on the next skillswap event.
                    expect(mon2.ability).to.equal("chlorophyll");
                    expect(mon2.baseAbility).to.be.empty;

                    // Restart in order to parse the other skillswap event.
                    await ph.close().finally(() => (pctx = undefined));
                    pctx = initParser(ictx.startArgs, dispatch);

                    await ph.handle({
                        args: [
                            "-endability",
                            toIdent("p2"),
                            toAbilityName("chlorophyll"),
                        ],
                        kwArgs: {from: toEffectName("skillswap", "move")},
                    });
                    await ph.return();
                    expect(mon1.volatile.suppressAbility).to.be.false;
                    expect(mon1.ability).to.equal("chlorophyll");
                    expect(mon1.baseAbility).to.be.empty;
                    expect(mon2.volatile.suppressAbility).to.be.false;
                    expect(mon2.ability).to.equal("swiftswim");
                    expect(mon2.baseAbility).to.be.empty;
                });
            });
        });

        describe("|-transform|", function () {
            it("Should transform pokemon", async function () {
                const us = sh.initActive("p1", smeargle);
                const them = sh.initActive("p2", ditto);

                await ph.handle({
                    args: ["-transform", toIdent("p2", ditto), toIdent("p1")],
                    kwArgs: {},
                });
                await ph.return();
                expect(them.volatile.transformed).to.be.true;
                expect(them.species).to.equal(us.species);
            });
        });

        describe("|-mega|", function () {
            it("Should do nothing since unsupported", async function () {
                await ph.handle({
                    args: [
                        "-mega",
                        toIdent("p1"),
                        toSpeciesName("gengar"),
                        "Gengarite" as Protocol.ItemName,
                    ],
                    kwArgs: {},
                });
                await ph.return();
            });
        });

        describe("|-primal|", function () {
            it("Should do nothing since unsupported", async function () {
                await ph.handle({args: ["-primal", toIdent("p1")], kwArgs: {}});
                await ph.return();
            });
        });

        describe("|-burst|", function () {
            it("Should do nothing since unsupported", async function () {
                await ph.handle({
                    args: [
                        "-burst",
                        toIdent("p1"),
                        "Necrozma-DM" as Protocol.SpeciesName,
                        "Ultranecrozium Z" as Protocol.ItemName,
                    ],
                    kwArgs: {},
                });
                await ph.return();
            });
        });

        describe("|-zpower|", function () {
            it("Should do nothing since unsupported", async function () {
                await ph.handle({args: ["-zpower", toIdent("p1")], kwArgs: {}});
                await ph.return();
            });
        });

        describe("|-zbroken|", function () {
            it("Should do nothing since unsupported", async function () {
                await ph.handle({
                    args: ["-zbroken", toIdent("p1")],
                    kwArgs: {},
                });
                await ph.return();
            });
        });

        describe("|-activate|", function () {
            for (const [effect, type] of [
                ["bide", "move"],
                ["confusion"],
            ] as const) {
                it(`Should update ${effect}`, async function () {
                    const mon = sh.initActive("p1");
                    expect(mon.volatile[effect].isActive).to.be.false;

                    // First start the effect.
                    mon.volatile[effect].start();
                    expect(mon.volatile[effect].isActive).to.be.true;
                    expect(mon.volatile[effect].turns).to.equal(0);

                    // Then update it.
                    await ph.handle({
                        args: [
                            "-activate",
                            toIdent("p1"),
                            toEffectName(effect, type),
                        ],
                        kwArgs: {},
                    });
                    await ph.return();
                    expect(mon.volatile[effect].isActive).to.be.true;
                    expect(mon.volatile[effect].turns).to.equal(1);
                });
            }

            for (const [effect, type] of [["charge", "move"]] as const) {
                it(`Should start ${effect}`, async function () {
                    const mon = sh.initActive("p1");
                    expect(mon.volatile[effect].isActive).to.be.false;

                    await ph.handle({
                        args: [
                            "-activate",
                            toIdent("p1"),
                            toEffectName(effect, type),
                        ],
                        kwArgs: {},
                    });
                    await ph.return();
                    expect(mon.volatile[effect].isActive).to.be.true;
                    expect(mon.volatile[effect].turns).to.equal(0);
                });
            }

            for (const effect of [
                "detect",
                "protect",
                "endure",
                "mist",
                "safeguard",
                "substitute",
            ] as const) {
                it(`Should handle blocked effect if ${effect}`, async function () {
                    const mon = sh.initActive("p1");
                    switch (effect) {
                        case "detect":
                        case "endure":
                        case "protect":
                            mon.volatile.stall(true);
                            break;
                        case "mist":
                        case "safeguard":
                            mon.team!.status[effect].start();
                            break;
                        case "substitute":
                            mon.volatile[effect] = true;
                            break;
                    }
                    sh.initActive("p2");

                    await ph.handle({
                        args: [
                            "-activate",
                            toIdent("p1"),
                            toEffectName(effect, "move"),
                        ],
                        kwArgs: {},
                    });
                    await ph.return();
                });

                if (["detect", "protect"].includes(effect)) {
                    it(`Should reset rampage if blocked by ${effect}`, async function () {
                        const mon1 = sh.initActive("p1");
                        mon1.volatile.rampage.start("thrash");
                        expect(mon1.volatile.rampage.isActive).to.be.true;
                        const mon2 = sh.initActive("p2");
                        mon2.volatile.stall(true);

                        await ph.handle({
                            args: [
                                "-activate",
                                toIdent("p2"),
                                toEffectName(effect, "move"),
                            ],
                            kwArgs: {},
                        });
                        await ph.return();
                        expect(mon1.volatile.rampage.isActive).to.be.false;
                    });
                }
            }

            it("Should break stall if feint", async function () {
                const mon = sh.initActive("p2");
                mon.volatile.stall(true);
                expect(mon.volatile.stalling).to.be.true;
                expect(mon.volatile.stallTurns).to.equal(1);

                // Assume p1 uses feint move.
                await ph.handle({
                    args: [
                        "-activate",
                        toIdent("p2"),
                        toEffectName("feint", "move"),
                    ],
                    kwArgs: {},
                });
                await ph.return();
                expect(mon.volatile.stalling).to.be.false;
                // Note: Should not reset stall turns.
                expect(mon.volatile.stallTurns).to.equal(1);
            });

            it("Should activate forewarn ability", async function () {
                const mon1 = sh.initActive("p1");
                mon1.revealAbility("");
                expect(mon1.ability).to.be.empty;
                expect(mon1.baseAbility).to.be.empty;
                const mon2 = sh.initActive("p2");
                expect(mon2.moveset.get("takedown")).to.be.null;

                await ph.handle({
                    args: [
                        "-activate",
                        toIdent("p1"),
                        toEffectName("forewarn", "ability"),
                        toMoveName("takedown"),
                    ],
                    kwArgs: {of: toIdent("p2")},
                });
                await ph.return();
                expect(mon1.ability).to.equal("forewarn");
                expect(mon1.baseAbility).to.equal("forewarn");
                expect(mon2.moveset.get("takedown")).to.not.be.null;
            });
            // TODO: Test forewarn move inferences.

            it("Should fully deplete move pp if grudge", async function () {
                const mon = sh.initActive("p2");
                expect(mon.moveset.get("splash")).to.be.null;

                await ph.handle({
                    args: [
                        "-activate",
                        toIdent("p2"),
                        toEffectName("grudge", "move"),
                        toMoveName("splash"),
                    ],
                    kwArgs: {},
                });
                await ph.return();
                const move = mon.moveset.get("splash");
                expect(move).to.not.be.null;
                expect(move).to.have.property("pp", 0);
                expect(move).to.have.property("maxpp", 64);
            });

            it("Should cure team if healbell", async function () {
                const [benched, mon] = sh.initTeam("p1", [ditto, smeargle]);
                benched.majorStatus.afflict("tox");
                mon.majorStatus.afflict("par");

                await ph.handle({
                    args: [
                        "-activate",
                        toIdent("p1"),
                        toEffectName("healbell", "move"),
                    ],
                    kwArgs: {},
                });
                await ph.return();
                expect(benched.majorStatus.current).to.be.null;
                expect(mon.majorStatus.current).to.be.null;
            });

            it("Should restore 10 move pp if leppaberry", async function () {
                const mon = sh.initActive("p2");
                const move = mon.moveset.reveal("ember")!;
                move.pp -= 20;
                expect(move).to.have.property("pp", move.maxpp - 20);

                await ph.handle({
                    args: [
                        "-activate",
                        toIdent("p2"),
                        toEffectName("leppaberry", "item"),
                        toMoveName("ember"),
                    ],
                    kwArgs: {},
                });
                await ph.return();
                expect(move).to.have.property("pp", move.maxpp - 10);
            });

            for (const effect of ["lockon", "mindreader"] as const) {
                it(`Should set lockon status if ${effect}`, async function () {
                    const mon1 = sh.initActive("p1");
                    const mon2 = sh.initActive("p2");
                    expect(mon1.volatile.lockedOnBy).to.be.null;
                    expect(mon1.volatile.lockOnTarget).to.be.null;
                    expect(mon1.volatile.lockOnTurns.isActive).to.be.false;
                    expect(mon2.volatile.lockedOnBy).to.be.null;
                    expect(mon2.volatile.lockOnTarget).to.be.null;
                    expect(mon2.volatile.lockOnTurns.isActive).to.be.false;

                    // P1 locks onto p2.
                    await ph.handle({
                        args: [
                            "-activate",
                            toIdent("p1"),
                            toEffectName(effect, "move"),
                        ],
                        kwArgs: {of: toIdent("p2")},
                    });
                    await ph.return();
                    expect(mon1.volatile.lockedOnBy).to.be.null;
                    expect(mon1.volatile.lockOnTarget).to.equal(mon2.volatile);
                    expect(mon1.volatile.lockOnTurns.isActive).to.be.true;
                    expect(mon2.volatile.lockedOnBy).to.equal(mon1.volatile);
                    expect(mon2.volatile.lockOnTarget).to.be.null;
                    expect(mon2.volatile.lockOnTurns.isActive).to.be.false;
                });
            }

            it("Should activate mimic move effect", async function () {
                const mon = sh.initActive("p2");
                mon.moveset.reveal("mimic");
                mon.volatile.lastMove = "mimic";

                await ph.handle({
                    args: [
                        "-activate",
                        toIdent("p2"),
                        toEffectName("mimic", "move"),
                        toMoveName("splash"),
                    ],
                    kwArgs: {},
                });
                await ph.return();
                // Replaces override moveset but not base, so switching will
                // still restore the original mimic move.
                expect(mon.moveset.get("splash")).to.not.be.null;
                expect(mon.moveset.get("mimic")).to.be.null;
                expect(mon.baseMoveset.get("splash")).to.be.null;
                expect(mon.baseMoveset.get("mimic")).to.not.be.null;
            });

            it("Should activate sketch move effect", async function () {
                const mon = sh.initActive("p2");
                mon.moveset.reveal("sketch");
                mon.volatile.lastMove = "sketch";

                // Note(gen4): Same exact event as mimic, differentiator is
                // lastMove for now.
                await ph.handle({
                    args: [
                        "-activate",
                        toIdent("p2"),
                        toEffectName("mimic", "move"),
                        toMoveName("tackle"),
                    ],
                    kwArgs: {},
                });
                await ph.return();
                // Works like mimic but also changes base moveset.
                expect(mon.moveset.get("tackle")).to.not.be.null;
                expect(mon.moveset.get("sketch")).to.be.null;
                expect(mon.baseMoveset.get("tackle")).to.not.be.null;
                expect(mon.baseMoveset.get("sketch")).to.be.null;
            });

            it("Should activate pursuit move effect and reveal move", async function () {
                const mon1 = sh.initActive("p1");
                expect(mon1.moveset.get("pursuit")).to.be.null;
                const mon2 = sh.initActive("p2");
                expect(mon2.moveset.get("pursuit")).to.be.null;

                // P1's switch-out is interrupted by p2's pursuit move.
                await ph.handle({
                    args: [
                        "-activate",
                        toIdent("p1"),
                        toEffectName("pursuit", "move"),
                    ],
                    kwArgs: {},
                });
                await ph.return();
                expect(mon1.moveset.get("pursuit")).to.be.null;
                expect(mon2.moveset.get("pursuit")).to.not.be.null;
            });

            it("Should activate snatch move effect", async function () {
                const mon = sh.initActive("p1");
                mon.volatile.snatch = true;

                await ph.handle({
                    args: [
                        "-activate",
                        toIdent("p1"),
                        toEffectName("snatch", "move"),
                    ],
                    kwArgs: {of: toIdent("p2")},
                });
                await ph.return();
                expect(mon.volatile.snatch).to.be.false;
            });

            it("Should deplete arbitrary move pp if spite", async function () {
                const mon = sh.initActive("p2");
                expect(mon.moveset.get("splash")).to.be.null;

                await ph.handle({
                    args: [
                        "-activate",
                        toIdent("p2"),
                        toEffectName("spite", "move"),
                        toMoveName("splash"),
                        toNum(4),
                    ],
                    kwArgs: {},
                } as Event<"|-activate|">); // TODO: Fix protocol typings?
                await ph.return();
                const move = mon.moveset.get("splash");
                expect(move).to.not.be.null;
                expect(move).to.have.property("pp", 60);
                expect(move).to.have.property("maxpp", 64);
            });

            it("Should start trapped status", async function () {
                const mon1 = sh.initActive("p1");
                expect(mon1.volatile.trapped).to.be.null;
                expect(mon1.volatile.trapping).to.be.null;
                const mon2 = sh.initActive("p2");
                expect(mon2.volatile.trapped).to.be.null;
                expect(mon2.volatile.trapping).to.be.null;

                // P1 being trapped by p2.
                await ph.handle({
                    args: ["-activate", toIdent("p1"), toEffectName("trapped")],
                    kwArgs: {},
                });
                await ph.return();
                expect(mon1.volatile.trapped).to.equal(mon2.volatile);
                expect(mon1.volatile.trapping).to.be.null;
                expect(mon2.volatile.trapped).to.be.null;
                expect(mon2.volatile.trapping).to.equal(mon1.volatile);
            });

            it("Should ignore invalid effect", async function () {
                sh.initActive("p1");

                await ph.handle({
                    args: ["-activate", toIdent("p1"), toEffectName("invalid")],
                    kwArgs: {},
                });
                await ph.return();
            });

            it("Should ignore event without ident", async function () {
                await ph.handle({
                    args: ["-activate", "", toEffectName("invalid")],
                    kwArgs: {},
                });
                await ph.return();
            });
        });

        describe("|-fieldactivate|", function () {
            it("Should handle", async function () {
                await ph.handle({
                    args: ["-fieldactivate", toEffectName("payday", "move")],
                    kwArgs: {},
                });
                await ph.return();
            });
        });

        describe("|-center|", function () {
            it("Should do nothing since unsupported", async function () {
                await ph.handle({args: ["-center"], kwArgs: {}});
                await ph.return();
            });
        });

        describe("|-combine|", function () {
            it("Should do nothing since unsupported", async function () {
                await ph.handle({args: ["-combine"], kwArgs: {}});
                await ph.return();
            });
        });

        describe("|-waiting|", function () {
            it("Should do nothing since unsupported", async function () {
                await ph.handle({
                    args: [
                        "-waiting",
                        toIdent("p1"),
                        toIdent("p1", ditto, "b"),
                    ],
                    kwArgs: {},
                });
                await ph.return();
            });
        });

        describe("|-prepare|", function () {
            it("Should prepare two-turn move", async function () {
                const mon = sh.initActive("p2");
                expect(mon.volatile.twoTurn.isActive).to.be.false;

                await ph.handle({
                    args: ["-prepare", toIdent("p2"), toMoveName("fly")],
                    kwArgs: {},
                });
                await ph.return();
                expect(mon.volatile.twoTurn.isActive).to.be.true;
                expect(mon.volatile.twoTurn.type).to.equal("fly");
            });

            it("Should ignore non-two-turn move", async function () {
                const mon = sh.initActive("p2");
                expect(mon.volatile.twoTurn.isActive).to.be.false;

                await ph.handle({
                    args: ["-prepare", toIdent("p2"), toMoveName("splash")],
                    kwArgs: {},
                });
                await ph.return();
                expect(mon.volatile.twoTurn.isActive).to.be.false;
            });
        });

        describe("|-mustrecharge|", function () {
            it("Should indicate recharge", async function () {
                const mon = sh.initActive("p1");
                expect(mon.volatile.mustRecharge).to.be.false;

                await ph.handle({
                    args: ["-mustrecharge", toIdent("p1")],
                    kwArgs: {},
                });
                await ph.return();
                expect(mon.volatile.mustRecharge).to.be.true;
            });
        });

        describe("|-hitcount|", function () {
            it("Should do nothing", async function () {
                await ph.handle({
                    args: ["-hitcount", toIdent("p2"), toNum(4)],
                    kwArgs: {},
                });
                await ph.return();
            });
        });

        describe("|-singlemove|", function () {
            for (const effect of ["destinybond", "grudge", "rage"] as const) {
                it(`Should start ${effect}`, async function () {
                    const mon = sh.initActive("p1");
                    expect(mon.volatile[effect]).to.be.false;

                    await ph.handle({
                        args: [
                            "-singlemove",
                            toIdent("p1"),
                            toMoveName(effect),
                        ],
                        kwArgs: {},
                    });
                    await ph.return();
                    expect(mon.volatile[effect]).to.be.true;
                });
            }
        });

        describe("|-singleturn|", function () {
            function testSingleTurn(
                effect: string,
                getter: (v: ReadonlyVolatileStatus) => boolean,
                moveId?: string,
            ): void {
                const moveName = toMoveName(moveId ?? effect);
                it(`Should start ${effect}`, async function () {
                    const mon = sh.initActive("p1");
                    expect(getter(mon.volatile)).to.be.false;

                    await ph.handle({
                        args: ["-singleturn", toIdent("p1"), moveName],
                        kwArgs: {},
                    });
                    await ph.return();
                    expect(getter(mon.volatile)).to.be.true;
                });
            }

            testSingleTurn("endure", v => v.stallTurns > 0);
            testSingleTurn("protect", v => v.stallTurns > 0);
            testSingleTurn("focus", v => v.focus, "focuspunch");
            testSingleTurn("magiccoat", v => v.magiccoat);
            testSingleTurn("roost", v => v.roost);
            testSingleTurn("snatch", v => v.snatch);
        });

        describe("|-candynamax|", function () {
            it("Should do nothing since unsupported", async function () {
                await ph.handle({args: ["-candynamax", "p1"], kwArgs: {}});
                await ph.return();
            });
        });
    });
