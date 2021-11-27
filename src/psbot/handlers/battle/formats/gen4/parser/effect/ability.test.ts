import {Protocol} from "@pkmn/protocol";
import {SideID} from "@pkmn/types";
import {expect} from "chai";
import "mocha";
import {Event} from "../../../../../../parser";
import * as dex from "../../dex";
import {BattleState} from "../../state/BattleState";
import {Pokemon} from "../../state/Pokemon";
import {SwitchOptions} from "../../state/Team";
import {
    castform,
    castformrainy,
    smeargle,
} from "../../state/switchOptions.test";
import {createInitialContext} from "../Context.test";
import {ParserHelpers} from "../ParserHelpers.test";
import {
    setupUnorderedParser,
    toAbilityName,
    toEffectName,
    toHPStatus,
    toIdent,
    toItemName,
    toMoveName,
    toNum,
    toSpeciesName,
    toTypes,
    toWeather,
} from "../helpers.test";
import * as reason from "../reason";
import * as effectAbility from "./ability";

export const test = () =>
    describe("ability", function () {
        const ictx = createInitialContext();
        const {sh} = ictx;

        let state: BattleState;

        beforeEach("Extract BattleState", function () {
            state = ictx.getState();
        });

        // Can have damp (explosive-blocking ability).
        const golduck: SwitchOptions = {
            species: "golduck",
            level: 100,
            gender: "M",
            hp: 100,
            hpMax: 100,
        };

        // Can have clearbody or liquidooze.
        const tentacruel: SwitchOptions = {
            species: "tentacruel",
            level: 50,
            gender: "M",
            hp: 100,
            hpMax: 100,
        };

        describe("onSwitchOut()", function () {
            const init = setupUnorderedParser(
                ictx.startArgs,
                effectAbility.onSwitchOut,
            );
            let pctx: ReturnType<typeof init> | undefined;
            const ph = new ParserHelpers(() => pctx);

            afterEach("Close ParserContext", async function () {
                // Reset variable so it doesn't leak into other tests.
                await ph.close().finally(() => (pctx = undefined));
            });

            // Can have naturalcure.
            const starmie: SwitchOptions = {
                species: "starmie",
                level: 50,
                gender: "N",
                hp: 100,
                hpMax: 100,
            };

            it("Should infer no on-switchOut ability if it did not activate", async function () {
                sh.initActive("p1");
                // Can have naturalcure.
                const mon = sh.initActive("p2", starmie);
                mon.majorStatus.afflict("tox"); // Required for this ability.
                expect(mon.traits.ability.possibleValues).to.have.keys(
                    "illuminate",
                    "naturalcure",
                );

                pctx = init("p2");
                await ph.halt();
                await ph.return([]);
                expect(mon.traits.ability.possibleValues).to.have.keys(
                    "illuminate",
                );
            });

            it("Shouldn't infer no on-switchOut ability if it did not activate and ability is suppressed", async function () {
                // Can have naturalcure.
                sh.initActive("p1");
                const mon = sh.initActive("p2", starmie);
                mon.majorStatus.afflict("tox");
                mon.volatile.suppressAbility = true;
                expect(mon.traits.ability.possibleValues).to.have.keys(
                    "illuminate",
                    "naturalcure",
                );

                pctx = init("p2");
                await ph.halt();
                await ph.return([]);
                expect(mon.traits.ability.possibleValues).to.have.keys(
                    "illuminate",
                    "naturalcure",
                );
            });

            describe("Cure (naturalcure)", function () {
                it("Should cure status", async function () {
                    sh.initActive("p1");
                    const mon = sh.initActive("p2", starmie);
                    mon.majorStatus.afflict("brn");

                    pctx = init("p2");
                    await ph.handle({
                        args: ["-curestatus", toIdent("p2", starmie), "brn"],
                        kwArgs: {from: toEffectName("naturalcure", "ability")},
                    });
                    await ph.halt();
                    await ph.return([undefined]);
                    expect(mon.majorStatus.current).to.be.null;
                });
            });
        });

        describe("onStart()", function () {
            const init = setupUnorderedParser(
                ictx.startArgs,
                effectAbility.onStart,
            );
            let pctx: ReturnType<typeof init> | undefined;
            const ph = new ParserHelpers(() => pctx);

            afterEach("Close ParserContext", async function () {
                await ph.close().finally(() => (pctx = undefined));
            });

            // Can have forewarn.
            const hypno: SwitchOptions = {
                species: "hypno",
                level: 30,
                gender: "M",
                hp: 100,
                hpMax: 100,
            };

            it("Should infer no on-start ability if it did not activate", async function () {
                sh.initActive("p1");
                const mon = sh.initActive("p2", hypno);
                expect(mon.traits.ability.possibleValues).to.have.keys(
                    "insomnia",
                    "forewarn",
                );

                pctx = init("p2");
                await ph.halt();
                await ph.return([]);
                expect(mon.traits.ability.possibleValues).to.have.keys(
                    "insomnia",
                );
            });

            it("Shouldn't infer no on-start ability if it did not activate and ability is suppressed", async function () {
                sh.initActive("p1");
                const mon = sh.initActive("p2", hypno);
                mon.volatile.suppressAbility = true;
                expect(mon.traits.ability.possibleValues).to.have.keys(
                    "insomnia",
                    "forewarn",
                );

                pctx = init("p2");
                await ph.halt();
                await ph.return([]);
                expect(mon.traits.ability.possibleValues).to.have.keys(
                    "insomnia",
                    "forewarn",
                );
            });

            describe("Anticipate (Anticipation)", function () {
                it("Should handle", async function () {
                    sh.initActive("p1").moveset.reveal("icebeam");
                    const mon = sh.initActive("p2");
                    mon.setAbility("anticipation");
                    mon.volatile.changeTypes(["grass", "???"]);

                    pctx = init("p2");
                    await ph.handle({
                        args: [
                            "-ability",
                            toIdent("p2"),
                            toAbilityName("anticipation"),
                        ],
                        kwArgs: {},
                    });
                    await ph.halt();
                    await ph.return([undefined]);
                });

                // TODO: Implement all activation conditions before supporting
                // any assertions for this ability.
                it("Should allow no activation", async function () {
                    sh.initActive("p1").moveset.reveal("icebeam");
                    const mon = sh.initActive("p2");
                    mon.setAbility("anticipation");
                    mon.volatile.changeTypes(["grass", "???"]);

                    pctx = init("p2");
                    await ph.halt();
                    await ph.return([]);
                });
            });

            describe("Boost", function () {
                describe("Self (Download)", function () {
                    it("Should handle", async function () {
                        const mon = sh.initActive("p1");
                        mon.traits.stats.def.set(mon.traits.stats.def.min);
                        mon.traits.stats.spd.set(mon.traits.stats.spd.max);
                        expect(mon.traits.stats.def.max).to.be.lessThan(
                            mon.traits.stats.spd.max,
                        );
                        sh.initActive("p2").setAbility("download");

                        pctx = init("p2");
                        await ph.handle({
                            args: [
                                "-ability",
                                toIdent("p2"),
                                toAbilityName("download"),
                                "boost",
                            ],
                            kwArgs: {},
                        });
                        // Def is lower.
                        await ph.handle({
                            args: ["-boost", toIdent("p2"), "atk", toNum(1)],
                            kwArgs: {},
                        });
                        await ph.halt();
                        await ph.return([undefined]);
                    });

                    it("Should throw if invalid boost", async function () {
                        sh.initActive("p1");
                        sh.initActive("p2").setAbility("download");

                        pctx = init("p2");
                        await ph.handle({
                            args: [
                                "-ability",
                                toIdent("p2"),
                                toAbilityName("download"),
                                "boost",
                            ],
                            kwArgs: {},
                        });
                        await ph.rejectError(
                            {
                                args: [
                                    "-boost",
                                    toIdent("p2"),
                                    "spe",
                                    toNum(1),
                                ],
                                kwArgs: {},
                            },
                            Error,
                            "On-start boost self download effect failed: " +
                                "Missing boost: [{atk: 1}, {spa: 1}]",
                        );
                    });

                    it("Should consider stat boosts", async function () {
                        const mon = sh.initActive("p1");
                        mon.traits.stats.def.set(mon.traits.stats.def.min);
                        mon.traits.stats.spd.set(mon.traits.stats.spd.max);
                        expect(mon.traits.stats.def.max).to.be.lessThan(
                            mon.traits.stats.spd.max,
                        );
                        mon.volatile.boosts.def = 1;
                        sh.initActive("p2").setAbility("download");

                        pctx = init("p2");
                        await ph.handle({
                            args: [
                                "-ability",
                                toIdent("p2"),
                                toAbilityName("download"),
                                "boost",
                            ],
                            kwArgs: {},
                        });
                        // Considers stat boost, so spd is lower.
                        await ph.handle({
                            args: ["-boost", toIdent("p2"), "spa", toNum(1)],
                            kwArgs: {},
                        });
                        await ph.halt();
                        await ph.return([undefined]);
                    });

                    it("Should not consider ability-boosted stats", async function () {
                        const mon = sh.initActive("p1");
                        // TODO: Implement ability-boosted stats.
                        mon.setAbility("marvelscale");
                        mon.majorStatus.afflict("par");
                        mon.traits.stats.def.set(mon.traits.stats.def.min);
                        mon.traits.stats.spd.set(mon.traits.stats.spd.max);
                        expect(mon.traits.stats.def.max).to.be.lessThan(
                            mon.traits.stats.spd.max,
                        );
                        sh.initActive("p2").setAbility("download");

                        pctx = init("p2");
                        await ph.handle({
                            args: [
                                "-ability",
                                toIdent("p2"),
                                toAbilityName("download"),
                                "boost",
                            ],
                            kwArgs: {},
                        });
                        // Ignores marvelscale boost, so def is lower.
                        await ph.handle({
                            args: ["-boost", toIdent("p2"), "atk", toNum(1)],
                            kwArgs: {},
                        });
                        await ph.halt();
                        await ph.return([undefined]);
                    });

                    // TODO(#311): Implement stat inferences.
                    it("Should infer stat range");
                });

                describe("Foes (Intimidate)", function () {
                    it("Should handle", async function () {
                        sh.initActive("p1");
                        sh.initActive("p2").setAbility("intimidate");

                        pctx = init("p2");
                        await ph.handle({
                            args: [
                                "-ability",
                                toIdent("p2"),
                                toAbilityName("intimidate"),
                                "boost",
                            ],
                            kwArgs: {},
                        });
                        await ph.handle({
                            args: ["-unboost", toIdent("p1"), "atk", toNum(1)],
                            kwArgs: {},
                        });
                        await ph.halt();
                        await ph.return([undefined]);
                    });

                    it("Should not activate if substitute", async function () {
                        sh.initActive("p1").volatile.substitute = true;
                        sh.initActive("p2").setAbility("intimidate");

                        pctx = init("p2");
                        await ph.halt();
                        await ph.return([]);
                    });

                    it("Should still activate if substitute just broken", async function () {
                        sh.initActive("p1").volatile.substituteBroken =
                            "tackle";
                        sh.initActive("p2").setAbility("intimidate");

                        pctx = init("p2");
                        await ph.handle({
                            args: [
                                "-ability",
                                toIdent("p2"),
                                toAbilityName("intimidate"),
                                "boost",
                            ],
                            kwArgs: {},
                        });
                        await ph.handle({
                            args: ["-unboost", toIdent("p1"), "atk", toNum(1)],
                            kwArgs: {},
                        });
                        await ph.halt();
                        await ph.return([undefined]);
                    });

                    it("Should not activate if substitute just broken by uturn", async function () {
                        sh.initActive("p1").volatile.substituteBroken = "uturn";
                        sh.initActive("p2").setAbility("intimidate");

                        pctx = init("p2");
                        await ph.halt();
                        await ph.return([]);
                    });

                    it("Should be blocked by on-tryUnboost ability", async function () {
                        const mon = sh.initActive("p1");
                        mon.setAbility("hypercutter");
                        const source = sh.initActive("p2");
                        source.setAbility("intimidate");

                        pctx = init("p2");
                        await ph.handle({
                            args: [
                                "-ability",
                                toIdent("p2"),
                                toAbilityName("intimidate"),
                                "boost",
                            ],
                            kwArgs: {},
                        });
                        await ph.handle({
                            args: [
                                "-fail",
                                toIdent("p1"),
                                toEffectName("unboost"),
                            ],
                            kwArgs: {
                                from: toEffectName("hypercutter", "ability"),
                                of: toIdent("p1"),
                            },
                        });
                        await ph.halt();
                        await ph.return([undefined]);
                    });

                    // TODO(doubles): Test |-immune| event for when only one
                    // opponent has a substitute.
                });
            });

            describe("ExtraPpUsage (Pressure)", function () {
                it("Should handle", async function () {
                    sh.initActive("p1");
                    sh.initActive("p2").setAbility("pressure");

                    pctx = init("p2");
                    await ph.handle({
                        args: [
                            "-ability",
                            toIdent("p2"),
                            toAbilityName("pressure"),
                        ],
                        kwArgs: {},
                    });
                    await ph.halt();
                    await ph.return([undefined]);
                });
            });

            describe("IgnoreTargetAbility (Mold Breaker)", function () {
                it("Should handle", async function () {
                    sh.initActive("p1");
                    sh.initActive("p2").setAbility("moldbreaker");

                    pctx = init("p2");
                    await ph.handle({
                        args: [
                            "-ability",
                            toIdent("p2"),
                            toAbilityName("moldbreaker"),
                        ],
                        kwArgs: {},
                    });
                    await ph.halt();
                    await ph.return([undefined]);
                });
            });

            describe("RevealItem (Frisk)", function () {
                // Can have frisk.
                const banette: SwitchOptions = {
                    species: "banette",
                    level: 50,
                    gender: "M",
                    hp: 100,
                    hpMax: 100,
                };

                it("Should handle item reveal", async function () {
                    sh.initActive("p1").setAbility("frisk");
                    sh.initActive("p2");

                    pctx = init("p1");
                    await ph.handle({
                        args: ["-item", toIdent("p2"), toItemName("mail")],
                        kwArgs: {
                            identify: true,
                            from: toEffectName("frisk", "ability"),
                            of: toIdent("p1"),
                        },
                    });
                    await ph.halt();
                    await ph.return([undefined]);
                });

                it("Should infer opponent's lack of item if ability is known and opponent's item is unknown", async function () {
                    const mon = sh.initActive("p2", banette);
                    mon.traits.ability.narrow("frisk");
                    // Opponent could have an item or no item.
                    const opp = sh.initActive("p1");
                    expect(opp.item.possibleValues).to.include.keys("none");
                    expect(opp.item.size).to.be.gt(1);

                    pctx = init("p2");
                    await ph.halt();
                    await ph.return([]);
                    // Opponent definitely has no item.
                    expect(opp.item.possibleValues).to.have.keys("none");
                });

                it("Should infer no frisk if opponent has item", async function () {
                    const mon = sh.initActive("p2", banette);
                    expect(mon.traits.ability.possibleValues).to.have.keys(
                        "insomnia",
                        "frisk",
                    );
                    // Opponent definitely has an item.
                    const opp = sh.initActive("p1");
                    opp.item.remove("none");

                    pctx = init("p2");
                    await ph.halt();
                    await ph.return([]);
                    // Should remove frisk.
                    expect(mon.traits.ability.possibleValues).to.have.keys(
                        "insomnia",
                    );
                });

                it("Should not infer ability if opponent has no item", async function () {
                    const mon = sh.initActive("p2", banette);
                    expect(mon.traits.ability.possibleValues).to.have.keys(
                        "insomnia",
                        "frisk",
                    );
                    const opp = sh.initActive("p1");
                    opp.setItem("none");

                    pctx = init("p2");
                    await ph.halt();
                    await ph.return([]);
                    // Shouldn't infer ability.
                    expect(mon.traits.ability.possibleValues).to.have.keys(
                        "insomnia",
                        "frisk",
                    );
                });
            });

            describe("Status", function () {
                describe("Self (Slow Start)", function () {
                    it("Should handle", async function () {
                        sh.initActive("p1").setAbility("slowstart");

                        pctx = init("p1");
                        await ph.handle({
                            args: [
                                "-start",
                                toIdent("p1"),
                                toEffectName("slowstart", "ability"),
                            ],
                            kwArgs: {},
                        });
                        await ph.halt();
                        await ph.return([undefined]);
                    });
                });
            });

            describe("WarnStrongestMove (Forewarn)", function () {
                // Limited movepool for easier testing.
                const wobbuffet: SwitchOptions = {
                    species: "wobbuffet",
                    gender: "M",
                    level: 100,
                    hp: 100,
                    hpMax: 100,
                };

                it("Should eliminate stronger moves from moveset constraint", async function () {
                    sh.initActive("p1", hypno);
                    const {moveset} = sh.initActive("p2", wobbuffet);
                    expect(moveset.constraint).to.include.keys(
                        "counter",
                        "mirrorcoat",
                    );

                    pctx = init("p1");
                    // Note: forewarn doesn't actually activate when the
                    // opponent has all status moves, but this is just for
                    // testing purposes.
                    await ph.handle({
                        args: [
                            "-activate",
                            toIdent("p1", hypno),
                            toEffectName("forewarn", "ability"),
                            toMoveName("splash"),
                        ],
                        kwArgs: {},
                    });
                    await ph.halt();
                    await ph.return([undefined]);
                    // Should remove moves with bp higher than 0 (these two are
                    // treated as 120).
                    expect(moveset.constraint).to.not.include.keys(
                        "counter",
                        "mirrorcoat",
                    );
                });
            });

            describe("Weather (Drizzle/Drought/Sand Stream/Snow Warning)", function () {
                it("Should handle", async function () {
                    sh.initActive("p2").setAbility("drizzle");

                    pctx = init("p2");
                    await ph.handle({
                        args: ["-weather", toWeather("RainDance")],
                        kwArgs: {
                            from: toEffectName("drizzle", "ability"),
                            of: toIdent("p2"),
                        },
                    });
                    await ph.halt();
                    await ph.return([undefined]);
                    expect(state.status.weather.type).to.equal("RainDance");
                    // Note(gen4): Weather abilities have infinite duration.
                    expect(state.status.weather.duration).to.be.null;
                });

                it("Should still handle if weather is already set but different from the desired one", async function () {
                    sh.initActive("p2").setAbility("drought");
                    state.status.weather.start(null /*source*/, "Hail");

                    pctx = init("p2");
                    await ph.handle({
                        args: ["-weather", toWeather("SunnyDay")],
                        kwArgs: {
                            from: toEffectName("drought", "ability"),
                            of: toIdent("p2"),
                        },
                    });
                    await ph.halt();
                    await ph.return([undefined]);
                    expect(state.status.weather.type).to.equal("SunnyDay");
                    expect(state.status.weather.duration).to.be.null;
                });

                it("Should not handle if weather already set to the desired one", async function () {
                    sh.initActive("p2").setAbility("sandstream");
                    state.status.weather.start(null /*source*/, "Sandstorm");

                    pctx = init("p2");
                    await ph.halt();
                    await ph.return([]);
                });
            });
        });

        describe("onBlock()", function () {
            const init = setupUnorderedParser(
                ictx.startArgs,
                effectAbility.onBlock,
            );
            let pctx: ReturnType<typeof init> | undefined;
            const ph = new ParserHelpers(() => pctx);

            afterEach("Close ParserContext", async function () {
                await ph.close().finally(() => (pctx = undefined));
            });

            // Can have voltabsorb.
            const lanturn: SwitchOptions = {
                species: "lanturn",
                level: 50,
                gender: "M",
                hp: 100,
                hpMax: 100,
            };

            it("Should infer no on-block ability if it did not activate", async function () {
                sh.initActive("p1");
                const mon = sh.initActive("p2", lanturn);
                expect(mon.traits.ability.possibleValues).to.have.keys(
                    "voltabsorb",
                    "illuminate",
                );

                pctx = init("p2", {
                    userRef: "p1",
                    move: dex.getMove(dex.moves["thunder"]),
                });
                await ph.halt();
                await ph.return([]);
                expect(mon.traits.ability.possibleValues).to.have.keys(
                    "illuminate",
                );
            });

            it("Shouldn't infer no on-block ability if it did not activate and ability is suppressed", async function () {
                sh.initActive("p1");
                const mon = sh.initActive("p2", lanturn);
                mon.volatile.suppressAbility = true;
                expect(mon.traits.ability.possibleValues).to.have.keys(
                    "voltabsorb",
                    "illuminate",
                );

                pctx = init("p2", {
                    userRef: "p1",
                    move: dex.getMove(dex.moves["thunder"]),
                });
                await ph.halt();
                await ph.return([]);
                expect(mon.traits.ability.possibleValues).to.have.keys(
                    "voltabsorb",
                    "illuminate",
                );
            });

            it("Should reject if move user ignores abilities", async function () {
                const mon = sh.initActive("p2", lanturn);
                expect(mon.traits.ability.possibleValues).to.have.keys(
                    "voltabsorb",
                    "illuminate",
                );
                sh.initActive("p1").setAbility("moldbreaker");

                pctx = init("p2", {
                    userRef: "p1",
                    move: dex.getMove(dex.moves["thunder"]),
                });
                await ph.halt();
                await ph.return([]);
                expect(mon.traits.ability.possibleValues).to.have.keys(
                    "voltabsorb",
                    "illuminate",
                );
            });

            describe("Status", function () {
                it("Should block status effect", async function () {
                    // Can have immunity.
                    const snorlax: SwitchOptions = {
                        species: "snorlax",
                        level: 100,
                        gender: "M",
                        hp: 100,
                        hpMax: 100,
                    };
                    sh.initActive("p1");
                    sh.initActive("p2", snorlax);

                    pctx = init("p2", {
                        move: dex.getMove(dex.moves["toxic"]),
                        userRef: "p1",
                    });
                    await ph.handle({
                        args: ["-immune", toIdent("p2", snorlax)],
                        kwArgs: {from: toEffectName("immunity", "ability")},
                    });
                    await ph.halt();
                    await ph.return([{blockStatus: {psn: true, tox: true}}]);
                });

                // TODO: Add separate test suites for each dex entry.
                describe("block.status = SunnyDay (leafguard)", function () {
                    let mon: Pokemon;
                    beforeEach("Initialize pokemon", function () {
                        mon = sh.initActive("p2");
                        mon.setAbility("leafguard");
                        sh.initActive("p1");
                    });

                    it("Should block yawn if sun", async function () {
                        state.status.weather.start(null /*source*/, "SunnyDay");

                        pctx = init("p2", {
                            move: dex.getMove(dex.moves["yawn"]),
                            userRef: "p1",
                        });
                        await ph.handle({
                            args: ["-immune", toIdent("p2", smeargle)],
                            kwArgs: {
                                from: toEffectName("leafguard", "ability"),
                            },
                        });
                        await ph.halt();
                        await ph.return([{blockStatus: {yawn: true}}]);
                    });

                    it("Should not block yawn without sun", async function () {
                        pctx = init("p2", {
                            move: dex.getMove(dex.moves["yawn"]),
                            userRef: "p1",
                        });
                        await ph.halt();
                        await ph.return([]);
                        // Shouldn't overnarrow.
                        expect(mon.traits.ability.possibleValues).to.have.keys(
                            "leafguard",
                        );
                    });

                    it("Should silently block major status on sun", async function () {
                        state.status.weather.start(null /*source*/, "SunnyDay");

                        pctx = init("p2", {
                            move: dex.getMove(dex.moves["toxic"]),
                            userRef: "p1",
                        });
                        await ph.halt();
                        await ph.return([]);
                        // Shouldn't overnarrow.
                        expect(mon.traits.ability.possibleValues).to.have.keys(
                            "leafguard",
                        );
                    });
                });
            });

            describe("Move", function () {
                it("Should handle type immunity", async function () {
                    // Can have levitate.
                    const bronzong: SwitchOptions = {
                        species: "bronzong",
                        level: 100,
                        gender: "N",
                        hp: 100,
                        hpMax: 100,
                    };
                    sh.initActive("p1");
                    sh.initActive("p2", bronzong);

                    pctx = init("p2", {
                        move: dex.getMove(dex.moves["mudshot"]),
                        userRef: "p1",
                    });
                    await ph.handle({
                        args: ["-immune", toIdent("p2", bronzong)],
                        kwArgs: {from: toEffectName("levitate", "ability")},
                    });
                    await ph.halt();
                    await ph.return([{immune: true}]);
                });

                // Can have motordrive.
                const electivire: SwitchOptions = {
                    species: "electivire",
                    level: 100,
                    gender: "M",
                    hp: 100,
                    hpMax: 100,
                };

                it("Should handle boost effect", async function () {
                    sh.initActive("p1");
                    sh.initActive("p2", electivire);

                    pctx = init("p2", {
                        move: dex.getMove(dex.moves["thunder"]),
                        userRef: "p1",
                    });
                    await ph.handle({
                        args: [
                            "-ability",
                            toIdent("p2", electivire),
                            toAbilityName("motordrive"),
                            "boost",
                        ],
                        kwArgs: {},
                    });
                    await ph.handle({
                        args: [
                            "-boost",
                            toIdent("p2", electivire),
                            "spe",
                            toNum(1),
                        ],
                        kwArgs: {},
                    });
                    await ph.halt();
                    await ph.return([{immune: true}]);
                });

                it("Should handle silent boost effect", async function () {
                    sh.initActive("p1");
                    sh.initActive("p2", electivire).volatile.boosts.spe = 6;

                    pctx = init("p2", {
                        move: dex.getMove(dex.moves["thunder"]),
                        userRef: "p1",
                    });
                    await ph.handle({
                        args: ["-immune", toIdent("p2", electivire)],
                        kwArgs: {from: toEffectName("motordrive", "ability")},
                    });
                    await ph.halt();
                    await ph.return([{immune: true}]);
                });

                it("Should throw if missing boosts", async function () {
                    sh.initActive("p1");
                    sh.initActive("p2", electivire);

                    pctx = init("p2", {
                        move: dex.getMove(dex.moves["thunder"]),
                        userRef: "p1",
                    });
                    await ph.handle({
                        args: [
                            "-ability",
                            toIdent("p2", electivire),
                            toAbilityName("motordrive"),
                            "boost",
                        ],
                        kwArgs: {},
                    });
                    await ph.haltError(
                        Error,
                        "On-block move boost effect failed: " +
                            "Failed to parse boosts [spe: 1]",
                    );
                });

                // Can have waterabsorb.
                const quagsire: SwitchOptions = {
                    species: "quagsire",
                    level: 100,
                    gender: "M",
                    hp: 100,
                    hpMax: 100,
                };

                it("Should handle percentDamage effect", async function () {
                    sh.initActive("p1");
                    sh.initActive("p2", quagsire).hp.set(1);

                    pctx = init("p2", {
                        move: dex.getMove(dex.moves["bubble"]),
                        userRef: "p1",
                    });
                    await ph.handle({
                        args: [
                            "-heal",
                            toIdent("p2", quagsire),
                            toHPStatus(100, 100),
                        ],
                        kwArgs: {
                            from: toEffectName("waterabsorb", "ability"),
                            of: toIdent("p1", smeargle),
                        },
                    });
                    await ph.halt();
                    await ph.return([{immune: true}]);
                });

                it("Should handle silent percentDamage effect", async function () {
                    sh.initActive("p1");
                    sh.initActive("p2", quagsire);

                    pctx = init("p2", {
                        move: dex.getMove(dex.moves["bubble"]),
                        userRef: "p1",
                    });
                    await ph.handle({
                        args: ["-immune", toIdent("p2", quagsire)],
                        kwArgs: {from: toEffectName("waterabsorb", "ability")},
                    });
                    await ph.halt();
                    await ph.return([{immune: true}]);
                });

                it("Should handle status effect", async function () {
                    // Can have flashfire.
                    const arcanine: SwitchOptions = {
                        species: "arcanine",
                        level: 100,
                        gender: "M",
                        hp: 100,
                        hpMax: 100,
                    };
                    sh.initActive("p1");
                    sh.initActive("p2", arcanine);

                    pctx = init("p2", {
                        move: dex.getMove(dex.moves["ember"]),
                        userRef: "p1",
                    });
                    await ph.handle({
                        args: [
                            "-start",
                            toIdent("p2", arcanine),
                            toEffectName("flashfire", "ability"),
                        ],
                        kwArgs: {},
                    });
                    await ph.halt();
                    await ph.return([{immune: true}]);
                });

                it("Should infer hiddenpower type", async function () {
                    const {hpType} = sh.initActive("p1");
                    expect(hpType.definiteValue).to.be.null;
                    sh.initActive("p2", quagsire);

                    pctx = init("p2", {
                        move: dex.getMove(dex.moves["hiddenpower"]),
                        userRef: "p1",
                    });
                    await ph.handle({
                        args: ["-immune", toIdent("p2", quagsire)],
                        kwArgs: {from: toEffectName("waterabsorb", "ability")},
                    });
                    await ph.halt();
                    await ph.return([{immune: true}]);
                    expect(hpType.definiteValue).to.equal("water");
                });

                it("Should infer judgment plate type", async function () {
                    const {item} = sh.initActive("p1");
                    expect(item.definiteValue).to.be.null;
                    sh.initActive("p2", quagsire);

                    pctx = init("p2", {
                        move: dex.getMove(dex.moves["judgment"]),
                        userRef: "p1",
                    });
                    await ph.handle({
                        args: ["-immune", toIdent("p2", quagsire)],
                        kwArgs: {from: toEffectName("waterabsorb", "ability")},
                    });
                    await ph.halt();
                    await ph.return([{immune: true}]);
                    // Water.
                    expect(item.definiteValue).to.equal("splashplate");
                });

                it("Should narrow hiddenpower type if ability didn't activate", async function () {
                    // Defender immune to electric through an ability.
                    const mon = sh.initActive("p2", lanturn);
                    mon.setAbility("voltabsorb");

                    // Hiddenpower type could be electric.
                    const {hpType} = sh.initActive("p1");
                    expect(hpType.definiteValue).to.be.null;
                    expect(hpType.possibleValues).to.include("electric");

                    // Ability didn't activate, so hpType must not be electric.
                    pctx = init("p2", {
                        move: dex.getMove(dex.moves["hiddenpower"]),
                        userRef: "p1",
                    });
                    await ph.halt();
                    await ph.return([]);
                    expect(hpType.possibleValues).to.not.include("electric");
                });

                it("Should infer judgment plate type if ability didn't activate", async function () {
                    // Defender immune to electric through an ability.
                    const mon = sh.initActive("p2", lanturn);
                    mon.setAbility("voltabsorb");

                    // PlateType could be electric.
                    const {item} = sh.initActive("p1");
                    expect(item.definiteValue).to.be.null;
                    // Electric.
                    expect(item.possibleValues).to.include("zapplate");

                    // Ability didn't activate, so plateType must not be
                    // electric.
                    pctx = init("p2", {
                        move: dex.getMove(dex.moves["judgment"]),
                        userRef: "p1",
                    });
                    await ph.halt();
                    await ph.return([]);
                    expect(item.possibleValues).to.not.include("zapplate");
                });

                describe("block.move.type = nonSuper (wonderguard)", function () {
                    it("Should block move", async function () {
                        sh.initActive("p1");
                        const mon = sh.initActive("p2");
                        mon.setAbility("wonderguard", "waterabsorb");

                        pctx = init("p2", {
                            move: dex.getMove(dex.moves["bubble"]),
                            userRef: "p1",
                        });
                        await ph.handle({
                            args: ["-immune", toIdent("p2")],
                            kwArgs: {
                                from: toEffectName("wonderguard", "ability"),
                            },
                        });
                        await ph.halt();
                        await ph.return([{immune: true}]);
                        expect(mon.traits.ability.possibleValues).to.have.keys(
                            "wonderguard",
                        );
                    });
                });
            });

            describe("Effect", function () {
                describe("Explosive", function () {
                    it("Should block explosive move", async function () {
                        sh.initActive("p1");
                        sh.initActive("p2", golduck);

                        pctx = init("p2", {
                            move: dex.getMove(dex.moves["explosion"]),
                            userRef: "p1",
                        });
                        await ph.handle({
                            args: [
                                "cant",
                                toIdent("p1"),
                                toEffectName("damp", "ability"),
                                toEffectName("explosion", "move"),
                            ],
                            kwArgs: {of: toIdent("p2", golduck)},
                        });
                        await ph.halt();
                        await ph.return([{failed: true}]);
                    });
                });
            });
        });

        describe("onTryUnboost()", function () {
            const init = setupUnorderedParser(
                ictx.startArgs,
                effectAbility.onTryUnboost,
            );
            let pctx: ReturnType<typeof init> | undefined;
            const ph = new ParserHelpers(() => pctx);

            afterEach("Close ParserContext", async function () {
                await ph.close().finally(() => (pctx = undefined));
            });

            it("Should indicate blocked unboost effect", async function () {
                // Can have clearbody (block-unboost ability).
                const metagross: SwitchOptions = {
                    species: "metagross",
                    level: 100,
                    gender: "M",
                    hp: 100,
                    hpMax: 100,
                };
                const source = sh.initActive("p1");
                sh.initActive("p2", metagross);

                pctx = init("p2", source, {atk: -1});
                await ph.handle({
                    args: [
                        "-fail",
                        toIdent("p2", metagross),
                        toEffectName("unboost"),
                    ],
                    kwArgs: {
                        from: toEffectName("clearbody", "ability"),
                        of: toIdent("p2", metagross),
                    },
                });
                await ph.halt();
                await ph.return([dex.boostNames]);
            });

            it("Should reject if move user ignores abilities", async function () {
                const mon = sh.initActive("p2", tentacruel);
                expect(mon.traits.ability.possibleValues).to.have.keys(
                    "clearbody",
                    "liquidooze",
                );

                const source = sh.initActive("p1");
                source.setAbility("moldbreaker");
                pctx = init("p2", source, {atk: -1});
                await ph.halt();
                await ph.return([]);
                expect(mon.traits.ability.possibleValues).to.have.keys(
                    "clearbody",
                    "liquidooze",
                );
            });

            it("Should infer no on-tryUnboost ability if it did not activate", async function () {
                const source = sh.initActive("p1");
                const mon = sh.initActive("p2", tentacruel);
                expect(mon.traits.ability.possibleValues).to.have.keys(
                    "clearbody",
                    "liquidooze",
                );

                pctx = init("p2", source, {atk: -1});
                await ph.halt();
                await ph.return([]);
                expect(mon.traits.ability.possibleValues).to.have.keys(
                    "liquidooze",
                );
            });

            it("Shouldn't infer no on-tryUnboost ability if it did not activate and ability is suppressed", async function () {
                const source = sh.initActive("p1");
                const mon = sh.initActive("p2", tentacruel);
                mon.volatile.suppressAbility = true;
                expect(mon.traits.ability.possibleValues).to.have.keys(
                    "clearbody",
                    "liquidooze",
                );

                pctx = init("p2", source, {atk: -1});
                await ph.halt();
                await ph.return([]);
                expect(mon.traits.ability.possibleValues).to.have.keys(
                    "clearbody",
                    "liquidooze",
                );
            });
        });

        describe("onMoveDamage()", function () {
            /** Initializes the onMoveDamage parser. */
            const init = setupUnorderedParser(
                ictx.startArgs,
                effectAbility.onMoveDamage,
            );
            let pctx: ReturnType<typeof init> | undefined;
            const ph = new ParserHelpers(() => pctx);

            afterEach("Close ParserContext", async function () {
                await ph.close().finally(() => (pctx = undefined));
            });

            describe("qualifier=contactKo", function () {
                it("Should handle", async function () {
                    sh.initActive("p1").setAbility("aftermath");
                    sh.initActive("p2");

                    pctx = init("p1", "contactKo", {
                        move: dex.getMove(dex.moves["tackle"]),
                        userRef: "p2",
                    });
                    await ph.handle({
                        args: ["-damage", toIdent("p2"), toHPStatus(75, 100)],
                        kwArgs: {
                            from: toEffectName("aftermath", "ability"),
                            of: toIdent("p1"),
                        },
                    });
                    await ph.halt();
                    await ph.return([undefined]);
                });

                // Can have aftermath.
                const drifblim: SwitchOptions = {
                    species: "drifblim",
                    level: 50,
                    gender: "M",
                    hp: 100,
                    hpMax: 100,
                };

                it("Should infer no on-moveContactKo ability if it did not activate", async function () {
                    sh.initActive("p1");
                    const mon = sh.initActive("p2", drifblim);
                    expect(mon.traits.ability.possibleValues).to.have.keys(
                        "aftermath",
                        "unburden",
                    );

                    pctx = init("p2", "contactKo", {
                        move: dex.getMove(dex.moves["tackle"]),
                        userRef: "p1",
                    });
                    await ph.halt();
                    await ph.return([]);
                    expect(mon.traits.ability.possibleValues).to.have.keys(
                        "unburden",
                    );
                });

                it("Shouldn't infer no on-moveContactKo ability if it did not activate and and ability is suppressed", async function () {
                    sh.initActive("p1");
                    const mon = sh.initActive("p2", drifblim);
                    mon.volatile.suppressAbility = true;
                    expect(mon.traits.ability.possibleValues).to.have.keys(
                        "aftermath",
                        "unburden",
                    );

                    pctx = init("p2", "contactKo", {
                        move: dex.getMove(dex.moves["tackle"]),
                        userRef: "p1",
                    });
                    await ph.halt();
                    await ph.return([]);
                    expect(mon.traits.ability.possibleValues).to.have.keys(
                        "aftermath",
                        "unburden",
                    );
                });

                describe("explosive", function () {
                    it("Should infer non-blockExplosive ability for opponent", async function () {
                        sh.initActive("p1").setAbility("aftermath");
                        const mon = sh.initActive("p2", golduck);
                        expect(mon.traits.ability.possibleValues).to.have.keys([
                            "damp",
                            "cloudnine",
                        ]);

                        // Activate explosive effect, meaning other side doesn't
                        // have damp.
                        pctx = init("p1", "contactKo", {
                            move: dex.getMove(dex.moves["tackle"]),
                            userRef: "p2",
                        });
                        await ph.handle({
                            args: [
                                "-damage",
                                toIdent("p2"),
                                toHPStatus(75, 100),
                            ],
                            kwArgs: {
                                from: toEffectName("aftermath", "ability"),
                                of: toIdent("p1"),
                            },
                        });
                        await ph.halt();
                        await ph.return([undefined]);
                        expect(mon.traits.ability.possibleValues).to.have.keys([
                            "cloudnine",
                        ]);
                    });
                });
            });

            describe("qualifier=contact", function () {
                /** Flamebody pokemon. */
                const magmar: SwitchOptions = {
                    species: "magmar",
                    level: 40,
                    gender: "F",
                    hp: 100,
                    hpMax: 100,
                };

                /** Roughskin pokemon. */
                const sharpedo: SwitchOptions = {
                    species: "sharpedo",
                    level: 40,
                    gender: "M",
                    hp: 100,
                    hpMax: 100,
                };

                it("Should handle status effect", async function () {
                    sh.initActive("p1");
                    sh.initActive("p2", magmar);

                    pctx = init("p2", "contact", {
                        move: dex.getMove(dex.moves["tackle"]),
                        userRef: "p1",
                    });
                    await ph.handle({
                        args: ["-status", toIdent("p1"), "brn"],
                        kwArgs: {
                            from: toEffectName("flamebody", "ability"),
                            of: toIdent("p2", magmar),
                        },
                    });
                    await ph.halt();
                    await ph.return([undefined]);
                });

                it("Should handle percentDamage effect", async function () {
                    sh.initActive("p1");
                    sh.initActive("p2", sharpedo);

                    pctx = init("p2", "contact", {
                        move: dex.getMove(dex.moves["tackle"]),
                        userRef: "p1",
                    });
                    await ph.handle({
                        args: ["-damage", toIdent("p1"), toHPStatus(94, 100)],
                        kwArgs: {
                            from: toEffectName("roughskin", "ability"),
                            of: toIdent("p2", sharpedo),
                        },
                    });
                    await ph.halt();
                    await ph.return([undefined]);
                });

                it("Should still handle if qualifier=contactKo and effect targets opponent", async function () {
                    sh.initActive("p1");
                    sh.initActive("p2", magmar);

                    pctx = init("p2", "contactKo", {
                        move: dex.getMove(dex.moves["tackle"]),
                        userRef: "p1",
                    });
                    await ph.handle({
                        args: ["-status", toIdent("p1"), "brn"],
                        kwArgs: {
                            from: toEffectName("flamebody", "ability"),
                            of: toIdent("p2", magmar),
                        },
                    });
                    await ph.halt();
                    await ph.return([undefined]);
                });

                it("Should not handle if qualifier=damage", async function () {
                    sh.initActive("p1");
                    sh.initActive("p2", magmar);

                    pctx = init("p2", "damage", {
                        move: dex.getMove(dex.moves["watergun"]),
                        userRef: "p1",
                    });
                    await ph.halt();
                    await ph.return([]);
                });

                it("Should infer no on-moveContact ability if it did not activate", async function () {
                    sh.initActive("p1");
                    const mon = sh.initActive("p2");
                    mon.setAbility("roughskin", "illuminate");

                    pctx = init("p2", "contact", {
                        move: dex.getMove(dex.moves["tackle"]),
                        userRef: "p1",
                    });
                    await ph.halt();
                    await ph.return([]);
                    expect(mon.traits.ability.possibleValues).to.have.keys(
                        "illuminate",
                    );
                });

                it("Shouldn't infer no on-moveContact ability if it did not activate and and ability is suppressed", async function () {
                    sh.initActive("p1");
                    const mon = sh.initActive("p2");
                    mon.volatile.suppressAbility = true;
                    mon.setAbility("roughskin", "illuminate");

                    pctx = init("p2", "contact", {
                        move: dex.getMove(dex.moves["tackle"]),
                        userRef: "p1",
                    });
                    await ph.halt();
                    await ph.return([]);
                    expect(mon.traits.ability.possibleValues).to.have.keys(
                        "roughskin",
                        "illuminate",
                    );
                });
            });

            describe("qualifier=damage", function () {
                it("Should infer no on-moveDamage ability if it did not activate", async function () {
                    const mon = sh.initActive("p1");
                    mon.setAbility("colorchange", "illuminate");
                    sh.initActive("p2");

                    pctx = init("p1", "damage", {
                        move: dex.getMove(dex.moves["watergun"]),
                        userRef: "p2",
                    });
                    await ph.halt();
                    await ph.return([]);
                    expect(mon.traits.ability.possibleValues).to.have.keys(
                        "illuminate",
                    );
                });

                it("Shouldn't infer no on-moveDamage ability if it did not activate and and ability is suppressed", async function () {
                    const mon = sh.initActive("p1");
                    mon.volatile.suppressAbility = true;
                    mon.setAbility("colorchange", "illuminate");
                    sh.initActive("p2");

                    pctx = init("p1", "damage", {
                        move: dex.getMove(dex.moves["watergun"]),
                        userRef: "p2",
                    });
                    await ph.halt();
                    await ph.return([]);
                    expect(mon.traits.ability.possibleValues).to.have.keys(
                        "colorchange",
                        "illuminate",
                    );
                });

                describe("changeToMoveType (colorchange)", function () {
                    /** Colorchange pokemon. */
                    const kecleon: SwitchOptions = {
                        species: "kecleon",
                        level: 40,
                        gender: "M",
                        hp: 100,
                        hpMax: 100,
                    };

                    it("Should handle", async function () {
                        sh.initActive("p1", kecleon);
                        sh.initActive("p2");

                        pctx = init("p1", "damage", {
                            move: dex.getMove(dex.moves["watergun"]),
                            userRef: "p2",
                        });
                        await ph.handle({
                            args: [
                                "-start",
                                toIdent("p1", kecleon),
                                toEffectName("typechange"),
                                toTypes("water"),
                            ],
                            kwArgs: {
                                from: toEffectName("colorchange", "ability"),
                            },
                        });
                        await ph.halt();
                        await ph.return([undefined]);
                    });

                    it("Should not activate if KO'd", async function () {
                        const mon = sh.initActive("p1", kecleon);
                        mon.faint();
                        sh.initActive("p2");

                        pctx = init("p1", "damage", {
                            move: dex.getMove(dex.moves["watergun"]),
                            userRef: "p2",
                        });
                        await ph.halt();
                        await ph.return([]);
                    });

                    it("Should not activate if already same type", async function () {
                        const mon = sh.initActive("p1", kecleon);
                        mon.volatile.changeTypes(["fire", "???"]);
                        sh.initActive("p2");

                        pctx = init("p1", "damage", {
                            move: dex.getMove(dex.moves["ember"]),
                            userRef: "p2",
                        });
                        await ph.halt();
                        await ph.return([]);
                    });

                    it("Should infer hiddenpower type", async function () {
                        const {hpType} = sh.initActive("p1");
                        expect(hpType.definiteValue).to.be.null;
                        sh.initActive("p2", kecleon);

                        pctx = init("p2", "damage", {
                            move: dex.getMove(dex.moves["hiddenpower"]),
                            userRef: "p1",
                        });
                        await ph.handle({
                            args: [
                                "-start",
                                toIdent("p2", kecleon),
                                toEffectName("typechange"),
                                toTypes("water"),
                            ],
                            kwArgs: {
                                from: toEffectName("colorchange", "ability"),
                            },
                        });
                        await ph.halt();
                        await ph.return([undefined]);
                        expect(hpType.definiteValue).to.equal("water");
                    });

                    it("Should infer hiddenpower type if ability didn't activate", async function () {
                        const mon = sh.initActive("p1", kecleon);
                        mon.volatile.changeTypes(["ghost", "???"]);
                        const {hpType} = sh.initActive("p2");
                        expect(hpType.definiteValue).to.be.null;

                        pctx = init("p1", "damage", {
                            move: dex.getMove(dex.moves["hiddenpower"]),
                            userRef: "p2",
                        });
                        await ph.halt();
                        await ph.return([]);
                        expect(hpType.definiteValue).to.equal("ghost");
                    });

                    it("Should infer judgment plate type", async function () {
                        const {item} = sh.initActive("p1");
                        expect(item.definiteValue).to.be.null;
                        sh.initActive("p2", kecleon);

                        pctx = init("p2", "damage", {
                            move: dex.getMove(dex.moves["judgment"]),
                            userRef: "p1",
                        });
                        await ph.handle({
                            args: [
                                "-start",
                                toIdent("p2", kecleon),
                                toEffectName("typechange"),
                                toTypes("water"),
                            ],
                            kwArgs: {
                                from: toEffectName("colorchange", "ability"),
                            },
                        });
                        await ph.halt();
                        await ph.return([undefined]);
                        // Water.
                        expect(item.definiteValue).to.equal("splashplate");
                    });

                    it("Should infer judgment plate type if ability didn't activate", async function () {
                        const mon = sh.initActive("p1", kecleon);
                        mon.volatile.changeTypes(["electric", "???"]);
                        const {item} = sh.initActive("p2");
                        expect(item.definiteValue).to.be.null;

                        pctx = init("p1", "damage", {
                            move: dex.getMove(dex.moves["judgment"]),
                            userRef: "p2",
                        });
                        await ph.halt();
                        await ph.return([]);
                        // Electric.
                        expect(item.definiteValue).to.equal("zapplate");
                    });
                });
            });
        });

        describe("onMoveDrain()", function () {
            const init = setupUnorderedParser(
                ictx.startArgs,
                effectAbility.onMoveDrain,
            );
            let pctx: ReturnType<typeof init> | undefined;
            const ph = new ParserHelpers(() => pctx);

            afterEach("Close ParserContext", async function () {
                await ph.close().finally(() => (pctx = undefined));
            });

            it("Should infer no on-moveDrain ability if it did not activate", async function () {
                sh.initActive("p1");
                const mon = sh.initActive("p2", tentacruel);
                expect(mon.traits.ability.possibleValues).to.have.keys(
                    "clearbody",
                    "liquidooze",
                );

                pctx = init("p2", "p1");
                await ph.halt();
                await ph.return([]);
                expect(mon.traits.ability.possibleValues).to.have.keys(
                    "clearbody",
                );
            });

            it("Shouldn't infer no on-moveDrain ability if it did not activate and and ability is suppressed", async function () {
                sh.initActive("p1");
                const mon = sh.initActive("p2", tentacruel);
                mon.volatile.suppressAbility = true;
                expect(mon.traits.ability.possibleValues).to.have.keys(
                    "clearbody",
                    "liquidooze",
                );

                pctx = init("p2", "p1");
                await ph.halt();
                await ph.return([]);
                expect(mon.traits.ability.possibleValues).to.have.keys(
                    "clearbody",
                    "liquidooze",
                );
            });

            describe("Invert", function () {
                it("Should handle", async function () {
                    sh.initActive("p1");
                    sh.initActive("p2", tentacruel);

                    pctx = init("p2", "p1");
                    await ph.handle({
                        args: ["-damage", toIdent("p1"), toHPStatus(94, 100)],
                        kwArgs: {
                            from: toEffectName("liquidooze", "ability"),
                            of: toIdent("p2", tentacruel),
                        },
                    });
                    await ph.return(["invert"]);
                });
            });
        });

        describe("onWeather()", function () {
            const init = setupUnorderedParser(
                ictx.startArgs,
                effectAbility.onWeather,
            );
            let pctx: ReturnType<typeof init> | undefined;
            const ph = new ParserHelpers(() => pctx);

            afterEach("Close ParserContext", async function () {
                await ph.close().finally(() => (pctx = undefined));
            });

            it("Should infer no on-weather ability if it did not activate", async function () {
                sh.initActive("p1");
                const mon = sh.initActive("p2");
                mon.setAbility("dryskin", "illuminate");

                // Note: The active weather is provided as an argument here, so
                // we technically don't need to actually set the weather in the
                // battle state.
                pctx = init("p2", "SunnyDay", new Set());
                await ph.halt();
                await ph.return([]);
                expect(mon.traits.ability.possibleValues).to.have.keys(
                    "illuminate",
                );
            });

            it("Shouldn't infer no on-weather ability if it did not activate and and ability is suppressed", async function () {
                state.status.weather.start(null /*source*/, "SunnyDay");
                sh.initActive("p1");
                const mon = sh.initActive("p2", tentacruel);
                mon.setAbility("dryskin", "illuminate");
                mon.volatile.suppressAbility = true;

                pctx = init("p2", "SunnyDay", new Set());
                await ph.halt();
                await ph.return([]);
                expect(mon.traits.ability.possibleValues).to.have.keys(
                    "dryskin",
                    "illuminate",
                );
            });

            it("Should also make use of the given SubReasons", async function () {
                const us = sh.initActive("p1");
                us.setAbility("illuminate", "chlorophyll");
                const mon = sh.initActive("p2", tentacruel);
                mon.setAbility("dryskin", "illuminate");

                pctx = init(
                    "p2",
                    "SunnyDay",
                    // This SubReason must hold in order for on-weather
                    // abilities to activate at all.
                    new Set([reason.ability.has(us, new Set(["illuminate"]))]),
                );
                await ph.halt();
                await ph.return([]);
                // Either mon doesn't have dryskin (no on-weather activation),
                // or us doesn't have illuminate (preventing on-weather
                // activation at all).
                expect(mon.traits.ability.possibleValues).to.have.keys(
                    "dryskin",
                    "illuminate",
                );
                expect(us.traits.ability.possibleValues).to.have.keys(
                    "chlorophyll",
                    "illuminate",
                );
                // Trigger the assertion by narrowing one of them.
                mon.traits.ability.narrow("dryskin");
                expect(us.traits.ability.possibleValues).to.have.keys(
                    "chlorophyll",
                );
            });

            describe("PercentDamage", function () {
                it("Should handle", async function () {
                    sh.initActive("p1");
                    const mon = sh.initActive("p2");
                    mon.setAbility("icebody");
                    mon.hp.set(94);

                    pctx = init("p2", "Hail", new Set());
                    await ph.handle({
                        args: ["-heal", toIdent("p2"), toHPStatus(100, 100)],
                        kwArgs: {from: toEffectName("icebody", "ability")},
                    });
                    await ph.halt();
                    await ph.return([undefined]);
                });

                it("Should also make use of the given SubReasons", async function () {
                    sh.initActive("p1");
                    const mon = sh.initActive("p2");
                    mon.setAbility("icebody");
                    mon.hp.set(94);
                    expect(mon.item.possibleValues).to.include.keys("pokeball");
                    expect(mon.item.definiteValue).to.be.null;

                    pctx = init(
                        "p2",
                        "Hail",
                        new Set([reason.item.has(mon, new Set(["pokeball"]))]),
                    );
                    await ph.handle({
                        args: ["-heal", toIdent("p2"), toHPStatus(100, 100)],
                        kwArgs: {from: toEffectName("icebody", "ability")},
                    });
                    await ph.halt();
                    await ph.return([undefined]);
                    expect(mon.item.possibleValues).to.have.keys("pokeball");
                    expect(mon.item.definiteValue).to.not.be.null;
                });
            });

            describe("Cure", function () {
                it("Should handle", async function () {
                    sh.initActive("p1");
                    const mon = sh.initActive("p2");
                    mon.setAbility("hydration");
                    mon.majorStatus.afflict("brn");

                    pctx = init("p2", "RainDance", new Set());
                    await ph.handle({
                        args: [
                            "-activate",
                            toIdent("p2"),
                            toEffectName("hydration", "ability"),
                        ],
                        kwArgs: {},
                    });
                    await ph.handle({
                        args: ["-curestatus", toIdent("p2"), "brn"],
                        kwArgs: {},
                    });
                    await ph.halt();
                    await ph.return([undefined]);
                });

                it("Should also make use of the given SubReasons", async function () {
                    sh.initActive("p1");
                    const mon = sh.initActive("p2");
                    mon.setAbility("hydration");
                    mon.majorStatus.afflict("brn");
                    expect(mon.item.possibleValues).to.include.keys("pokeball");
                    expect(mon.item.definiteValue).to.be.null;

                    pctx = init(
                        "p2",
                        "RainDance",
                        new Set([reason.item.has(mon, new Set(["pokeball"]))]),
                    );
                    await ph.handle({
                        args: [
                            "-activate",
                            toIdent("p2"),
                            toEffectName("hydration", "ability"),
                        ],
                        kwArgs: {},
                    });
                    await ph.handle({
                        args: ["-curestatus", toIdent("p2"), "brn"],
                        kwArgs: {},
                    });
                    await ph.halt();
                    await ph.return([undefined]);
                    expect(mon.item.possibleValues).to.have.keys("pokeball");
                    expect(mon.item.definiteValue).to.not.be.null;
                });
            });
        });

        const traceEvent = (
            side1: SideID,
            traced: string,
            side2: SideID,
            opt1 = smeargle,
            opt2 = smeargle,
            pos1: Protocol.PositionLetter = "a",
            pos2: Protocol.PositionLetter = "a",
        ): Event<"|-ability|"> => ({
            args: [
                "-ability",
                toIdent(side1, opt1, pos1),
                toAbilityName(traced),
            ],
            kwArgs: {
                // Ability that caused trace effect.
                from: toEffectName("trace", "ability"),
                // Trace target.
                of: toIdent(side2, opt2, pos2),
            },
        });

        describe("onUpdate()", function () {
            const init = setupUnorderedParser(
                ictx.startArgs,
                effectAbility.onUpdate,
            );
            let pctx: ReturnType<typeof init> | undefined;
            const ph = new ParserHelpers(() => pctx);

            afterEach("Close ParserContext", async function () {
                await ph.close().finally(() => (pctx = undefined));
            });

            it("Should handle", async function () {
                const mon = sh.initActive("p1");
                mon.majorStatus.afflict("slp");
                mon.setAbility("insomnia");
                sh.initActive("p2");

                pctx = init("p1");
                await ph.handle({
                    args: [
                        "-activate",
                        toIdent("p1"),
                        toEffectName("insomnia", "ability"),
                    ],
                    kwArgs: {},
                });
                await ph.handle({
                    args: ["-curestatus", toIdent("p1"), "slp"],
                    kwArgs: {},
                });
                await ph.halt();
                await ph.return([undefined]);
            });

            // Can have limber or owntempo.
            const glameow: SwitchOptions = {
                species: "glameow",
                level: 50,
                gender: "F",
                hp: 100,
                hpMax: 100,
            };

            it("Should infer no on-update ability if it did not activate", async function () {
                sh.initActive("p1");
                const mon = sh.initActive("p2", glameow);
                mon.volatile.confusion.start();
                expect(mon.traits.ability.possibleValues).to.have.keys(
                    "limber",
                    "owntempo",
                );

                pctx = init("p2");
                await ph.halt();
                await ph.return([]);
                expect(mon.traits.ability.possibleValues).to.have.keys(
                    "limber",
                );
            });

            it("Shouldn't infer no on-update ability if it did not activate and ability is suppressed", async function () {
                sh.initActive("p1");
                const mon = sh.initActive("p2", glameow);
                mon.volatile.suppressAbility = true;
                mon.volatile.confusion.start();
                expect(mon.traits.ability.possibleValues).to.have.keys(
                    "limber",
                    "owntempo",
                );

                pctx = init("p2");
                await ph.halt();
                await ph.return([]);
                expect(mon.traits.ability.possibleValues).to.have.keys(
                    "limber",
                    "owntempo",
                );
            });

            describe("CopyFoeAbility (Trace)", function () {
                // TODO: Test subtle interactions with base traits.
                it("Should reveal abilities", async function () {
                    const us = sh.initActive("p1");
                    us.setAbility("trace");
                    const them = sh.initActive("p2");
                    them.setAbility("hugepower", "illuminate");

                    pctx = init("p1");
                    await ph.handle(traceEvent("p1", "illuminate", "p2"));
                    await ph.halt();
                    await ph.return([undefined]);
                    expect(us.ability).to.equal("illuminate");
                    expect(them.ability).to.equal("illuminate");
                });

                it("Should handle no activation", async function () {
                    const us = sh.initActive("p1");
                    us.setAbility("trace", "illuminate");
                    us.majorStatus.afflict("slp");
                    const them = sh.initActive("p2");
                    them.setAbility("insomnia", "pressure");

                    pctx = init("p1");
                    await ph.halt();
                    await ph.return([]);
                    expect(us.ability).to.equal("illuminate");
                    expect(them.ability).to.be.empty;
                });

                it("Should not copy un-copyable ability", async function () {
                    const us = sh.initActive("p1");
                    us.setAbility("trace");
                    const them = sh.initActive("p2");
                    them.setAbility("multitype");

                    pctx = init("p1");
                    await ph.halt();
                    await ph.return([]);
                    expect(us.ability).to.equal("trace");
                    expect(them.ability).to.equal("multitype");
                });

                it("Should throw if ability does not activate after copy", async function () {
                    const us = sh.initActive("p1");
                    us.setAbility("vitalspirit", "insomnia");
                    const them = sh.initActive("p2");
                    them.setAbility("trace");
                    them.majorStatus.afflict("slp");

                    pctx = init("p2");
                    await ph.handle(traceEvent("p2", "insomnia", "p1"));
                    await ph.haltError(
                        Error,
                        "CopyFoeAbility ability 'trace' copied 'insomnia' " +
                            "but copied ability did not activate",
                    );
                    // Inference didn't finish so opponent is inferred but not
                    // the holder.
                    expect(us.ability).to.equal("insomnia");
                    expect(them.ability).to.equal("trace");
                });

                it("Should activate copied on-update ability afterwards", async function () {
                    const us = sh.initActive("p1");
                    us.setAbility("vitalspirit", "insomnia");
                    const them = sh.initActive("p2");
                    them.setAbility("trace");
                    them.majorStatus.afflict("slp");

                    pctx = init("p2");
                    await ph.handle(traceEvent("p2", "insomnia", "p1"));
                    await ph.handle({
                        args: [
                            "-activate",
                            toIdent("p2"),
                            toEffectName("insomnia", "ability"),
                        ],
                        kwArgs: {},
                    });
                    await ph.handle({
                        args: ["-curestatus", toIdent("p2"), "slp"],
                        kwArgs: {},
                    });
                    await ph.halt();
                    await ph.return([undefined]);
                    expect(us.ability).to.equal("insomnia");
                    expect(them.ability).to.equal("insomnia");
                });

                it("Should activate copied on-start ability first", async function () {
                    const us = sh.initActive("p1");
                    us.setAbility("pressure", "moldbreaker");
                    const them = sh.initActive("p2");
                    them.setAbility("trace");

                    pctx = init("p2");
                    await ph.handle({
                        args: [
                            "-ability",
                            toIdent("p2"),
                            toAbilityName("pressure"),
                        ],
                        kwArgs: {},
                    });
                    await ph.handle(traceEvent("p2", "pressure", "p1"));
                    await ph.halt();
                    await ph.return([undefined]);
                    expect(us.ability).to.equal("pressure");
                    expect(them.ability).to.equal("pressure");
                });

                it("Should activate copied on-start ability first if the copied ability could've been one of the ability holder's possible abilities", async function () {
                    const us = sh.initActive("p1");
                    us.setAbility("trace", "pressure");
                    const them = sh.initActive("p2");
                    them.setAbility("pressure", "moldbreaker");

                    pctx = init("p1");
                    await ph.handle({
                        args: [
                            "-ability",
                            toIdent("p1"),
                            toAbilityName("moldbreaker"),
                        ],
                        kwArgs: {},
                    });
                    await ph.handle(traceEvent("p1", "moldbreaker", "p2"));
                    await ph.halt();
                    await ph.return([undefined]);
                    expect(us.ability).to.equal("moldbreaker");
                    expect(them.ability).to.equal("moldbreaker");
                });

                it("Should activate copied on-start ability first if the copied ability is one of the ability holder's possible abilities", async function () {
                    const us = sh.initActive("p1");
                    us.setAbility("trace", "pressure");
                    const them = sh.initActive("p2");
                    them.setAbility("pressure", "moldbreaker");

                    pctx = init("p1");
                    await ph.handle({
                        args: [
                            "-ability",
                            toIdent("p1"),
                            toAbilityName("pressure"),
                        ],
                        kwArgs: {},
                    });
                    await ph.handle(traceEvent("p1", "pressure", "p2"));
                    await ph.halt();
                    await ph.return([undefined]);
                    expect(us.ability).to.equal("pressure");
                    expect(them.ability).to.equal("pressure");
                });

                it("Should distinguish from non-copied shared ability", async function () {
                    const us = sh.initActive("p1");
                    us.setAbility("trace", "vitalspirit");
                    us.majorStatus.afflict("slp");
                    const them = sh.initActive("p2");
                    them.setAbility("vitalspirit", "insomnia");

                    pctx = init("p1");
                    await ph.handle({
                        args: [
                            "-activate",
                            toIdent("p1"),
                            toEffectName("vitalspirit", "ability"),
                        ],
                        kwArgs: {},
                    });
                    await ph.handle({
                        args: ["-curestatus", toIdent("p1"), "slp"],
                        kwArgs: {},
                    });
                    await ph.halt();
                    await ph.return([undefined]);
                    expect(us.ability).to.equal("vitalspirit");
                    expect(them.ability).to.be.empty;
                });

                it("Should throw if no copy indicator event", async function () {
                    const us = sh.initActive("p1");
                    us.setAbility("trace", "pressure");
                    const them = sh.initActive("p2");
                    them.setAbility("pressure", "moldbreaker");

                    pctx = init("p1");
                    await ph.handle({
                        args: [
                            "-ability",
                            toIdent("p1"),
                            toAbilityName("moldbreaker"),
                        ],
                        kwArgs: {},
                    });
                    await ph.haltError(
                        Error,
                        "CopyFoeAbility ability [trace] activated for " +
                            "'moldbreaker' but no copy indicator event found",
                    );
                });
            });

            describe("Cure (immunity)", function () {
                it("Should cure status", async function () {
                    const mon = sh.initActive("p1");
                    mon.majorStatus.afflict("slp");
                    mon.setAbility("insomnia");
                    sh.initActive("p2");

                    pctx = init("p1");
                    await ph.handle({
                        args: [
                            "-activate",
                            toIdent("p1"),
                            toEffectName("insomnia", "ability"),
                        ],
                        kwArgs: {},
                    });
                    await ph.handle({
                        args: ["-curestatus", toIdent("p1"), "slp"],
                        kwArgs: {},
                    });
                    await ph.halt();
                    await ph.return([undefined]);
                });

                it("Should throw if missing cure event", async function () {
                    const mon = sh.initActive("p1");
                    mon.majorStatus.afflict("slp");
                    mon.setAbility("insomnia");
                    sh.initActive("p2");

                    pctx = init("p1");
                    await ph.handle({
                        args: [
                            "-activate",
                            toIdent("p1"),
                            toEffectName("insomnia", "ability"),
                        ],
                        kwArgs: {},
                    });
                    await ph.haltError(
                        Error,
                        "On-status cure effect failed: " +
                            "Missing cure events: [slp]",
                    );
                });

                it("Should throw if cure event is not the same as the status", async function () {
                    const mon = sh.initActive("p1");
                    mon.majorStatus.afflict("slp");
                    mon.setAbility("insomnia");
                    sh.initActive("p2");

                    pctx = init("p1");
                    await ph.handle({
                        args: [
                            "-activate",
                            toIdent("p1"),
                            toEffectName("insomnia", "ability"),
                        ],
                        kwArgs: {},
                    });
                    await ph.rejectError(
                        {
                            args: ["-curestatus", toIdent("p1"), "par"],
                            kwArgs: {},
                        },
                        Error,
                        "On-status cure effect failed: " +
                            "Missing cure events: [slp]",
                    );
                });
            });

            describe("Forecast", function () {
                it("Should handle", async function () {
                    state.status.weather.start(null /*source*/, "RainDance");
                    sh.initActive("p1");
                    const mon = sh.initActive("p2", castform);
                    expect(mon.ability).to.equal("forecast");

                    pctx = init("p2");
                    await ph.handle({
                        args: [
                            "-formechange",
                            toIdent("p2", castform),
                            toSpeciesName(castformrainy.species),
                        ],
                        kwArgs: {
                            msg: true,
                            from: toEffectName("forecast", "ability"),
                        },
                    });
                    await ph.halt();
                    await ph.return([undefined]);
                });
            });
        });

        describe("onStartOrUpdate()", function () {
            const init = setupUnorderedParser(
                ictx.startArgs,
                effectAbility.onStartOrUpdate,
            );
            let pctx: ReturnType<typeof init> | undefined;
            const ph = new ParserHelpers(() => pctx);

            afterEach("Close ParserContext", async function () {
                await ph.close().finally(() => (pctx = undefined));
            });

            it("Should handle on-start", async function () {
                sh.initActive("p1").setAbility("pressure");
                sh.initActive("p2");

                pctx = init("p1");
                await ph.handle({
                    args: [
                        "-ability",
                        toIdent("p1"),
                        toAbilityName("pressure"),
                    ],
                    kwArgs: {},
                });
                await ph.halt();
                await ph.return([undefined]);
            });

            it("Should handle on-update", async function () {
                const mon = sh.initActive("p1");
                mon.majorStatus.afflict("slp");
                mon.setAbility("insomnia");
                sh.initActive("p2");

                pctx = init("p1");
                await ph.handle({
                    args: [
                        "-activate",
                        toIdent("p1"),
                        toEffectName("insomnia", "ability"),
                    ],
                    kwArgs: {},
                });
                await ph.handle({
                    args: ["-curestatus", toIdent("p1"), "slp"],
                    kwArgs: {},
                });
                await ph.halt();
                await ph.return([undefined]);
            });

            describe("CopyFoeAbility (Trace)", function () {
                // TODO: Test subtle interactions with base traits.
                it("Should reveal abilities", async function () {
                    const us = sh.initActive("p1");
                    us.setAbility("trace");
                    const them = sh.initActive("p2");
                    them.setAbility("hugepower", "illuminate");

                    pctx = init("p1");
                    await ph.handle(traceEvent("p1", "illuminate", "p2"));
                    await ph.halt();
                    await ph.return([undefined]);
                    expect(us.ability).to.equal("illuminate");
                    expect(them.ability).to.equal("illuminate");
                });

                it("Should not copy un-copyable ability", async function () {
                    const us = sh.initActive("p1");
                    us.setAbility("trace");
                    const them = sh.initActive("p2");
                    them.setAbility("multitype");

                    pctx = init("p1");
                    await ph.halt();
                    await ph.return([]);
                    expect(us.ability).to.equal("trace");
                    expect(them.ability).to.equal("multitype");
                });

                it("Should activate copied on-update ability afterwards", async function () {
                    const us = sh.initActive("p1");
                    us.setAbility("vitalspirit", "insomnia");
                    const them = sh.initActive("p2");
                    them.setAbility("trace");
                    them.majorStatus.afflict("slp");

                    pctx = init("p2");
                    await ph.handle(traceEvent("p2", "insomnia", "p1"));
                    await ph.handle({
                        args: [
                            "-activate",
                            toIdent("p2"),
                            toEffectName("insomnia", "ability"),
                        ],
                        kwArgs: {},
                    });
                    await ph.handle({
                        args: ["-curestatus", toIdent("p2"), "slp"],
                        kwArgs: {},
                    });
                    await ph.halt();
                    await ph.return([undefined]);
                    expect(us.ability).to.equal("insomnia");
                    expect(them.ability).to.equal("insomnia");
                });

                it("Should activate copied on-start ability first", async function () {
                    const us = sh.initActive("p1");
                    us.setAbility("pressure", "moldbreaker");
                    const them = sh.initActive("p2");
                    them.setAbility("trace");

                    pctx = init("p2");
                    await ph.handle({
                        args: [
                            "-ability",
                            toIdent("p2"),
                            toAbilityName("pressure"),
                        ],
                        kwArgs: {},
                    });
                    await ph.handle(traceEvent("p2", "pressure", "p1"));
                    await ph.halt();
                    await ph.return([undefined]);
                    expect(us.ability).to.equal("pressure");
                    expect(them.ability).to.equal("pressure");
                });

                it("Should activate copied on-start ability first if the copied ability could've been one of the ability holder's possible abilities", async function () {
                    const us = sh.initActive("p1");
                    us.setAbility("trace", "pressure");
                    const them = sh.initActive("p2");
                    them.setAbility("pressure", "moldbreaker");

                    pctx = init("p1");
                    await ph.handle({
                        args: [
                            "-ability",
                            toIdent("p1"),
                            toAbilityName("moldbreaker"),
                        ],
                        kwArgs: {},
                    });
                    await ph.handle(traceEvent("p1", "moldbreaker", "p2"));
                    await ph.halt();
                    await ph.return([undefined]);
                    expect(us.ability).to.equal("moldbreaker");
                    expect(them.ability).to.equal("moldbreaker");
                });

                it("Should activate copied on-start ability first if the copied ability is one of the ability holder's possible abilities", async function () {
                    const us = sh.initActive("p1");
                    us.setAbility("trace", "pressure");
                    const them = sh.initActive("p2");
                    them.setAbility("pressure", "moldbreaker");

                    pctx = init("p1");
                    await ph.handle({
                        args: [
                            "-ability",
                            toIdent("p1"),
                            toAbilityName("pressure"),
                        ],
                        kwArgs: {},
                    });
                    await ph.handle(traceEvent("p1", "pressure", "p2"));
                    await ph.halt();
                    await ph.return([undefined]);
                    expect(us.ability).to.equal("pressure");
                    expect(them.ability).to.equal("pressure");
                });

                it("Should distinguish from non-copied shared on-start ability", async function () {
                    const us = sh.initActive("p1");
                    us.setAbility("trace", "pressure");
                    const them = sh.initActive("p2");
                    them.setAbility("pressure", "moldbreaker");

                    pctx = init("p1");
                    await ph.handle({
                        args: [
                            "-ability",
                            toIdent("p1"),
                            toAbilityName("pressure"),
                        ],
                        kwArgs: {},
                    });
                    await ph.halt();
                    await ph.return([undefined]);
                    expect(us.ability).to.equal("pressure");
                    expect(them.ability).to.be.empty;
                });

                it("Should distinguish from non-copied non-shared on-start ability", async function () {
                    const us = sh.initActive("p1");
                    us.setAbility("trace", "pressure");
                    const them = sh.initActive("p2");
                    them.setAbility("illuminate", "moldbreaker");

                    pctx = init("p1");
                    await ph.handle({
                        args: [
                            "-ability",
                            toIdent("p1"),
                            toAbilityName("pressure"),
                        ],
                        kwArgs: {},
                    });
                    await ph.halt();
                    await ph.return([undefined]);
                    expect(us.ability).to.equal("pressure");
                    expect(them.ability).to.be.empty;
                });

                it("Should distinguish from non-copied shared on-update ability", async function () {
                    const us = sh.initActive("p1");
                    us.setAbility("trace", "insomnia");
                    us.majorStatus.afflict("slp");
                    const them = sh.initActive("p2");
                    them.setAbility("insomnia", "vitalspirit");

                    pctx = init("p1");
                    await ph.handle({
                        args: [
                            "-activate",
                            toIdent("p1"),
                            toEffectName("insomnia", "ability"),
                        ],
                        kwArgs: {},
                    });
                    await ph.handle({
                        args: ["-curestatus", toIdent("p1"), "slp"],
                        kwArgs: {},
                    });
                    await ph.halt();
                    await ph.return([undefined]);
                    expect(us.ability).to.equal("insomnia");
                    expect(them.ability).to.be.empty;
                });

                it("Should distinguish from non-copied non-shared on-update ability", async function () {
                    const us = sh.initActive("p1");
                    us.setAbility("trace", "insomnia");
                    us.majorStatus.afflict("slp");
                    const them = sh.initActive("p2");
                    them.setAbility("illuminate", "vitalspirit");

                    pctx = init("p1");
                    await ph.handle({
                        args: [
                            "-activate",
                            toIdent("p1"),
                            toEffectName("insomnia", "ability"),
                        ],
                        kwArgs: {},
                    });
                    await ph.handle({
                        args: ["-curestatus", toIdent("p1"), "slp"],
                        kwArgs: {},
                    });
                    await ph.halt();
                    await ph.return([undefined]);
                    expect(us.ability).to.equal("insomnia");
                    expect(them.ability).to.be.empty;
                });

                it("Should throw if no copy indicator event", async function () {
                    const us = sh.initActive("p1");
                    us.setAbility("trace", "pressure");
                    const them = sh.initActive("p2");
                    them.setAbility("pressure", "moldbreaker");

                    pctx = init("p1");
                    await ph.handle({
                        args: [
                            "-ability",
                            toIdent("p1"),
                            toAbilityName("moldbreaker"),
                        ],
                        kwArgs: {},
                    });
                    await ph.haltError(
                        Error,
                        "CopyFoeAbility ability [trace] activated for " +
                            "'moldbreaker' but no copy indicator event found",
                    );
                });
            });
        });

        describe("onResidual()", function () {
            const init = setupUnorderedParser(
                ictx.startArgs,
                effectAbility.onResidual,
            );
            let pctx: ReturnType<typeof init> | undefined;
            const ph = new ParserHelpers(() => pctx);

            afterEach("Close ParserContext", async function () {
                await ph.close().finally(() => (pctx = undefined));
            });

            it("Should infer no on-residual ability if it did not activate", async function () {
                sh.initActive("p1");
                const mon = sh.initActive("p2");
                mon.setAbility("speedboost", "illuminate");

                pctx = init("p2");
                await ph.halt();
                await ph.return([]);
                expect(mon.traits.ability.possibleValues).to.have.keys(
                    "illuminate",
                );
            });

            it("Shouldn't infer no on-residual ability if it did not activate and ability is suppressed", async function () {
                sh.initActive("p1");
                const mon = sh.initActive("p2");
                mon.setAbility("speedboost", "illuminate");
                mon.volatile.suppressAbility = true;

                pctx = init("p2");
                await ph.halt();
                await ph.return([]);
                expect(mon.traits.ability.possibleValues).to.have.keys(
                    "speedboost",
                    "illuminate",
                );
            });

            describe("DamageIfStatus (Bad Dreams)", function () {
                it("Should handle", async function () {
                    const mon = sh.initActive("p1");
                    mon.setAbility("baddreams");
                    sh.initActive("p2").majorStatus.afflict("slp");

                    pctx = init("p1");
                    await ph.handle({
                        args: ["-damage", toIdent("p2"), toHPStatus(88)],
                        kwArgs: {
                            from: toEffectName("baddreams", "ability"),
                            of: toIdent("p1"),
                        },
                    });
                    await ph.halt();
                    await ph.return([undefined]);
                });

                it("Should not handle if no status", async function () {
                    const mon = sh.initActive("p1");
                    mon.setAbility("baddreams");
                    sh.initActive("p2");

                    pctx = init("p1");
                    await ph.halt();
                    await ph.return([]);
                });
            });

            describe("Cure (Shed Skin)", function () {
                it("Should handle", async function () {
                    const mon = sh.initActive("p1");
                    mon.setAbility("shedskin");
                    mon.majorStatus.afflict("par");
                    sh.initActive("p2");

                    pctx = init("p1");
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
                    await ph.return([undefined]);
                });

                it("Should allow no activation due to chance", async function () {
                    const mon = sh.initActive("p1");
                    mon.setAbility("shedskin");
                    mon.majorStatus.afflict("par");
                    sh.initActive("p2");

                    pctx = init("p1");
                    await ph.halt();
                    await ph.return([]);
                });
            });

            describe("Boost (Speed Boost)", function () {
                it("Should handle", async function () {
                    const mon = sh.initActive("p1");
                    mon.setAbility("speedboost");
                    sh.initActive("p2");

                    pctx = init("p1");
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
                    await ph.return([undefined]);
                });

                it("Should not handle if boost already maxed out", async function () {
                    const mon = sh.initActive("p1");
                    mon.setAbility("speedboost");
                    mon.volatile.boosts.spe = 6;
                    sh.initActive("p2");

                    pctx = init("p1");
                    await ph.halt();
                    await ph.return([]);
                });
            });
        });
    });
