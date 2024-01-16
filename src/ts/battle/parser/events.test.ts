import {Protocol} from "@pkmn/protocol";
import {SideID} from "@pkmn/types";
import {expect} from "chai";
import "mocha";
import {Event} from "../../protocol/Event";
import {Mutable} from "../../utils/types";
import * as dex from "../dex";
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
import {BattleParserContext} from "./BattleParser";
import {
    createTestContext,
    setupOverrideAgent,
    setupOverrideExecutor,
} from "./contextHelpers.test";
import {handlers} from "./events";
import {
    toAbilityName,
    toBoostIDs,
    toDetails,
    toEffectName,
    toFieldCondition,
    toFormatName,
    toHPStatus,
    toID,
    toIdent,
    toItemName,
    toMoveName,
    toNickname,
    toNum,
    toRequestJSON,
    toRule,
    toSearchID,
    toSeed,
    toSide,
    toSideCondition,
    toSpeciesName,
    toTypes,
    toUsername,
    toWeather,
} from "./protocolHelpers.test";
import {initActive, initTeam} from "./stateHelpers.test";
import {createDispatcher} from "./utils";

const dispatcher = createDispatcher(handlers);

export const test = () =>
    describe("events", function () {
        let ctx: Mutable<BattleParserContext>;

        beforeEach("Initialize BattleParserContext", function () {
            ctx = createTestContext();
        });

        const handle = async (event: Event) =>
            void (await expect(dispatcher(ctx, event)).to.eventually.be
                .fulfilled);
        const reject = async (
            event: Event,
            constructor: ErrorConstructor | Error,
            expected?: RegExp | string,
        ) =>
            void (await expect(
                dispatcher(ctx, event),
            ).to.eventually.be.rejectedWith(constructor, expected));

        describe("invalid event", function () {
            it("Should ignore", async function () {
                await handle({
                    args: ["invalid"],
                    kwArgs: {},
                } as unknown as Event);
            });
        });

        describe("|init|", function () {
            it("Should do nothing", async function () {
                await handle({args: ["init", "battle"], kwArgs: {}});
            });
        });

        describe("|player|", function () {
            it("Should set state.ourSide if username matches", async function () {
                ctx.state.ourSide = undefined;
                await handle({
                    args: [
                        "player",
                        "p2",
                        toUsername(ctx.state.username),
                        "",
                        "",
                    ],
                    kwArgs: {},
                });
                expect(ctx.state.ourSide).to.equal("p2");
            });

            it("Should skip if mentioning different player", async function () {
                ctx.state.ourSide = undefined;
                await handle({
                    args: [
                        "player",
                        "p1",
                        toUsername(ctx.state.username + "1"),
                        "",
                        "",
                    ],
                    kwArgs: {},
                });
                expect(ctx.state.ourSide).to.be.undefined;
            });
        });

        describe("|teamsize|", function () {
            it("Should set team size for opponent", async function () {
                expect(ctx.state.getTeam("p2").size).to.equal(0);
                await handle({
                    args: ["teamsize", "p2", toNum(4)],
                    kwArgs: {},
                });
                expect(ctx.state.getTeam("p2").size).to.equal(4);
            });

            it("Should skip setting team size for client", async function () {
                expect(ctx.state.getTeam("p1").size).to.equal(0);
                await handle({
                    args: ["teamsize", "p1", toNum(4)],
                    kwArgs: {},
                });
                expect(ctx.state.getTeam("p1").size).to.equal(0);
            });

            it("Should throw if state not fully initialized", async function () {
                ctx.state.ourSide = undefined;
                await reject(
                    {
                        args: ["teamsize", "p1", toNum(3)],
                        kwArgs: {},
                    },
                    Error,
                    "Expected |player| event for client before |teamsize| " +
                        "event",
                );
            });
        });

        describe("|gametype|", function () {
            it("Should do nothing", async function () {
                await handle({args: ["gametype", "singles"], kwArgs: {}});
            });
        });

        describe("|gen|", function () {
            it("Should do nothing", async function () {
                await handle({args: ["gen", 4], kwArgs: {}});
            });
        });

        describe("|tier|", function () {
            it("Should do nothing", async function () {
                await handle({
                    args: ["tier", toFormatName("[Gen 4] Random Battle")],
                    kwArgs: {},
                });
            });
        });

        describe("|rated|", function () {
            it("Should do nothing", async function () {
                await handle({args: ["rated"], kwArgs: {}});
            });
        });

        describe("|seed|", function () {
            it("Should do nothing", async function () {
                await handle({args: ["seed", toSeed("abc")], kwArgs: {}});
            });
        });

        describe("|rule|", function () {
            it("Should do nothing", async function () {
                await handle({
                    args: [
                        "rule",
                        toRule("Sleep Clause: Limit one foe put to sleep"),
                    ],
                    kwArgs: {},
                });
            });
        });

        describe("|clearpoke|", function () {
            it("Should do nothing since unsupported", async function () {
                await handle({args: ["clearpoke"], kwArgs: {}});
            });
        });

        describe("|poke|", function () {
            it("Should do nothing since unsupported", async function () {
                await handle({
                    args: ["poke", "p1", toDetails(), "item"],
                    kwArgs: {},
                });
            });
        });

        describe("|teampreview|", function () {
            it("Should do nothing since unsupported", async function () {
                await handle({args: ["teampreview"], kwArgs: {}});
            });
        });

        describe("|updatepoke|", function () {
            it("Should do nothing since unsupported", async function () {
                await handle({
                    args: ["updatepoke", toIdent("p1"), toDetails()],
                    kwArgs: {},
                });
            });
        });

        describe("|start|", function () {
            it("Should start the battle", async function () {
                ctx.state.started = false;
                await handle({args: ["start"], kwArgs: {}});
                expect(ctx.state.started).to.be.true;
            });

            it("Should throw if state not fully initialized", async function () {
                ctx.state.started = false;
                ctx.state.ourSide = undefined;
                await reject(
                    {args: ["start"], kwArgs: {}},
                    Error,
                    "Expected |player| event for client before |start event",
                );
            });
        });

        describe("|done|", function () {
            it("Should do nothing", async function () {
                await handle({args: ["done"], kwArgs: {}});
            });
        });

        describe("|request|", function () {
            const agent = setupOverrideAgent(() => ctx);
            const executor = setupOverrideExecutor(() => ctx);

            describe("requestType = team", function () {
                it("Should do nothing since unsupported", async function () {
                    await handle({
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
                });
            });

            describe("requestType = move", function () {
                it("Should update moves and send action", async function () {
                    const [, , mon] = initTeam(ctx.state, "p1", [
                        eevee,
                        ditto,
                        smeargle,
                    ]);
                    expect(mon.moveset.reveal("ember").pp).to.equal(40);
                    expect(mon.moveset.get("tackle")).to.be.null;

                    const p = handle(
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

                    await expect(
                        agent.receiveChoices(),
                    ).to.eventually.have.members([
                        "move 1",
                        "move 2",
                        "switch 2",
                        "switch 3",
                    ]);
                    agent.resolve();
                    await expect(executor.receiveAction()).to.eventually.equal(
                        "move 1",
                    );
                    executor.resolve(false /*i.e., accept the action*/);

                    await p;
                    expect(mon.moveset.get("ember")!.pp).to.equal(10);
                    expect(mon.moveset.get("tackle")).to.not.be.null;
                });

                it("Should handle lockedmove pp", async function () {
                    const [, , mon] = initTeam(ctx.state, "p1", [
                        eevee,
                        ditto,
                        smeargle,
                    ]);
                    expect(mon.moveset.reveal("outrage").pp).to.equal(24);
                    expect(mon.moveset.reveal("ember").pp).to.equal(40);

                    const p = handle(
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
                    await expect(executor.receiveAction()).to.eventually.equal(
                        "move 1",
                    );
                    executor.resolve(false /*i.e., accept the action*/);

                    await p;
                    expect(mon.moveset.get("outrage")!.pp).to.equal(24);
                    expect(mon.moveset.get("ember")!.pp).to.equal(40);
                });

                it("Should handle switch rejection via trapping ability", async function () {
                    initTeam(ctx.state, "p1", [eevee, ditto, smeargle]);

                    const mon = initActive(ctx.state, "p2");
                    mon.setAbility("shadowtag");

                    const p = handle(
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

                    // Execute a switch action.
                    const c = await agent.receiveChoices();
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
                    // Switch action was rejected due to a trapping ability.
                    await expect(executor.receiveAction()).to.eventually.equal(
                        "switch 2",
                    );
                    executor.resolve("trapped");

                    // Execute a new action after eliminating switch choices.
                    await expect(executor.receiveAction()).to.eventually.equal(
                        "move 2",
                    );
                    executor.resolve(false /*i.e., accept the action*/);

                    await p;
                });

                it("Should send final choice if all actions were rejected", async function () {
                    const [, , mon] = initTeam(ctx.state, "p1", [
                        eevee,
                        ditto,
                        smeargle,
                    ]);
                    expect(mon.moveset.reveal("ember").pp).to.equal(40);
                    expect(mon.moveset.get("tackle")).to.be.null;

                    const p = handle(
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

                    const choices = await agent.receiveChoices();
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
                    await expect(executor.receiveAction()).to.eventually.equal(
                        "move 1",
                    );
                    executor.resolve(true /*i.e., reject the action*/);
                    await expect(executor.receiveAction()).to.eventually.equal(
                        "switch 3",
                    );
                    expect(choices).to.have.members([
                        "switch 3",
                        "switch 2",
                        "move 2",
                    ]);
                    executor.resolve(true);
                    await expect(executor.receiveAction()).to.eventually.equal(
                        "switch 2",
                    );
                    expect(choices).to.have.members(["switch 2", "move 2"]);
                    executor.resolve(true);
                    // Send last remaining choice.
                    await expect(executor.receiveAction()).to.eventually.equal(
                        "move 2",
                    );
                    expect(choices).to.have.members(["move 2"]);
                    executor.resolve(false /*i.e., accept the action*/);

                    await p;
                });

                it("Should throw if all actions are rejected", async function () {
                    const [, , mon] = initTeam(ctx.state, "p1", [
                        eevee,
                        ditto,
                        smeargle,
                    ]);
                    expect(mon.moveset.reveal("ember").pp).to.equal(40);
                    expect(mon.moveset.get("tackle")).to.be.null;

                    const p = reject(
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
                        "Final choice 'move 2' was rejected as " + "'true'",
                    );

                    const choices = await agent.receiveChoices();
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
                    await expect(executor.receiveAction()).to.eventually.equal(
                        "move 1",
                    );
                    executor.resolve(true /*i.e., reject the action*/);
                    await expect(executor.receiveAction()).to.eventually.equal(
                        "switch 3",
                    );
                    expect(choices).to.have.members([
                        "switch 3",
                        "switch 2",
                        "move 2",
                    ]);
                    executor.resolve(true);
                    await expect(executor.receiveAction()).to.eventually.equal(
                        "switch 2",
                    );
                    expect(choices).to.have.members(["switch 2", "move 2"]);
                    executor.resolve(true);
                    // Send last remaining choice.
                    await expect(executor.receiveAction()).to.eventually.equal(
                        "move 2",
                    );
                    expect(choices).to.have.members(["move 2"]);
                    executor.resolve(true);

                    await p;
                });

                describe("state.started = false", function () {
                    beforeEach("state.started = false", function () {
                        ctx.state.started = false;
                    });

                    it("Should initialize team", async function () {
                        const team = ctx.state.getTeam("p1");
                        expect(team.size).to.equal(0);

                        await handle(
                            requestEvent(
                                "move",
                                [
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
                                        name: toSpeciesName(smeargle.species),
                                        speciesForme: toSpeciesName(
                                            smeargle.species,
                                        ),
                                        level: smeargle.level,
                                        shiny: true,
                                        gender: smeargle.gender,
                                        searchid: toSearchID("p1", smeargle),
                                    },
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
                                    ],
                                },
                            ),
                        );
                        expect(team.size).to.equal(1);
                        expect(() => team.active).to.not.throw();
                    });

                    it("Should initialize team with hiddenpower type and happiness annotations", async function () {
                        const team = ctx.state.getTeam("p1");
                        expect(team.size).to.equal(0);

                        await handle(
                            requestEvent(
                                "move",
                                [
                                    {
                                        active: true,
                                        details: toDetails(smeargle),
                                        ident: toIdent("p1", smeargle),
                                        pokeball: toID("pokeball"),
                                        ability: toID("owntempo"),
                                        baseAbility: toID("owntempo"),
                                        condition: toHPStatus(100, 100),
                                        item: toID("mail"),
                                        moves: [
                                            toID("hiddenpowerfire"),
                                            toID("return102"),
                                        ],
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
                                        name: toSpeciesName(smeargle.species),
                                        speciesForme: toSpeciesName(
                                            smeargle.species,
                                        ),
                                        level: smeargle.level,
                                        shiny: true,
                                        gender: smeargle.gender,
                                        searchid: toSearchID("p1", smeargle),
                                    },
                                ],
                                {
                                    moves: [
                                        {
                                            id: toID("hiddenpower"),
                                            name: (toMoveName("hiddenpower") +
                                                " Fire 70") as Protocol.MoveName,
                                            pp: 24,
                                            maxpp: 24,
                                            target: "normal",
                                            disabled: false,
                                        },
                                        {
                                            id: toID("return"),
                                            name: (toMoveName("return") +
                                                " 102") as Protocol.MoveName,
                                            pp: 32,
                                            maxpp: 32,
                                            target: "normal",
                                            disabled: false,
                                        },
                                    ],
                                },
                            ),
                        );
                        expect(team.size).to.equal(1);
                        expect(() => team.active).to.not.throw();
                        expect(team.active.happiness).to.equal(255);
                        expect(team.active.stats.hpType).to.equal("fire");
                    });

                    it("Should handle |request| with alt form", async function () {
                        const deoxysdefense: SwitchOptions = {
                            species: "deoxysdefense",
                            level: 20,
                            gender: "N",
                            hp: 55,
                            hpMax: 55,
                        };

                        await handle(
                            requestEvent("move", [
                                {
                                    active: true,
                                    details: toDetails(deoxysdefense),
                                    // Note: PS can sometimes omit the form name
                                    // in the ident.
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
                                        toSpeciesName("deoxysdefense"),
                                    level: deoxysdefense.level,
                                    shiny: false,
                                    gender: deoxysdefense.gender,
                                    searchid: toSearchID("p1", deoxysdefense),
                                },
                            ]),
                        );
                    });
                });
            });

            describe("requestType = switch", function () {
                it("Should consider only switch actions", async function () {
                    initTeam(ctx.state, "p1", [eevee, ditto, smeargle]);

                    const p = handle(requestEvent("switch", benchInfo));

                    await expect(
                        agent.receiveChoices(),
                    ).to.eventually.have.members(["switch 2", "switch 3"]);
                    agent.resolve();
                    await expect(executor.receiveAction()).to.eventually.equal(
                        "switch 2",
                    );
                    executor.resolve(false /*i.e., accept the action*/);

                    await p;
                });
            });

            describe("requestType = wait", function () {
                it("Should do nothing", async function () {
                    await handle({
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
                });
            });
        });

        describe("|turn|", function () {
            it("Should handle", async function () {
                await handle({args: ["turn", toNum(2)], kwArgs: {}});
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
                const mon = initActive(ctx.state, "p1");
                expect(mon.moveset.get("tackle")).to.be.null;
                expect(mon.volatile.lastMove).to.be.null;
                initActive(ctx.state, "p2");

                await handle(moveEvent("p1", "tackle"));
                const move = mon.moveset.get("tackle");
                expect(move).to.not.be.null;
                expect(move).to.have.property("pp", 55);
                expect(move).to.have.property("maxpp", 56);
                expect(mon.volatile.lastMove).to.equal("tackle");
            });

            it("Should not reveal move if from lockedmove", async function () {
                const mon = initActive(ctx.state, "p1");
                expect(mon.moveset.get("tackle")).to.be.null;
                expect(mon.volatile.lastMove).to.be.null;
                initActive(ctx.state, "p2");

                await handle(
                    moveEvent("p1", "tackle", {
                        from: toEffectName("lockedmove"),
                    }),
                );
                expect(mon.moveset.get("tackle")).to.be.null;
                expect(mon.volatile.lastMove).to.equal("tackle");
            });

            it("Should not deduct pp if from lockedmove", async function () {
                const mon = initActive(ctx.state, "p1");
                const move = mon.moveset.reveal("tackle");
                expect(move).to.have.property("pp", 56);
                expect(move).to.have.property("maxpp", 56);
                expect(mon.volatile.lastMove).to.be.null;
                initActive(ctx.state, "p2");

                await handle(
                    moveEvent("p1", "tackle", {
                        from: toEffectName("lockedmove"),
                    }),
                );
                expect(move).to.have.property("pp", 56);
                expect(move).to.have.property("maxpp", 56);
                expect(mon.volatile.lastMove).to.equal("tackle");
            });

            it("Should still set last move if from pursuit", async function () {
                const mon = initActive(ctx.state, "p1");
                expect(mon.moveset.get("pursuit")).to.be.null;
                expect(mon.volatile.lastMove).to.be.null;
                initActive(ctx.state, "p2");

                await handle(
                    moveEvent("p1", "pursuit", {
                        from: toEffectName("pursuit", "move"),
                    }),
                );
                expect(mon.moveset.get("pursuit")).to.be.null;
                expect(mon.volatile.lastMove).to.equal("pursuit");
            });

            describe("multi-turn move", function () {
                describe("rampage move", function () {
                    it("Should start rampage move status", async function () {
                        const mon = initActive(ctx.state, "p1");
                        expect(mon.volatile.rampage.isActive).to.be.false;
                        initActive(ctx.state, "p2");

                        await handle(moveEvent("p1", "outrage"));
                        expect(mon.volatile.rampage.isActive).to.be.true;
                        expect(mon.volatile.rampage.type).to.equal("outrage");
                    });

                    it("Should continue rampage move status", async function () {
                        const mon = initActive(ctx.state, "p1");
                        mon.volatile.rampage.start("petaldance");
                        expect(mon.volatile.rampage.isActive).to.be.true;
                        expect(mon.volatile.rampage.type).to.equal(
                            "petaldance",
                        );
                        expect(mon.volatile.rampage.turns).to.equal(0);

                        await handle(
                            moveEvent("p1", "petaldance", {
                                from: toEffectName("lockedmove"),
                            }),
                        );
                        expect(mon.volatile.rampage.isActive).to.be.true;
                        expect(mon.volatile.rampage.type).to.equal(
                            "petaldance",
                        );
                        expect(mon.volatile.rampage.turns).to.equal(1);
                    });

                    it("Should restart rampage if different move", async function () {
                        const mon = initActive(ctx.state, "p1");
                        mon.volatile.rampage.start("outrage");
                        expect(mon.volatile.rampage.isActive).to.be.true;
                        expect(mon.volatile.rampage.type).to.equal("outrage");
                        expect(mon.volatile.rampage.turns).to.equal(0);
                        initActive(ctx.state, "p2");

                        await handle(moveEvent("p1", "thrash"));
                        expect(mon.volatile.rampage.isActive).to.be.true;
                        expect(mon.volatile.rampage.type).to.equal("thrash");
                        expect(mon.volatile.rampage.turns).to.equal(0);
                    });

                    it("Should reset rampage if unrelated move", async function () {
                        const mon = initActive(ctx.state, "p1");
                        mon.volatile.rampage.start("thrash");
                        expect(mon.volatile.rampage.isActive).to.be.true;

                        await handle(moveEvent("p1", "splash"));
                        expect(mon.volatile.rampage.isActive).to.be.false;
                    });

                    it("Should reset rampage if notarget", async function () {
                        const mon = initActive(ctx.state, "p1");
                        mon.volatile.rampage.start("outrage");
                        expect(mon.volatile.rampage.isActive).to.be.true;

                        await handle(
                            moveEvent("p1", "outrage", {
                                from: toEffectName("lockedmove"),
                                notarget: true,
                            }),
                        );
                        expect(mon.volatile.rampage.isActive).to.be.false;
                    });

                    it("Should not reset rampage if miss", async function () {
                        const mon = initActive(ctx.state, "p1");
                        mon.volatile.rampage.start("petaldance");
                        expect(mon.volatile.rampage.isActive).to.be.true;

                        await handle(
                            moveEvent("p1", "petaldance", {
                                from: toEffectName("lockedmove"),
                                miss: true,
                            }),
                        );
                        expect(mon.volatile.rampage.isActive).to.be.true;
                    });
                });

                describe("momentum move", function () {
                    it("Should start momentum move status", async function () {
                        const mon = initActive(ctx.state, "p1");
                        expect(mon.volatile.momentum.isActive).to.be.false;
                        initActive(ctx.state, "p2");

                        await handle(moveEvent("p1", "rollout"));
                        expect(mon.volatile.momentum.isActive).to.be.true;
                        expect(mon.volatile.momentum.type).to.equal("rollout");
                    });

                    it("Should continue momentum move status", async function () {
                        const mon = initActive(ctx.state, "p1");
                        mon.volatile.momentum.start("iceball");
                        expect(mon.volatile.momentum.isActive).to.be.true;
                        expect(mon.volatile.momentum.type).to.equal("iceball");
                        expect(mon.volatile.momentum.turns).to.equal(0);

                        await handle(
                            moveEvent("p1", "iceball", {
                                from: toEffectName("lockedmove"),
                            }),
                        );
                        expect(mon.volatile.momentum.isActive).to.be.true;
                        expect(mon.volatile.momentum.type).to.equal("iceball");
                        expect(mon.volatile.momentum.turns).to.equal(1);
                    });

                    it("Should restart momentum if different move", async function () {
                        const mon = initActive(ctx.state, "p1");
                        mon.volatile.momentum.start("rollout");
                        expect(mon.volatile.momentum.isActive).to.be.true;
                        expect(mon.volatile.momentum.type).to.equal("rollout");
                        expect(mon.volatile.momentum.turns).to.equal(0);
                        initActive(ctx.state, "p2");

                        await handle(moveEvent("p1", "iceball"));
                        expect(mon.volatile.momentum.isActive).to.be.true;
                        expect(mon.volatile.momentum.type).to.equal("iceball");
                        expect(mon.volatile.momentum.turns).to.equal(0);
                    });

                    it("Should reset momentum if unrelated move", async function () {
                        const mon = initActive(ctx.state, "p1");
                        mon.volatile.momentum.start("iceball");
                        expect(mon.volatile.momentum.isActive).to.be.true;

                        await handle(moveEvent("p1", "splash"));
                        expect(mon.volatile.momentum.isActive).to.be.false;
                    });

                    it("Should reset momentum if notarget", async function () {
                        const mon = initActive(ctx.state, "p1");
                        mon.volatile.momentum.start("rollout");
                        expect(mon.volatile.momentum.isActive).to.be.true;

                        await handle(
                            moveEvent("p1", "rollout", {
                                from: toEffectName("lockedmove"),
                                notarget: true,
                            }),
                        );
                        expect(mon.volatile.momentum.isActive).to.be.false;
                    });

                    it("Should reset momentum if miss", async function () {
                        const mon = initActive(ctx.state, "p1");
                        mon.volatile.momentum.start("iceball");
                        expect(mon.volatile.momentum.isActive).to.be.true;

                        await handle(
                            moveEvent("p1", "iceball", {
                                from: toEffectName("lockedmove"),
                                miss: true,
                            }),
                        );
                        expect(mon.volatile.momentum.isActive).to.be.false;
                    });
                });

                describe("two-turn move", function () {
                    it("Should release two-turn move", async function () {
                        const mon = initActive(ctx.state, "p1");
                        mon.volatile.twoTurn.start("fly");
                        expect(mon.volatile.twoTurn.isActive).to.be.true;
                        expect(mon.volatile.twoTurn.type).to.equal("fly");
                        mon.volatile.twoTurn.tick();

                        await handle(
                            moveEvent("p1", "fly", {
                                from: toEffectName("lockedmove"),
                            }),
                        );
                        expect(mon.volatile.twoTurn.isActive).to.be.false;
                    });
                });
            });

            describe("start implicit move statuses", function () {
                for (const move of ["defensecurl", "minimize"] as const) {
                    it(`Should start ${move}`, async function () {
                        const mon = initActive(ctx.state, "p1");
                        expect(mon.volatile[move]).to.be.false;

                        await handle(moveEvent("p1", move));
                        expect(mon.volatile[move]).to.be.true;
                    });
                }

                for (const move of ["healingwish", "lunardance"] as const) {
                    it(`Should start ${move} and set self-switch`, async function () {
                        const team = initActive(ctx.state, "p1").team!;
                        expect(team.status[move]).to.be.false;
                        expect(team.status.selfSwitch).to.be.null;

                        await handle(moveEvent("p1", move));
                        expect(team.status[move]).to.be.true;
                        expect(team.status.selfSwitch).to.be.true;
                    });
                }

                it("Should start wish", async function () {
                    const team = initActive(ctx.state, "p1").team!;
                    expect(team.status.wish.isActive).to.be.false;

                    await handle(moveEvent("p1", "wish"));
                    expect(team.status.wish.isActive).to.be.true;
                });

                it("Should set self-switch if applicable", async function () {
                    const team = initActive(ctx.state, "p1").team!;
                    expect(team.status.selfSwitch).to.be.null;

                    await handle(moveEvent("p1", "batonpass"));
                    expect(team.status.selfSwitch).to.equal("copyvolatile");
                });
            });

            describe("consume implicit move statuses", function () {
                it("Should reset micleberry status", async function () {
                    const mon = initActive(ctx.state, "p1");
                    mon.volatile.micleberry = true;

                    await handle(moveEvent("p1", "splash"));
                    expect(mon.volatile.micleberry).to.be.false;
                });

                it("Should reset single-move statuses", async function () {
                    const mon = initActive(ctx.state, "p1");
                    mon.volatile.destinybond = true;

                    await handle(moveEvent("p1", "splash"));
                    expect(mon.volatile.destinybond).to.be.false;
                });

                it("Should reset focuspunch status", async function () {
                    const mon = initActive(ctx.state, "p1");
                    mon.volatile.focus = true;
                    initActive(ctx.state, "p2");

                    await handle(moveEvent("p1", "focuspunch"));
                    expect(mon.volatile.focus).to.be.false;
                });

                it("Should reset stall counter if not a stall move", async function () {
                    const mon = initActive(ctx.state, "p1");
                    mon.volatile.stall(true);
                    expect(mon.volatile.stalling).to.be.true;

                    await handle(moveEvent("p1", "splash"));
                    expect(mon.volatile.stalling).to.be.false;
                });

                it("Should not reset stall counter if using stall move", async function () {
                    const mon = initActive(ctx.state, "p1");
                    mon.volatile.stall(true);
                    expect(mon.volatile.stalling).to.be.true;

                    await handle(moveEvent("p1", "detect"));
                    expect(mon.volatile.stalling).to.be.true;
                });

                it("Should reset stall counter if stall move failed", async function () {
                    const mon = initActive(ctx.state, "p1");
                    mon.volatile.stall(true);
                    expect(mon.volatile.stalling).to.be.true;

                    // Note: Indicates upcoming |-fail| event in this context.
                    await handle(moveEvent("p1", "detect", {still: true}));
                    expect(mon.volatile.stalling).to.be.false;
                });
            });

            describe("pressure", function () {
                it("Should deduct extra pp if targeting pressure ability holder", async function () {
                    const mon = initActive(ctx.state, "p1");
                    expect(mon.moveset.get("tackle")).to.be.null;
                    expect(mon.volatile.lastMove).to.be.null;
                    initActive(ctx.state, "p2").setAbility("pressure");

                    await handle(moveEvent("p1", "tackle"));
                    const move = mon.moveset.get("tackle");
                    expect(move).to.not.be.null;
                    expect(move).to.have.property("pp", 54);
                    expect(move).to.have.property("maxpp", 56);
                    expect(mon.volatile.lastMove).to.equal("tackle");
                });

                it("Should still not deduct pp if from lockedmove", async function () {
                    const mon = initActive(ctx.state, "p1");
                    const move = mon.moveset.reveal("tackle");
                    expect(move).to.have.property("pp", 56);
                    expect(move).to.have.property("maxpp", 56);
                    expect(mon.volatile.lastMove).to.be.null;
                    initActive(ctx.state, "p2").setAbility("pressure");

                    await handle(
                        moveEvent("p1", "tackle", {
                            from: toEffectName("lockedmove"),
                        }),
                    );
                    expect(move).to.have.property("pp", 56);
                    expect(move).to.have.property("maxpp", 56);
                    expect(mon.volatile.lastMove).to.equal("tackle");
                });

                it("Should deduct normal pp if not targeting pressure ability holder", async function () {
                    const mon = initActive(ctx.state, "p1");
                    expect(mon.moveset.get("splash")).to.be.null;
                    expect(mon.volatile.lastMove).to.be.null;
                    initActive(ctx.state, "p2").setAbility("pressure");

                    await handle(moveEvent("p1", "splash"));
                    const move = mon.moveset.get("splash");
                    expect(move).to.not.be.null;
                    expect(move).to.have.property("pp", 63);
                    expect(move).to.have.property("maxpp", 64);
                    expect(mon.volatile.lastMove).to.equal("splash");
                });
            });

            describe("called move", function () {
                it("Should not reveal move", async function () {
                    const mon = initActive(ctx.state, "p1");
                    expect(mon.moveset.get("tackle")).to.be.null;

                    await handle(
                        moveEvent("p1", "tackle", {
                            from: toEffectName("metronome", "move"),
                        }),
                    );
                    expect(mon.moveset.get("tackle")).to.be.null;
                });

                it("Should not update single-move, focus, lastMove, or stall", async function () {
                    const mon = initActive(ctx.state, "p1");
                    mon.volatile.destinybond = true;
                    mon.volatile.focus = true;
                    expect(mon.volatile.lastMove).to.be.null;
                    mon.volatile.stall(true);
                    expect(mon.volatile.stalling).to.be.true;

                    await handle(
                        moveEvent("p1", "tackle", {
                            from: toEffectName("metronome", "move"),
                        }),
                    );
                    expect(mon.volatile.destinybond).to.be.true;
                    expect(mon.volatile.focus).to.be.true;
                    expect(mon.volatile.lastMove).to.be.null;
                    expect(mon.volatile.stalling).to.be.true;
                });

                it("Should reveal move if calling from user's moveset via sleeptalk", async function () {
                    const mon = initActive(ctx.state, "p1");
                    expect(mon.moveset.get("tackle")).to.be.null;

                    await handle(
                        moveEvent("p1", "tackle", {
                            from: toEffectName("sleeptalk", "move"),
                        }),
                    );
                    const move = mon.moveset.get("tackle");
                    expect(move).to.not.be.null;
                    expect(move).to.have.property("pp", 56);
                    expect(move).to.have.property("maxpp", 56);
                });

                it("Should reveal move if calling from target's moveset via mefirst", async function () {
                    const mon1 = initActive(ctx.state, "p1");
                    expect(mon1.moveset.get("tackle")).to.be.null;
                    const mon2 = initActive(ctx.state, "p2");
                    expect(mon2.moveset.get("tackle")).to.be.null;

                    await handle(
                        moveEvent("p1", "tackle", {
                            from: toEffectName("mefirst", "move"),
                        }),
                    );
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
                initActive(ctx.state, "p1");
                initActive(ctx.state, "p2", smeargle, 2 /*size*/);

                await handle({
                    args: [
                        "switch",
                        toIdent("p2", ditto),
                        toDetails(ditto),
                        toHPStatus(100),
                    ],
                    kwArgs: {},
                });
            });
        });

        describe("|drag|", function () {
            it("Should handle forced switch-in", async function () {
                initActive(ctx.state, "p1");
                initActive(ctx.state, "p2", smeargle, 2 /*size*/);

                await handle({
                    args: [
                        "drag",
                        toIdent("p2", ditto),
                        toDetails(ditto),
                        toHPStatus(100),
                    ],
                    kwArgs: {},
                });
            });
        });

        describe("|detailschange|", function () {
            it("Should handle permanent form change", async function () {
                const mon = initActive(ctx.state, "p1", smeargle);
                expect(mon.species).to.equal("smeargle");
                expect(mon.baseSpecies).to.equal("smeargle");

                await handle({
                    args: [
                        "detailschange",
                        toIdent("p1", ditto),
                        toDetails(ditto),
                    ],
                    kwArgs: {},
                });
                expect(mon.species).to.equal("ditto");
                expect(mon.baseSpecies).to.equal("ditto");
            });
        });

        describe("|cant|", function () {
            it("Should handle inactivity and clear single-move statuses", async function () {
                const mon = initActive(ctx.state, "p1");
                mon.volatile.destinybond = true;

                await handle({
                    args: ["cant", toIdent("p1"), "flinch"],
                    kwArgs: {},
                });
            });

            it("Should reveal move if mentioned", async function () {
                const mon = initActive(ctx.state, "p1");
                mon.volatile.destinybond = true;
                expect(mon.moveset.get("tackle")).to.be.null;

                await handle({
                    args: [
                        "cant",
                        toIdent("p1"),
                        "flinch",
                        toMoveName("tackle"),
                    ],
                    kwArgs: {},
                });
                expect(mon.moveset.get("tackle")).to.not.be.null;
            });

            describe("reason = Damp ability", function () {
                it("Should reveal blocking ability", async function () {
                    const mon1 = initActive(ctx.state, "p1");
                    expect(mon1.moveset.get("selfdestruct")).to.be.null;
                    const mon2 = initActive(ctx.state, "p2");
                    expect(mon2.ability).to.be.empty;
                    expect(mon2.baseAbility).to.be.empty;

                    await handle({
                        args: [
                            "cant",
                            toIdent("p1"),
                            toEffectName("damp", "ability"),
                            toMoveName("selfdestruct"),
                        ],
                        kwArgs: {of: toIdent("p2")},
                    });
                    expect(mon1.moveset.get("selfdestruct")).to.not.be.null;
                    expect(mon2.ability).to.equal("damp");
                    expect(mon2.baseAbility).to.equal("damp");
                });
            });

            describe("reason = Focus Punch move", function () {
                it("Should reset focus status", async function () {
                    const mon = initActive(ctx.state, "p1");
                    mon.volatile.focus = true;

                    await handle({
                        args: ["cant", toIdent("p1"), toMoveName("focuspunch")],
                        kwArgs: {},
                    });
                    expect(mon.volatile.focus).to.be.false;
                });
            });

            describe("reason = Imprison move", function () {
                it("Should reveal move for both sides", async function () {
                    const us = initActive(ctx.state, "p1").moveset;
                    const them = initActive(ctx.state, "p2").moveset;
                    expect(us.get("splash")).to.be.null;
                    expect(them.get("splash")).to.be.null;

                    await handle({
                        args: [
                            "cant",
                            toIdent("p2"),
                            toMoveName("imprison"),
                            toMoveName("splash"),
                        ],
                        kwArgs: {},
                    });
                    expect(us.get("splash")).to.not.be.null;
                    expect(them.get("splash")).to.not.be.null;
                });
            });

            describe("reason = nopp", function () {
                it("Should not reveal move", async function () {
                    const mon = initActive(ctx.state, "p1");
                    expect(mon.moveset.get("encore")).to.be.null;

                    await handle({
                        args: [
                            "cant",
                            toIdent("p1"),
                            toEffectName("nopp"),
                            toMoveName("encore"),
                        ],
                        kwArgs: {},
                    });
                    expect(mon.moveset.get("encore")).to.be.null;
                });
            });

            describe("reason = recharge", function () {
                it("Should reset mustRecharge status", async function () {
                    const mon = initActive(ctx.state, "p1");
                    mon.volatile.mustRecharge = true;

                    await handle({
                        args: ["cant", toIdent("p1"), "recharge"],
                        kwArgs: {},
                    });
                    expect(mon.volatile.mustRecharge).to.be.false;
                });
            });

            describe("reason = slp", function () {
                it("Should tick slp turns", async function () {
                    const mon = initActive(ctx.state, "p1");
                    mon.majorStatus.afflict("slp");
                    expect(mon.majorStatus.turns).to.equal(1);

                    await handle({
                        args: ["cant", toIdent("p1"), "slp"],
                        kwArgs: {},
                    });
                    expect(mon.majorStatus.turns).to.equal(2);
                });
            });

            describe("reason = Truant ability", function () {
                it("Should flip Truant state", async function () {
                    // First make sure the pokemon has truant.
                    const mon = initActive(ctx.state, "p1");
                    mon.setAbility("truant");
                    expect(mon.volatile.willTruant).to.be.false;

                    // Also flipped back on postTurn to sync with this event.
                    await handle({
                        args: [
                            "cant",
                            toIdent("p1"),
                            toEffectName("truant", "ability"),
                        ],
                        kwArgs: {},
                    });
                    // Note: postTurn() will flip this to properly sync.
                    expect(mon.volatile.willTruant).to.be.true;
                });

                it("Should overlap Truant turn with recharge turn", async function () {
                    // First make sure the pokemon has truant.
                    const mon = initActive(ctx.state, "p1");
                    mon.setAbility("truant");
                    expect(mon.volatile.willTruant).to.be.false;
                    mon.volatile.mustRecharge = true;

                    await handle({
                        args: [
                            "cant",
                            toIdent("p1"),
                            toEffectName("truant", "ability"),
                        ],
                        kwArgs: {},
                    });
                    expect(mon.volatile.willTruant).to.be.true;
                    expect(mon.volatile.mustRecharge).to.be.false;
                });
            });
        });

        describe("|faint|", function () {
            it("Should set hp to 0", async function () {
                const mon = initActive(ctx.state, "p2");
                expect(mon.hp.current).to.equal(100);

                await handle({args: ["faint", toIdent("p2")], kwArgs: {}});
                expect(mon.hp.current).to.equal(0);
            });
        });

        describe("|-formechange|", function () {
            it("Should handle temporary form change", async function () {
                const mon = initActive(ctx.state, "p1", smeargle);
                expect(mon.species).to.equal("smeargle");
                expect(mon.baseSpecies).to.equal("smeargle");

                await handle({
                    args: [
                        "-formechange",
                        toIdent("p1", smeargle),
                        toSpeciesName("ditto"),
                    ],
                    kwArgs: {},
                });
                expect(mon.species).to.equal("ditto");
                expect(mon.baseSpecies).to.equal("smeargle");
            });

            it("Should reveal forecast", async function () {
                ctx.state.status.weather.start("SunnyDay");
                const mon = initActive(ctx.state, "p1", castform);
                expect(mon.species).to.equal("castform");
                expect(mon.baseSpecies).to.equal("castform");

                await handle({
                    args: [
                        "-formechange",
                        toIdent("p1", castform),
                        toSpeciesName("castformsunny"),
                    ],
                    kwArgs: {from: toEffectName("forecast", "ability")},
                });
                expect(mon.species).to.equal("castformsunny");
                expect(mon.baseSpecies).to.equal("castform");
                expect(mon.ability).to.equal("forecast");
            });
        });

        describe("|-fail|", function () {
            it("Should do nothing", async function () {
                await handle({args: ["-fail", toIdent("p1")], kwArgs: {}});
            });

            it("Should reveal ability that caused the move failure", async function () {
                const mon = initActive(ctx.state, "p2");
                mon.revealAbility("");
                expect(mon.ability).to.be.empty;
                expect(mon.baseAbility).to.be.empty;

                await handle({
                    args: ["-fail", toIdent("p1"), toEffectName("unboost")],
                    kwArgs: {
                        from: toEffectName("clearbody", "ability"),
                        of: toIdent("p2"),
                    },
                });
                expect(mon.ability).to.equal("clearbody");
                expect(mon.baseAbility).to.equal("clearbody");
            });
        });

        describe("|-block|", function () {
            it("Should do nothing since unsupported", async function () {
                await handle({
                    args: ["-block", toIdent("p1"), toEffectName("Dynamax")],
                    kwArgs: {},
                });
            });
        });

        describe("|-notarget|", function () {
            it("Should do nothing", async function () {
                await handle({args: ["-notarget"], kwArgs: {}});
            });
        });

        describe("|-miss|", function () {
            it("Should do nothing", async function () {
                await handle({args: ["-miss", toIdent("p2")], kwArgs: {}});
            });
        });

        describe("|-damage|", function () {
            it("Should set hp", async function () {
                const mon = initActive(ctx.state, "p2");
                expect(mon.hp.current).to.equal(100);

                await handle({
                    args: ["-damage", toIdent("p2"), toHPStatus(64)],
                    kwArgs: {},
                });
                expect(mon.hp.current).to.equal(64);
            });

            it("Should reveal ability that caused damage to self", async function () {
                const mon = initActive(ctx.state, "p2");
                mon.revealAbility("");
                expect(mon.ability).to.be.empty;
                expect(mon.baseAbility).to.be.empty;

                await handle({
                    args: ["-damage", toIdent("p2"), toHPStatus(90)],
                    kwArgs: {from: toEffectName("solarpower", "ability")},
                });
                expect(mon.ability).to.equal("solarpower");
                expect(mon.baseAbility).to.equal("solarpower");
            });

            it("Should reveal ability that caused damage to target", async function () {
                initActive(ctx.state, "p2");
                const mon = initActive(ctx.state, "p1");
                mon.revealAbility("");
                expect(mon.ability).to.be.empty;
                expect(mon.baseAbility).to.be.empty;

                await handle({
                    args: ["-damage", toIdent("p2"), toHPStatus(90)],
                    kwArgs: {
                        from: toEffectName("roughskin", "ability"),
                        of: toIdent("p1"),
                    },
                });
                expect(mon.ability).to.equal("roughskin");
                expect(mon.baseAbility).to.equal("roughskin");
            });

            it("Should reveal item that caused damage to self", async function () {
                const mon = initActive(ctx.state, "p2");
                expect(mon.item).to.be.empty;

                await handle({
                    args: ["-damage", toIdent("p2"), toHPStatus(90)],
                    kwArgs: {from: toEffectName("lifeorb", "item")},
                });
                expect(mon.item).to.equal("lifeorb");
            });
        });

        describe("|-heal|", function () {
            it("Should set hp", async function () {
                const mon = initActive(ctx.state, "p2");
                mon.hp.set(43);

                await handle({
                    args: ["-heal", toIdent("p2"), toHPStatus(92)],
                    kwArgs: {},
                });
                expect(mon.hp.current).to.equal(92);
            });

            it("Should reveal ability that caused self-heal", async function () {
                ctx.state.status.weather.start("Hail");
                const mon = initActive(ctx.state, "p2");
                mon.hp.set(90);
                mon.revealAbility("");
                expect(mon.ability).to.be.empty;
                expect(mon.baseAbility).to.be.empty;

                await handle({
                    args: ["-heal", toIdent("p2"), toHPStatus(95)],
                    kwArgs: {from: toEffectName("icebody", "ability")},
                });
                expect(mon.ability).to.equal("icebody");
                expect(mon.baseAbility).to.equal("icebody");
            });

            it("Should reveal item that caused self-heal", async function () {
                const mon = initActive(ctx.state, "p2");
                mon.hp.set(90);
                expect(mon.item).to.be.empty;

                await handle({
                    args: ["-heal", toIdent("p2"), toHPStatus(95)],
                    kwArgs: {from: toEffectName("leftovers", "item")},
                });
                expect(mon.item).to.equal("leftovers");
            });

            it("Should consume lunardance status and restore move pp if mentioned", async function () {
                const mon = initActive(ctx.state, "p2");
                mon.team!.status.lunardance = true;
                mon.hp.set(31);
                mon.majorStatus.afflict("slp");
                const move = mon.moveset.reveal("tackle");
                move.pp = 3;

                await handle({
                    args: ["-heal", toIdent("p2"), toHPStatus(100)],
                    kwArgs: {from: toEffectName("lunardance", "move")},
                });
                expect(mon.hp.current).to.equal(100);
                expect(mon.majorStatus.current).to.be.null;
                expect(mon.team!.status.lunardance).to.be.false;
                expect(move.pp).to.equal(move.maxpp);
            });

            it("Should consume healingwish status if mentioned", async function () {
                const mon = initActive(ctx.state, "p2");
                mon.team!.status.healingwish = true;
                mon.hp.set(31);
                mon.majorStatus.afflict("psn");

                await handle({
                    args: ["-heal", toIdent("p2"), toHPStatus(100)],
                    kwArgs: {from: toEffectName("healingwish", "move")},
                });
                expect(mon.hp.current).to.equal(100);
                expect(mon.majorStatus.current).to.be.null;
                expect(mon.team!.status.healingwish).to.be.false;
            });

            it("Should consume wish status if mentioned", async function () {
                const [, mon] = initTeam(ctx.state, "p2", [ditto, smeargle]);
                mon.hp.set(2);
                ctx.state.getTeam("p2").status.wish.start();

                await handle({
                    args: ["-heal", toIdent("p2"), toHPStatus(100)],
                    kwArgs: {
                        from: toEffectName("wish", "move"),
                        wisher: toNickname("Ditto"),
                    },
                });
                expect(mon.hp.current).to.equal(100);
                expect(mon.team!.status.wish.isActive).to.be.false;
            });
        });

        describe("|-sethp|", function () {
            it("Should set hp for one target", async function () {
                const mon = initActive(ctx.state, "p2");
                mon.hp.set(11);

                await handle({
                    args: ["-sethp", toIdent("p2"), toHPStatus(1)],
                    kwArgs: {},
                });
                expect(mon.hp.current).to.equal(1);
            });

            it("Should set hp for two targets", async function () {
                const mon1 = initActive(ctx.state, "p1");
                mon1.hp.set(16);
                const mon2 = initActive(ctx.state, "p2");
                mon2.hp.set(11);

                await handle({
                    args: [
                        "-sethp",
                        toIdent("p2"),
                        toNum(19),
                        toIdent("p1"),
                        toNum(13),
                    ],
                    kwArgs: {},
                });
                expect(mon1.hp.current).to.equal(13);
                expect(mon2.hp.current).to.equal(19);
            });

            it("Should throw if first health number is invalid", async function () {
                initActive(ctx.state, "p1");
                initActive(ctx.state, "p2");

                await reject(
                    {
                        args: [
                            "-sethp",
                            toIdent("p2"),
                            toNum(NaN),
                            toIdent("p1"),
                            toNum(13),
                        ],
                        kwArgs: {},
                    },
                    Error,
                    "Invalid health number 'NaN'",
                );
            });

            it("Should throw if second health number is invalid", async function () {
                initActive(ctx.state, "p1");
                initActive(ctx.state, "p2");

                await reject(
                    {
                        args: [
                            "-sethp",
                            toIdent("p2"),
                            toNum(50),
                            toIdent("p1"),
                            toNum(NaN),
                        ],
                        kwArgs: {},
                    },
                    Error,
                    "Invalid health number 'NaN'",
                );
            });
        });

        describe("|-status|", function () {
            it("Should afflict major status", async function () {
                const mon = initActive(ctx.state, "p1");
                expect(mon.majorStatus.current).to.be.null;

                await handle({
                    args: ["-status", toIdent("p1"), "brn"],
                    kwArgs: {},
                });
                expect(mon.majorStatus.current).to.equal("brn");
            });

            it("Should reveal ability that caused status", async function () {
                initActive(ctx.state, "p1");
                const mon = initActive(ctx.state, "p2");
                mon.revealAbility("");
                expect(mon.ability).to.be.empty;
                expect(mon.baseAbility).to.be.empty;

                await handle({
                    args: ["-status", toIdent("p1"), "psn"],
                    kwArgs: {
                        from: toEffectName("poisonpoint", "ability"),
                        of: toIdent("p2"),
                    },
                });
                expect(mon.ability).to.equal("poisonpoint");
                expect(mon.baseAbility).to.equal("poisonpoint");
            });

            it("Should reveal item that caused status", async function () {
                const mon = initActive(ctx.state, "p1");
                expect(mon.item).to.be.empty;

                await handle({
                    args: ["-status", toIdent("p1"), "tox"],
                    kwArgs: {from: toEffectName("toxicorb", "item")},
                });
                expect(mon.item).to.equal("toxicorb");
            });
        });

        describe("|-curestatus|", function () {
            it("Should cure major status", async function () {
                const mon = initActive(ctx.state, "p1");
                mon.majorStatus.afflict("frz");

                await handle({
                    args: ["-curestatus", toIdent("p1"), "frz"],
                    kwArgs: {},
                });
                expect(mon.majorStatus.current).to.be.null;
            });

            it("Should reveal ability that caused self-cure", async function () {
                const mon = initActive(ctx.state, "p1");
                mon.majorStatus.afflict("slp");
                mon.revealAbility("");
                expect(mon.ability).to.be.empty;
                expect(mon.baseAbility).to.be.empty;

                await handle({
                    args: ["-curestatus", toIdent("p1"), "slp"],
                    kwArgs: {from: toEffectName("naturalcure", "ability")},
                });
                expect(mon.ability).to.equal("naturalcure");
                expect(mon.baseAbility).to.equal("naturalcure");
            });

            // Note: This usually happens due to healbell/aromatherapy move
            // effect, but the event that announces that effect already takes
            // care of it.
            it("Should ignore bench cure for now", async function () {
                const [benched] = initTeam(ctx.state, "p1", [ditto, smeargle]);
                benched.majorStatus.afflict("frz");

                await handle({
                    args: ["-curestatus", toIdent("p1", ditto, null), "frz"],
                    kwArgs: {silent: true},
                });
                expect(benched.majorStatus.current).to.equal("frz");
            });
        });

        describe("|-cureteam|", function () {
            it("Should cure major status of every pokemon on the team", async function () {
                const [bench, active] = initTeam(ctx.state, "p1", [
                    ditto,
                    smeargle,
                ]);
                bench.majorStatus.afflict("slp");
                active.majorStatus.afflict("par");

                await handle({
                    args: ["-cureteam", toIdent("p1")],
                    kwArgs: {},
                });
                expect(bench.majorStatus.current).to.be.null;
                expect(active.majorStatus.current).to.be.null;
            });
        });

        describe("|-boost|", function () {
            it("Should add boost", async function () {
                const {boosts} = initActive(ctx.state, "p1").volatile;
                boosts.atk = 1;

                await handle({
                    args: ["-boost", toIdent("p1"), "atk", toNum(2)],
                    kwArgs: {},
                });
                expect(boosts.atk).to.equal(3);
            });

            it("Should throw if invalid boost number", async function () {
                initActive(ctx.state, "p1");

                await reject(
                    {
                        args: ["-boost", toIdent("p1"), "atk", toNum(NaN)],
                        kwArgs: {},
                    },
                    Error,
                    "Invalid boost num 'NaN'",
                );
            });
        });

        describe("|-unboost|", function () {
            it("Should subtract boost", async function () {
                const {boosts} = initActive(ctx.state, "p2").volatile;
                boosts.spe = 5;

                await handle({
                    args: ["-unboost", toIdent("p2"), "spe", toNum(4)],
                    kwArgs: {},
                });
                expect(boosts.spe).to.equal(1);
            });

            it("Should throw if invalid unboost number", async function () {
                initActive(ctx.state, "p1");

                await reject(
                    {
                        args: ["-unboost", toIdent("p1"), "atk", toNum(NaN)],
                        kwArgs: {},
                    },
                    Error,
                    "Invalid unboost num 'NaN'",
                );
            });
        });

        describe("|-setboost|", function () {
            it("Should set boost", async function () {
                const {boosts} = initActive(ctx.state, "p2").volatile;
                boosts.evasion = -2;

                await handle({
                    args: ["-setboost", toIdent("p2"), "evasion", toNum(2)],
                    kwArgs: {},
                });
                expect(boosts.evasion).to.equal(2);
            });

            it("Should throw if invalid boost number", async function () {
                initActive(ctx.state, "p2");

                await reject(
                    {
                        args: ["-setboost", toIdent("p2"), "spe", toNum(NaN)],
                        kwArgs: {},
                    },
                    Error,
                    "Invalid setboost num 'NaN'",
                );
            });
        });

        describe("|-swapboost|", function () {
            it("Should swap boosts", async function () {
                const us = initActive(ctx.state, "p1").volatile.boosts;
                const them = initActive(ctx.state, "p2").volatile.boosts;
                us.accuracy = 4;
                them.accuracy = 3;
                them.spd = -1;
                them.spe = 2;

                await handle({
                    args: [
                        "-swapboost",
                        toIdent("p1"),
                        toIdent("p2"),
                        toBoostIDs("accuracy", "spe"),
                    ],
                    kwArgs: {},
                });
                expect(us.accuracy).to.equal(3);
                expect(us.spd).to.equal(0);
                expect(us.spe).to.equal(2);
                expect(them.accuracy).to.equal(4);
                expect(them.spd).to.equal(-1);
                expect(them.spe).to.equal(0);
            });

            it("Should swap all boosts if none are mentioned", async function () {
                const us = initActive(ctx.state, "p1").volatile.boosts;
                const them = initActive(ctx.state, "p2").volatile.boosts;
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

                await handle({
                    args: ["-swapboost", toIdent("p1"), toIdent("p2")],
                    kwArgs: {},
                });
                expect(us).to.deep.equal(themOld);
                expect(them).to.deep.equal(usOld);
            });
        });

        describe("|-invertboost|", function () {
            it("Should invert boosts", async function () {
                const {boosts} = initActive(ctx.state, "p1").volatile;
                boosts.spe = 1;
                boosts.atk = -1;

                await handle({
                    args: ["-invertboost", toIdent("p1")],
                    kwArgs: {},
                });
                expect(boosts.spe).to.equal(-1);
                expect(boosts.atk).to.equal(1);
            });
        });

        describe("|-clearboost|", function () {
            it("Should clear boosts", async function () {
                const {boosts} = initActive(ctx.state, "p1").volatile;
                boosts.spe = -3;
                boosts.accuracy = 6;

                await handle({
                    args: ["-clearboost", toIdent("p1")],
                    kwArgs: {},
                });
                expect(boosts.spe).to.equal(0);
                expect(boosts.accuracy).to.equal(0);
            });
        });

        describe("|-clearallboost|", function () {
            it("Should clear all boosts from both sides", async function () {
                const us = initActive(ctx.state, "p1").volatile.boosts;
                const them = initActive(ctx.state, "p2").volatile.boosts;
                us.accuracy = 2;
                them.spe = -2;

                await handle({args: ["-clearallboost"], kwArgs: {}});
                expect(us.accuracy).to.equal(0);
                expect(them.spe).to.equal(0);
            });
        });

        describe("|-clearpositiveboost|", function () {
            it("Should clear positive boosts", async function () {
                const {boosts} = initActive(ctx.state, "p1").volatile;
                boosts.spd = 3;
                boosts.def = -1;

                await handle({
                    args: [
                        "-clearpositiveboost",
                        toIdent("p1"),
                        // Source pokemon/effect (note: unsupported move).
                        toIdent("p2"),
                        toEffectName("move: Spectral Thief"),
                    ],
                    kwArgs: {},
                });
                expect(boosts.spd).to.equal(0);
                expect(boosts.def).to.equal(-1);
            });
        });

        describe("|-clearnegativeboost|", function () {
            it("Should clear negative boosts", async function () {
                const {boosts} = initActive(ctx.state, "p1").volatile;
                boosts.evasion = 2;
                boosts.spa = -3;

                await handle({
                    args: ["-clearnegativeboost", toIdent("p1")],
                    kwArgs: {},
                });
                expect(boosts.evasion).to.equal(2);
                expect(boosts.spa).to.equal(0);
            });
        });

        describe("|-copyboost|", function () {
            it("Should copy boosts", async function () {
                const us = initActive(ctx.state, "p1").volatile.boosts;
                const them = initActive(ctx.state, "p2").volatile.boosts;
                us.evasion = 3;
                us.def = -1;
                them.def = 4;

                await handle({
                    args: [
                        // Order of idents is [source, target].
                        "-copyboost",
                        toIdent("p1"),
                        toIdent("p2"),
                        toBoostIDs("def"),
                    ],
                    kwArgs: {},
                });
                expect(us.evasion).to.equal(3);
                expect(us.def).to.equal(-1);
                expect(them.def).to.equal(-1);
            });

            it("Should copy all boosts if none are mentioned", async function () {
                const us = initActive(ctx.state, "p1").volatile.boosts;
                const them = initActive(ctx.state, "p2").volatile.boosts;
                us.atk = 2;
                them.atk = -2;

                await handle({
                    args: ["-copyboost", toIdent("p1"), toIdent("p2")],
                    kwArgs: {},
                });
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
                expect(ctx.state.status.weather.type).to.equal("none");
            });

            it("Should set weather", async function () {
                await handle(weatherEvent("Sandstorm"));
                expect(ctx.state.status.weather.type).to.equal("Sandstorm");
                expect(ctx.state.status.weather.duration).to.equal(8);
                expect(ctx.state.status.weather.infinite).to.be.false;
            });

            it("Should reveal ability that caused weather and infer infinite duration", async function () {
                const mon = initActive(ctx.state, "p2");
                mon.revealAbility("");
                expect(mon.ability).to.be.empty;
                expect(mon.baseAbility).to.be.empty;

                await handle(
                    weatherEvent("SunnyDay", {
                        from: toEffectName("drought", "ability"),
                        of: toIdent("p2"),
                    }),
                );
                expect(mon.ability).to.equal("drought");
                expect(mon.baseAbility).to.equal("drought");
                expect(ctx.state.status.weather.type).to.equal("SunnyDay");
                expect(ctx.state.status.weather.duration).to.equal(8);
                expect(ctx.state.status.weather.infinite).to.be.true;
            });

            it("Should reset weather set to 'none'", async function () {
                ctx.state.status.weather.start("Hail");
                expect(ctx.state.status.weather.type).to.equal("Hail");

                await handle(weatherEvent("none"));
                expect(ctx.state.status.weather.type).to.equal("none");
            });

            it("Should tick weather if [upkeep] suffix", async function () {
                ctx.state.status.weather.start("RainDance");
                expect(ctx.state.status.weather.turns).to.equal(0);

                await handle(weatherEvent("RainDance", {upkeep: true}));
                expect(ctx.state.status.weather.turns).to.equal(1);
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
                            ctx.state.status[effect].start();
                        }
                        expect(ctx.state.status[effect].isActive).to.be[
                            start ? "false" : "true"
                        ];

                        await handle({
                            args: [eventName, toFieldCondition(effect)],
                            kwArgs: {},
                        });
                        expect(ctx.state.status[effect].isActive).to.be[
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
                        const ts = ctx.state.getTeam("p1").status;
                        if (!start) {
                            ts[effect].start();
                        }
                        expect(ts[effect].isActive).to.be[
                            start ? "false" : "true"
                        ];

                        await handle({
                            args: [
                                eventName,
                                toSide("p1", "player1"),
                                condition,
                            ],
                            kwArgs: {},
                        });
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
                        const {status: ts} = ctx.state.getTeam("p1");
                        if (!start) {
                            ts[effect] = 1;
                        }
                        expect(ts[effect]).to.equal(start ? 0 : 1);

                        await handle({
                            args: [
                                eventName,
                                toSide("p1", "player1"),
                                condition,
                            ],
                            kwArgs: {},
                        });
                        expect(ts[effect]).to.equal(start ? 1 : 0);
                    });
                }
            });
        }

        describe("|-swapsideconditions|", function () {
            it("Should do nothing since unsupported", async function () {
                await handle({args: ["-swapsideconditions"], kwArgs: {}});
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
                        const mon = initActive(ctx.state, "p1");
                        mon.revealAbility("");
                        expect(mon.ability).to.be.empty;
                        expect(mon.baseAbility).to.be.empty;
                        expect(mon.volatile.flashfire).to.be.false;

                        await handle({
                            args: [
                                "-start",
                                toIdent("p1"),
                                toEffectName(toAbilityName("flashfire")),
                            ],
                            kwArgs: {},
                        });
                        expect(mon.ability).to.equal("flashfire");
                        expect(mon.baseAbility).to.equal("flashfire");
                        expect(mon.volatile.flashfire).to.be.true;
                    });

                    it("Should start typechange", async function () {
                        const mon = initActive(ctx.state, "p1", ditto);
                        expect(mon.types).to.have.members(["normal", "???"]);
                        expect(mon.baseTypes).to.have.members([
                            "normal",
                            "???",
                        ]);

                        await handle({
                            args: [
                                "-start",
                                toIdent("p1"),
                                "typechange",
                                toTypes("dark", "rock"),
                            ],
                            kwArgs: {},
                        });
                        expect(mon.types).to.have.members(["dark", "rock"]);
                        expect(mon.baseTypes).to.have.members([
                            "normal",
                            "???",
                        ]);
                    });

                    it("Should truncate typechange if more than 2 types given", async function () {
                        const mon = initActive(ctx.state, "p1", ditto);
                        expect(mon.types).to.have.members(["normal", "???"]);
                        expect(mon.baseTypes).to.have.members([
                            "normal",
                            "???",
                        ]);

                        await handle({
                            args: [
                                "-start",
                                toIdent("p1"),
                                "typechange",
                                toTypes("dragon", "ghost", "psychic"),
                            ],
                            kwArgs: {},
                        });
                        expect(mon.types).to.have.members(["dragon", "ghost"]);
                        expect(mon.baseTypes).to.have.members([
                            "normal",
                            "???",
                        ]);
                    });

                    it("Should expand typechange if 1 type given", async function () {
                        const mon = initActive(ctx.state, "p1", ditto);
                        expect(mon.types).to.have.members(["normal", "???"]);
                        expect(mon.baseTypes).to.have.members([
                            "normal",
                            "???",
                        ]);

                        await handle({
                            args: [
                                "-start",
                                toIdent("p1"),
                                "typechange",
                                toTypes("psychic"),
                            ],
                            kwArgs: {},
                        });
                        expect(mon.types).to.have.members(["psychic", "???"]);
                        expect(mon.baseTypes).to.have.members([
                            "normal",
                            "???",
                        ]);
                    });

                    it("Should expand typechange if 0 types given", async function () {
                        const mon = initActive(ctx.state, "p1", ditto);
                        expect(mon.types).to.have.members(["normal", "???"]);
                        expect(mon.baseTypes).to.have.members([
                            "normal",
                            "???",
                        ]);

                        await handle({
                            args: ["-start", toIdent("p1"), "typechange"],
                            kwArgs: {},
                        });
                        expect(mon.types).to.have.members(["???", "???"]);
                        expect(mon.baseTypes).to.have.members([
                            "normal",
                            "???",
                        ]);
                    });

                    it("Should count perish", async function () {
                        const mon = initActive(ctx.state, "p1", ditto);
                        expect(mon.volatile.perish).to.equal(0);

                        await handle({
                            args: [
                                "-start",
                                toIdent("p1"),
                                toEffectName("perish2"),
                            ],
                            kwArgs: {},
                        });
                        expect(mon.volatile.perish).to.equal(2);
                    });

                    it("Should count stockpile", async function () {
                        const mon = initActive(ctx.state, "p1", ditto);
                        expect(mon.volatile.stockpile).to.equal(0);

                        await handle({
                            args: [
                                "-start",
                                toIdent("p1"),
                                toEffectName("stockpile1"),
                            ],
                            kwArgs: {},
                        });
                        expect(mon.volatile.stockpile).to.equal(1);
                    });

                    it("Should reveal ability that caused self-effect", async function () {
                        const mon = initActive(ctx.state, "p1", ditto);
                        mon.revealAbility("");
                        expect(mon.ability).to.be.empty;
                        expect(mon.baseAbility).to.be.empty;
                        expect(mon.types).to.have.members(["normal", "???"]);
                        expect(mon.baseTypes).to.have.members([
                            "normal",
                            "???",
                        ]);

                        await handle({
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
                        expect(mon.types).to.have.members(["water", "???"]);
                        expect(mon.baseTypes).to.have.members([
                            "normal",
                            "???",
                        ]);
                    });

                    it("Should reveal ability that caused effect on target", async function () {
                        initActive(ctx.state, "p1");
                        const mon = initActive(ctx.state, "p2");
                        mon.revealAbility("");
                        expect(mon.ability).to.be.empty;
                        expect(mon.baseAbility).to.be.empty;

                        await handle({
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
                        expect(mon.ability).to.equal("cutecharm");
                        expect(mon.baseAbility).to.equal("cutecharm");
                    });
                } else {
                    it("Should end stockpile", async function () {
                        const mon = initActive(ctx.state, "p1", ditto);
                        mon.volatile.stockpile = 3;

                        await handle({
                            args: [
                                "-end",
                                toIdent("p1"),
                                toEffectName("stockpile"),
                            ],
                            kwArgs: {},
                        });
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
                        const mon = initActive(ctx.state, "p1");
                        if (!start) {
                            mon.volatile[effect] = true;
                        }
                        expect(mon.volatile[effect]).to.be[
                            start ? "false" : "true"
                        ];

                        await handle({
                            args: [
                                eventName,
                                toIdent("p1"),
                                toEffectName(effect, "move"),
                            ],
                            kwArgs: {},
                        });
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
                        const mon = initActive(ctx.state, "p1");
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

                        await handle({
                            args: [
                                eventName,
                                toIdent("p1"),
                                toEffectName(effect, type),
                            ],
                            kwArgs: {},
                        });
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
                            const mon = initActive(ctx.state, "p2");
                            mon.volatile.rampage.start("outrage");

                            await handle({
                                args: [
                                    "-start",
                                    toIdent("p2"),
                                    toEffectName(effect, type),
                                ],
                                kwArgs: {fatigue: true},
                            });
                            expect(mon.volatile.rampage.isActive).to.be.false;
                        });
                    }

                    if (start && effect === "uproar") {
                        it("Should tick uproar if upkeep and already active", async function () {
                            const mon = initActive(ctx.state, "p1");
                            expect(mon.volatile[effect].isActive).to.be.false;

                            // First start the effect.
                            mon.volatile[effect].start();
                            expect(mon.volatile[effect].isActive).to.be.true;
                            expect(mon.volatile[effect].turns).to.equal(0);

                            // Then update it.
                            await handle({
                                args: [
                                    "-start",
                                    toIdent("p1"),
                                    toEffectName(effect, type),
                                ],
                                kwArgs: {upkeep: true},
                            });
                            expect(mon.volatile[effect].isActive).to.be.true;
                            expect(mon.volatile[effect].turns).to.equal(1);
                        });
                    }
                }

                // Disable move status.
                if (start) {
                    it("Should disable move", async function () {
                        const mon = initActive(ctx.state, "p2");

                        await handle({
                            args: [
                                "-start",
                                toIdent("p2"),
                                toEffectName("disable", "move"),
                                toMoveName("tackle"),
                            ],
                            kwArgs: {},
                        });
                        expect(mon.volatile.disabled.move).to.equal("tackle");
                        expect(mon.volatile.disabled.ts.isActive).to.be.true;
                    });
                } else {
                    it("Should re-enable disabled moves", async function () {
                        const mon = initActive(ctx.state, "p2");
                        mon.volatile.disableMove("tackle");
                        expect(mon.volatile.disabled.move).to.equal("tackle");
                        expect(mon.volatile.disabled.ts.isActive).to.be.true;

                        await handle({
                            args: [
                                "-end",
                                toIdent("p2"),
                                toEffectName("disable", "move"),
                            ],
                            kwArgs: {},
                        });
                        expect(mon.volatile.disabled.move).to.be.null;
                        expect(mon.volatile.disabled.ts.isActive).to.be.false;
                    });
                }

                it(`Should ${verb} encore`, async function () {
                    const mon = initActive(ctx.state, "p1");
                    if (!start) {
                        mon.volatile.encoreMove("tackle");
                        expect(mon.volatile.encore.ts.isActive).to.be.true;
                        expect(mon.volatile.encore.move).to.equal("tackle");
                    } else {
                        mon.volatile.lastMove = "tackle";
                        expect(mon.volatile.encore.ts.isActive).to.be.false;
                        expect(mon.volatile.encore.move).to.be.null;
                    }

                    await handle({
                        args: [
                            eventName,
                            toIdent("p1"),
                            toEffectName("encore", "move"),
                        ],
                        kwArgs: {},
                    });
                    expect(mon.volatile.encore.ts.isActive).to.be[
                        start ? "true" : "false"
                    ];
                    if (start) {
                        expect(mon.volatile.encore.move).to.equal("tackle");
                    } else {
                        expect(mon.volatile.encore.move).to.be.null;
                    }
                });

                for (const effect of ["foresight", "miracleeye"] as const) {
                    it(`Should ${verb} ${effect}`, async function () {
                        const mon = initActive(ctx.state, "p1");
                        if (!start) {
                            mon.volatile.identified = effect;
                        } else {
                            expect(mon.volatile.identified).to.be.null;
                        }

                        await handle({
                            args: [
                                eventName,
                                toIdent("p1"),
                                toEffectName(effect, "move"),
                            ],
                            kwArgs: {},
                        });
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
                    initActive(ctx.state, "p1");
                    initActive(ctx.state, "p2");
                    const team = ctx.state.getTeam("p1");
                    if (!start) {
                        team.status.futureMoves.doomdesire.start();
                    }
                    expect(team.status.futureMoves.doomdesire.isActive).to.be[
                        start ? "false" : "true"
                    ];

                    await handle({
                        args: [
                            // Note: Start mentions user, end mentions target.
                            eventName,
                            toIdent(start ? "p1" : "p2"),
                            toMoveName("doomdesire"),
                        ],
                        kwArgs: {},
                    });
                    expect(team.status.futureMoves.doomdesire.isActive).to.be[
                        start ? "true" : "false"
                    ];
                });

                it("Should ignore invalid effect", async function () {
                    initActive(ctx.state, "p1");

                    await handle({
                        args: [
                            eventName,
                            toIdent("p1"),
                            toEffectName("invalid"),
                        ],
                        kwArgs: {},
                    });
                });
            });
        }

        describe("|-crit|", function () {
            it("Should do nothing", async function () {
                await handle({args: ["-crit", toIdent("p2")], kwArgs: {}});
            });
        });

        describe("|-supereffective|", function () {
            it("Should do nothing", async function () {
                await handle({
                    args: ["-supereffective", toIdent("p2")],
                    kwArgs: {},
                });
            });
        });

        describe("|-resisted|", function () {
            it("Should do nothing", async function () {
                await handle({
                    args: ["-resisted", toIdent("p2")],
                    kwArgs: {},
                });
            });
        });

        describe("|-immune|", function () {
            it("Should do nothing", async function () {
                await handle({args: ["-immune", toIdent("p2")], kwArgs: {}});
            });

            it("Should reveal ability that caused immunity", async function () {
                const mon = initActive(ctx.state, "p2");
                mon.revealAbility("");
                expect(mon.ability).to.be.empty;
                expect(mon.baseAbility).to.be.empty;

                await handle({
                    args: ["-immune", toIdent("p2")],
                    kwArgs: {from: toEffectName("levitate", "ability")},
                });
                expect(mon.ability).to.equal("levitate");
                expect(mon.baseAbility).to.equal("levitate");
            });
        });

        describe("|-item|", function () {
            it("Should set item", async function () {
                const mon = initActive(ctx.state, "p1");
                expect(mon.item).to.be.empty;

                await handle({
                    args: ["-item", toIdent("p1"), toItemName("mail")],
                    kwArgs: {},
                });
                expect(mon.item).to.equal("mail");
            });

            it("Should handle recycle effect", async function () {
                const mon = initActive(ctx.state, "p1");
                mon.removeItem("mail");
                expect(mon.item).to.equal("none");
                expect(mon.lastItem).to.equal("mail");

                await handle({
                    args: ["-item", toIdent("p1"), toItemName("mail")],
                    kwArgs: {from: toEffectName("recycle", "move")},
                });
                expect(mon.item).to.equal("mail");
                expect(mon.lastItem).to.equal("none");
            });

            it("Should reveal item due to frisk", async function () {
                const mon1 = initActive(ctx.state, "p1");
                expect(mon1.item).to.be.empty;
                const mon2 = initActive(ctx.state, "p2");
                mon2.revealAbility("");
                expect(mon2.ability).to.be.empty;
                expect(mon2.baseAbility).to.be.empty;

                await handle({
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
                const mon = initActive(ctx.state, "p1");
                expect(mon.item).to.be.empty;
                expect(mon.lastItem).to.equal("none");

                await handle({
                    args: ["-enditem", toIdent("p1"), toItemName("focussash")],
                    kwArgs: {},
                });
                expect(mon.item).to.equal("none");
                expect(mon.lastItem).to.equal("focussash");
            });

            it("Should eat item", async function () {
                const mon = initActive(ctx.state, "p1");
                expect(mon.item).to.be.empty;
                expect(mon.lastItem).to.equal("none");

                await handle({
                    args: ["-enditem", toIdent("p1"), toItemName("lumberry")],
                    kwArgs: {eat: true},
                });
                expect(mon.item).to.equal("none");
                expect(mon.lastItem).to.equal("lumberry");
            });

            it("Should ignore resist berry effect", async function () {
                await handle({
                    args: [
                        "-enditem",
                        toIdent("p1"),
                        toItemName("chopleberry"),
                    ],
                    kwArgs: {weaken: true},
                });
            });

            it("Should destroy item if from stealeat effect", async function () {
                const mon1 = initActive(ctx.state, "p1");
                const mon2 = initActive(ctx.state, "p2");
                expect(mon1.item).to.be.empty;
                expect(mon1.lastItem).to.equal("none");
                expect(mon2.item).to.be.empty;
                expect(mon2.lastItem).to.equal("none");

                await handle({
                    args: ["-enditem", toIdent("p1"), toItemName("oranberry")],
                    kwArgs: {
                        from: toEffectName("stealeat"),
                        move: toMoveName("bugbite"),
                        of: toIdent("p2"),
                    },
                });
                expect(mon1.item).to.equal("none");
                expect(mon1.lastItem).to.equal("none");
                expect(mon2.item).to.be.empty;
                expect(mon2.lastItem).to.equal("none");
            });

            it("Should destroy item if from item-removal move", async function () {
                const mon1 = initActive(ctx.state, "p1");
                const mon2 = initActive(ctx.state, "p2");
                expect(mon1.item).to.be.empty;
                expect(mon1.lastItem).to.equal("none");
                expect(mon2.item).to.be.empty;
                expect(mon2.lastItem).to.equal("none");

                await handle({
                    args: ["-enditem", toIdent("p1"), toItemName("oranberry")],
                    kwArgs: {
                        from: toEffectName("knockoff", "move"),
                        of: toIdent("p2"),
                    },
                });
                expect(mon1.item).to.equal("none");
                expect(mon1.lastItem).to.equal("none");
                expect(mon2.item).to.be.empty;
                expect(mon2.lastItem).to.equal("none");
            });

            it("Should consume micleberry status", async function () {
                const mon = initActive(ctx.state, "p1");
                mon.volatile.micleberry = true;
                expect(mon.item).to.be.empty;
                expect(mon.lastItem).to.equal("none");

                await handle({
                    args: ["-enditem", toIdent("p1"), toItemName("micleberry")],
                    kwArgs: {},
                });
                expect(mon.volatile.micleberry).to.be.false;
                expect(mon.item).to.be.empty;
                expect(mon.lastItem).to.equal("none");
            });
        });

        describe("|-ability|", function () {
            it("Should indicate ability activation", async function () {
                const mon = initActive(ctx.state, "p1");
                mon.revealAbility("");
                expect(mon.ability).to.be.empty;
                expect(mon.baseAbility).to.be.empty;

                await handle({
                    args: [
                        "-ability",
                        toIdent("p1"),
                        toAbilityName("pressure"),
                    ],
                    kwArgs: {},
                });
                expect(mon.ability).to.equal("pressure");
                expect(mon.baseAbility).to.equal("pressure");
            });

            it("Should not set base ability if acquired via effect", async function () {
                const mon = initActive(ctx.state, "p1");
                mon.revealAbility("");
                expect(mon.ability).to.be.empty;
                expect(mon.baseAbility).to.be.empty;

                await handle({
                    args: [
                        "-ability",
                        toIdent("p1"),
                        toAbilityName("insomnia"),
                    ],
                    kwArgs: {from: toEffectName("worryseed", "move")},
                });
                expect(mon.ability).to.equal("insomnia");
                expect(mon.baseAbility).to.be.empty;
            });

            it("Should set abilities appropriately if acquired via trace", async function () {
                // Note: Traced ability activates before trace event, so here we
                // operate under the false assumption that p1 has the ability
                // directly when it was really traced, and we correct that using
                // the trace event.
                const mon1 = initActive(ctx.state, "p1");
                mon1.revealAbility("moldbreaker");
                expect(mon1.ability).to.equal("moldbreaker");
                expect(mon1.baseAbility).to.equal("moldbreaker");
                const mon2 = initActive(ctx.state, "p2");
                mon2.revealAbility("");
                expect(mon2.ability).to.be.empty;
                expect(mon2.baseAbility).to.be.empty;

                await handle({
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
                expect(mon1.ability).to.equal("moldbreaker");
                expect(mon1.baseAbility).to.equal("trace");
                expect(mon2.ability).to.equal("moldbreaker");
                expect(mon2.baseAbility).to.equal("moldbreaker");
            });
        });

        describe("|-endability|", function () {
            it("Should start gastroacid status", async function () {
                const mon = initActive(ctx.state, "p2");
                expect(mon.volatile.suppressAbility).to.be.false;

                await handle({
                    args: ["-endability", toIdent("p2")],
                    kwArgs: {},
                });
                expect(mon.volatile.suppressAbility).to.be.true;
            });

            it("Should also reveal ability if specified", async function () {
                const mon = initActive(ctx.state, "p2");
                mon.revealAbility("");
                expect(mon.volatile.suppressAbility).to.be.false;
                expect(mon.ability).to.be.empty;
                expect(mon.baseAbility).to.be.empty;

                await handle({
                    args: [
                        "-endability",
                        toIdent("p2"),
                        toAbilityName("frisk"),
                    ],
                    kwArgs: {},
                });
                expect(mon.volatile.suppressAbility).to.be.true;
                expect(mon.ability).to.equal("frisk");
                expect(mon.baseAbility).to.equal("frisk");
            });

            describe("skillswap", function () {
                it("Should reveal and exchange abilities", async function () {
                    const mon1 = initActive(ctx.state, "p1");
                    mon1.revealAbility("");
                    expect(mon1.volatile.suppressAbility).to.be.false;
                    expect(mon1.ability).to.be.empty;
                    expect(mon1.baseAbility).to.be.empty;
                    const mon2 = initActive(ctx.state, "p2");
                    mon2.revealAbility("");
                    expect(mon2.volatile.suppressAbility).to.be.false;
                    expect(mon2.ability).to.be.empty;
                    expect(mon2.baseAbility).to.be.empty;

                    await handle({
                        args: [
                            "-endability",
                            toIdent("p1"),
                            toAbilityName("swiftswim"),
                        ],
                        kwArgs: {from: toEffectName("skillswap", "move")},
                    });
                    expect(mon1.volatile.suppressAbility).to.be.false;
                    expect(mon1.ability).to.be.empty;
                    expect(mon1.baseAbility).to.equal("swiftswim");
                    expect(mon2.volatile.suppressAbility).to.be.false;
                    // Note: Internal fields are set so that the inference can
                    // be completed on the next skillswap event.
                    expect(mon2.ability).to.be.empty;
                    expect(mon2.baseAbility).to.be.empty;

                    await handle({
                        args: [
                            "-endability",
                            toIdent("p2"),
                            toAbilityName("chlorophyll"),
                        ],
                        kwArgs: {from: toEffectName("skillswap", "move")},
                    });
                    expect(mon1.volatile.suppressAbility).to.be.false;
                    expect(mon1.ability).to.equal("chlorophyll");
                    expect(mon1.baseAbility).to.equal("swiftswim");
                    expect(mon2.volatile.suppressAbility).to.be.false;
                    expect(mon2.ability).to.equal("swiftswim");
                    expect(mon2.baseAbility).to.equal("chlorophyll");
                });

                it("Should exchange override abilities", async function () {
                    const mon1 = initActive(ctx.state, "p1");
                    mon1.setAbility("swiftswim");
                    expect(mon1.volatile.suppressAbility).to.be.false;
                    expect(mon1.ability).to.equal("swiftswim");
                    expect(mon1.baseAbility).to.be.empty;
                    const mon2 = initActive(ctx.state, "p2");
                    mon2.setAbility("chlorophyll");
                    expect(mon2.volatile.suppressAbility).to.be.false;
                    expect(mon2.ability).to.equal("chlorophyll");
                    expect(mon2.baseAbility).to.be.empty;

                    await handle({
                        args: [
                            "-endability",
                            toIdent("p1"),
                            toAbilityName("swiftswim"),
                        ],
                        kwArgs: {from: toEffectName("skillswap", "move")},
                    });
                    expect(mon1.volatile.suppressAbility).to.be.false;
                    expect(mon1.ability).to.equal("swiftswim");
                    expect(mon1.baseAbility).to.be.empty;
                    expect(mon2.volatile.suppressAbility).to.be.false;
                    // Note: Internal fields are set so that the inference can
                    // be completed on the next skillswap event.
                    expect(mon2.ability).to.equal("chlorophyll");
                    expect(mon2.baseAbility).to.be.empty;

                    await handle({
                        args: [
                            "-endability",
                            toIdent("p2"),
                            toAbilityName("chlorophyll"),
                        ],
                        kwArgs: {from: toEffectName("skillswap", "move")},
                    });
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
                const us = initActive(ctx.state, "p1", smeargle);
                const them = initActive(ctx.state, "p2", ditto);

                await handle({
                    args: ["-transform", toIdent("p2", ditto), toIdent("p1")],
                    kwArgs: {},
                });
                expect(them.volatile.transformed).to.be.true;
                expect(them.species).to.equal(us.species);
            });
        });

        describe("|-mega|", function () {
            it("Should do nothing since unsupported", async function () {
                await handle({
                    args: [
                        "-mega",
                        toIdent("p1"),
                        toSpeciesName("gengar"),
                        "Gengarite" as Protocol.ItemName,
                    ],
                    kwArgs: {},
                });
            });
        });

        describe("|-primal|", function () {
            it("Should do nothing since unsupported", async function () {
                await handle({
                    args: ["-primal", toIdent("p1"), toItemName("redorb")],
                    kwArgs: {},
                });
            });
        });

        describe("|-burst|", function () {
            it("Should do nothing since unsupported", async function () {
                await handle({
                    args: [
                        "-burst",
                        toIdent("p1"),
                        "Necrozma-DM" as Protocol.SpeciesName,
                        "Ultranecrozium Z" as Protocol.ItemName,
                    ],
                    kwArgs: {},
                });
            });
        });

        describe("|-zpower|", function () {
            it("Should do nothing since unsupported", async function () {
                await handle({args: ["-zpower", toIdent("p1")], kwArgs: {}});
            });
        });

        describe("|-zbroken|", function () {
            it("Should do nothing since unsupported", async function () {
                await handle({
                    args: ["-zbroken", toIdent("p1")],
                    kwArgs: {},
                });
            });
        });

        describe("|-activate|", function () {
            for (const [effect, type] of [
                ["bide", "move"],
                ["confusion"],
            ] as const) {
                it(`Should update ${effect}`, async function () {
                    const mon = initActive(ctx.state, "p1");
                    expect(mon.volatile[effect].isActive).to.be.false;

                    // First start the effect.
                    mon.volatile[effect].start();
                    expect(mon.volatile[effect].isActive).to.be.true;
                    expect(mon.volatile[effect].turns).to.equal(0);

                    // Then update it.
                    await handle({
                        args: [
                            "-activate",
                            toIdent("p1"),
                            toEffectName(effect, type),
                        ],
                        kwArgs: {},
                    });
                    expect(mon.volatile[effect].isActive).to.be.true;
                    expect(mon.volatile[effect].turns).to.equal(1);
                });
            }

            for (const [effect, type] of [["charge", "move"]] as const) {
                it(`Should start ${effect}`, async function () {
                    const mon = initActive(ctx.state, "p1");
                    expect(mon.volatile[effect].isActive).to.be.false;

                    await handle({
                        args: [
                            "-activate",
                            toIdent("p1"),
                            toEffectName(effect, type),
                        ],
                        kwArgs: {},
                    });
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
                    const mon = initActive(ctx.state, "p1");
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
                    initActive(ctx.state, "p2");

                    await handle({
                        args: [
                            "-activate",
                            toIdent("p1"),
                            toEffectName(effect, "move"),
                        ],
                        kwArgs: {},
                    });
                });

                if (["detect", "protect"].includes(effect)) {
                    it(`Should reset rampage if blocked by ${effect}`, async function () {
                        const mon1 = initActive(ctx.state, "p1");
                        mon1.volatile.rampage.start("thrash");
                        expect(mon1.volatile.rampage.isActive).to.be.true;
                        const mon2 = initActive(ctx.state, "p2");
                        mon2.volatile.stall(true);

                        await handle({
                            args: [
                                "-activate",
                                toIdent("p2"),
                                toEffectName(effect, "move"),
                            ],
                            kwArgs: {},
                        });
                        expect(mon1.volatile.rampage.isActive).to.be.false;
                    });
                }
            }

            it("Should break stall if feint", async function () {
                const mon = initActive(ctx.state, "p2");
                mon.volatile.stall(true);
                expect(mon.volatile.stalling).to.be.true;
                expect(mon.volatile.stallTurns).to.equal(1);

                // Assume p1 uses feint move.
                await handle({
                    args: [
                        "-activate",
                        toIdent("p2"),
                        toEffectName("feint", "move"),
                    ],
                    kwArgs: {},
                });
                expect(mon.volatile.stalling).to.be.false;
                // Note: Should not reset stall turns.
                expect(mon.volatile.stallTurns).to.equal(1);
            });

            it("Should activate forewarn ability", async function () {
                const mon1 = initActive(ctx.state, "p1");
                mon1.revealAbility("");
                expect(mon1.ability).to.be.empty;
                expect(mon1.baseAbility).to.be.empty;
                const mon2 = initActive(ctx.state, "p2");
                expect(mon2.moveset.get("takedown")).to.be.null;

                await handle({
                    args: [
                        "-activate",
                        toIdent("p1"),
                        toEffectName("forewarn", "ability"),
                        toMoveName("takedown"),
                    ],
                    kwArgs: {of: toIdent("p2")},
                });
                expect(mon1.ability).to.equal("forewarn");
                expect(mon1.baseAbility).to.equal("forewarn");
                expect(mon2.moveset.get("takedown")).to.not.be.null;
            });
            // TODO: Test forewarn move inferences.

            it("Should fully deplete move pp if grudge", async function () {
                const mon = initActive(ctx.state, "p2");
                expect(mon.moveset.get("splash")).to.be.null;

                await handle({
                    args: [
                        "-activate",
                        toIdent("p2"),
                        toEffectName("grudge", "move"),
                        toMoveName("splash"),
                    ],
                    kwArgs: {},
                });
                const move = mon.moveset.get("splash");
                expect(move).to.not.be.null;
                expect(move).to.have.property("pp", 0);
                expect(move).to.have.property("maxpp", 64);
            });

            it("Should cure team if healbell", async function () {
                const [benched, mon] = initTeam(ctx.state, "p1", [
                    ditto,
                    smeargle,
                ]);
                benched.majorStatus.afflict("tox");
                mon.majorStatus.afflict("par");

                await handle({
                    args: [
                        "-activate",
                        toIdent("p1"),
                        toEffectName("healbell", "move"),
                    ],
                    kwArgs: {},
                });
                expect(benched.majorStatus.current).to.be.null;
                expect(mon.majorStatus.current).to.be.null;
            });

            it("Should restore 10 move pp if leppaberry", async function () {
                const mon = initActive(ctx.state, "p2");
                const move = mon.moveset.reveal("ember")!;
                move.pp -= 20;
                expect(move).to.have.property("pp", move.maxpp - 20);

                await handle({
                    args: [
                        "-activate",
                        toIdent("p2"),
                        toEffectName("leppaberry", "item"),
                        toMoveName("ember"),
                    ],
                    kwArgs: {},
                });
                expect(move).to.have.property("pp", move.maxpp - 10);
            });

            for (const effect of ["lockon", "mindreader"] as const) {
                it(`Should set lockon status if ${effect}`, async function () {
                    const mon1 = initActive(ctx.state, "p1");
                    const mon2 = initActive(ctx.state, "p2");
                    expect(mon1.volatile.lockedOnBy).to.be.null;
                    expect(mon1.volatile.lockOnTarget).to.be.null;
                    expect(mon1.volatile.lockOnTurns.isActive).to.be.false;
                    expect(mon2.volatile.lockedOnBy).to.be.null;
                    expect(mon2.volatile.lockOnTarget).to.be.null;
                    expect(mon2.volatile.lockOnTurns.isActive).to.be.false;

                    // P1 locks onto p2.
                    await handle({
                        args: [
                            "-activate",
                            toIdent("p1"),
                            toEffectName(effect, "move"),
                        ],
                        kwArgs: {of: toIdent("p2")},
                    });
                    expect(mon1.volatile.lockedOnBy).to.be.null;
                    expect(mon1.volatile.lockOnTarget).to.equal(mon2.volatile);
                    expect(mon1.volatile.lockOnTurns.isActive).to.be.true;
                    expect(mon2.volatile.lockedOnBy).to.equal(mon1.volatile);
                    expect(mon2.volatile.lockOnTarget).to.be.null;
                    expect(mon2.volatile.lockOnTurns.isActive).to.be.false;
                });
            }

            it("Should activate mimic move effect", async function () {
                const mon = initActive(ctx.state, "p2");
                mon.moveset.reveal("mimic");
                mon.volatile.lastMove = "mimic";

                await handle({
                    args: [
                        "-activate",
                        toIdent("p2"),
                        toEffectName("mimic", "move"),
                        toMoveName("splash"),
                    ],
                    kwArgs: {},
                });
                // Replaces override moveset but not base, so switching will
                // still restore the original mimic move.
                expect(mon.moveset.get("splash")).to.not.be.null;
                expect(mon.moveset.get("mimic")).to.be.null;
                expect(mon.baseMoveset.get("splash")).to.be.null;
                expect(mon.baseMoveset.get("mimic")).to.not.be.null;
            });

            it("Should activate sketch move effect", async function () {
                const mon = initActive(ctx.state, "p2");
                mon.moveset.reveal("sketch");
                mon.volatile.lastMove = "sketch";

                // Note(gen4): Same exact event as mimic, differentiator is
                // lastMove for now.
                await handle({
                    args: [
                        "-activate",
                        toIdent("p2"),
                        toEffectName("mimic", "move"),
                        toMoveName("tackle"),
                    ],
                    kwArgs: {},
                });
                // Works like mimic but also changes base moveset.
                expect(mon.moveset.get("tackle")).to.not.be.null;
                expect(mon.moveset.get("sketch")).to.be.null;
                expect(mon.baseMoveset.get("tackle")).to.not.be.null;
                expect(mon.baseMoveset.get("sketch")).to.be.null;
            });

            it("Should activate pursuit move effect and reveal move", async function () {
                const mon1 = initActive(ctx.state, "p1");
                expect(mon1.moveset.get("pursuit")).to.be.null;
                const mon2 = initActive(ctx.state, "p2");
                expect(mon2.moveset.get("pursuit")).to.be.null;

                // P1's switch-out is interrupted by p2's pursuit move.
                await handle({
                    args: [
                        "-activate",
                        toIdent("p1"),
                        toEffectName("pursuit", "move"),
                    ],
                    kwArgs: {},
                });
                expect(mon1.moveset.get("pursuit")).to.be.null;
                expect(mon2.moveset.get("pursuit")).to.not.be.null;
            });

            it("Should activate snatch move effect", async function () {
                const mon = initActive(ctx.state, "p1");
                mon.volatile.snatch = true;

                await handle({
                    args: [
                        "-activate",
                        toIdent("p1"),
                        toEffectName("snatch", "move"),
                    ],
                    kwArgs: {of: toIdent("p2")},
                });
                expect(mon.volatile.snatch).to.be.false;
            });

            it("Should deplete arbitrary move pp if spite", async function () {
                const mon = initActive(ctx.state, "p2");
                expect(mon.moveset.get("splash")).to.be.null;

                await handle({
                    args: [
                        "-activate",
                        toIdent("p2"),
                        toEffectName("spite", "move"),
                        toMoveName("splash"),
                        toNum(4),
                    ],
                    kwArgs: {},
                } as Event<"|-activate|">); // TODO: Fix protocol typings?
                const move = mon.moveset.get("splash");
                expect(move).to.not.be.null;
                expect(move).to.have.property("pp", 60);
                expect(move).to.have.property("maxpp", 64);
            });

            it("Should start trapped status", async function () {
                const mon1 = initActive(ctx.state, "p1");
                expect(mon1.volatile.trapped).to.be.null;
                expect(mon1.volatile.trapping).to.be.null;
                const mon2 = initActive(ctx.state, "p2");
                expect(mon2.volatile.trapped).to.be.null;
                expect(mon2.volatile.trapping).to.be.null;

                // P1 being trapped by p2.
                await handle({
                    args: ["-activate", toIdent("p1"), toEffectName("trapped")],
                    kwArgs: {},
                });
                expect(mon1.volatile.trapped).to.equal(mon2.volatile);
                expect(mon1.volatile.trapping).to.be.null;
                expect(mon2.volatile.trapped).to.be.null;
                expect(mon2.volatile.trapping).to.equal(mon1.volatile);
            });

            it("Should ignore invalid effect", async function () {
                initActive(ctx.state, "p1");

                await handle({
                    args: ["-activate", toIdent("p1"), toEffectName("invalid")],
                    kwArgs: {},
                });
            });

            it("Should ignore event without ident", async function () {
                await handle({
                    args: ["-activate", "", toEffectName("invalid")],
                    kwArgs: {},
                });
            });
        });

        describe("|-fieldactivate|", function () {
            it("Should handle", async function () {
                await handle({
                    args: ["-fieldactivate", toEffectName("payday", "move")],
                    kwArgs: {},
                });
            });
        });

        describe("|-center|", function () {
            it("Should do nothing since unsupported", async function () {
                await handle({args: ["-center"], kwArgs: {}});
            });
        });

        describe("|-combine|", function () {
            it("Should do nothing since unsupported", async function () {
                await handle({args: ["-combine"], kwArgs: {}});
            });
        });

        describe("|-waiting|", function () {
            it("Should do nothing since unsupported", async function () {
                await handle({
                    args: [
                        "-waiting",
                        toIdent("p1"),
                        toIdent("p1", ditto, "b"),
                    ],
                    kwArgs: {},
                });
            });
        });

        describe("|-prepare|", function () {
            it("Should prepare two-turn move", async function () {
                const mon = initActive(ctx.state, "p2");
                expect(mon.volatile.twoTurn.isActive).to.be.false;

                await handle({
                    args: ["-prepare", toIdent("p2"), toMoveName("fly")],
                    kwArgs: {},
                });
                expect(mon.volatile.twoTurn.isActive).to.be.true;
                expect(mon.volatile.twoTurn.type).to.equal("fly");
            });

            it("Should ignore non-two-turn move", async function () {
                const mon = initActive(ctx.state, "p2");
                expect(mon.volatile.twoTurn.isActive).to.be.false;

                await handle({
                    args: ["-prepare", toIdent("p2"), toMoveName("splash")],
                    kwArgs: {},
                });
                expect(mon.volatile.twoTurn.isActive).to.be.false;
            });
        });

        describe("|-mustrecharge|", function () {
            it("Should indicate recharge", async function () {
                const mon = initActive(ctx.state, "p1");
                expect(mon.volatile.mustRecharge).to.be.false;

                await handle({
                    args: ["-mustrecharge", toIdent("p1")],
                    kwArgs: {},
                });
                expect(mon.volatile.mustRecharge).to.be.true;
            });
        });

        describe("|-hitcount|", function () {
            it("Should do nothing", async function () {
                await handle({
                    args: ["-hitcount", toIdent("p2"), toNum(4)],
                    kwArgs: {},
                });
            });
        });

        describe("|-singlemove|", function () {
            for (const effect of ["destinybond", "grudge", "rage"] as const) {
                it(`Should start ${effect}`, async function () {
                    const mon = initActive(ctx.state, "p1");
                    expect(mon.volatile[effect]).to.be.false;

                    await handle({
                        args: [
                            "-singlemove",
                            toIdent("p1"),
                            toMoveName(effect),
                        ],
                        kwArgs: {},
                    });
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
                    const mon = initActive(ctx.state, "p1");
                    expect(getter(mon.volatile)).to.be.false;

                    await handle({
                        args: ["-singleturn", toIdent("p1"), moveName],
                        kwArgs: {},
                    });
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
                await handle({args: ["-candynamax", "p1"], kwArgs: {}});
            });
        });
    });
