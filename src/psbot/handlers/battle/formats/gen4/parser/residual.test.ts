import "mocha";
import {Protocol} from "@pkmn/protocol";
import {FieldCondition, SideCondition, SideID} from "@pkmn/types";
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
    toAbilityName,
    toEffectName,
    toHPStatus,
    toIdent,
    toItemName,
    toMoveName,
    toNickname,
    toNum,
    toSide,
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

        // TODO: Exhaustive tests for each status type.

        const sideEndEvent = (
            side: SideID,
            username: string,
            name: string,
        ): Event<"|-sideend|"> => ({
            args: [
                "-sideend",
                toSide(side, username),
                toEffectName(name, "move") as unknown as SideCondition,
            ],
            kwArgs: {},
        });

        const sideEndKeys = [
            "reflect",
            "lightscreen",
            "mist",
            "safeguard",
            "tailwind",
            "luckychant",
        ] as const;

        describe("side end", function () {
            for (const name of sideEndKeys) {
                describe(name, function () {
                    it("Should handle end", async function () {
                        const ts = state.getTeam("p1").status[name];
                        ts.start();

                        pctx = init();
                        await ph.handle(
                            sideEndEvent("p1", state.username, name),
                        );
                        await ph.halt();
                        await ph.return();
                    });
                });
            }
        });

        const wishEvent = (
            side: SideID,
            wisher: string,
            opt = smeargle,
            pos: Protocol.PositionLetter = "a",
            hp = 100,
        ): Event<"|-heal|"> => ({
            args: ["-heal", toIdent(side, opt, pos), toHPStatus(hp, 100)],
            kwArgs: {
                from: toEffectName("wish", "move"),
                wisher: toNickname(toSpeciesName(wisher)),
            },
        });

        describe("wish", function () {
            it("Should heal and end status", async function () {
                [, us] = sh.initTeam("p1", [ditto, smeargle]);
                us.hp.set(50);
                const ts = state.getTeam("p1").status.wish;
                ts.start();
                expect(ts.isActive).to.be.true;

                pctx = init();
                await ph.handle(wishEvent("p1", ditto.species));
                await ph.halt();
                await ph.return();
                expect(ts.isActive).to.be.false;
            });
        });

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

        const fieldEndEvent = (name: string): Event<"|-fieldend|"> => ({
            args: [
                "-fieldend",
                toEffectName(name, "move") as unknown as FieldCondition,
            ],
            kwArgs: {},
        });

        describe("field end", function () {
            for (const name of ["gravity", "trickroom"] as const) {
                describe(name, function () {
                    it("Should handle end", async function () {
                        const ts = state.status[name];
                        ts.start();

                        pctx = init();
                        await ph.handle(fieldEndEvent(name));
                        await ph.halt();
                        await ph.return();
                    });
                });
            }
        });

        const statusHealEvent = (
            side: SideID,
            health: Protocol.PokemonHPStatus,
            from: Protocol.EffectName,
            opt = smeargle,
            pos: Protocol.PositionLetter = "a",
        ): Event<"|-heal|"> => ({
            args: ["-heal", toIdent(side, opt, pos), health],
            kwArgs: {from},
        });

        const statusDamageEvent = (
            side: SideID,
            health: Protocol.PokemonHPStatus,
            from: Protocol.EffectName,
            opt = smeargle,
            pos: Protocol.PositionLetter = "a",
        ): Event<"|-damage|"> => ({
            args: ["-damage", toIdent(side, opt, pos), health],
            kwArgs: {from},
        });

        describe("status damage", function () {
            it("Should handle heal", async function () {
                us.volatile.aquaring = true;
                us.hp.set(88);

                pctx = init();
                await ph.handle(
                    statusHealEvent(
                        "p1",
                        toHPStatus(100, 100),
                        toEffectName("aquaring", "move"),
                    ),
                );
                await ph.halt();
                await ph.return();
            });

            it("Should handle damage", async function () {
                us.majorStatus.afflict("tox");

                pctx = init();
                await ph.handle(
                    statusDamageEvent(
                        "p1",
                        toHPStatus(84, 100),
                        toEffectName("psn"),
                    ),
                );
                await ph.halt();
                await ph.return();
            });
        });

        const leechseedDamageEvent = (
            side: SideID,
            damage: Protocol.PokemonHPStatus,
            sourceSide: SideID,
            opt = smeargle,
            pos: Protocol.PositionLetter = "a",
            sourceOpt = smeargle,
            sourcePos: Protocol.PositionLetter = "a",
        ): Event<"|-damage|"> => ({
            args: ["-damage", toIdent(side, opt, pos), damage],
            kwArgs: {
                from: toEffectName("leechseed", "move"),
                of: toIdent(sourceSide, sourceOpt, sourcePos),
            },
        });

        const leechseedHealEvent = (
            side: SideID,
            heal: Protocol.PokemonHPStatus,
            opt = smeargle,
            pos: Protocol.PositionLetter = "a",
        ): Event<"|-heal|"> => ({
            args: ["-heal", toIdent(side, opt, pos), heal],
            kwArgs: {silent: true},
        });

        describe("leechseed", function () {
            it("Should handle", async function () {
                them.volatile.leechseed = true;
                us.hp.set(50);

                pctx = init();
                await ph.handle(
                    leechseedDamageEvent("p2", toHPStatus(95, 100), "p1"),
                );
                await ph.handle(leechseedHealEvent("p1", toHPStatus(55, 100)));
                await ph.halt();
                await ph.return();
            });

            it("Should handle heal at full hp", async function () {
                them.volatile.leechseed = true;

                pctx = init();
                await ph.handle(
                    leechseedDamageEvent("p2", toHPStatus(95, 100), "p1"),
                );
                await ph.halt();
                await ph.return();
            });

            describe("Ability on-drain (liquidooze)", function () {
                it("Should invert heal damage", async function () {
                    them.volatile.leechseed = true;
                    them.setAbility("liquidooze", "illuminate");

                    pctx = init();
                    await ph.handle({
                        args: ["-damage", toIdent("p2"), toHPStatus(95)],
                        kwArgs: {
                            from: toEffectName("leechseed", "move"),
                            of: toIdent("p1"),
                        },
                    });
                    await ph.handle({
                        args: ["-damage", toIdent("p1"), toHPStatus(95)],
                        kwArgs: {
                            from: toEffectName("liquidooze", "ability"),
                            of: toIdent("p2"),
                        },
                    });
                    await ph.halt();
                    await ph.return();
                    expect(them.traits.ability.possibleValues).to.have.keys(
                        "liquidooze",
                    );
                });

                it("Should infer no on-drain ability if it did not activate", async function () {
                    them.volatile.leechseed = true;
                    us.hp.set(50);
                    them.setAbility("liquidooze", "illuminate");

                    pctx = init();
                    await ph.handle(
                        leechseedDamageEvent("p2", toHPStatus(95, 100), "p1"),
                    );
                    await ph.handle(
                        leechseedHealEvent("p1", toHPStatus(55, 100)),
                    );
                    await ph.halt();
                    await ph.return();
                    expect(them.traits.ability.possibleValues).to.have.keys(
                        "illuminate",
                    );
                });

                it("Shouldn't infer no on-drain ability if it did not activate and ability is suppressed", async function () {
                    them.volatile.leechseed = true;
                    us.hp.set(50);
                    them.setAbility("liquidooze", "illuminate");
                    them.volatile.suppressAbility = true;

                    pctx = init();
                    await ph.handle(
                        leechseedDamageEvent("p2", toHPStatus(95, 100), "p1"),
                    );
                    await ph.handle(
                        leechseedHealEvent("p1", toHPStatus(55, 100)),
                    );
                    await ph.halt();
                    await ph.return();
                    expect(them.traits.ability.possibleValues).to.have.keys(
                        "liquidooze",
                        "illuminate",
                    );
                });
            });
        });

        const partiallytrappedDamageEvent = (
            side: SideID,
            health: Protocol.PokemonHPStatus,
            move: string,
            opt = smeargle,
            pos: Protocol.PositionLetter = "a",
        ): Event<"|-damage|"> => ({
            args: ["-damage", toIdent(side, opt, pos), health],
            kwArgs: {
                from: toEffectName(move, "move"),
                partiallytrapped: true,
            },
        });

        describe("partiallytrapped", function () {
            it("Should handle damage", async function () {
                // TODO: Implement status.

                pctx = init();
                await ph.handle(
                    partiallytrappedDamageEvent(
                        "p2",
                        toHPStatus(88, 100),
                        "bind",
                    ),
                );
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
                    kwArgs: {partiallytrapped: true},
                });
                await ph.halt();
                await ph.return();
            });
        });

        const uproarUpkeepEvent = (
            side: SideID,
            opt = smeargle,
            pos: Protocol.PositionLetter = "a",
        ): Event<"|-start|"> => ({
            args: ["-start", toIdent(side, opt, pos), toMoveName("uproar")],
            kwArgs: {upkeep: true},
        });

        describe("uproar", function () {
            it("Should handle uproar", async function () {
                them.volatile.uproar.start();

                pctx = init();
                await ph.handle(uproarUpkeepEvent("p2"));
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

        const statusEndEvent = (
            side: SideID,
            name: string,
            opt = smeargle,
            pos: Protocol.PositionLetter = "a",
        ): Event<"|-end|"> => ({
            args: ["-end", toIdent(side, opt, pos), toEffectName(name, "move")],
            kwArgs: {},
        });

        describe("status end", function () {
            it("Should end status", async function () {
                us.volatile.taunt.start();

                pctx = init();
                await ph.handle(statusEndEvent("p1", "taunt"));
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
                await ph.halt();
                await ph.return();
                expect(them.traits.ability.possibleValues).to.have.keys(
                    "illuminate",
                );
            });

            it("Should infer weather-suppressant effects if weather-based ability immunity didn't activate", async function () {
                state.status.weather.start(null /*source*/, "SunnyDay");
                us.setAbility("cloudnine", "illuminate");
                them.volatile.yawn.start();
                them.setAbility("leafguard", "illuminate");

                pctx = init();
                await ph.handle(upkeepEvent("SunnyDay"));
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
                // Either us=cloudnine given them=leafguard, or just
                // us=illuminate.
                expect(us.traits.ability.possibleValues).to.have.keys(
                    "cloudnine",
                    "illuminate",
                );
                expect(them.traits.ability.possibleValues).to.have.keys(
                    "leafguard",
                    "illuminate",
                );
                // Collapse inference.
                them.traits.ability.narrow("leafguard");
                expect(us.traits.ability.possibleValues).to.have.keys(
                    "cloudnine",
                );
            });

            it("Should infer no weather-suppressant effects if blocked via weather-based ability immunity", async function () {
                state.status.weather.start(null /*source*/, "SunnyDay");
                us.setAbility("cloudnine", "illuminate");
                them.volatile.yawn.start();
                them.setAbility("leafguard", "illuminate");

                pctx = init();
                await ph.handle(upkeepEvent("SunnyDay"));
                await ph.handle({
                    args: ["-end", toIdent("p2"), toEffectName("yawn", "move")],
                    kwArgs: {silent: true},
                });
                await ph.halt();
                await ph.return();
                expect(us.traits.ability.possibleValues).to.have.keys(
                    "illuminate",
                );
                expect(them.traits.ability.possibleValues).to.have.keys(
                    "leafguard",
                );
            });
        });

        describe("futuremove", function () {
            it("Should handle move damage", async function () {
                state.getTeam("p2").status.futureMoves.futuresight.start();

                pctx = init();
                await ph.handle(statusEndEvent("p1", "futuresight"));
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
                state.getTeam("p2").status.futureMoves.doomdesire.start();
                us.setItem("sitrusberry");

                pctx = init();
                await ph.handle(statusEndEvent("p1", "doomdesire"));
                await ph.handle({
                    args: ["-damage", toIdent("p1"), toHPStatus("faint")],
                    kwArgs: {},
                });
                await ph.handle({args: ["faint", toIdent("p1")], kwArgs: {}});
                await ph.halt();
                await ph.return();
            });
        });

        const perishEvent = (
            side: SideID,
            count: number,
            opt = smeargle,
            pos: Protocol.PositionLetter = "a",
        ): Event<"|-start|"> => ({
            args: [
                "-start",
                toIdent(side, opt, pos),
                toEffectName(`perish${count}`),
            ],
            kwArgs: {},
        });

        describe("perishsong", function () {
            it("Should handle count", async function () {
                us.volatile.perish = 2;

                pctx = init();
                await ph.handle(perishEvent("p1", 1));
                await ph.halt();
                await ph.return();
            });

            it("Should handle faint due to count", async function () {
                us.volatile.perish = 1;

                pctx = init();
                await ph.handle(perishEvent("p1", 0));
                await ph.handle({args: ["faint", toIdent("p1")], kwArgs: {}});
                await ph.halt();
                await ph.return();
            });
        });

        const fatigueEvent = (
            side: SideID,
            opt = smeargle,
            pos: Protocol.PositionLetter = "a",
        ): Event<"|-start|"> => ({
            args: [
                "-start",
                toIdent(side, opt, pos),
                toEffectName("confusion"),
            ],
            kwArgs: {fatigue: true},
        });

        describe("lockedmove fatigue", function () {
            it("Should handle", async function () {
                us.volatile.lockedMove.start("thrash");

                pctx = init();
                await ph.handle(fatigueEvent("p1"));
                await ph.halt();
                await ph.return();
            });
        });

        describe("ability", function () {
            it("Shouldn't infer no on-residual ability if it did not activate and ability is suppressed", async function () {
                them.setAbility("speedboost", "illuminate");
                them.volatile.suppressAbility = true;

                pctx = init();
                await ph.halt();
                await ph.return();
                expect(them.traits.ability.possibleValues).to.have.keys(
                    "speedboost",
                    "illuminate",
                );
            });

            describe("DamageIfStatus (Bad Dreams)", function () {
                it("Should handle", async function () {
                    us.setAbility("baddreams");
                    them.majorStatus.afflict("slp");

                    pctx = init();
                    await ph.handle({
                        args: [
                            "-damage",
                            toIdent("p2"),
                            toHPStatus(88, 100, "slp"),
                        ],
                        kwArgs: {
                            from: toEffectName("baddreams", "ability"),
                            of: toIdent("p1"),
                        },
                    });
                    await ph.halt();
                    await ph.return();
                });

                it("Should not handle if no status", async function () {
                    us.setAbility("baddreams");

                    pctx = init();
                    await ph.halt();
                    await ph.return();
                });
            });

            describe("Cure (Shed Skin)", function () {
                it("Should handle", async function () {
                    us.setAbility("shedskin");
                    us.majorStatus.afflict("par");

                    pctx = init();
                    await ph.handle({
                        args: [
                            "-activate",
                            toIdent("p1"),
                            toEffectName("shedskin", "ability"),
                        ],
                        kwArgs: {},
                    });
                    await ph.handle({
                        args: ["-curestatus", toIdent("p1"), "par"],
                        kwArgs: {msg: true},
                    });
                    await ph.halt();
                    await ph.return();
                });

                it("Should allow no activation due to chance", async function () {
                    us.setAbility("shedskin");
                    us.majorStatus.afflict("par");

                    pctx = init();
                    await ph.halt();
                    await ph.return();
                });
            });

            describe("Boost (Speed Boost)", function () {
                it("Should handle", async function () {
                    us.setAbility("speedboost");

                    pctx = init();
                    await ph.handle({
                        args: [
                            "-ability",
                            toIdent("p1"),
                            toAbilityName("speedboost"),
                            "boost",
                        ],
                        kwArgs: {},
                    });
                    await ph.handle({
                        args: ["-boost", toIdent("p1"), "spe", toNum(1)],
                        kwArgs: {},
                    });
                    await ph.halt();
                    await ph.return();
                });

                it("Should not handle if boost already maxed out", async function () {
                    us.setAbility("speedboost");
                    us.volatile.boosts.spe = 6;

                    pctx = init();
                    await ph.halt();
                    await ph.return();
                });
            });
        });

        describe("item", function () {
            describe("Item-ignoring ability (klutz)", function () {
                const micleEvent: Event = {
                    args: ["-enditem", toIdent("p2"), toItemName("micleberry")],
                    kwArgs: {eat: true},
                };

                it("Should infer no klutz if item activated", async function () {
                    them.hp.set(1);
                    them.setAbility("klutz", "illuminate");

                    pctx = init();
                    await ph.handle(micleEvent);
                    await ph.halt();
                    await ph.return();
                    expect(them.item.possibleValues).to.have.keys("none");
                    expect(them.lastItem.possibleValues).to.have.keys(
                        "micleberry",
                    );
                    expect(them.traits.ability.possibleValues).to.have.keys(
                        "illuminate",
                    );
                });

                it("Shouldn't infer klutz if suppressed and item activates", async function () {
                    them.hp.set(1);
                    them.setAbility("klutz");
                    them.volatile.suppressAbility = true;

                    pctx = init();
                    await ph.handle(micleEvent);
                    await ph.halt();
                    await ph.return();
                    expect(them.item.possibleValues).to.have.keys("none");
                    expect(them.lastItem.possibleValues).to.have.keys(
                        "micleberry",
                    );
                    expect(them.traits.ability.possibleValues).to.have.keys(
                        "klutz",
                    );
                });

                it("Should infer no item if klutz suppressed and item doesn't activate", async function () {
                    them.hp.set(1);
                    them.setAbility("klutz");
                    them.volatile.suppressAbility = true;

                    pctx = init();
                    await ph.halt();
                    await ph.return();
                    expect(them.item.possibleValues).to.not.have.keys(
                        "micleberry",
                    );
                });
            });

            describe("PoisonDamage/NoPoisonDamage (blacksludge)", function () {
                it("Should have poison effect if poison type", async function () {
                    them.hp.set(90);
                    them.volatile.changeTypes(["poison", "???"]);

                    pctx = init();
                    await ph.handle(
                        statusHealEvent(
                            "p2",
                            toHPStatus(100, 100),
                            toEffectName("blacksludge", "item"),
                        ),
                    );
                    await ph.halt();
                    await ph.return();
                });

                it("Should have noPoison effect if not poison type", async function () {
                    pctx = init();
                    await ph.handle(
                        statusDamageEvent(
                            "p2",
                            toHPStatus(88, 100),
                            toEffectName("blacksludge", "item"),
                        ),
                    );
                    await ph.halt();
                    await ph.return();
                });
            });

            describe("Damage (stickybarb)", function () {
                const stickybarbEvent = statusDamageEvent(
                    "p2",
                    toHPStatus(94, 100),
                    toEffectName("stickybarb", "item"),
                );

                it("Should handle", async function () {
                    expect(them.item.possibleValues).to.include.keys(
                        "stickybarb",
                    );

                    pctx = init();
                    await ph.handle(stickybarbEvent);
                    await ph.halt();
                    await ph.return();
                    expect(them.item.possibleValues).to.have.keys("stickybarb");
                });

                it("Should infer no magicguard if damaged", async function () {
                    them.setAbility("magicguard", "illuminate");
                    expect(them.item.possibleValues).to.include.keys(
                        "stickybarb",
                    );

                    pctx = init();
                    await ph.handle(stickybarbEvent);
                    await ph.halt();
                    await ph.return();
                    expect(them.item.possibleValues).to.have.keys("stickybarb");
                    expect(them.traits.ability.possibleValues).to.have.keys(
                        "illuminate",
                    );
                });

                it("Shouldn't infer no magicguard if damaged and ability suppressed", async function () {
                    them.setAbility("magicguard", "illuminate");
                    them.volatile.suppressAbility = true;
                    expect(them.item.possibleValues).to.include.keys(
                        "stickybarb",
                    );

                    pctx = init();
                    await ph.handle(stickybarbEvent);
                    await ph.halt();
                    await ph.return();
                    expect(them.item.possibleValues).to.have.keys("stickybarb");
                    expect(them.traits.ability.possibleValues).to.have.keys(
                        "magicguard",
                        "illuminate",
                    );
                });
            });

            describe("Status (flameorb)", function () {
                it("Should handle status effect", async function () {
                    expect(them.item.possibleValues).to.include.keys(
                        "flameorb",
                    );

                    pctx = init();
                    await ph.handle({
                        args: ["-status", toIdent("p2"), "brn"],
                        kwArgs: {from: toEffectName("flameorb", "item")},
                    });
                    await ph.halt();
                    await ph.return();
                    expect(them.item.possibleValues).to.have.keys("flameorb");
                });

                it("Should not handle if already statused", async function () {
                    us.setItem("flameorb");
                    us.majorStatus.afflict("frz");

                    pctx = init();
                    await ph.halt();
                    await ph.return();
                });

                describe("ability immunity (waterveil)", function () {
                    it("Should not handle status effect if ability immunity", async function () {
                        us.setAbility("waterveil");
                        us.setItem("flameorb");

                        pctx = init();
                        await ph.halt();
                        await ph.return();
                    });
                    // TODO: Include magicguard/other tests?
                });

                describe("weather-based ability immunity (leafguard)", function () {
                    it("Should not handle status effect if weather-based ability immunity", async function () {
                        state.status.weather.start(null /*source*/, "SunnyDay");
                        us.setAbility("leafguard");
                        us.setItem("flameorb");

                        pctx = init();
                        await ph.handle(upkeepEvent("SunnyDay"));
                        await ph.halt();
                        await ph.return();
                    });

                    it("Should infer opponent has weather-blocking ability if holder has weather-based ability immunity and item activated", async function () {
                        state.status.weather.start(null /*source*/, "SunnyDay");
                        us.setAbility("leafguard");
                        us.setItem("flameorb");
                        them.setAbility("cloudnine", "illuminate");

                        pctx = init();
                        await ph.handle(upkeepEvent("SunnyDay"));
                        await ph.handle({
                            args: ["-status", toIdent("p1"), "brn"],
                            kwArgs: {from: toEffectName("flameorb", "item")},
                        });
                        await ph.halt();
                        await ph.return();
                        expect(them.traits.ability.possibleValues).to.have.keys(
                            "cloudnine",
                        );
                    });
                });
            });

            describe("HP threshold (micleberry)", function () {
                it("Should handle implicit effect", async function () {
                    us.hp.set(1);
                    expect(us.volatile.micleberry).to.be.false;

                    pctx = init();
                    await ph.handle({
                        args: [
                            "-enditem",
                            toIdent("p1"),
                            toItemName("micleberry"),
                        ],
                        kwArgs: {eat: true},
                    });
                    await ph.halt();
                    await ph.return();
                    expect(us.volatile.micleberry).to.be.true;
                });
            });
        });

        describe("multiple effects", function () {
            it("Should handle multiple sparse effects in order", async function () {
                us.setItem("leftovers");
                us.hp.set(90);
                them.majorStatus.afflict("tox");

                pctx = init();
                await ph.handle(
                    statusDamageEvent(
                        "p2",
                        toHPStatus(90, 100, "tox"),
                        toEffectName("psn"),
                    ),
                );
                await ph.handle(
                    statusHealEvent(
                        "p1",
                        toHPStatus(95, 100),
                        toEffectName("leftovers", "item"),
                    ),
                );
                await ph.halt();
                await ph.return();
            });

            it("Should allow early silent leftovers check", async function () {
                us.setItem("leftovers");
                us.majorStatus.afflict("slp");
                them.setAbility("baddreams");

                pctx = init();
                // In this case p1.speed > p2.speed, so leftovers gets checked
                // first then the opponent's ability is checked.
                await ph.handle({
                    args: [
                        "-damage",
                        toIdent("p1"),
                        toHPStatus(95, 100, "slp"),
                    ],
                    kwArgs: {
                        from: toEffectName("baddreams", "ability"),
                        of: toIdent("p2"),
                    },
                });
                await ph.halt();
                await ph.return();
            });

            it("Should allow late silent leftovers check", async function () {
                us.setItem("leftovers");
                us.hp.set(95);
                them.volatile.leechseed = true;

                pctx = init();
                await ph.handle(
                    leechseedDamageEvent("p2", toHPStatus(95, 100), "p1"),
                );
                await ph.handle(leechseedHealEvent("p1", toHPStatus(100, 100)));
                // In this case p1.speed < p2.speed, so leftovers gets checked
                // after the opponent's leechseed status is checked.
                await ph.halt();
                await ph.return();
            });

            it("Should allow late leftovers check", async function () {
                us.setItem("leftovers");
                us.majorStatus.afflict("slp");
                them.setAbility("baddreams");

                pctx = init();
                await ph.handle({
                    args: [
                        "-damage",
                        toIdent("p1"),
                        toHPStatus(95, 100, "slp"),
                    ],
                    kwArgs: {
                        from: toEffectName("baddreams", "ability"),
                        of: toIdent("p2"),
                    },
                });
                // In this case p1.speed < p2.speed, so leftovers gets checked
                // after the opponent's ability is checked.
                await ph.handle(
                    statusHealEvent(
                        "p1",
                        toHPStatus(100, 100, "slp"),
                        toEffectName("leftovers"),
                    ),
                );
                await ph.halt();
                await ph.return();
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
                // Even though leftovers should still be parsed, since we
                // reached a game-over state the game will instead end
                // prematurely. Instead we leave the parsers enabled but disable
                // their on-reject inferences.
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
                    damageEvent(
                        "Hail",
                        "p1",
                        undefined,
                        undefined,
                        toHPStatus(50),
                    ),
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
                    args: [
                        "-enditem",
                        toIdent("p1"),
                        toItemName("sitrusberry"),
                    ],
                    kwArgs: {eat: true},
                });
                await ph.handle({
                    args: ["-heal", toIdent("p1"), toHPStatus(65)],
                    kwArgs: {from: toEffectName("sitrusberry", "item")},
                });
                // TODO: Test on-update ability activation
            });

            it("Should handle all effects in the correct order", async function () {
                state.status.weather.start(null /*source*/, "Hail");
                state.status.gravity.start();
                state.status.trickroom.start();

                for (const name of sideEndKeys) {
                    us.team!.status[name].start();
                    them.team!.status[name].start();
                }
                us.team!.status.futureMoves.futuresight.start();
                them.team!.status.wish.start();
                them.team!.status.futureMoves.doomdesire.start();

                [, us] = sh.initTeam("p1", [ditto, smeargle]);
                us.hp.set(50);
                us.volatile.ingrain = true;
                us.volatile.aquaring = true;
                us.setAbility("speedboost");
                us.setItem("blacksludge");
                us.volatile.leechseed = true;
                us.majorStatus.afflict("slp");
                us.volatile.nightmare = true;
                us.volatile.curse = true;
                // TODO: Add partiallytrapped status.
                us.volatile.disableMove("tackle");
                us.volatile.encoreMove("ember");
                us.volatile.taunt.start();
                us.volatile.magnetrise.start();
                us.volatile.healblock.start();
                // Note: Embargo blocks items and ends after blacksludge check.
                us.volatile.yawn.start();
                us.volatile.perish = 3;
                us.volatile.slowstart.start();
                us.volatile.lockedMove.start("thrash");

                [, them] = sh.initTeam("p2", [ditto, smeargle]);
                them.hp.set(50);
                them.volatile.ingrain = true;
                them.volatile.aquaring = true;
                them.volatile.leechseed = true;
                them.majorStatus.afflict("tox");
                them.volatile.curse = true;
                // TODO: Add partiallytrapped status.
                them.setAbility("baddreams");
                them.volatile.uproar.start();
                them.volatile.disableMove("tackle");
                them.volatile.encoreMove("ember");
                them.volatile.taunt.start();
                them.volatile.magnetrise.start();
                them.volatile.healblock.start();
                // Note: Embargo blocks items but ends before stickybarb check.
                them.volatile.embargo.start();
                them.volatile.yawn.start();
                them.setItem("stickybarb");
                them.volatile.perish = 2;
                them.volatile.slowstart.start();
                them.volatile.lockedMove.start("outrage");

                pctx = init();
                let flip = true;
                for (const name of sideEndKeys) {
                    // Note: Order is random within each order group since
                    // there's no speed stat or sub-order to consider.
                    if ((flip = !flip)) {
                        await ph.handle(sideEndEvent("p2", "player2", name));
                        await ph.handle(sideEndEvent("p1", "player1", name));
                    } else {
                        await ph.handle(sideEndEvent("p1", "player1", name));
                        await ph.handle(sideEndEvent("p2", "player2", name));
                    }
                }
                await ph.handle(wishEvent("p2", ditto.species));
                await ph.handle(upkeepEvent("Hail"));
                await ph.handle(
                    damageEvent(
                        "Hail",
                        "p1",
                        undefined,
                        undefined,
                        toHPStatus(80, 100, "slp"),
                    ),
                );
                await ph.handle(
                    damageEvent(
                        "Hail",
                        "p2",
                        undefined,
                        undefined,
                        toHPStatus(80, 100, "tox"),
                    ),
                );
                await ph.handle(fieldEndEvent("gravity"));
                // Note: Order group 10 has several sub-order groups, and the
                // group itself is sorted in speed order before handling
                // sub-order.
                // Speed group p1:
                await ph.handle(
                    statusHealEvent(
                        "p1",
                        toHPStatus(85, 100, "slp"),
                        toEffectName("ingrain", "move"),
                    ),
                );
                await ph.handle(
                    statusHealEvent(
                        "p1",
                        toHPStatus(90, 100, "slp"),
                        toEffectName("aquaring", "move"),
                    ),
                );
                await ph.handle({
                    args: [
                        "-ability",
                        toIdent("p1"),
                        toAbilityName("speedboost"),
                        "boost",
                    ],
                    kwArgs: {},
                });
                await ph.handle({
                    args: ["-boost", toIdent("p1"), "spe", toNum(1)],
                    kwArgs: {},
                });
                await ph.handle(
                    statusDamageEvent(
                        "p1",
                        toHPStatus(85, 100, "slp"),
                        toEffectName("blacksludge", "item"),
                    ),
                );
                await ph.handle(
                    leechseedDamageEvent(
                        "p1",
                        toHPStatus(80, 100, "slp"),
                        "p2",
                    ),
                );
                await ph.handle(
                    leechseedHealEvent("p2", toHPStatus(85, 100, "tox")),
                );
                await ph.handle(
                    statusDamageEvent(
                        "p1",
                        toHPStatus(75, 100, "slp"),
                        toEffectName("nightmare", "move"),
                    ),
                );
                await ph.handle(
                    statusDamageEvent(
                        "p1",
                        toHPStatus(70, 100, "slp"),
                        toEffectName("curse", "move"),
                    ),
                );
                await ph.handle(
                    partiallytrappedDamageEvent(
                        "p1",
                        toHPStatus(65, 100, "slp"),
                        "firespin",
                    ),
                );
                await ph.handle(statusEndEvent("p1", "disable"));
                await ph.handle(statusEndEvent("p1", "encore"));
                await ph.handle(statusEndEvent("p1", "taunt"));
                await ph.handle(statusEndEvent("p1", "magnetrise"));
                await ph.handle(statusEndEvent("p1", "healblock"));
                await ph.handle(statusEndEvent("p1", "yawn"));
                // Speed group p2:
                await ph.handle(
                    statusHealEvent(
                        "p2",
                        toHPStatus(90, 100, "tox"),
                        toEffectName("ingrain", "move"),
                    ),
                );
                await ph.handle(
                    statusHealEvent(
                        "p2",
                        toHPStatus(95, 100, "tox"),
                        toEffectName("aquaring", "move"),
                    ),
                );
                await ph.handle(
                    leechseedDamageEvent(
                        "p2",
                        toHPStatus(90, 100, "tox"),
                        "p1",
                    ),
                );
                await ph.handle(
                    leechseedHealEvent("p1", toHPStatus(70, 100, "slp")),
                );
                await ph.handle(
                    statusDamageEvent(
                        "p2",
                        toHPStatus(85, 100, "tox"),
                        toEffectName("psn"),
                    ),
                );
                await ph.handle(
                    statusDamageEvent(
                        "p2",
                        toHPStatus(80, 100, "tox"),
                        toEffectName("curse", "move"),
                    ),
                );
                await ph.handle(
                    partiallytrappedDamageEvent(
                        "p2",
                        toHPStatus(75, 100, "tox"),
                        "sandtomb",
                    ),
                );
                await ph.handle({
                    args: [
                        "-damage",
                        toIdent("p1"),
                        toHPStatus(65, 100, "slp"),
                    ],
                    kwArgs: {
                        from: toEffectName("baddreams", "ability"),
                        of: toIdent("p2"),
                    },
                });
                await ph.handle(uproarUpkeepEvent("p2"));
                await ph.handle(statusEndEvent("p2", "disable"));
                await ph.handle(statusEndEvent("p2", "encore"));
                await ph.handle(statusEndEvent("p2", "taunt"));
                await ph.handle(statusEndEvent("p2", "magnetrise"));
                await ph.handle(statusEndEvent("p2", "healblock"));
                await ph.handle(statusEndEvent("p2", "embargo"));
                await ph.handle(statusEndEvent("p2", "yawn"));
                await ph.handle(
                    statusDamageEvent(
                        "p2",
                        toHPStatus(70, 100, "tox"),
                        toEffectName("stickybarb", "item"),
                    ),
                );
                // End order group 10.
                await ph.handle(statusEndEvent("p1", "doomdesire"));
                await ph.handle({
                    args: [
                        "-damage",
                        toIdent("p1"),
                        toHPStatus(60, 100, "slp"),
                    ],
                    kwArgs: {},
                });
                await ph.handle(statusEndEvent("p2", "futuresight"));
                await ph.handle({
                    args: [
                        "-damage",
                        toIdent("p2"),
                        toHPStatus(65, 100, "tox"),
                    ],
                    kwArgs: {},
                });
                await ph.handle(perishEvent("p1", 2));
                await ph.handle(perishEvent("p2", 1));
                await ph.handle(fieldEndEvent("trickroom"));
                await ph.handle(statusEndEvent("p1", "slowstart"));
                await ph.handle(statusEndEvent("p2", "slowstart"));
                await ph.handle(fatigueEvent("p1"));
                await ph.handle(fatigueEvent("p2"));
                await ph.halt();
                await ph.return();

                expect(state.status.weather.isActive).to.be.true;
                expect(state.status.gravity.isActive).to.be.false;
                expect(state.status.trickroom.isActive).to.be.false;

                for (const name of sideEndKeys) {
                    expect(us.team!.status[name].isActive).to.be.false;
                    expect(them.team!.status[name].isActive).to.be.false;
                }
                expect(them.team!.status.wish.isActive).to.be.false;
            });

            it("Should handle speed ties", async function () {
                [, us] = sh.initTeam("p1", [ditto, smeargle]);
                us.hp.set(50);
                us.volatile.ingrain = true;
                us.volatile.aquaring = true;
                us.setAbility("speedboost");
                us.setItem("blacksludge");
                us.volatile.leechseed = true;
                us.majorStatus.afflict("slp");
                us.volatile.nightmare = true;
                us.volatile.curse = true;
                // TODO: Add partiallytrapped status.
                us.volatile.disableMove("tackle");
                us.volatile.encoreMove("ember");
                us.volatile.taunt.start();
                us.volatile.magnetrise.start();
                us.volatile.healblock.start();
                // Note: Embargo blocks items and ends after blacksludge check.
                us.volatile.yawn.start();

                [, them] = sh.initTeam("p2", [ditto, smeargle]);
                them.hp.set(50);
                them.volatile.ingrain = true;
                them.volatile.aquaring = true;
                them.volatile.leechseed = true;
                them.majorStatus.afflict("tox");
                them.volatile.curse = true;
                // TODO: Add partiallytrapped status.
                them.setAbility("baddreams");
                them.volatile.uproar.start();
                them.volatile.disableMove("tackle");
                them.volatile.encoreMove("ember");
                them.volatile.taunt.start();
                them.volatile.magnetrise.start();
                them.volatile.healblock.start();
                // Note: Embargo blocks items but ends before stickybarb check.
                them.volatile.embargo.start();
                them.volatile.yawn.start();
                them.setItem("stickybarb");

                pctx = init();
                // Note: Since p1 and p2 are speed tied, each sub-order group is
                // parsed separately, with both sides parsing in any order.
                await ph.handle(
                    statusHealEvent(
                        "p1",
                        toHPStatus(55, 100, "slp"),
                        toEffectName("ingrain", "move"),
                    ),
                );
                await ph.handle(
                    statusHealEvent(
                        "p2",
                        toHPStatus(55, 100, "tox"),
                        toEffectName("ingrain", "move"),
                    ),
                );
                await ph.handle(
                    statusHealEvent(
                        "p2",
                        toHPStatus(60, 100, "tox"),
                        toEffectName("aquaring", "move"),
                    ),
                );
                await ph.handle(
                    statusHealEvent(
                        "p1",
                        toHPStatus(60, 100, "slp"),
                        toEffectName("aquaring", "move"),
                    ),
                );
                await ph.handle({
                    args: [
                        "-ability",
                        toIdent("p1"),
                        toAbilityName("speedboost"),
                        "boost",
                    ],
                    kwArgs: {},
                });
                await ph.handle({
                    args: ["-boost", toIdent("p1"), "spe", toNum(1)],
                    kwArgs: {},
                });
                await ph.handle(
                    statusDamageEvent(
                        "p1",
                        toHPStatus(55, 100, "slp"),
                        toEffectName("blacksludge", "item"),
                    ),
                );
                await ph.handle(
                    leechseedDamageEvent(
                        "p2",
                        toHPStatus(55, 100, "tox"),
                        "p1",
                    ),
                );
                await ph.handle(
                    leechseedHealEvent("p1", toHPStatus(60, 100, "slp")),
                );
                await ph.handle(
                    leechseedDamageEvent(
                        "p1",
                        toHPStatus(55, 100, "slp"),
                        "p2",
                    ),
                );
                await ph.handle(
                    leechseedHealEvent("p2", toHPStatus(60, 100, "tox")),
                );
                await ph.handle(
                    statusDamageEvent(
                        "p2",
                        toHPStatus(55, 100, "tox"),
                        toEffectName("psn"),
                    ),
                );
                await ph.handle(
                    statusDamageEvent(
                        "p1",
                        toHPStatus(50, 100, "slp"),
                        toEffectName("nightmare", "move"),
                    ),
                );
                await ph.handle(
                    statusDamageEvent(
                        "p2",
                        toHPStatus(50, 100, "tox"),
                        toEffectName("curse", "move"),
                    ),
                );
                await ph.handle(
                    statusDamageEvent(
                        "p1",
                        toHPStatus(45, 100, "slp"),
                        toEffectName("curse", "move"),
                    ),
                );
                await ph.handle(
                    partiallytrappedDamageEvent(
                        "p1",
                        toHPStatus(40, 100, "slp"),
                        "firespin",
                    ),
                );
                await ph.handle(
                    partiallytrappedDamageEvent(
                        "p2",
                        toHPStatus(45, 100, "tox"),
                        "sandtomb",
                    ),
                );
                await ph.handle({
                    args: [
                        "-damage",
                        toIdent("p1"),
                        toHPStatus(35, 100, "slp"),
                    ],
                    kwArgs: {
                        from: toEffectName("baddreams", "ability"),
                        of: toIdent("p2"),
                    },
                });
                await ph.handle(uproarUpkeepEvent("p2"));
                await ph.handle(statusEndEvent("p2", "disable"));
                await ph.handle(statusEndEvent("p1", "disable"));
                await ph.handle(statusEndEvent("p1", "encore"));
                await ph.handle(statusEndEvent("p2", "encore"));
                await ph.handle(statusEndEvent("p1", "taunt"));
                await ph.handle(statusEndEvent("p2", "taunt"));
                await ph.handle(statusEndEvent("p2", "magnetrise"));
                await ph.handle(statusEndEvent("p1", "magnetrise"));
                await ph.handle(statusEndEvent("p1", "healblock"));
                await ph.handle(statusEndEvent("p2", "healblock"));
                await ph.handle(statusEndEvent("p2", "embargo"));
                await ph.handle(statusEndEvent("p2", "yawn"));
                await ph.handle(statusEndEvent("p1", "yawn"));
                await ph.handle(
                    statusDamageEvent(
                        "p2",
                        toHPStatus(40, 100, "tox"),
                        toEffectName("stickybarb", "item"),
                    ),
                );
                await ph.halt();
                await ph.return();
            });

            it("Should handle sparse speed tie", async function () {
                [, us] = sh.initTeam("p1", [ditto, smeargle]);
                us.hp.set(50);
                us.volatile.ingrain = true;
                us.volatile.aquaring = true;
                them.volatile.disableMove("ember");
                them.volatile.encoreMove("tackle");

                [, them] = sh.initTeam("p2", [ditto, smeargle]);
                them.volatile.disableMove("ember");

                pctx = init();
                // Note: Since p1 and p2 are speed tied, each sub-order group is
                // parsed separately, with both sides parsing in any order.
                await ph.handle(
                    statusHealEvent(
                        "p1",
                        toHPStatus(55, 100),
                        toEffectName("ingrain", "move"),
                    ),
                );
                await ph.handle(
                    statusHealEvent(
                        "p1",
                        toHPStatus(60, 100),
                        toEffectName("aquaring", "move"),
                    ),
                );
                await ph.handle(statusEndEvent("p1", "disable"));
                await ph.handle(statusEndEvent("p2", "disable"));
                await ph.handle(statusEndEvent("p1", "encore"));
                await ph.halt();
                await ph.return();
            });
        });
    });
