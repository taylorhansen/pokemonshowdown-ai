import "mocha";
import {Protocol} from "@pkmn/protocol";
import {FieldCondition, SideID} from "@pkmn/types";
import {expect} from "chai";
import {Event} from "../../../../../parser";
import * as dex from "../dex";
import {BattleState} from "../state";
import {Pokemon} from "../state/Pokemon";
import {ditto, smeargle} from "../state/switchOptions.test";
import {createInitialContext, ParserContext} from "./Context.test";
import {ParserHelpers} from "./ParserHelpers.test";
import {StateHelpers} from "./StateHelpers.test";
import {
    setupBattleParser,
    toEffectName,
    toHPStatus,
    toIdent,
    toItemName,
    toMoveName,
    toNickname,
    toSpeciesName,
    toWeather,
} from "./helpers.test";
import {residual} from "./residual";

export const test = () =>
    describe("residual", function () {
        const ictx = createInitialContext();

        let state: BattleState;
        const sh = new StateHelpers(() => state);

        beforeEach("Extract BattleState", function () {
            state = ictx.getState();
        });

        let us: Pokemon;
        let them: Pokemon;

        beforeEach("Initialize state", function () {
            us = sh.initActive("p1");
            them = sh.initActive("p2");
        });

        let pctx: ParserContext<void> | undefined;
        const ph = new ParserHelpers(() => pctx);
        const init = setupBattleParser(ictx.startArgs, residual);

        afterEach("Close ParserContext", async function () {
            await ph.close().finally(() => (pctx = undefined));
        });

        /** Weather upkeep event. */
        const upkeepEvent = (
            weatherType: dex.WeatherType,
        ): Event<"|-weather|"> => ({
            args: ["-weather", toWeather(weatherType)],
            kwArgs: {upkeep: true},
        });

        /** Weather damage event. */
        const damageEvent = (
            weatherType: dex.WeatherType,
            side: SideID,
            opt = smeargle,
            pos: Protocol.PositionLetter = "a",
            healthStr: Protocol.PokemonHPStatus = toHPStatus(94, 100),
        ): Event<"|-damage|"> => ({
            args: ["-damage", toIdent(side, opt, pos), healthStr],
            kwArgs: {from: toEffectName(weatherType)},
        });

        it("Should handle faint immediately after weather", async function () {
            state.status.weather.start(null /*source*/, "Hail");
            us.volatile.changeTypes(["???", "???"]);
            us.volatile.suppressAbility = true;
            them.volatile.changeTypes(["???", "???"]);
            them.volatile.suppressAbility = true;
            them.hp.set(96);

            pctx = init();
            await ph.handle(upkeepEvent("Hail"));
            await ph.handle(
                damageEvent(
                    "Hail",
                    "p1",
                    undefined,
                    undefined,
                    toHPStatus("faint"),
                ),
            );
            await ph.handle(damageEvent("Hail", "p2"));
            await ph.handle({args: ["faint", toIdent("p1")], kwArgs: {}});
            await ph.handle({
                args: ["-heal", toIdent("p2"), toHPStatus(100, 100)],
                kwArgs: {from: toEffectName("leftovers", "item")},
            });
            await ph.halt();
            await ph.return();
        });

        it("Should cancel inferences on game-over", async function () {
            state.status.weather.start(null /*source*/, "Hail");
            us.volatile.changeTypes(["???", "???"]);
            us.volatile.suppressAbility = true;
            them.volatile.changeTypes(["???", "???"]);
            them.volatile.suppressAbility = true;
            them.setItem("leftovers");

            pctx = init();
            await ph.handle(upkeepEvent("Hail"));
            await ph.handle(
                damageEvent(
                    "Hail",
                    "p1",
                    undefined,
                    undefined,
                    toHPStatus("faint"),
                ),
            );
            await ph.handle(damageEvent("Hail", "p2"));
            // Last pokemon to faint.
            await ph.handle({args: ["faint", toIdent("p1")], kwArgs: {}});
            // Even though leftovers should still be parsed, since we reached a
            // game-over state the game will instead end prematurely. Instead we
            // leave the parsers enabled but disable their on-reject inferences.
            await ph.halt();
            await ph.return();
        });

        it("Should handle ability/item on-update afterwards", async function () {
            state.status.weather.start(null /*source*/, "Hail");
            us.volatile.changeTypes(["???", "???"]);
            us.volatile.suppressAbility = true;
            us.setItem("sitrusberry");
            // TODO: Add partiallytrapped status.
            them.volatile.changeTypes(["???", "???"]);
            them.volatile.suppressAbility = true;

            pctx = init();
            // Hail damage.
            await ph.handle(upkeepEvent("Hail"));
            await ph.handle(
                damageEvent("Hail", "p1", undefined, undefined, toHPStatus(50)),
            );
            await ph.handle(damageEvent("Hail", "p2"));
            // Partiallytrapped damage.
            await ph.handle({
                args: ["-damage", toIdent("p1"), toHPStatus(40)],
                kwArgs: {partiallytrapped: true},
            });
            // Only after all on-residual effects do the on-update effects
            // happen.
            await ph.handle({
                args: ["-enditem", toIdent("p1"), toItemName("sitrusberry")],
                kwArgs: {eat: true},
            });
            await ph.handle({
                args: ["-heal", toIdent("p1"), toHPStatus(65)],
                kwArgs: {from: toEffectName("sitrusberry", "item")},
            });
            // TODO: Test on-update ability activation
        });

        // TODO: Exhaustive tests for each status type.

        describe("weather", function () {
            beforeEach("Reset relevant pokemon traits", function () {
                // Typeless and no ability, guaranteed to be affected.
                us.volatile.changeTypes(["???", "???"]);
                us.volatile.suppressAbility = true;
                them.volatile.changeTypes(["???", "???"]);
                them.volatile.suppressAbility = true;
            });

            describe("none", function () {
                it("Should have no events if no weather", async function () {
                    pctx = init();
                    await ph.halt();
                    await ph.return();
                });
            });

            const weatherImmuneAbilities: {[W in dex.WeatherType]?: string[]} =
                {};
            for (const n of dex.abilityKeys) {
                const a = dex.abilities[n];
                if (!a.weatherImmunity) continue;
                (weatherImmuneAbilities[a.weatherImmunity] ??= []).push(n);
            }
            for (const weatherType of dex.weatherKeys) {
                describe(weatherType, function () {
                    const immuneTypes = dex.typeKeys.filter(
                        t => dex.canBlockWeather([t], weatherType) === true,
                    );

                    testUpkeep(weatherType, immuneTypes);
                    if (immuneTypes.length > 0) {
                        testWeatherDamage(
                            weatherType,
                            immuneTypes,
                            weatherImmuneAbilities[weatherType] ?? [],
                        );
                    }
                });
            }

            function testUpkeep(
                weatherType: dex.WeatherType,
                immuneTypes: readonly dex.Type[],
            ) {
                it("Should handle upkeep event", async function () {
                    state.status.weather.start(null /*source*/, weatherType);
                    // Immunity type, guaranteed to not take damage.
                    if (immuneTypes && immuneTypes.length > 0) {
                        us.volatile.changeTypes([immuneTypes[0], "???"]);
                        them.volatile.changeTypes([immuneTypes[0], "???"]);
                    }

                    pctx = init();
                    await ph.handle(upkeepEvent(weatherType));
                    await ph.halt();
                    await ph.return();
                });

                it("Should handle weather ending", async function () {
                    state.status.weather.start(null /*source*/, weatherType);

                    pctx = init();
                    await ph.handle({args: ["-weather", "none"], kwArgs: {}});
                    await ph.halt();
                    await ph.return();
                });
            }

            function testWeatherDamage(
                weatherType: dex.WeatherType,
                immuneTypes: readonly dex.Type[],
                immuneAbilities: readonly string[],
            ) {
                it("Should handle weather damage", async function () {
                    state.status.weather.start(null /*source*/, weatherType);

                    pctx = init();
                    await ph.handle(upkeepEvent(weatherType));
                    await ph.handle(damageEvent(weatherType, "p1"));
                    await ph.handle(damageEvent(weatherType, "p2"));
                    await ph.halt();
                    await ph.return();
                });

                for (const type of immuneTypes) {
                    it(`Should not take weather damage if ${type} type`, async function () {
                        state.status.weather.start(
                            null /*source*/,
                            weatherType,
                        );
                        them.volatile.changeTypes([type, "???"]);

                        pctx = init();
                        await ph.handle(upkeepEvent(weatherType));
                        await ph.handle(damageEvent(weatherType, "p1"));
                        await ph.halt();
                        await ph.return();
                    });
                }

                for (const ability of immuneAbilities) {
                    it(`Should not take weather damage if ${ability} ability`, async function () {
                        state.status.weather.start(
                            null /*source*/,
                            weatherType,
                        );
                        us.setAbility(ability);
                        us.volatile.suppressAbility = false;

                        pctx = init();
                        await ph.handle(upkeepEvent(weatherType));
                        await ph.handle(damageEvent(weatherType, "p2"));
                        await ph.halt();
                        await ph.return();
                    });
                }
            }
        });

        describe("field end", function () {
            for (const name of ["gravity", "trickroom"] as const) {
                describe(name, function () {
                    it("Should handle end", async function () {
                        const ts = state.status[name];
                        ts.start();

                        pctx = init();
                        await ph.handle({
                            args: [
                                "-fieldend",
                                toEffectName(
                                    name,
                                    "move",
                                ) as unknown as FieldCondition,
                            ],
                            kwArgs: {},
                        });
                        await ph.halt();
                        await ph.return();
                    });
                });
            }
        });

        describe("wish", function () {
            it("Should heal and end status", async function () {
                [, us] = sh.initTeam("p1", [ditto, smeargle]);
                us.hp.set(50);
                const ts = state.getTeam("p1").status.wish;
                ts.start();
                expect(ts.isActive).to.be.true;

                pctx = init();
                await ph.handle({
                    args: ["-heal", toIdent("p1"), toHPStatus(100, 100)],
                    kwArgs: {
                        from: toEffectName("wish", "move"),
                        wisher: toNickname(toSpeciesName(ditto.species)),
                    },
                });
                await ph.halt();
                await ph.return();
                expect(ts.isActive).to.be.false;
            });
        });

        describe("status damage", function () {
            it("Should handle heal", async function () {
                us.volatile.aquaring = true;
                us.hp.set(88);

                pctx = init();
                await ph.handle({
                    args: ["-heal", toIdent("p1"), toHPStatus(100, 100)],
                    kwArgs: {
                        from: toEffectName("aquaring", "move"),
                    },
                });
                await ph.halt();
                await ph.return();
            });

            it("Should handle damage", async function () {
                us.majorStatus.afflict("tox");

                pctx = init();
                await ph.handle({
                    args: ["-damage", toIdent("p1"), toHPStatus(84, 100)],
                    kwArgs: {from: toEffectName("psn")},
                });
                await ph.halt();
                await ph.return();
            });
        });

        describe("leechseed", function () {
            it("Should handle", async function () {
                them.volatile.leechseed = true;
                us.hp.set(50);

                pctx = init();
                await ph.handle({
                    args: ["-damage", toIdent("p2"), toHPStatus(88, 100)],
                    kwArgs: {
                        from: toEffectName("leechseed", "move"),
                        of: toIdent("p1"),
                    },
                });
                await ph.handle({
                    args: ["-heal", toIdent("p1"), toHPStatus(62, 100)],
                    kwArgs: {silent: true},
                });
                await ph.halt();
                await ph.return();
            });
        });

        describe("partiallytrapped", function () {
            it("Should handle damage", async function () {
                // TODO: Implement status.

                pctx = init();
                await ph.handle({
                    args: ["-damage", toIdent("p2"), toHPStatus(88, 100)],
                    kwArgs: {
                        from: toEffectName("firespin", "move"),
                        partiallytrapped: true,
                    },
                });
                await ph.halt();
                await ph.return();
            });

            it("Should handle end", async function () {
                // TODO: Implement status.

                pctx = init();
                await ph.handle({
                    args: [
                        "-end",
                        toIdent("p2"),
                        toEffectName("firespin", "move"),
                    ],
                    kwArgs: {
                        partiallytrapped: true,
                    },
                });
                await ph.halt();
                await ph.return();
            });
        });

        describe("uproar", function () {
            it("Should handle uproar", async function () {
                them.volatile.uproar.start();

                pctx = init();
                await ph.handle({
                    args: ["-start", toIdent("p2"), toMoveName("uproar")],
                    kwArgs: {upkeep: true},
                });
                await ph.halt();
                await ph.return();
            });

            it("Should handle end", async function () {
                them.volatile.uproar.start();

                pctx = init();
                await ph.handle({
                    args: ["-end", toIdent("p2"), toMoveName("uproar")],
                    kwArgs: {},
                });
                await ph.halt();
                await ph.return();
            });
        });

        describe("status end", function () {
            it("Should end status", async function () {
                us.volatile.taunt.start();

                pctx = init();
                await ph.handle({
                    args: [
                        "-end",
                        toIdent("p1"),
                        toEffectName("taunt", "move"),
                    ],
                    kwArgs: {},
                });
                await ph.halt();
                await ph.return();
            });
        });

        describe("yawn", function () {
            it("Should also afflict slp after ending", async function () {
                them.volatile.yawn.start();

                pctx = init();
                await ph.handle({
                    args: ["-end", toIdent("p2"), toEffectName("yawn", "move")],
                    kwArgs: {silent: true},
                });
                await ph.handle({
                    args: ["-status", toIdent("p2"), "slp"],
                    kwArgs: {},
                });
                await ph.halt();
                await ph.return();
            });

            it("Should infer status immunity if no slp", async function () {
                state.status.weather.start(null /*source*/, "SunnyDay");
                them.volatile.yawn.start();
                them.setAbility("illuminate", "leafguard");

                pctx = init();
                await ph.handle(upkeepEvent("SunnyDay"));
                await ph.handle({
                    args: ["-end", toIdent("p2"), toEffectName("yawn", "move")],
                    kwArgs: {silent: true},
                });
                await ph.halt();
                await ph.return();
                expect(them.traits.ability.possibleValues).to.have.keys(
                    "leafguard",
                );
            });

            it("Should infer no status immunity if slp", async function () {
                them.volatile.yawn.start();
                them.setAbility("illuminate", "insomnia");

                pctx = init();
                await ph.handle({
                    args: ["-end", toIdent("p2"), toEffectName("yawn", "move")],
                    kwArgs: {silent: true},
                });
                await ph.handle({
                    args: ["-status", toIdent("p2"), "slp"],
                    kwArgs: {},
                });
                expect(them.traits.ability.possibleValues).to.have.keys(
                    "illuminate",
                );
                await ph.halt();
                await ph.return();
            });
        });

        describe("futuremove", function () {
            it("Should handle move damage", async function () {
                state.getTeam("p2").status.futureMoves.futuresight.start();

                pctx = init();
                await ph.handle({
                    args: [
                        "-end",
                        toIdent("p1"),
                        toEffectName("futuresight", "move"),
                    ],
                    kwArgs: {},
                });
                await ph.handle({
                    args: ["-damage", toIdent("p1"), toHPStatus(50, 100)],
                    kwArgs: {},
                });
                await ph.handle({
                    args: [
                        "-enditem",
                        toIdent("p1"),
                        toItemName("sitrusberry"),
                    ],
                    kwArgs: {eat: true},
                });
                await ph.handle({
                    args: ["-heal", toIdent("p1"), toHPStatus(75, 100)],
                    kwArgs: {from: toEffectName("sitrusberry", "item")},
                });
                await ph.halt();
                await ph.return();
            });

            it("Should handle faint due to damage", async function () {
                state.getTeam("p2").status.futureMoves.futuresight.start();
                us.setItem("sitrusberry");

                pctx = init();
                await ph.handle({
                    args: [
                        "-end",
                        toIdent("p1"),
                        toEffectName("futuresight", "move"),
                    ],
                    kwArgs: {},
                });
                await ph.handle({
                    args: ["-damage", toIdent("p1"), toHPStatus("faint")],
                    kwArgs: {},
                });
                await ph.handle({args: ["faint", toIdent("p1")], kwArgs: {}});
                await ph.halt();
                await ph.return();
            });
        });

        describe("perishsong", function () {
            it("Should handle count", async function () {
                us.volatile.perish = 2;

                pctx = init();
                await ph.handle({
                    args: ["-start", toIdent("p1"), toEffectName("perish1")],
                    kwArgs: {},
                });
                await ph.halt();
                await ph.return();
            });

            it("Should handle faint due to count", async function () {
                us.volatile.perish = 1;

                pctx = init();
                await ph.handle({
                    args: ["-start", toIdent("p1"), toEffectName("perish0")],
                    kwArgs: {},
                });
                await ph.handle({args: ["faint", toIdent("p1")], kwArgs: {}});
                await ph.halt();
                await ph.return();
            });
        });

        describe("lockedmove fatigue", function () {
            it("Should handle", async function () {
                us.volatile.lockedMove.start("thrash");

                pctx = init();
                await ph.handle({
                    args: ["-start", toIdent("p1"), toEffectName("confusion")],
                    kwArgs: {fatigue: true},
                });
                await ph.halt();
                await ph.return();
            });
        });
    });
