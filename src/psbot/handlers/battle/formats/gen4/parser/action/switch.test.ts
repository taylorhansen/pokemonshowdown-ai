import { Protocol } from "@pkmn/protocol";
import { SideCondition, SideID } from "@pkmn/types";
import { expect } from "chai";
import "mocha";
import { Event } from "../../../../../../parser";
import { BattleState } from "../../state";
import { Pokemon } from "../../state/Pokemon";
import { SwitchOptions } from "../../state/Team";
import { ditto, smeargle } from "../../state/switchOptions.test";
import { ParserContext , createInitialContext } from "../Context.test";
import { ParserHelpers } from "../ParserHelpers.test";
import { setupBattleParser, toAbilityName, toDetails, toEffectName, toHPStatus,
    toIdent, toItemName, toMoveName, toSide } from "../helpers.test";
import * as actionSwitch from "./switch";

export const test = () => describe("switch", function()
{
    const ictx = createInitialContext();
    const {sh} = ictx;

    let state: BattleState;

    beforeEach("Extract BattleState", function()
    {
        state = ictx.getState();
    });

    const switchEvent = (side: SideID, opt = smeargle,
        pos: Protocol.PositionLetter = "a"): Event<"|switch|"> =>
    ({
            args:
            [
                "switch", toIdent(side, opt, pos), toDetails(opt),
                toHPStatus(100, 100)
            ],
            kwArgs: {}
    });

    describe("switchAction()", function()
    {
        const init = setupBattleParser(ictx.startArgs,
            actionSwitch.switchAction);
        let pctx: ParserContext<actionSwitch.SwitchActionResult> | undefined;
        const ph = new ParserHelpers(() => pctx);

        afterEach("Close ParserContext", async function()
        {
            // Reset variable so it doesn't leak into other tests.
            await ph.close().finally(() => pctx = undefined);
        });

        it("Should handle switch-in", async function()
        {
            state.getTeam("p1").size = 2;
            state.getTeam("p1").switchIn(ditto);
            sh.initActive("p2");

            pctx = init("p1");
            await ph.handle(switchEvent("p1"));
            await ph.halt();
            await ph.return(
                {mon: state.getTeam("p1").active, actioned: {p1: true}});
        });

        it("Should throw if invalid ident", async function()
        {
            state.getTeam("p1").size = 2;
            state.getTeam("p1").switchIn(ditto);
            sh.initActive("p2");

            pctx = init("p1");
            await ph.rejectError(switchEvent("p2"), Error,
                "Expected switch-in for 'p1' but got 'p2'");
        });

        describe("interceptSwitch moves (pursuit)", function()
        {
            it("Should handle Pursuit", async function()
            {
                state.getTeam("p1").size = 2;
                state.getTeam("p1").switchIn(smeargle);
                sh.initActive("p2");

                pctx = init("p1");
                // Pursuit indicator event.
                await ph.handle(
                {
                    args:
                    [
                        "-activate", toIdent("p1"),
                        toEffectName("pursuit", "move")
                    ],
                    kwArgs: {}
                });
                // Move event and effects.
                await ph.handle(
                {
                    args: ["move", toIdent("p2"), toMoveName("pursuit")],
                    kwArgs: {}
                });
                await ph.handle(
                {
                    args: ["-damage", toIdent("p1"), toHPStatus(90, 100)],
                    kwArgs: {}
                });
                // Actual switch event.
                await ph.handle(switchEvent("p1", ditto));
                await ph.halt();
                await ph.return(
                {
                    mon: state.getTeam("p1").active,
                    actioned: {p1: true, p2: true}
                });
            });

            it("Should throw if move doesn't have interceptSwitch flag",
            async function()
            {
                state.getTeam("p1").size = 2;
                state.getTeam("p1").switchIn(smeargle);
                sh.initActive("p2");
                pctx = init("p1");
                await ph.rejectError(
                {
                    args:
                    [
                        "-activate", toIdent("p2"),
                        toEffectName("tackle", "move")
                    ],
                    kwArgs: {}
                },
                    Error,
                    "Invalid event: Expected type ['|switch|', '|drag|'] but " +
                    "got '|-activate|'");
            });

            it("Should throw if mismatched monRef", async function()
            {
                state.getTeam("p1").size = 2;
                state.getTeam("p1").switchIn(smeargle);
                pctx = init("p1");
                await ph.rejectError(
                {
                    args:
                    [
                        "-activate", toIdent("p1"),
                        toEffectName("tackle", "move")
                    ],
                    kwArgs: {}
                },
                    Error,
                    "Invalid event: Expected type ['|switch|', '|drag|'] but " +
                        "got '|-activate|'");
            });
        });

        describe("on-switchOut abilities (naturalcure)", function()
        {
            it("Should handle", async function()
            {
                const [, mon] = sh.initTeam("p1", [ditto, smeargle]);
                mon.majorStatus.afflict("frz");
                mon.setAbility("naturalcure");
                sh.initActive("p2");

                pctx = init("p1");
                await ph.handle(
                {
                    args: ["-curestatus", toIdent("p1"), "frz"],
                    kwArgs: {from: toEffectName("naturalcure", "ability")}
                });
                await ph.handle(switchEvent("p1", ditto));
                await ph.halt();
                await ph.return(
                    {mon: state.getTeam("p1").active, actioned: {p1: true}});
            });
        });

        describe("switch effects", function()
        {
            // Pressure ability
            const entei: SwitchOptions =
                {species: "entei", level: 25, gender: "M", hp: 100, hpMax: 100};

            it("Should handle multiple effects", async function()
            {
                const [mon] = sh.initTeam("p1", [entei, ditto]);
                const team = state.getTeam("p1");
                team.status.spikes = 3;
                team.status.stealthrock = 1;
                team.status.toxicspikes = 2;
                team.status.healingwish = true;
                sh.initActive("p2");

                pctx = init("p1");
                await ph.handle(switchEvent("p1", entei));
                await ph.handle(
                {
                    args: ["-damage", toIdent("p1", entei), toHPStatus(75)],
                    kwArgs: {from: toMoveName("spikes")}
                });
                await ph.handle(
                {
                    args: ["-damage", toIdent("p1", entei), toHPStatus(63)],
                    kwArgs: {from: toMoveName("stealthrock")}
                });
                await ph.handle(
                {
                    args: ["-status", toIdent("p1", entei), "tox"], kwArgs: {}
                });
                await ph.handle(
                {
                    args: ["-heal", toIdent("p1", entei), toHPStatus(100)],
                    kwArgs: {from: toMoveName("healingwish")}
                });
                await ph.handle(
                {
                    args:
                    [
                        "-ability", toIdent("p1", entei),
                        toAbilityName("pressure")
                    ],
                    kwArgs: {}
                });
                await ph.halt();
                await ph.return({mon, actioned: {p1: true}});
            });

            describe("hazards", function()
            {
                // Can have magicguard.
                const clefable: SwitchOptions =
                {
                    species: "clefable", level: 30, gender: "F",
                    hp: 100, hpMax: 100
                };

                // Ungrounded.
                const pidgey: SwitchOptions =
                {
                    species: "pidgey", level: 50, gender: "M",
                    hp: 100, hpMax: 100
                };

                // Steel type.
                const aron: SwitchOptions =
                {
                    species: "aron", level: 40, gender: "F",
                    hp: 100, hpMax: 100
                };

                // Immunity ability.
                const snorlax: SwitchOptions =
                {
                    species: "snorlax", level: 20, gender: "M",
                    hp: 100, hpMax: 100
                };

                it("Should handle multiple hazards", async function()
                {
                    const [mon] = sh.initTeam("p1", [smeargle, ditto]);
                    const team = state.getTeam("p1");
                    team.status.spikes = 3;
                    team.status.stealthrock = 1;
                    team.status.toxicspikes = 2;
                    sh.initActive("p2");

                    pctx = init("p1");
                    await ph.handle(switchEvent("p1"));
                    await ph.handle(
                    {
                        args:
                            ["-damage", toIdent("p1"), toHPStatus(75)],
                        kwArgs: {from: toMoveName("spikes")}
                    });
                    await ph.handle(
                    {
                        args:
                            ["-damage", toIdent("p1"), toHPStatus(63)],
                        kwArgs: {from: toMoveName("stealthrock")}
                    });
                    await ph.handle(
                        {args: ["-status", toIdent("p1"), "tox"], kwArgs: {}});
                    await ph.halt();
                    await ph.return({mon, actioned: {p1: true}});
                });

                for (const effect of ["spikes", "stealthrock"] as const)
                {
                    describe(effect, function()
                    {
                        it("Should handle", async function()
                        {
                            const [mon] = sh.initTeam("p1", [smeargle, ditto]);
                            const team = state.getTeam("p1");
                            team.status[effect] = 1;
                            sh.initActive("p2");

                            pctx = init("p1");
                            await ph.handle(switchEvent("p1"));
                            await ph.handle(
                            {
                                args:
                                    ["-damage", toIdent("p1"), toHPStatus(88)],
                                kwArgs: {from: toMoveName(effect)}
                            });
                            await ph.halt();
                            await ph.return({mon, actioned: {p1: true}});
                        });

                        it("Should update items if damaged", async function()
                        {
                            const [mon] = sh.initTeam("p1", [smeargle, ditto]);
                            const team = state.getTeam("p1");
                            team.status[effect] = 1;
                            sh.initActive("p2");

                            pctx = init("p1");
                            await ph.handle(switchEvent("p1"));
                            await ph.handle(
                            {
                                args:
                                    ["-damage", toIdent("p1"), toHPStatus(25)],
                                kwArgs: {from: toMoveName(effect)}
                            });
                            await ph.handle(
                            {
                                args:
                                [
                                    "-enditem", toIdent("p1"),
                                    toItemName("oranberry")
                                ],
                                kwArgs: {eat: true}
                            });
                            await ph.handle(
                            {
                                args: ["-heal", toIdent("p1"), toHPStatus(100)],
                                kwArgs:
                                    {from: toEffectName("oranberry", "item")}
                            });
                            await ph.halt();
                            await ph.return({mon, actioned: {p1: true}});
                        });

                        it("Should be ignoreable due to unhandled magicguard",
                        async function()
                        {
                            const [mon] = sh.initTeam("p1", [clefable, ditto]);
                            const team = state.getTeam("p1");
                            team.status[effect] = 1;
                            sh.initActive("p2");

                            pctx = init("p1");
                            await ph.handle(switchEvent("p1", clefable));
                            await ph.halt();
                            await ph.return({mon, actioned: {p1: true}});
                        });

                        it("Should faint if damaged enough", async function()
                        {
                            const [mon] = sh.initTeam("p1", [smeargle, ditto]);
                            const team = state.getTeam("p1");
                            team.status[effect] = 1;
                            sh.initActive("p2");

                            pctx = init("p1");
                            await ph.handle(switchEvent("p1"));
                            await ph.handle(
                            {
                                args:
                                [
                                    "-damage", toIdent("p1"),
                                    toHPStatus("faint")
                                ],
                                kwArgs: {from: toMoveName(effect)}
                            });
                            await ph.handle(
                                {args: ["faint", toIdent("p1")], kwArgs: {}});
                            await ph.halt();
                            await ph.return({mon, actioned: {p1: true}});
                        });

                        const otherEffect = effect === "spikes" ?
                            "stealthrock" : "spikes";
                        it("Should not handle if fainted after " + otherEffect,
                        async function()
                        {
                            const [mon] = sh.initTeam("p1", [smeargle, ditto]);
                            const team = state.getTeam("p1");
                            team.status.spikes = 3;
                            team.status.stealthrock = 2;
                            sh.initActive("p2");

                            pctx = init("p1");
                            await ph.handle(switchEvent("p1"));
                            await ph.handle(
                            {
                                args:
                                [
                                    "-damage", toIdent("p1"),
                                    toHPStatus("faint")
                                ],
                                kwArgs:
                                    {from: toEffectName(otherEffect, "move")}
                            });
                            await ph.handle(
                                {args: ["faint", toIdent("p1")], kwArgs: {}});
                            await ph.halt();
                            await ph.return({mon, actioned: {p1: true}});
                        });
                    });
                }

                describe("toxicspikes", function()
                {
                    const arbok: SwitchOptions =
                    {
                        species: "arbok", level: 40, gender: "M", hp: 100,
                        hpMax: 100
                    };

                    interface TestOptions
                    {
                        name: string;
                        response?: "status" | "remove";
                        layers?: 1 | 2;
                        otherHazard?: "spikes" | "stealthrock";
                        opt?: SwitchOptions;
                        substitute?: boolean;
                        otherEvents?: readonly Event[];
                    }

                    function testToxicSpikes(
                        {
                            name, response, layers = 1, otherHazard,
                            opt = smeargle, substitute, otherEvents = []
                        }:
                            TestOptions)
                    {
                        it(name, async function()
                        {
                            const [mon, old] = sh.initTeam("p1", [opt, ditto]);
                            const team = state.getTeam("p1");
                            team.status.toxicspikes = layers;
                            if  (otherHazard) team.status[otherHazard] = 1;
                            if (substitute)
                            {
                                // Pass substitute onto switch-in.
                                team.status.selfSwitch = "copyvolatile";
                                old.volatile.substitute = true;
                            }
                            sh.initActive("p2");

                            pctx = init("p1");
                            await ph.handle(switchEvent("p1", opt));
                            if (response === "status")
                            {
                                await ph.handle(
                                {
                                    args:
                                    [
                                        "-status", toIdent("p1", opt),
                                        layers < 2 ? "psn" : "tox"
                                    ],
                                    kwArgs: {}
                                });
                            }
                            else if (response === "remove")
                            {
                                await ph.handle(
                                {
                                    args:
                                    [
                                        "-sideend", toSide("p1", "username"),
                                        toEffectName("toxicspikes", "move") as
                                            unknown as SideCondition
                                    ],
                                    kwArgs: {of: toIdent("p1", opt)}
                                });
                            }
                            for (const e of otherEvents) await ph.handle(e);
                            await ph.halt();
                            await ph.return({mon, actioned: {p1: true}});
                        });
                    }

                    testToxicSpikes(
                        {name: "Should handle", response: "status"});

                    testToxicSpikes(
                        {name: "Should handle ability immunity", opt: snorlax});

                    testToxicSpikes(
                        {name: "Should ignore if steel type", opt: aron});

                    testToxicSpikes(
                    {
                        name: "Should ignore if substitute", substitute: true
                    });

                    testToxicSpikes(
                        {name: "Should ignore if magicguard", opt: clefable});

                    testToxicSpikes(
                        {name: "Should ignore if not grounded", opt: pidgey});

                    testToxicSpikes(
                    {
                        name: "Should update items if statused",
                        response: "status", layers: 2,
                        otherEvents:
                        [
                            {
                                args:
                                [
                                    "-enditem", toIdent("p1"),
                                    toItemName("pechaberry")
                                ],
                                kwArgs: {eat: true}
                            },
                            {
                                args: ["-curestatus", toIdent("p1"), "tox"],
                                kwArgs:
                                    {from: toEffectName("pechaberry", "item")}
                            }
                        ]
                    });

                    testToxicSpikes(
                    {
                        name: "Should remove if poison type",
                        response: "remove", opt: arbok
                    });

                    testToxicSpikes(
                    {
                        name:
                            "Should still remove if poison type and substitute",
                        opt: arbok, substitute: true
                    });

                    testToxicSpikes(
                    {
                        name:
                            "Should not handle if fainted after other hazards",
                        otherHazard: "spikes",
                        otherEvents:
                        [
                            {
                                args:
                                [
                                    "-damage", toIdent("p1"),
                                    toHPStatus("faint")
                                ],
                                kwArgs: {from: toEffectName("spikes", "move")}
                            },
                            {args: ["faint", toIdent("p1")], kwArgs: {}}
                        ]
                    });
                });
            });

            describe("healingwish", function()
            {
                for (const effect of ["healingwish", "lunardance"] as const)
                {
                    it(`Should handle ${effect}`, async function()
                    {
                        const [mon] = sh.initTeam("p1", [smeargle, ditto]);
                        const team = state.getTeam("p1");
                        team.status[effect] = true;
                        sh.initActive("p2");

                        pctx = init("p1");
                        await ph.handle(switchEvent("p1"));
                        await ph.handle(
                        {
                            args:
                                ["-heal", toIdent("p1"), toHPStatus(100)],
                            kwArgs: {from: toMoveName(effect)}
                        });
                        await ph.halt();
                        await ph.return({mon, actioned: {p1: true}});
                    });

                    it(`Should throw if ${effect} didn't happen`,
                    async function()
                    {
                        sh.initTeam("p1", [smeargle, ditto]);
                        const team = state.getTeam("p1");
                        team.status[effect] = true;
                        sh.initActive("p2");

                        pctx = init("p1");
                        await ph.handle(switchEvent("p1"));
                        await ph.haltError(Error,
                            `Expected effect that didn't happen: p1 ${effect}`);
                    });

                    it("Should not handle if fainted after hazards",
                    async function()
                    {
                        const [mon] = sh.initTeam("p1", [smeargle, ditto]);
                        const team = state.getTeam("p1");
                        team.status[effect] = true;
                        team.status.spikes = 3;
                        sh.initActive("p2");

                        pctx = init("p1");
                        await ph.handle(switchEvent("p1"));
                        await ph.handle(
                        {
                            args:
                            [
                                "-damage", toIdent("p1"), toHPStatus("faint")
                            ],
                            kwArgs: {from: toEffectName("spikes", "move")}
                        });
                        await ph.handle(
                            {args: ["faint", toIdent("p1")], kwArgs: {}});
                        await ph.halt();
                        await ph.return({mon, actioned: {p1: true}});
                    });
                }
            });

            describe("on-start abilities", function()
            {
                it("Should handle pressure", async function()
                {
                    const [mon] = sh.initTeam("p1", [entei, ditto]);
                    expect(mon.traits.ability.possibleValues)
                        .to.have.keys("pressure")
                    sh.initActive("p2");

                    pctx = init("p1");
                    await ph.handle(switchEvent("p1", entei));
                    await ph.handle(
                    {
                        args:
                        [
                            "-ability", toIdent("p1", entei),
                            toAbilityName("pressure")
                        ],
                        kwArgs: {}
                    });
                    await ph.halt();
                    await ph.return({mon, actioned: {p1: true}});
                });

                it("Should not handle if fainted after hazards",
                async function()
                {
                    const [mon] = sh.initTeam("p1", [entei, ditto]);
                    expect(mon.traits.ability.possibleValues)
                        .to.have.keys("pressure")
                    const team = state.getTeam("p1");
                    team.status.spikes = 3;
                    sh.initActive("p2");

                    pctx = init("p1");
                    await ph.handle(switchEvent("p1", entei));
                    await ph.handle(
                    {
                        args:
                        [
                            "-damage", toIdent("p1", entei), toHPStatus("faint")
                        ],
                        kwArgs: {from: toEffectName("spikes", "move")}
                    });
                    await ph.handle(
                        {args: ["faint", toIdent("p1", entei)], kwArgs: {}});
                    await ph.halt();
                    await ph.return({mon, actioned: {p1: true}});
                });
            });
        });
    });

    describe("multipleSwitchIns()", function()
    {
        const init = setupBattleParser(ictx.startArgs,
            actionSwitch.multipleSwitchIns);
        let pctx: ParserContext<[side: SideID, mon: Pokemon][]> | undefined;
        const ph = new ParserHelpers(() => pctx);

        // eslint-disable-next-line mocha/no-hooks-for-single-case
        afterEach("Close ParserContext", async function()
        {
            await ph.close().finally(() => pctx = undefined);
        });

        it("Should handle switch-ins", async function()
        {
            state.getTeam("p1").size = 1;
            state.getTeam("p2").size = 1;

            pctx = init();
            await ph.handle(switchEvent("p1"));
            await ph.handle(switchEvent("p2", ditto));
            await ph.halt();
            await ph.return(
            [
                ["p1", state.getTeam("p1").active],
                ["p2", state.getTeam("p2").active]
            ]);
        });
    });
});
