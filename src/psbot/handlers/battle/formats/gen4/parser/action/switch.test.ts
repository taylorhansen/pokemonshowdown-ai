import {Protocol} from "@pkmn/protocol";
import {SideID} from "@pkmn/types";
import {expect} from "chai";
import "mocha";
import {Event} from "../../../../../../parser";
import {BattleState} from "../../state";
import {Pokemon} from "../../state/Pokemon";
import {SwitchOptions} from "../../state/Team";
import {
    castform,
    castformrainy,
    castformsunny,
    ditto,
    smeargle,
} from "../../state/switchOptions.test";
import {ParserContext, createInitialContext} from "../Context.test";
import {ParserHelpers} from "../ParserHelpers.test";
import {
    setupBattleParser,
    toAbilityName,
    toDetails,
    toEffectName,
    toHPStatus,
    toIdent,
    toItemName,
    toMoveName,
    toNum,
    toSide,
    toSideCondition,
    toSpeciesName,
    toUsername,
    toWeather,
} from "../helpers.test";
import * as actionSwitch from "./switch";

export const test = () =>
    describe("switch", function () {
        const ictx = createInitialContext();
        const {sh} = ictx;

        let state: BattleState;

        beforeEach("Extract BattleState", function () {
            state = ictx.getState();
        });

        const switchEvent = (
            side: SideID,
            opt = smeargle,
            pos: Protocol.PositionLetter = "a",
        ): Event<"|switch|"> => ({
            args: [
                "switch",
                toIdent(side, opt, pos),
                toDetails(opt),
                toHPStatus(100, 100),
            ],
            kwArgs: {},
        });

        // Pressure ability.
        const entei: SwitchOptions = {
            species: "entei",
            level: 25,
            gender: "M",
            hp: 100,
            hpMax: 100,
        };

        // Trace ability.
        const ralts: SwitchOptions = {
            species: "ralts",
            level: 40,
            gender: "M",
            hp: 100,
            hpMax: 100,
        };

        describe("switchAction()", function () {
            const init = setupBattleParser(
                ictx.startArgs,
                actionSwitch.switchAction,
            );
            let pctx:
                | ParserContext<actionSwitch.SwitchActionResult>
                | undefined;
            const ph = new ParserHelpers(() => pctx);

            afterEach("Close ParserContext", async function () {
                // Reset variable so it doesn't leak into other tests.
                await ph.close().finally(() => (pctx = undefined));
            });

            it("Should handle switch-in", async function () {
                sh.initTeam("p1", [undefined, ditto]);
                sh.initActive("p2");

                pctx = init("p1");
                await ph.handle(switchEvent("p1"));
                await ph.halt();
                await ph.return({
                    mon: state.getTeam("p1").active,
                    actioned: {p1: true},
                });
            });

            it("Should throw if invalid ident", async function () {
                sh.initTeam("p1", [undefined, ditto]);
                sh.initActive("p2");

                pctx = init("p1");
                await ph.rejectError(
                    switchEvent("p2"),
                    Error,
                    "Expected switch-in for 'p1' but got 'p2'",
                );
            });

            describe("interceptSwitch moves (pursuit)", function () {
                it("Should handle Pursuit", async function () {
                    sh.initTeam("p1", [undefined, smeargle]);
                    sh.initActive("p2");

                    pctx = init("p1");
                    // Pursuit indicator event.
                    await ph.handle({
                        args: [
                            "-activate",
                            toIdent("p1"),
                            toEffectName("pursuit", "move"),
                        ],
                        kwArgs: {},
                    });
                    // Move event and effects.
                    await ph.handle({
                        args: ["move", toIdent("p2"), toMoveName("pursuit")],
                        kwArgs: {},
                    });
                    await ph.handle({
                        args: ["-damage", toIdent("p1"), toHPStatus(90, 100)],
                        kwArgs: {},
                    });
                    // Actual switch event.
                    await ph.handle(switchEvent("p1", ditto));
                    await ph.halt();
                    await ph.return({
                        mon: state.getTeam("p1").active,
                        actioned: {p1: true, p2: true},
                    });
                });

                it("Should throw if move doesn't have interceptSwitch flag", async function () {
                    sh.initTeam("p1", [undefined, smeargle]);
                    sh.initActive("p2");

                    pctx = init("p1");
                    await ph.rejectError(
                        {
                            args: [
                                "-activate",
                                toIdent("p2"),
                                toEffectName("tackle", "move"),
                            ],
                            kwArgs: {},
                        },
                        Error,
                        "Invalid event: Expected type ['|switch|', '|drag|'] " +
                            "but got '|-activate|'",
                    );
                });

                it("Should throw if mismatched monRef", async function () {
                    sh.initTeam("p1", [undefined, smeargle]);
                    sh.initActive("p2");

                    pctx = init("p1");
                    await ph.rejectError(
                        {
                            args: [
                                "-activate",
                                toIdent("p1"),
                                toEffectName("tackle", "move"),
                            ],
                            kwArgs: {},
                        },
                        Error,
                        "Invalid event: Expected type ['|switch|', '|drag|'] " +
                            "but got '|-activate|'",
                    );
                });

                // Gen2-4.
                it("Should continue previous switch choice even if target faints", async function () {
                    sh.initTeam("p1", [undefined, smeargle]);
                    sh.initActive("p2");

                    pctx = init("p1");
                    await ph.handle({
                        args: [
                            "-activate",
                            toIdent("p1"),
                            toEffectName("pursuit", "move"),
                        ],
                        kwArgs: {},
                    });
                    await ph.handle({
                        args: ["move", toIdent("p2"), toMoveName("pursuit")],
                        kwArgs: {},
                    });
                    await ph.handle({
                        args: ["-damage", toIdent("p1"), toHPStatus("faint")],
                        kwArgs: {},
                    });
                    await ph.handle({
                        args: ["faint", toIdent("p1")],
                        kwArgs: {},
                    });
                    // Actual switch event.
                    await ph.handle(switchEvent("p1", ditto));
                    await ph.halt();
                    await ph.return({
                        mon: state.getTeam("p1").active,
                        actioned: {p1: true, p2: true},
                    });
                });
            });

            describe("on-switchOut abilities (naturalcure)", function () {
                it("Should handle", async function () {
                    const [, mon] = sh.initTeam("p1", [ditto, smeargle]);
                    mon.majorStatus.afflict("frz");
                    mon.setAbility("naturalcure");
                    sh.initActive("p2");

                    pctx = init("p1");
                    await ph.handle({
                        args: ["-curestatus", toIdent("p1"), "frz"],
                        kwArgs: {from: toEffectName("naturalcure", "ability")},
                    });
                    await ph.handle(switchEvent("p1", ditto));
                    await ph.halt();
                    await ph.return({
                        mon: state.getTeam("p1").active,
                        actioned: {p1: true},
                    });
                });
            });

            describe("switch effects", function () {
                it("Should handle multiple effects", async function () {
                    const [mon] = sh.initTeam("p1", [entei, ditto]);
                    const team = state.getTeam("p1");
                    team.status.spikes = 3;
                    team.status.stealthrock = 1;
                    team.status.toxicspikes = 2;
                    team.status.healingwish = true;
                    sh.initActive("p2");

                    pctx = init("p1");
                    await ph.handle(switchEvent("p1", entei));
                    await ph.handle({
                        args: ["-damage", toIdent("p1", entei), toHPStatus(75)],
                        kwArgs: {from: toMoveName("spikes")},
                    });
                    await ph.handle({
                        args: ["-damage", toIdent("p1", entei), toHPStatus(63)],
                        kwArgs: {from: toMoveName("stealthrock")},
                    });
                    await ph.handle({
                        args: ["-status", toIdent("p1", entei), "tox"],
                        kwArgs: {},
                    });
                    await ph.handle({
                        args: ["-heal", toIdent("p1", entei), toHPStatus(100)],
                        kwArgs: {from: toMoveName("healingwish")},
                    });
                    await ph.handle({
                        args: [
                            "-ability",
                            toIdent("p1", entei),
                            toAbilityName("pressure"),
                        ],
                        kwArgs: {},
                    });
                    // TODO: What about on-update item?
                    await ph.halt();
                    await ph.return({mon, actioned: {p1: true}});
                });

                describe("hazards", function () {
                    // Can have magicguard.
                    const clefable: SwitchOptions = {
                        species: "clefable",
                        level: 30,
                        gender: "F",
                        hp: 100,
                        hpMax: 100,
                    };

                    // Ungrounded.
                    const pidgey: SwitchOptions = {
                        species: "pidgey",
                        level: 50,
                        gender: "M",
                        hp: 100,
                        hpMax: 100,
                    };

                    // Steel type.
                    const aron: SwitchOptions = {
                        species: "aron",
                        level: 40,
                        gender: "F",
                        hp: 100,
                        hpMax: 100,
                    };

                    // Immunity ability.
                    const snorlax: SwitchOptions = {
                        species: "snorlax",
                        level: 20,
                        gender: "M",
                        hp: 100,
                        hpMax: 100,
                    };

                    it("Should handle multiple hazards", async function () {
                        const [mon] = sh.initTeam("p1", [smeargle, ditto]);
                        const team = state.getTeam("p1");
                        team.status.spikes = 3;
                        team.status.stealthrock = 1;
                        team.status.toxicspikes = 2;
                        sh.initActive("p2");

                        pctx = init("p1");
                        await ph.handle(switchEvent("p1"));
                        await ph.handle({
                            args: ["-damage", toIdent("p1"), toHPStatus(75)],
                            kwArgs: {from: toMoveName("spikes")},
                        });
                        await ph.handle({
                            args: ["-damage", toIdent("p1"), toHPStatus(63)],
                            kwArgs: {from: toMoveName("stealthrock")},
                        });
                        await ph.handle({
                            args: ["-status", toIdent("p1"), "tox"],
                            kwArgs: {},
                        });
                        await ph.halt();
                        await ph.return({mon, actioned: {p1: true}});
                    });

                    for (const effect of ["spikes", "stealthrock"] as const) {
                        describe(effect, function () {
                            it("Should handle", async function () {
                                const [mon] = sh.initTeam("p1", [
                                    smeargle,
                                    ditto,
                                ]);
                                const team = state.getTeam("p1");
                                team.status[effect] = 1;
                                sh.initActive("p2");

                                pctx = init("p1");
                                await ph.handle(switchEvent("p1"));
                                await ph.handle({
                                    args: [
                                        "-damage",
                                        toIdent("p1"),
                                        toHPStatus(88),
                                    ],
                                    kwArgs: {from: toMoveName(effect)},
                                });
                                await ph.halt();
                                await ph.return({mon, actioned: {p1: true}});
                            });

                            it("Should update items if damaged", async function () {
                                const [mon] = sh.initTeam("p1", [
                                    smeargle,
                                    ditto,
                                ]);
                                const team = state.getTeam("p1");
                                team.status[effect] = 1;
                                sh.initActive("p2");

                                pctx = init("p1");
                                await ph.handle(switchEvent("p1"));
                                await ph.handle({
                                    args: [
                                        "-damage",
                                        toIdent("p1"),
                                        toHPStatus(25),
                                    ],
                                    kwArgs: {from: toMoveName(effect)},
                                });
                                await ph.handle({
                                    args: [
                                        "-enditem",
                                        toIdent("p1"),
                                        toItemName("oranberry"),
                                    ],
                                    kwArgs: {eat: true},
                                });
                                await ph.handle({
                                    args: [
                                        "-heal",
                                        toIdent("p1"),
                                        toHPStatus(100),
                                    ],
                                    kwArgs: {
                                        from: toEffectName("oranberry", "item"),
                                    },
                                });
                                await ph.halt();
                                await ph.return({mon, actioned: {p1: true}});
                            });

                            it("Should be ignoreable due to unhandled magicguard", async function () {
                                const [mon] = sh.initTeam("p1", [
                                    clefable,
                                    ditto,
                                ]);
                                const team = state.getTeam("p1");
                                team.status[effect] = 1;
                                sh.initActive("p2");

                                pctx = init("p1");
                                await ph.handle(switchEvent("p1", clefable));
                                await ph.halt();
                                await ph.return({mon, actioned: {p1: true}});
                            });

                            it("Should faint if damaged enough", async function () {
                                const [mon] = sh.initTeam("p1", [
                                    smeargle,
                                    ditto,
                                ]);
                                const team = state.getTeam("p1");
                                team.status[effect] = 1;
                                sh.initActive("p2");

                                pctx = init("p1");
                                await ph.handle(switchEvent("p1"));
                                await ph.handle({
                                    args: [
                                        "-damage",
                                        toIdent("p1"),
                                        toHPStatus("faint"),
                                    ],
                                    kwArgs: {from: toMoveName(effect)},
                                });
                                await ph.handle({
                                    args: ["faint", toIdent("p1")],
                                    kwArgs: {},
                                });
                                await ph.halt();
                                await ph.return({mon, actioned: {p1: true}});
                            });

                            const otherEffect =
                                effect === "spikes" ? "stealthrock" : "spikes";
                            it(`Should not handle if fainted after ${otherEffect}`, async function () {
                                const [mon] = sh.initTeam("p1", [
                                    smeargle,
                                    ditto,
                                ]);
                                const team = state.getTeam("p1");
                                team.status.spikes = 3;
                                team.status.stealthrock = 2;
                                sh.initActive("p2");

                                pctx = init("p1");
                                await ph.handle(switchEvent("p1"));
                                await ph.handle({
                                    args: [
                                        "-damage",
                                        toIdent("p1"),
                                        toHPStatus("faint"),
                                    ],
                                    kwArgs: {
                                        from: toEffectName(otherEffect, "move"),
                                    },
                                });
                                await ph.handle({
                                    args: ["faint", toIdent("p1")],
                                    kwArgs: {},
                                });
                                await ph.halt();
                                await ph.return({
                                    mon,
                                    actioned: {p1: true},
                                });
                            });
                        });
                    }

                    describe("toxicspikes", function () {
                        const arbok: SwitchOptions = {
                            species: "arbok",
                            level: 40,
                            gender: "M",
                            hp: 100,
                            hpMax: 100,
                        };

                        interface TestOptions {
                            name: string;
                            response?: "status" | "remove";
                            layers?: 1 | 2;
                            otherHazard?: "spikes" | "stealthrock";
                            opt?: SwitchOptions;
                            substitute?: boolean;
                            otherEvents?: readonly Event[];
                        }

                        function testToxicSpikes({
                            name,
                            response,
                            layers = 1,
                            otherHazard,
                            opt = smeargle,
                            substitute,
                            otherEvents = [],
                        }: TestOptions) {
                            it(name, async function () {
                                const [mon, old] = sh.initTeam("p1", [
                                    opt,
                                    ditto,
                                ]);
                                const team = state.getTeam("p1");
                                team.status.toxicspikes = layers;
                                if (otherHazard) team.status[otherHazard] = 1;
                                if (substitute) {
                                    // Pass substitute onto switch-in.
                                    team.status.selfSwitch = "copyvolatile";
                                    old.volatile.substitute = true;
                                }
                                sh.initActive("p2");

                                pctx = init("p1");
                                await ph.handle(switchEvent("p1", opt));
                                if (response === "status") {
                                    await ph.handle({
                                        args: [
                                            "-status",
                                            toIdent("p1", opt),
                                            layers < 2 ? "psn" : "tox",
                                        ],
                                        kwArgs: {},
                                    });
                                } else if (response === "remove") {
                                    await ph.handle({
                                        args: [
                                            "-sideend",
                                            toSide("p1", "username"),
                                            toSideCondition("toxicspikes"),
                                        ],
                                        kwArgs: {of: toIdent("p1", opt)},
                                    });
                                }
                                for (const e of otherEvents) await ph.handle(e);
                                await ph.halt();
                                await ph.return({mon, actioned: {p1: true}});
                            });
                        }

                        testToxicSpikes({
                            name: "Should handle",
                            response: "status",
                        });

                        testToxicSpikes({
                            name: "Should handle ability immunity",
                            opt: snorlax,
                        });

                        testToxicSpikes({
                            name: "Should ignore if steel type",
                            opt: aron,
                        });

                        testToxicSpikes({
                            name: "Should ignore if substitute",
                            substitute: true,
                        });

                        testToxicSpikes({
                            name: "Should ignore if magicguard",
                            opt: clefable,
                        });

                        testToxicSpikes({
                            name: "Should ignore if not grounded",
                            opt: pidgey,
                        });

                        testToxicSpikes({
                            name: "Should update items if statused",
                            response: "status",
                            layers: 2,
                            otherEvents: [
                                {
                                    args: [
                                        "-enditem",
                                        toIdent("p1"),
                                        toItemName("pechaberry"),
                                    ],
                                    kwArgs: {eat: true},
                                },
                                {
                                    args: ["-curestatus", toIdent("p1"), "tox"],
                                    kwArgs: {
                                        from: toEffectName(
                                            "pechaberry",
                                            "item",
                                        ),
                                    },
                                },
                            ],
                        });

                        testToxicSpikes({
                            name: "Should remove if poison type",
                            response: "remove",
                            opt: arbok,
                        });

                        testToxicSpikes({
                            name:
                                "Should still remove if poison type and " +
                                "substitute",
                            opt: arbok,
                            substitute: true,
                        });

                        testToxicSpikes({
                            name:
                                "Should not handle if fainted after other " +
                                "hazards",
                            otherHazard: "spikes",
                            otherEvents: [
                                {
                                    args: [
                                        "-damage",
                                        toIdent("p1"),
                                        toHPStatus("faint"),
                                    ],
                                    kwArgs: {
                                        from: toEffectName("spikes", "move"),
                                    },
                                },
                                {args: ["faint", toIdent("p1")], kwArgs: {}},
                            ],
                        });
                    });
                });

                describe("healingwish", function () {
                    for (const effect of [
                        "healingwish",
                        "lunardance",
                    ] as const) {
                        it(`Should handle ${effect}`, async function () {
                            const [mon] = sh.initTeam("p1", [smeargle, ditto]);
                            const team = state.getTeam("p1");
                            team.status[effect] = true;
                            sh.initActive("p2");

                            pctx = init("p1");
                            await ph.handle(switchEvent("p1"));
                            await ph.handle({
                                args: ["-heal", toIdent("p1"), toHPStatus(100)],
                                kwArgs: {from: toMoveName(effect)},
                            });
                            await ph.halt();
                            await ph.return({mon, actioned: {p1: true}});
                        });

                        it(`Should throw if ${effect} didn't happen`, async function () {
                            sh.initTeam("p1", [smeargle, ditto]);
                            const team = state.getTeam("p1");
                            team.status[effect] = true;
                            sh.initActive("p2");

                            pctx = init("p1");
                            await ph.handle(switchEvent("p1"));
                            await ph.haltError(
                                Error,
                                "Expected effect that didn't happen: p1 " +
                                    effect,
                            );
                        });

                        it("Should not handle if fainted after hazards", async function () {
                            const [mon] = sh.initTeam("p1", [smeargle, ditto]);
                            const team = state.getTeam("p1");
                            team.status[effect] = true;
                            team.status.spikes = 3;
                            sh.initActive("p2");

                            pctx = init("p1");
                            await ph.handle(switchEvent("p1"));
                            await ph.handle({
                                args: [
                                    "-damage",
                                    toIdent("p1"),
                                    toHPStatus("faint"),
                                ],
                                kwArgs: {from: toEffectName("spikes", "move")},
                            });
                            await ph.handle({
                                args: ["faint", toIdent("p1")],
                                kwArgs: {},
                            });
                            await ph.halt();
                            await ph.return({mon, actioned: {p1: true}});
                        });
                    }
                });

                describe("on-start abilities", function () {
                    it("Should handle pressure", async function () {
                        const [mon] = sh.initTeam("p1", [entei, ditto]);
                        expect(mon.traits.ability.possibleValues).to.have.keys(
                            "pressure",
                        );
                        sh.initActive("p2");

                        pctx = init("p1");
                        await ph.handle(switchEvent("p1", entei));
                        await ph.handle({
                            args: [
                                "-ability",
                                toIdent("p1", entei),
                                toAbilityName("pressure"),
                            ],
                            kwArgs: {},
                        });
                        await ph.halt();
                        await ph.return({mon, actioned: {p1: true}});
                    });

                    it("Should not handle if fainted after hazards", async function () {
                        const [mon] = sh.initTeam("p1", [entei, ditto]);
                        expect(mon.traits.ability.possibleValues).to.have.keys(
                            "pressure",
                        );
                        const team = state.getTeam("p1");
                        team.status.spikes = 3;
                        sh.initActive("p2");

                        pctx = init("p1");
                        await ph.handle(switchEvent("p1", entei));
                        await ph.handle({
                            args: [
                                "-damage",
                                toIdent("p1", entei),
                                toHPStatus("faint"),
                            ],
                            kwArgs: {from: toEffectName("spikes", "move")},
                        });
                        await ph.handle({
                            args: ["faint", toIdent("p1", entei)],
                            kwArgs: {},
                        });
                        await ph.halt();
                        await ph.return({mon, actioned: {p1: true}});
                    });
                });

                describe("on-update abilities", function () {
                    it("Should handle trace", async function () {
                        const [mon] = sh.initTeam("p1", [ralts, ditto]);
                        expect(mon.traits.ability.possibleValues).to.have.keys(
                            "trace",
                            "synchronize",
                        );
                        sh.initActive("p2").setAbility("pressure");

                        pctx = init("p1");
                        await ph.handle(switchEvent("p1", ralts));
                        await ph.handle({
                            args: [
                                "-ability",
                                toIdent("p1", ralts),
                                toAbilityName("pressure"),
                            ],
                            kwArgs: {},
                        });
                        await ph.handle({
                            args: [
                                "-ability",
                                toIdent("p1", ralts),
                                toAbilityName("pressure"),
                            ],
                            kwArgs: {
                                from: toEffectName("trace", "ability"),
                                of: toIdent("p2"),
                            },
                        });
                        await ph.halt();
                        await ph.return({mon, actioned: {p1: true}});
                    });

                    it("Should handle forecast", async function () {
                        state.status.weather.start(
                            null /*source*/,
                            "RainDance",
                        );
                        const [mon] = sh.initTeam("p1", [castform, ditto]);
                        sh.initActive("p2");

                        pctx = init("p1");
                        await ph.handle(switchEvent("p1", castform));
                        await ph.handle({
                            args: [
                                "-formechange",
                                toIdent("p1", castform),
                                toSpeciesName(castformrainy.species),
                            ],
                            kwArgs: {
                                msg: true,
                                from: toEffectName("forecast", "ability"),
                            },
                        });
                        await ph.halt();
                        await ph.return({mon, actioned: {p1: true}});
                    });

                    const groudon: SwitchOptions = {
                        species: "groudon",
                        level: 30,
                        gender: "N",
                        hp: 100,
                        hpMax: 100,
                    };

                    it("Should handle forecast after weather ability", async function () {
                        state.status.weather.start(null /*source*/, "Hail");
                        const [mon] = sh.initTeam("p1", [groudon, ditto]);
                        sh.initActive("p2", castform);

                        pctx = init("p1");
                        await ph.handle(switchEvent("p1", groudon));
                        await ph.handle({
                            args: ["-weather", toWeather("SunnyDay")],
                            kwArgs: {
                                from: toEffectName("drought", "ability"),
                                of: toIdent("p1", groudon),
                            },
                        });
                        await ph.handle({
                            args: [
                                "-formechange",
                                toIdent("p2", castform),
                                toSpeciesName(castformsunny.species),
                            ],
                            kwArgs: {
                                msg: true,
                                from: toEffectName("forecast", "ability"),
                            },
                        });
                        await ph.halt();
                        await ph.return({mon, actioned: {p1: true}});
                    });
                });

                describe("on-update items", function () {
                    it("TODO");
                });
            });
        });

        describe("multipleSwitchIns()", function () {
            const init = setupBattleParser(
                ictx.startArgs,
                actionSwitch.multipleSwitchIns,
            );
            let pctx: ParserContext<[side: SideID, mon: Pokemon][]> | undefined;
            const ph = new ParserHelpers(() => pctx);

            afterEach("Close ParserContext", async function () {
                await ph.close().finally(() => (pctx = undefined));
            });

            it("Should handle switch-ins", async function () {
                state.getTeam("p1").size = 1;
                state.getTeam("p2").size = 1;

                pctx = init();
                await ph.handle(switchEvent("p1"));
                await ph.handle(switchEvent("p2", ditto));
                await ph.halt();
                await ph.return([
                    ["p1", state.getTeam("p1").active],
                    ["p2", state.getTeam("p2").active],
                ]);
            });

            it("Should handle multiple switch-in effects in any order", async function () {
                state.getTeam("p1").size = 1;
                state.getTeam("p2").size = 1;

                pctx = init();
                await ph.handle(switchEvent("p1", entei));
                await ph.handle(switchEvent("p2", entei));
                await ph.handle({
                    args: [
                        "-ability",
                        toIdent("p2", entei),
                        toAbilityName("pressure"),
                    ],
                    kwArgs: {},
                });
                await ph.handle({
                    args: [
                        "-ability",
                        toIdent("p1", entei),
                        toAbilityName("pressure"),
                    ],
                    kwArgs: {},
                });
                await ph.halt();
                await ph.return([
                    ["p1", state.getTeam("p1").active],
                    ["p2", state.getTeam("p2").active],
                ]);
            });

            it("Should parse all effects in the required order", async function () {
                const p1 = state.getTeam("p1");
                p1.size = 1;
                p1.status.stealthrock = 1;
                p1.status.spikes = 3;
                const p2 = state.getTeam("p2");
                p2.size = 1;
                p2.status.stealthrock = 1;
                p2.status.spikes = 3;

                pctx = init();
                await ph.handle(switchEvent("p1", ralts));
                await ph.handle(switchEvent("p2", entei));
                // P2 effects.
                await ph.handle({
                    args: ["-damage", toIdent("p2", entei), toHPStatus(75)],
                    kwArgs: {from: toEffectName("stealthrock", "move")},
                });
                await ph.handle({
                    args: ["-damage", toIdent("p2", entei), toHPStatus(50)],
                    kwArgs: {from: toEffectName("spikes", "move")},
                });
                await ph.handle({
                    args: [
                        "-ability",
                        toIdent("p2", entei),
                        toAbilityName("pressure"),
                    ],
                    kwArgs: {},
                });
                await ph.handle({
                    args: [
                        "-enditem",
                        toIdent("p2", entei),
                        toItemName("sitrusberry"),
                    ],
                    kwArgs: {eat: true},
                });
                await ph.handle({
                    args: ["-heal", toIdent("p2", entei), toHPStatus(75)],
                    kwArgs: {from: toEffectName("sitrusberry", "item")},
                });
                // P1 effects.
                await ph.handle({
                    args: ["-damage", toIdent("p1", ralts), toHPStatus(75)],
                    kwArgs: {from: toEffectName("stealthrock", "move")},
                });
                await ph.handle({
                    args: ["-damage", toIdent("p1", ralts), toHPStatus(50)],
                    kwArgs: {from: toEffectName("spikes", "move")},
                });
                await ph.handle({
                    args: [
                        "-ability",
                        toIdent("p1", ralts),
                        toAbilityName("pressure"),
                    ],
                    kwArgs: {},
                });
                await ph.handle({
                    args: [
                        "-ability",
                        toIdent("p1", ralts),
                        toAbilityName("pressure"),
                    ],
                    kwArgs: {
                        from: toEffectName("trace", "ability"),
                        of: toIdent("p2", entei),
                    },
                });
                await ph.handle({
                    args: [
                        "-enditem",
                        toIdent("p1", ralts),
                        toItemName("sitrusberry"),
                    ],
                    kwArgs: {eat: true},
                });
                await ph.handle({
                    args: ["-heal", toIdent("p1", ralts), toHPStatus(75)],
                    kwArgs: {from: toEffectName("sitrusberry", "item")},
                });
                await ph.halt();
                await ph.return([
                    ["p1", state.getTeam("p1").active],
                    ["p2", state.getTeam("p2").active],
                ]);
            });

            // Trace or download ability.
            const porygon: SwitchOptions = {
                species: "porygon",
                level: 35,
                gender: "N",
                hp: 100,
                hpMax: 100,
            };

            it("Should also handle shared copied ability", async function () {
                const p1 = state.getTeam("p1");
                p1.size = 1;
                p1.status.stealthrock = 1;
                p1.status.spikes = 3;
                const p2 = state.getTeam("p2");
                p2.size = 1;
                p2.status.stealthrock = 1;
                p2.status.spikes = 3;

                pctx = init();
                await ph.handle(switchEvent("p2", porygon));
                await ph.handle(switchEvent("p1", porygon));
                // P1 effects.
                await ph.handle({
                    args: ["-damage", toIdent("p1", porygon), toHPStatus(75)],
                    kwArgs: {from: toEffectName("stealthrock", "move")},
                });
                await ph.handle({
                    args: ["-damage", toIdent("p1", porygon), toHPStatus(50)],
                    kwArgs: {from: toEffectName("spikes", "move")},
                });
                await ph.handle({
                    args: [
                        "-ability",
                        toIdent("p1", porygon),
                        toAbilityName("download"),
                        "boost",
                    ],
                    kwArgs: {},
                });
                await ph.handle({
                    args: ["-boost", toIdent("p1", porygon), "atk", toNum(1)],
                    kwArgs: {},
                });
                await ph.handle({
                    args: [
                        "-enditem",
                        toIdent("p1", porygon),
                        toItemName("sitrusberry"),
                    ],
                    kwArgs: {eat: true},
                });
                await ph.handle({
                    args: ["-heal", toIdent("p1", porygon), toHPStatus(75)],
                    kwArgs: {from: toEffectName("sitrusberry", "item")},
                });
                // P2 effects.
                await ph.handle({
                    args: ["-damage", toIdent("p2", porygon), toHPStatus(75)],
                    kwArgs: {from: toEffectName("stealthrock", "move")},
                });
                await ph.handle({
                    args: ["-damage", toIdent("p2", porygon), toHPStatus(50)],
                    kwArgs: {from: toEffectName("spikes", "move")},
                });
                await ph.handle({
                    args: [
                        "-ability",
                        toIdent("p2", porygon),
                        toAbilityName("download"),
                        "boost",
                    ],
                    kwArgs: {},
                });
                await ph.handle({
                    args: ["-boost", toIdent("p2", porygon), "atk", toNum(1)],
                    kwArgs: {},
                });
                await ph.handle({
                    args: [
                        "-ability",
                        toIdent("p2", porygon),
                        toAbilityName("download"),
                    ],
                    kwArgs: {
                        from: toEffectName("trace", "ability"),
                        of: toIdent("p1", porygon),
                    },
                });
                await ph.handle({
                    args: [
                        "-enditem",
                        toIdent("p2", porygon),
                        toItemName("sitrusberry"),
                    ],
                    kwArgs: {eat: true},
                });
                await ph.handle({
                    args: ["-heal", toIdent("p2", porygon), toHPStatus(75)],
                    kwArgs: {from: toEffectName("sitrusberry", "item")},
                });
                await ph.halt();
                await ph.return([
                    ["p2", state.getTeam("p2").active],
                    ["p1", state.getTeam("p1").active],
                ]);
                expect(p1.active.traits.ability.possibleValues).to.have.keys(
                    "download",
                );
                expect(
                    p1.active.baseTraits.ability.possibleValues,
                ).to.have.keys("download");
                expect(p2.active.traits.ability.possibleValues).to.have.keys(
                    "download",
                );
                expect(
                    p2.active.baseTraits.ability.possibleValues,
                ).to.have.keys("trace");
            });

            it("Should also handle shared non-copied ability", async function () {
                const p1 = state.getTeam("p1");
                p1.size = 1;
                p1.status.stealthrock = 1;
                p1.status.spikes = 3;
                const p2 = state.getTeam("p2");
                p2.size = 1;
                p2.status.stealthrock = 1;
                p2.status.spikes = 3;

                pctx = init();
                await ph.handle(switchEvent("p2", porygon));
                await ph.handle(switchEvent("p1", porygon));
                // P1 effects.
                await ph.handle({
                    args: ["-damage", toIdent("p1", porygon), toHPStatus(75)],
                    kwArgs: {from: toEffectName("stealthrock", "move")},
                });
                await ph.handle({
                    args: ["-damage", toIdent("p1", porygon), toHPStatus(50)],
                    kwArgs: {from: toEffectName("spikes", "move")},
                });
                await ph.handle({
                    args: [
                        "-ability",
                        toIdent("p1", porygon),
                        toAbilityName("download"),
                        "boost",
                    ],
                    kwArgs: {},
                });
                await ph.handle({
                    args: ["-boost", toIdent("p1", porygon), "atk", toNum(1)],
                    kwArgs: {},
                });
                await ph.handle({
                    args: [
                        "-enditem",
                        toIdent("p1", porygon),
                        toItemName("sitrusberry"),
                    ],
                    kwArgs: {eat: true},
                });
                await ph.handle({
                    args: ["-heal", toIdent("p1", porygon), toHPStatus(75)],
                    kwArgs: {from: toEffectName("sitrusberry", "item")},
                });
                // P2 effects.
                await ph.handle({
                    args: ["-damage", toIdent("p2", porygon), toHPStatus(75)],
                    kwArgs: {from: toEffectName("stealthrock", "move")},
                });
                await ph.handle({
                    args: ["-damage", toIdent("p2", porygon), toHPStatus(50)],
                    kwArgs: {from: toEffectName("spikes", "move")},
                });
                await ph.handle({
                    args: [
                        "-ability",
                        toIdent("p2", porygon),
                        toAbilityName("download"),
                        "boost",
                    ],
                    kwArgs: {},
                });
                await ph.handle({
                    args: ["-boost", toIdent("p2", porygon), "atk", toNum(1)],
                    kwArgs: {},
                });
                await ph.handle({
                    args: [
                        "-enditem",
                        toIdent("p2", porygon),
                        toItemName("sitrusberry"),
                    ],
                    kwArgs: {eat: true},
                });
                await ph.handle({
                    args: ["-heal", toIdent("p2", porygon), toHPStatus(75)],
                    kwArgs: {from: toEffectName("sitrusberry", "item")},
                });
                await ph.halt();
                await ph.return([
                    ["p2", state.getTeam("p2").active],
                    ["p1", state.getTeam("p1").active],
                ]);
                expect(p1.active.traits.ability.possibleValues).to.have.keys(
                    "download",
                );
                expect(
                    p1.active.baseTraits.ability.possibleValues,
                ).to.have.keys("download");
                expect(p2.active.traits.ability.possibleValues).to.have.keys(
                    "download",
                );
                expect(
                    p2.active.baseTraits.ability.possibleValues,
                ).to.have.keys("download");
            });

            // Moldbreaker or hypercutter ability.
            const pinsir: SwitchOptions = {
                species: "pinsir",
                level: 35,
                gender: "M",
                hp: 100,
                hpMax: 100,
            };

            it("Should assert no on-start ability if it did not activate", async function () {
                const p1 = state.getTeam("p1");
                p1.size = 1;
                p1.status.stealthrock = 1;
                p1.status.spikes = 3;
                const mon1 = p1.reveal(pinsir)!;
                expect(mon1.traits.ability.possibleValues).to.have.keys(
                    "hypercutter",
                    "moldbreaker",
                );
                const p2 = state.getTeam("p2");
                p2.size = 1;
                p2.status.stealthrock = 1;
                p2.status.spikes = 3;
                const mon2 = p2.reveal(pinsir)!;
                expect(mon2.traits.ability.possibleValues).to.have.keys(
                    "hypercutter",
                    "moldbreaker",
                );

                pctx = init();
                await ph.handle(switchEvent("p1", pinsir));
                await ph.handle(switchEvent("p2", pinsir));
                // P2 effects.
                await ph.handle({
                    args: ["-damage", toIdent("p2", pinsir), toHPStatus(75)],
                    kwArgs: {from: toEffectName("stealthrock", "move")},
                });
                await ph.handle({
                    args: ["-damage", toIdent("p2", pinsir), toHPStatus(50)],
                    kwArgs: {from: toEffectName("spikes", "move")},
                });
                // P1 effects.
                await ph.handle({
                    args: ["-damage", toIdent("p1", pinsir), toHPStatus(75)],
                    kwArgs: {from: toEffectName("spikes", "move")},
                });
                await ph.handle({
                    args: ["-damage", toIdent("p1", pinsir), toHPStatus(50)],
                    kwArgs: {from: toEffectName("stealthrock", "move")},
                });
                await ph.halt();
                await ph.return([
                    ["p1", state.getTeam("p1").active],
                    ["p2", state.getTeam("p2").active],
                ]);
                expect(mon1.traits.ability.possibleValues).to.have.keys(
                    "hypercutter",
                );
                expect(mon2.traits.ability.possibleValues).to.have.keys(
                    "hypercutter",
                );
            });

            it("Should assert no on-update ability if it did not activate", async function () {
                const p1 = state.getTeam("p1");
                p1.size = 1;
                p1.status.stealthrock = 1;
                p1.status.spikes = 3;
                const mon1 = p1.reveal(ralts)!;
                expect(mon1.traits.ability.possibleValues).to.have.keys(
                    "trace",
                    "synchronize",
                );
                const p2 = state.getTeam("p2");
                p2.size = 1;
                p2.status.stealthrock = 1;
                p2.status.spikes = 3;
                const mon2 = p2.reveal(smeargle)!;
                expect(mon2.traits.ability.possibleValues).to.have.keys(
                    "owntempo",
                    "technician",
                );

                pctx = init();
                await ph.handle(switchEvent("p1", ralts));
                await ph.handle(switchEvent("p2", smeargle));
                // P2 effects.
                await ph.handle({
                    args: ["-damage", toIdent("p2", smeargle), toHPStatus(75)],
                    kwArgs: {from: toEffectName("stealthrock", "move")},
                });
                await ph.handle({
                    args: ["-damage", toIdent("p2", smeargle), toHPStatus(50)],
                    kwArgs: {from: toEffectName("spikes", "move")},
                });
                // P1 effects.
                await ph.handle({
                    args: ["-damage", toIdent("p1", smeargle), toHPStatus(75)],
                    kwArgs: {from: toEffectName("spikes", "move")},
                });
                await ph.handle({
                    args: ["-damage", toIdent("p1", smeargle), toHPStatus(50)],
                    kwArgs: {from: toEffectName("stealthrock", "move")},
                });
                await ph.halt();
                await ph.return([
                    ["p1", state.getTeam("p1").active],
                    ["p2", state.getTeam("p2").active],
                ]);
                expect(mon1.traits.ability.possibleValues).to.have.keys(
                    "synchronize",
                );
                expect(mon2.traits.ability.possibleValues).to.have.keys(
                    "owntempo",
                    "technician",
                );
            });

            it("Should handle faint separately for both pathways", async function () {
                // Note: Requires teamsize=2 to prevent game-over.
                const p1 = state.getTeam("p1");
                p1.size = 2;
                p1.status.stealthrock = 1;
                p1.status.spikes = 3;
                const p2 = state.getTeam("p2");
                p2.size = 2;
                p2.status.stealthrock = 1;
                p2.status.spikes = 3;

                pctx = init();
                await ph.handle(switchEvent("p1", ralts));
                await ph.handle(switchEvent("p2", entei));
                // P2 effects.
                await ph.handle({
                    args: ["-damage", toIdent("p2", entei), toHPStatus(50)],
                    kwArgs: {from: toEffectName("stealthrock", "move")},
                });
                await ph.handle({
                    args: [
                        "-damage",
                        toIdent("p2", entei),
                        toHPStatus("faint"),
                    ],
                    kwArgs: {from: toEffectName("spikes", "move")},
                });
                await ph.handle({
                    args: ["faint", toIdent("p2", entei)],
                    kwArgs: {},
                });
                // P1 effects.
                await ph.handle({
                    args: ["-damage", toIdent("p1", ralts), toHPStatus(50)],
                    kwArgs: {from: toEffectName("stealthrock", "move")},
                });
                await ph.handle({
                    args: [
                        "-damage",
                        toIdent("p1", ralts),
                        toHPStatus("faint"),
                    ],
                    kwArgs: {from: toEffectName("spikes", "move")},
                });
                await ph.handle({
                    args: ["faint", toIdent("p1", ralts)],
                    kwArgs: {},
                });
                // Note: Since multipleSwitchIns() calls faint.replacements() we
                // can't use the default ph.halt() event here (which is really a
                // |request| event with type 'move') since it requires a
                // 'switch' type, so we just check the error here to make sure
                // the function isn't throwing anywhere else.
                await ph.haltError(
                    Error,
                    "Expected |request| type 'switch' but got 'move'",
                );
            });

            it("Should end game prematurely if all fainted on one side", async function () {
                const p1 = state.getTeam("p1");
                p1.size = 1;
                p1.status.stealthrock = 1;
                p1.status.spikes = 3;
                const mon1 = p1.reveal(ralts)!;
                mon1.setItem("sitrusberry");
                mon1.setAbility("trace");
                const p2 = state.getTeam("p2");
                p2.size = 1;
                p2.status.stealthrock = 1;
                p2.status.spikes = 3;
                const mon2 = p2.reveal(entei)!;
                mon2.setItem("sitrusberry");
                mon2.setAbility("pressure");

                pctx = init();
                await ph.handle(switchEvent("p1", ralts));
                await ph.handle(switchEvent("p2", entei));
                // P2 effects.
                await ph.handle({
                    args: ["-damage", toIdent("p2", entei), toHPStatus(75)],
                    kwArgs: {from: toEffectName("stealthrock", "move")},
                });
                await ph.handle({
                    args: [
                        "-damage",
                        toIdent("p2", entei),
                        toHPStatus("faint"),
                    ],
                    kwArgs: {from: toEffectName("spikes", "move")},
                });
                // Faint early.
                await ph.handle({
                    args: ["faint", toIdent("p2", entei)],
                    kwArgs: {},
                });
                // End game before checking p2 on-start or any p1 effects.
                // Note: Only the top-level turnLoop() parser can consume this
                // event.
                await ph.reject({
                    args: ["win", toUsername(state.username)],
                    kwArgs: {},
                });
                await ph.return([
                    ["p1", state.getTeam("p1").active],
                    ["p2", state.getTeam("p2").active],
                ]);
            });
        });
    });
