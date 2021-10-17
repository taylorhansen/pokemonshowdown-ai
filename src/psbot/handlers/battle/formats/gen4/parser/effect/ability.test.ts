import { expect } from "chai";
import "mocha";
import * as dex from "../../dex";
import { BattleState } from "../../state/BattleState";
import { Pokemon } from "../../state/Pokemon";
import { smeargle } from "../../state/switchOptions.test";
import { SwitchOptions } from "../../state/Team";
import { ParserContext } from "../Context.test";
import { createInitialContext } from "../Context.test";
import { ParserHelpers, setupUnorderedDeadline, toAbilityName, toEffectName,
    toHPStatus,
    toIdent, toItemName, toMoveName, toNum, toTypes } from "../helpers.test";
import * as effectAbility from "./ability";

export const test = () => describe("ability", function()
{
    const ictx = createInitialContext();
    const {sh} = ictx;

    let state: BattleState;

    beforeEach("Extract BattleState", function()
    {
        state = ictx.getState();
    });

    // can have damp (explosive-blocking ability)
    const golduck: SwitchOptions =
    {
        species: "golduck", level: 100, gender: "M", hp: 100,
        hpMax: 100
    };

    // can have clearbody or liquidooze
    const tentacruel: SwitchOptions =
        {species: "tentacruel", level: 50, gender: "M", hp: 100, hpMax: 100};

    describe("onSwitchOut()", function()
    {
        const init = setupUnorderedDeadline(ictx.startArgs,
            effectAbility.onSwitchOut);
        let pctx: ParserContext<[] | [void]> | undefined;
        const ph = new ParserHelpers(() => pctx);

        afterEach("Close ParserContext", async function()
        {
            // reset variable so it doesn't leak into other tests
            await ph.close().finally(() => pctx = undefined);
        });

        // can have naturalcure
        const starmie: SwitchOptions =
            {species: "starmie", level: 50, gender: "N", hp: 100, hpMax: 100};

        it("Should infer no on-switchOut ability if it did not activate",
        async function()
        {
            // can have naturalcure
            const mon = sh.initActive("p2", starmie);
            mon.majorStatus.afflict("tox"); // required for this ability
            expect(mon.traits.ability.possibleValues)
                .to.have.keys("illuminate", "naturalcure");

            pctx = init("p2");
            await ph.halt();
            await ph.return([])
            expect(mon.traits.ability.possibleValues)
                .to.have.keys("illuminate");
        });

        it("Shouldn't infer no on-switchOut ability if it did not activate " +
            "and ability is suppressed", async function()
        {
            // can have naturalcure
            const mon = sh.initActive("p2", starmie);
            mon.majorStatus.afflict("tox");
            mon.volatile.suppressAbility = true;
            expect(mon.traits.ability.possibleValues)
                .to.have.keys("illuminate", "naturalcure");

            pctx = init("p2");
            await ph.halt();
            await ph.return([])
            expect(mon.traits.ability.possibleValues)
                .to.have.keys("illuminate", "naturalcure");
        });

        describe("Cure (naturalcure)", function()
        {
            it("Should cure status", async function()
            {
                const mon = sh.initActive("p2", starmie)
                mon.majorStatus.afflict("brn");

                pctx = init("p2");
                await ph.handle(
                {
                    args: ["-curestatus", toIdent("p2", starmie), "brn"],
                    kwArgs: {from: "ability: Natural Cure"}
                });
                await ph.halt();
                await ph.return([undefined]);
                expect(mon.majorStatus.current).to.be.null;
            });
        });
    });

    describe("onStart()", function()
    {
        /** Initializes the onStart parser. */
        const init = setupUnorderedDeadline(ictx.startArgs,
            effectAbility.onStart);
        let pctx: ParserContext<[] | [void]> | undefined;
        const ph = new ParserHelpers(() => pctx);

        afterEach("Close ParserContext", async function()
        {
            await ph.close().finally(() => pctx = undefined);
        });

        // can have forewarn
        const hypno: SwitchOptions =
        {
            species: "hypno", level: 30, gender: "M", hp: 100,
            hpMax: 100
        };

        it("Should infer no on-start ability if it did not activate",
        async function()
        {
            const mon = sh.initActive("p2", hypno);
            expect(mon.traits.ability.possibleValues)
                .to.have.keys("insomnia", "forewarn");

            pctx = init("p2");
            await ph.halt();
            await ph.return([]);
            expect(mon.traits.ability.possibleValues).to.have.keys("insomnia");
        });

        it("Shouldn't infer no on-start ability if it did not activate and " +
            "ability is suppressed", async function()
        {
            const mon = sh.initActive("p2", hypno);
            mon.volatile.suppressAbility = true;
            expect(mon.traits.ability.possibleValues)
                .to.have.keys("insomnia", "forewarn");

            pctx = init("p2");
            await ph.halt();
            await ph.return([]);
            expect(mon.traits.ability.possibleValues)
                .to.have.keys("insomnia", "forewarn");
        });

        describe("Cure (immunity)", function()
        {
            it("Should cure status", async function()
            {
                const mon = sh.initActive("p1");
                mon.majorStatus.afflict("slp");
                mon.setAbility("insomnia");

                pctx = init("p1");
                await ph.handle(
                {
                    args:
                    [
                        "-activate", toIdent("p1"),
                        toEffectName("insomnia", "ability")
                    ],
                    kwArgs: {}
                });
                await ph.handle(
                    {args: ["-curestatus", toIdent("p1"), "slp"], kwArgs: {}});
                await ph.halt();
                await ph.return([undefined]);
            });
        });

        describe("CopyFoeAbility (Trace)", function()
        {
            // TODO: test subtle interactions with base traits
            it("Should reveal abilities", async function()
            {
                const us = sh.initActive("p1")
                us.setAbility("trace");
                const them = sh.initActive("p2");
                them.setAbility("hugepower", "illuminate");

                pctx = init("p1");
                await ph.handle(
                {
                    args:
                    [
                        "-ability", toIdent("p1"), toAbilityName("illuminate")
                    ],
                    kwArgs:
                    {
                        // ability that caused trace effect
                        from: toEffectName("trace", "ability"),
                        // trace target
                        of: toIdent("p2")
                    }
                });
                await ph.halt();
                await ph.return([undefined]);
                expect(us.ability).to.equal("illuminate");
                expect(them.ability).to.equal("illuminate");
            });

            it("Should activate traced ability first", async function()
            {
                const us = sh.initActive("p1");
                us.setAbility("pressure", "moldbreaker");
                const them = sh.initActive("p2")
                them.setAbility("trace");

                pctx = init("p2");
                await ph.handle(
                {
                    args:
                        ["-ability", toIdent("p2"), toAbilityName("pressure")],
                    kwArgs: {}
                });
                await ph.handle(
                {
                    args:
                        ["-ability", toIdent("p2"), toAbilityName("pressure")],
                    kwArgs:
                    {
                        // ability that caused trace effect
                        from: toEffectName("trace", "ability"),
                        // trace target
                        of: toIdent("p1")
                    }
                });
                await ph.halt();
                await ph.return([undefined]);
                expect(us.ability).to.equal("pressure");
                expect(them.ability).to.equal("pressure");
            });

            it("Should activate traced ability first even if it's one of the " +
                "ability holder's possible abilities", async function()
            {
                const us = sh.initActive("p1")
                us.setAbility("trace", "pressure");
                const them = sh.initActive("p2");
                them.setAbility("pressure", "moldbreaker");

                pctx = init("p1");
                await ph.handle(
                {
                    args:
                        ["-ability", toIdent("p1"), toAbilityName("pressure")],
                    kwArgs: {}
                });
                await ph.handle(
                {
                    args:
                        ["-ability", toIdent("p1"), toAbilityName("pressure")],
                    kwArgs:
                    {
                        // ability that caused trace effect
                        from: toEffectName("trace", "ability"),
                        // trace target
                        of: toIdent("p2")
                    }
                });
                await ph.halt();
                await ph.return([undefined]);
                expect(us.ability).to.equal("pressure");
                expect(them.ability).to.equal("pressure");
            });

            it("Should activate traced ability first even if it could be one " +
                "of the ability holder's possible abilities",
            async function()
            {
                const us = sh.initActive("p1")
                us.setAbility("trace", "pressure");
                const them = sh.initActive("p2");
                them.setAbility("pressure", "moldbreaker");

                pctx = init("p1");
                await ph.handle(
                {
                    args:
                    [
                        "-ability", toIdent("p1"), toAbilityName("moldbreaker")
                    ],
                    kwArgs: {}
                });
                await ph.handle(
                {
                    args:
                    [
                        "-ability", toIdent("p1"), toAbilityName("moldbreaker")
                    ],
                    kwArgs:
                    {
                        // ability that caused trace effect
                        from: toEffectName("trace", "ability"),
                        // trace target
                        of: toIdent("p2")
                    }
                });
                await ph.halt();
                await ph.return([undefined]);
                expect(us.ability).to.equal("moldbreaker");
                expect(them.ability).to.equal("moldbreaker");
            });

            it("Should distinguish from non-traced ability", async function()
            {
                const us = sh.initActive("p1")
                us.setAbility("trace", "pressure");
                const them = sh.initActive("p2");
                them.setAbility("pressure", "moldbreaker");

                pctx = init("p1");
                await ph.handle(
                {
                    args:
                        ["-ability", toIdent("p1"), toAbilityName("pressure")],
                    kwArgs: {}
                });
                await ph.halt();
                await ph.return([undefined]);
                expect(us.ability).to.equal("pressure");
                expect(them.ability).to.be.empty;
            });

            it("Should throw if no trace event", async function()
            {
                const us = sh.initActive("p1")
                us.setAbility("trace", "pressure");
                const them = sh.initActive("p2");
                them.setAbility("pressure", "moldbreaker");

                pctx = init("p1");
                await ph.handle(
                {
                    args:
                    [
                        "-ability", toIdent("p1"), toAbilityName("moldbreaker")
                    ],
                    kwArgs: {}
                });
                await ph.haltError(Error,
                    "Traced opponent's ability 'moldbreaker' but no trace " +
                    "indicator event found");
            });
        });

        describe("RevealItem (Frisk)", function()
        {
            // can have frisk
            const banette: SwitchOptions =
            {
                species: "banette", level: 50, gender: "M", hp: 100,
                hpMax: 100
            };

            it("Should handle item reveal", async function()
            {
                sh.initActive("p1").setAbility("frisk");
                sh.initActive("p2");

                pctx = init("p1");
                await ph.handle(
                {
                    args: ["-item", toIdent("p2"), toItemName("mail")],
                    kwArgs:
                    {
                        identify: true, from: toEffectName("frisk", "ability"),
                        of: toIdent("p1")
                    }
                });
                await ph.halt();
                await ph.return([undefined]);
            });

            it("Should infer opponent's lack of item if ability is known " +
                "and opponent's item is unknown", async function()
            {
                const mon = sh.initActive("p2", banette);
                mon.traits.ability.narrow("frisk");
                // opponent could have an item or no item
                const opp =  sh.initActive("p1");
                expect(opp.item.possibleValues).to.include.keys("none");
                expect(opp.item.size).to.be.gt(1);

                pctx = init("p2");
                await ph.halt();
                await ph.return([]);
                // opponent definitely has no item
                expect(opp.item.possibleValues).to.have.keys("none");
            });

            it("Should infer no frisk if opponent has item",
            async function()
            {
                const mon = sh.initActive("p2", banette);
                expect(mon.traits.ability.possibleValues)
                    .to.have.keys("insomnia", "frisk");
                // opponent definitely has an item
                const opp =  sh.initActive("p1");
                opp.item.remove("none");

                pctx = init("p2");
                await ph.halt();
                await ph.return([]);
                // should remove frisk
                expect(mon.traits.ability.possibleValues)
                    .to.have.keys("insomnia");
            });

            it("Should not infer ability if opponent has no item",
            async function()
            {
                const mon = sh.initActive("p2", banette);
                expect(mon.traits.ability.possibleValues)
                    .to.have.keys("insomnia", "frisk");
                const opp =  sh.initActive("p1");
                opp.setItem("none");

                pctx = init("p2");
                await ph.halt();
                await ph.return([]);
                // shouldn't infer ability
                expect(mon.traits.ability.possibleValues)
                    .to.have.keys("insomnia", "frisk");
            });
        });

        describe("WarnStrongestMove (Forewarn)", function()
        {
            // limited movepool for easier testing
            const wobbuffet: SwitchOptions =
            {
                species: "wobbuffet", gender: "M", level: 100, hp: 100,
                hpMax: 100
            };

            it("Should eliminate stronger moves from moveset constraint",
            async function()
            {
                sh.initActive("p1", hypno);
                const {moveset} = sh.initActive("p2", wobbuffet);
                expect(moveset.constraint).to.include.keys("counter",
                    "mirrorcoat");

                pctx = init("p1");
                // note: forewarn doesn't actually activate when the opponent
                //  has all status moves, but this is just for testing purposes
                await ph.handle(
                {
                    args:
                    [
                        "-activate", toIdent("p1", hypno),
                        toEffectName("forewarn", "ability"),
                        toMoveName("splash")
                    ],
                    kwArgs: {}
                });
                await ph.halt();
                await ph.return([undefined]);
                // should remove moves with bp higher than 0 (these two are
                //  treated as 120)
                expect(moveset.constraint).to.not.include.keys("counter",
                    "mirrorcoat");
            });
        });
    });

    describe("onBlock()", function()
    {
        /** Initializes the onBlock parser. */
        const init = setupUnorderedDeadline(ictx.startArgs,
            effectAbility.onBlock);
        let pctx:
            ParserContext<[] | [dex.AbilityBlockResult | undefined]> |
            undefined;
        const ph = new ParserHelpers(() => pctx);

        afterEach("Close ParserContext", async function()
        {
            await ph.close().finally(() => pctx = undefined);
        });

        // can have voltabsorb
        const lanturn: SwitchOptions =
            {species: "lanturn", level: 50, gender: "M", hp: 100, hpMax: 100};

        it("Should infer no on-block ability if it did not activate",
        async function()
        {
            sh.initActive("p1");
            const mon = sh.initActive("p2", lanturn);
            expect(mon.traits.ability.possibleValues)
                .to.have.keys("voltabsorb", "illuminate");

            pctx = init("p2",
                {userRef: "p1", move: dex.getMove(dex.moves["thunder"])});
            await ph.halt();
            await ph.return([]);
            expect(mon.traits.ability.possibleValues)
                .to.have.keys("illuminate");
        });

        it("Shouldn't infer no on-block ability if it did not activate and " +
            "ability is suppressed", async function()
        {
            sh.initActive("p1");
            const mon = sh.initActive("p2", lanturn);
            mon.volatile.suppressAbility = true;
            expect(mon.traits.ability.possibleValues)
                .to.have.keys("voltabsorb", "illuminate");

            pctx = init("p2",
                {userRef: "p1", move: dex.getMove(dex.moves["thunder"])});
            await ph.halt();
            await ph.return([]);
            expect(mon.traits.ability.possibleValues)
                .to.have.keys("voltabsorb", "illuminate");
        });

        it("Should reject if move user ignores abilities", async function()
        {
            const mon = sh.initActive("p2", lanturn);
            expect(mon.traits.ability.possibleValues)
                .to.have.keys("voltabsorb", "illuminate");
            sh.initActive("p1").setAbility("moldbreaker");

            pctx = init("p2",
                {userRef: "p1", move: dex.getMove(dex.moves["thunder"])});
            await ph.halt();
            await ph.return([]);
            expect(mon.traits.ability.possibleValues)
                .to.have.keys("voltabsorb", "illuminate");
        });

        describe("Status", function()
        {
            it("Should block status effect", async function()
            {
                // can have immunity
                const snorlax: SwitchOptions =
                {
                    species: "snorlax", level: 100, gender: "M", hp: 100,
                    hpMax: 100
                };
                sh.initActive("p1");
                sh.initActive("p2", snorlax);

                pctx = init("p2",
                    {move: dex.getMove(dex.moves["toxic"]), userRef: "p1"});
                await ph.handle(
                {
                    args: ["-immune", toIdent("p2", snorlax)],
                    kwArgs: {from: toEffectName("immunity", "ability")}
                });
                await ph.halt();
                await ph.return([{blockStatus: {psn: true, tox: true}}]);
            });

            // TODO: add separate test suites for each dex entry
            describe("block.status = SunnyDay (leafguard)", function()
            {
                let mon: Pokemon;
                beforeEach("Initialize pokemon", function()
                {
                    mon = sh.initActive("p2");
                    mon.setAbility("leafguard");
                    sh.initActive("p1");
                });

                it("Should block yawn if sun", async function()
                {
                    state.status.weather.start(/*source*/ null,
                        "SunnyDay");

                    pctx = init("p2",
                        {move: dex.getMove(dex.moves["yawn"]), userRef: "p1"});
                    await ph.handle(
                    {
                        args: ["-immune", toIdent("p2", smeargle)],
                        kwArgs: {from: toEffectName("leafguard", "ability")}
                    });
                    await ph.halt();
                    await ph.return([{blockStatus: {yawn: true}}]);
                });

                it("Should not block yawn without sun", async function()
                {
                    pctx = init("p2",
                        {move: dex.getMove(dex.moves["yawn"]), userRef: "p1"});
                    await ph.halt();
                    await ph.return([]);
                    // shouldn't overnarrow
                    expect(mon.traits.ability.possibleValues)
                        .to.have.keys("leafguard");
                });

                it("Should silently block major status on sun", async function()
                {
                    state.status.weather.start(/*source*/ null,
                        "SunnyDay");

                    pctx = init("p2",
                        {move: dex.getMove(dex.moves["toxic"]), userRef: "p1"});
                    await ph.halt();
                    await ph.return([]);
                    // shouldn't overnarrow
                    expect(mon.traits.ability.possibleValues)
                        .to.have.keys("leafguard");
                });
            });
        });

        describe("Move", function()
        {
            it("Should handle type immunity", async function()
            {
                // can have levitate
                const bronzong: SwitchOptions =
                {
                    species: "bronzong", level: 100, gender: "N", hp: 100,
                    hpMax: 100
                };
                sh.initActive("p1");
                sh.initActive("p2", bronzong);

                pctx = init("p2",
                    {move: dex.getMove(dex.moves["mudshot"]), userRef: "p1"});
                await ph.handle(
                {
                    args: ["-immune", toIdent("p2", bronzong)],
                    kwArgs: {from: toEffectName("levitate", "ability")}
                });
                await ph.halt();
                await ph.return([{immune: true}]);
            });

            it("Should handle boost effect", async function()
            {
                // can have motordrive
                const electivire: SwitchOptions =
                {
                    species: "electivire", level: 100, gender: "M", hp: 100,
                    hpMax: 100
                };
                sh.initActive("p1");
                sh.initActive("p2", electivire);

                pctx = init("p2",
                    {move: dex.getMove(dex.moves["thunder"]), userRef: "p1"});
                await ph.handle(
                {
                    args:
                    [
                        "-ability", toIdent("p2", electivire),
                        toAbilityName("motordrive"), "boost"
                    ],
                    kwArgs: {}
                });
                await ph.handle(
                {
                    args:
                        ["-boost", toIdent("p2", electivire), "spe", toNum(1)],
                    kwArgs: {}
                });
                await ph.halt();
                await ph.return([{immune: true}]);
            });

            // can have waterabsorb
            const quagsire: SwitchOptions =
            {
                species: "quagsire", level: 100, gender: "M", hp: 100,
                hpMax: 100
            };

            it("Should handle percentDamage effect", async function()
            {
                sh.initActive("p1");
                sh.initActive("p2", quagsire).hp.set(1);

                pctx = init("p2",
                    {move: dex.getMove(dex.moves["bubble"]), userRef: "p1"});
                await ph.handle(
                {
                    args:
                    [
                        "-heal", toIdent("p2", quagsire), toHPStatus(100, 100)
                    ],
                    kwArgs:
                    {
                        from: toEffectName("waterabsorb", "ability"),
                        of: toIdent("p1", smeargle)
                    }
                });
                await ph.halt();
                await ph.return([{immune: true}]);
            });

            it("Should handle silent percentDamage effect", async function()
            {
                sh.initActive("p1");
                sh.initActive("p2", quagsire);

                pctx = init("p2",
                    {move: dex.getMove(dex.moves["bubble"]), userRef: "p1"});
                await ph.handle(
                {
                    args: ["-immune", toIdent("p2", quagsire)],
                    kwArgs: {from: toEffectName("waterabsorb", "ability")}
                });
                await ph.halt();
                await ph.return([{immune: true}]);
            });

            it("Should handle status effect", async function()
            {
                // can have flashfire
                const arcanine: SwitchOptions =
                {
                    species: "arcanine", level: 100, gender: "M", hp: 100,
                    hpMax: 100
                };
                sh.initActive("p1");
                sh.initActive("p2", arcanine);

                pctx = init("p2",
                    {move: dex.getMove(dex.moves["ember"]), userRef: "p1"});
                await ph.handle(
                {
                    args:
                    [
                        "-start", toIdent("p2", arcanine),
                        toEffectName("flashfire", "ability")
                    ],
                    kwArgs: {}
                });
                await ph.halt();
                await ph.return([{immune: true}]);
            });

            it("Should infer hiddenpower type", async function()
            {
                const {hpType} = sh.initActive("p1");
                expect(hpType.definiteValue).to.be.null;
                sh.initActive("p2", quagsire);

                pctx = init("p2",
                {
                    move: dex.getMove(dex.moves["hiddenpower"]), userRef: "p1"
                });
                await ph.handle(
                {
                    args: ["-immune", toIdent("p2", quagsire)],
                    kwArgs: {from: toEffectName("waterabsorb", "ability")}
                });
                await ph.halt();
                await ph.return([{immune: true}]);
                expect(hpType.definiteValue).to.equal("water");
            });

            it("Should infer judgment plate type", async function()
            {
                const {item} = sh.initActive("p1");
                expect(item.definiteValue).to.be.null;
                sh.initActive("p2", quagsire);

                pctx = init("p2",
                    {move: dex.getMove(dex.moves["judgment"]), userRef: "p1"});
                await ph.handle(
                {
                    args: ["-immune", toIdent("p2", quagsire)],
                    kwArgs: {from: toEffectName("waterabsorb", "ability")}
                });
                await ph.halt();
                await ph.return([{immune: true}]);
                expect(item.definiteValue).to.equal("splashplate"); // water
            });

            it("Should narrow hiddenpower type if ability didn't activate",
            async function()
            {
                // defender immune to electric through an ability
                const mon = sh.initActive("p2", lanturn);
                mon.setAbility("voltabsorb");

                // hpType could be electric
                const {hpType} = sh.initActive("p1");
                expect(hpType.definiteValue).to.be.null;
                expect(hpType.possibleValues).to.include("electric");

                // ability didn't activate, so hpType must not be electric
                pctx = init("p2",
                {
                    move: dex.getMove(dex.moves["hiddenpower"]), userRef: "p1"
                });
                await ph.halt();
                await ph.return([]);
                expect(hpType.possibleValues).to.not.include("electric");
            });

            it("Should infer judgment plate type if ability didn't activate",
                async function()
            {
                // defender immune to electric through an ability
                const mon = sh.initActive("p2", lanturn);
                mon.setAbility("voltabsorb");

                // plateType could be electric
                const {item} = sh.initActive("p1");
                expect(item.definiteValue).to.be.null;
                expect(item.possibleValues).to.include("zapplate"); // electric

                // ability didn't activate, so plateType must not be electric
                pctx = init("p2",
                    {move: dex.getMove(dex.moves["judgment"]), userRef: "p1"});
                await ph.halt();
                await ph.return([]);
                expect(item.possibleValues).to.not.include("zapplate");
            });

            describe("block.move.type = nonSuper (wonderguard)", function()
            {
                it("Should block move", async function()
                {
                    sh.initActive("p1");
                    const mon = sh.initActive("p2");
                    mon.setAbility("wonderguard", "waterabsorb");

                    pctx = init("p2",
                    {
                        move: dex.getMove(dex.moves["bubble"]), userRef: "p1"
                    });
                    await ph.handle(
                    {
                        args: ["-immune", toIdent("p2")],
                        kwArgs: {from: toEffectName("wonderguard", "ability")}
                    });
                    await ph.halt();
                    await ph.return([{immune: true}]);
                    expect(mon.traits.ability.possibleValues)
                        .to.have.keys("wonderguard");
                });
            });
        });

        describe("Effect", function()
        {
            describe("Explosive", function()
            {
                it("Should block explosive move", async function()
                {
                    sh.initActive("p1");
                    sh.initActive("p2", golduck);

                    pctx = init("p2",
                    {
                        move: dex.getMove(dex.moves["explosion"]), userRef: "p1"
                    });
                    await ph.handle(
                    {
                        args:
                        [
                            "cant", toIdent("p1"),
                            toEffectName("damp", "ability"),
                            toEffectName("explosion", "move")
                        ],
                        kwArgs: {of: toIdent("p2", golduck)}
                    });
                    await ph.halt();
                    await ph.return([{failed: true}]);
                });
            });
        });
    });

    describe("onTryUnboost()", function()
    {
        /** Initializes the onTryUnboost parser. */
        const init = setupUnorderedDeadline(ictx.startArgs,
            effectAbility.onTryUnboost);
        let pctx:
            ParserContext<[] | [Partial<dex.BoostTable<true>> | undefined]> |
            undefined;
        const ph = new ParserHelpers(() => pctx);

        afterEach("Close ParserContext", async function()
        {
            await ph.close().finally(() => pctx = undefined);
        });

        it("Should indicate blocked unboost effect", async function()
        {
            // can have clearbody (block-unboost ability)
            const metagross: SwitchOptions =
            {
                species: "metagross", level: 100, gender: "M", hp: 100,
                hpMax: 100
            };
            sh.initActive("p1");
            sh.initActive("p2", metagross);

            pctx = init("p2",
                {move: dex.getMove(dex.moves["charm"]), userRef: "p1"});
            await ph.handle(
            {
                args:
                [
                    "-fail", toIdent("p2", metagross), toEffectName("unboost")
                ],
                kwArgs:
                {
                    from: toEffectName("clearbody", "ability"),
                    of: toIdent("p2", metagross)
                }
            });
            await ph.halt();
            await ph.return([dex.boostNames]);
        });

        it("Should reject if move user ignores abilities", async function()
        {
            const mon = sh.initActive("p2", tentacruel);
            expect(mon.traits.ability.possibleValues)
                .to.have.keys("clearbody", "liquidooze");

            sh.initActive("p1").setAbility("moldbreaker");
            pctx = init("p2",
                {move: dex.getMove(dex.moves["charm"]), userRef: "p1"});
            await ph.halt();
            await ph.return([]);
            expect(mon.traits.ability.possibleValues)
                .to.have.keys("clearbody", "liquidooze");
        });

        it("Should infer no on-tryUnboost ability if it did not activate",
        async function()
        {
            sh.initActive("p1");
            const mon = sh.initActive("p2", tentacruel);
            expect(mon.traits.ability.possibleValues)
                .to.have.keys("clearbody", "liquidooze");

            pctx = init("p2",
                {move: dex.getMove(dex.moves["charm"]), userRef: "p1"});
            await ph.halt();
            await ph.return([]);
            expect(mon.traits.ability.possibleValues)
                .to.have.keys("liquidooze");
        });

        it("Shouldn't infer no on-tryUnboost ability if it did not activate " +
            "and ability is suppressed", async function()
        {
            sh.initActive("p1");
            const mon = sh.initActive("p2", tentacruel);
            mon.volatile.suppressAbility = true;
            expect(mon.traits.ability.possibleValues)
                .to.have.keys("clearbody", "liquidooze");

            pctx = init("p2",
                {move: dex.getMove(dex.moves["charm"]), userRef: "p1"});
            await ph.halt();
            await ph.return([]);
            expect(mon.traits.ability.possibleValues)
                .to.have.keys("clearbody", "liquidooze");
        });
    });

    describe("onStatus()", function()
    {
        /** Initializes the onStatus parser. */
        const init = setupUnorderedDeadline(ictx.startArgs,
            effectAbility.onStatus);
        let pctx: ParserContext<[] | [void]> | undefined;
        const ph = new ParserHelpers(() => pctx);

        afterEach("Close ParserContext", async function()
        {
            await ph.close().finally(() => pctx = undefined);
        });

        it("Should handle", async function()
        {
            const mon = sh.initActive("p1");
            mon.majorStatus.afflict("slp");
            mon.setAbility("insomnia");

            pctx = init("p1", "slp");
            await ph.handle(
            {
                args:
                [
                    "-activate", toIdent("p1"),
                    toEffectName("insomnia", "ability")
                ],
                kwArgs: {}
            });
            await ph.handle(
                {args: ["-curestatus", toIdent("p1"), "slp"], kwArgs: {}});
            await ph.halt();
            await ph.return([undefined]);
        });

        // can have limber or owntempo
        const glameow: SwitchOptions =
            {species: "glameow", level: 50, gender: "F", hp: 100, hpMax: 100};

        it("Should infer no on-status ability if it did not activate",
        async function()
        {
            const mon = sh.initActive("p2", glameow);
            mon.volatile.confusion.start();
            expect(mon.traits.ability.possibleValues)
                .to.have.keys("limber", "owntempo");

            pctx = init("p2", "confusion");
            await ph.halt();
            await ph.return([]);
            expect(mon.traits.ability.possibleValues).to.have.keys("limber");
        });

        it("Shouldn't infer no on-status ability if it did not activate and " +
            "ability is suppressed", async function()
        {
            const mon = sh.initActive("p2", glameow);
            mon.volatile.suppressAbility = true;
            mon.volatile.confusion.start();
            expect(mon.traits.ability.possibleValues)
                .to.have.keys("limber", "owntempo");

            pctx = init("p2", "confusion");
            await ph.halt();
            await ph.return([]);
            expect(mon.traits.ability.possibleValues)
                .to.have.keys("limber", "owntempo");
        });
    });

    describe("onMoveDamage()", function()
    {
        /** Initializes the onMoveDamage parser. */
        const init = setupUnorderedDeadline(ictx.startArgs,
            effectAbility.onMoveDamage);
        let pctx: ParserContext<[] | [void]> | undefined;
        const ph = new ParserHelpers(() => pctx);

        afterEach("Close ParserContext", async function()
        {
            await ph.close().finally(() => pctx = undefined);
        });

        describe("qualifier=contactKO", function()
        {
            it("Should handle", async function()
            {
                sh.initActive("p1").setAbility("aftermath");
                sh.initActive("p2");

                pctx = init("p1", "contactKO",
                    {move: dex.getMove(dex.moves["tackle"]), userRef: "p2"});
                await ph.handle(
                {
                    args: ["-damage", toIdent("p2"), toHPStatus(75, 100)],
                    kwArgs:
                    {
                        from: toEffectName("aftermath", "ability"),
                        of: toIdent("p1")
                    }
                });
                await ph.halt();
                await ph.return([undefined]);
            });

            // can have aftermath
            const drifblim: SwitchOptions =
            {
                species: "drifblim", level: 50, gender: "M", hp: 100,
                hpMax: 100
            };

            it("Should infer no on-moveContactKO ability if it did not " +
                "activate",
            async function()
            {
                sh.initActive("p1");
                const mon = sh.initActive("p2", drifblim);
                expect(mon.traits.ability.possibleValues)
                    .to.have.keys("aftermath", "unburden");

                pctx = init("p2", "contactKO",
                    {move: dex.getMove(dex.moves["tackle"]), userRef: "p1"});
                await ph.halt();
                await ph.return([]);
                expect(mon.traits.ability.possibleValues)
                    .to.have.keys("unburden");
            });

            it("Shouldn't infer no on-moveContactKO ability if it did not " +
                "activate and and ability is suppressed", async function()
            {
                sh.initActive("p1");
                const mon = sh.initActive("p2", drifblim);
                mon.volatile.suppressAbility = true;
                expect(mon.traits.ability.possibleValues)
                    .to.have.keys("aftermath", "unburden");

                pctx = init("p2", "contactKO",
                    {move: dex.getMove(dex.moves["tackle"]), userRef: "p1"});
                await ph.halt();
                await ph.return([]);
                expect(mon.traits.ability.possibleValues)
                    .to.have.keys("aftermath", "unburden");
            });

            describe("explosive", function()
            {
                it("Should infer non-blockExplosive ability for opponent",
                async function()
                {
                    sh.initActive("p1").setAbility("aftermath");
                    const mon = sh.initActive("p2", golduck);
                    expect(mon.traits.ability.possibleValues)
                        .to.have.keys(["damp", "cloudnine"]);

                    // activate explosive effect, meaning other side doesn't
                    //  have damp
                    pctx = init("p1", "contactKO",
                    {
                        move: dex.getMove(dex.moves["tackle"]), userRef: "p2"
                    });
                    await ph.handle(
                    {
                        args: ["-damage", toIdent("p2"), toHPStatus(75, 100)],
                        kwArgs:
                        {
                            from: toEffectName("aftermath", "ability"),
                            of: toIdent("p1")
                        }
                    });
                    await ph.halt();
                    await ph.return([undefined]);
                    expect(mon.traits.ability.possibleValues)
                        .to.have.keys(["cloudnine"]);
                });
            });
        });

        describe("qualifier=contact", function()
        {
            /** flamebody pokemon. */
            const magmar: SwitchOptions =
            {
                species: "magmar", level: 40, gender: "F", hp: 100, hpMax: 100
            };

            /** roughskin pokemon. */
            const sharpedo: SwitchOptions =
            {
                species: "sharpedo", level: 40, gender: "M", hp: 100, hpMax: 100
            };

            it("Should handle status effect", async function()
            {
                sh.initActive("p1");
                sh.initActive("p2", magmar);

                pctx = init("p2", "contact",
                    {move: dex.getMove(dex.moves["tackle"]), userRef: "p1"});
                await ph.handle(
                {
                    args: ["-status", toIdent("p1"), "brn"],
                    kwArgs:
                    {
                        from: toEffectName("flamebody", "ability"),
                        of: toIdent("p2", magmar)
                    }
                });
                await ph.halt();
                await ph.return([undefined]);
            });

            it("Should handle percentDamage effect", async function()
            {
                sh.initActive("p1");
                sh.initActive("p2", sharpedo);

                pctx = init("p2", "contact",
                    {move: dex.getMove(dex.moves["tackle"]), userRef: "p1"});
                await ph.handle(
                {
                    args: ["-damage", toIdent("p1"), toHPStatus(94, 100)],
                    kwArgs:
                    {
                        from: toEffectName("roughskin", "ability"),
                        of: toIdent("p2", sharpedo)
                    }
                });
                await ph.halt();
                await ph.return([undefined]);
            });

            it("Should still handle if qualifier=contactKO and effect " +
                "targets opponent", async function()
            {
                sh.initActive("p1");
                sh.initActive("p2", magmar);

                pctx = init("p2", "contactKO",
                    {move: dex.getMove(dex.moves["tackle"]), userRef: "p1"});
                await ph.handle(
                {
                    args: ["-status", toIdent("p1"), "brn"],
                    kwArgs:
                    {
                        from: toEffectName("flamebody", "ability"),
                        of: toIdent("p2", magmar)
                    }
                });
                await ph.halt();
                await ph.return([undefined]);
            });

            it("Should not handle if qualifier=damage", async function()
            {
                sh.initActive("p1");
                sh.initActive("p2", magmar);

                pctx = init("p2", "damage",
                    {move: dex.getMove(dex.moves["watergun"]), userRef: "p1"});
                await ph.halt();
                await ph.return([]);
            });

            it("Should infer no on-moveContact ability if it did not " +
                "activate", async function()
            {
                sh.initActive("p1");
                const mon = sh.initActive("p2");
                mon.setAbility("roughskin", "illuminate");

                pctx = init("p2", "contact",
                    {move: dex.getMove(dex.moves["tackle"]), userRef: "p1"});
                await ph.halt();
                await ph.return([]);
                expect(mon.traits.ability.possibleValues)
                    .to.have.keys("illuminate");
            });

            it("Shouldn't infer no on-moveContact ability if it did not " +
                "activate and and ability is suppressed", async function()
            {
                sh.initActive("p1");
                const mon = sh.initActive("p2");
                mon.volatile.suppressAbility = true;
                mon.setAbility("roughskin", "illuminate");

                pctx = init("p2", "contact",
                    {move: dex.getMove(dex.moves["tackle"]), userRef: "p1"});
                await ph.halt();
                await ph.return([]);
                expect(mon.traits.ability.possibleValues)
                    .to.have.keys("roughskin", "illuminate");
            });
        });

        describe("qualifier=damage", function()
        {
            it("Should infer no on-moveDamage ability if it did not activate",
                async function()
            {
                const mon = sh.initActive("p1");
                mon.setAbility("colorchange", "illuminate");
                sh.initActive("p2");

                pctx = init("p1", "damage",
                {
                    move: dex.getMove(dex.moves["watergun"]),
                    userRef: "p2"
                });
                await ph.halt();
                await ph.return([]);
                expect(mon.traits.ability.possibleValues)
                    .to.have.keys("illuminate");
            });

            it("Shouldn't infer no on-moveDamage ability if it did not " +
                "activate and and ability is suppressed", async function()
            {
                const mon = sh.initActive("p1")
                mon.volatile.suppressAbility = true;
                mon.setAbility("colorchange", "illuminate");
                sh.initActive("p2");

                pctx = init("p1", "damage",
                {
                    move: dex.getMove(dex.moves["watergun"]),
                    userRef: "p2"
                });
                await ph.halt();
                await ph.return([]);
                expect(mon.traits.ability.possibleValues)
                    .to.have.keys("colorchange", "illuminate");
            });

            describe("changeToMoveType (colorchange)", function()
            {
                /** colorchange pokemon. */
                const kecleon: SwitchOptions =
                {
                    species: "kecleon", level: 40, gender: "M", hp: 100,
                    hpMax: 100
                };

                it("Should handle", async function()
                {
                    sh.initActive("p1", kecleon);
                    sh.initActive("p2");

                    pctx = init("p1", "damage",
                    {
                        move: dex.getMove(dex.moves["watergun"]),
                        userRef: "p2"
                    });
                    await ph.handle(
                    {
                        args:
                        [
                            "-start", toIdent("p1", kecleon),
                            toEffectName("typechange"),
                            toTypes("water")
                        ],
                        kwArgs: {from: toEffectName("colorchange", "ability")}
                    });
                    await ph.halt();
                    await ph.return([undefined]);
                });

                it("Should not activate if KO'd", async function()
                {
                    const mon = sh.initActive("p1", kecleon);
                    mon.faint();
                    sh.initActive("p2");

                    pctx = init("p1", "damage",
                    {
                        move: dex.getMove(dex.moves["watergun"]), userRef: "p2"
                    });
                    await ph.halt();
                    await ph.return([]);
                });

                it("Should not activate if already same type", async function()
                {
                    const mon = sh.initActive("p1", kecleon);
                    mon.volatile.changeTypes(["fire", "???"]);
                    sh.initActive("p2");

                    pctx = init("p1", "damage",
                        {move: dex.getMove(dex.moves["ember"]), userRef: "p2"});
                    await ph.halt();
                    await ph.return([]);
                });

                it("Should infer hiddenpower type", async function()
                {
                    const {hpType} = sh.initActive("p1");
                    expect(hpType.definiteValue).to.be.null;
                    sh.initActive("p2", kecleon);

                    pctx = init("p2", "damage",
                    {
                        move: dex.getMove(dex.moves["hiddenpower"]),
                        userRef: "p1"
                    });
                    await ph.handle(
                    {
                        args:
                        [
                            "-start", toIdent("p2", kecleon),
                            toEffectName("typechange"), toTypes("water")
                        ],
                        kwArgs: {from: toEffectName("colorchange", "ability")}
                    });
                    await ph.halt();
                    await ph.return([undefined]);
                    expect(hpType.definiteValue).to.equal("water");
                });

                it("Should infer hiddenpower type if ability didn't " +
                    "activate", async function()
                {
                    const mon = sh.initActive("p1", kecleon);
                    mon.volatile.changeTypes(["ghost", "???"]);
                    const {hpType} = sh.initActive("p2");
                    expect(hpType.definiteValue).to.be.null;

                    pctx = init("p1", "damage",
                    {
                        move: dex.getMove(dex.moves["hiddenpower"]),
                        userRef: "p2"
                    });
                    await ph.halt();
                    await ph.return([]);
                    expect(hpType.definiteValue).to.equal("ghost");
                });

                it("Should infer judgment plate type", async function()
                {
                    const {item} = sh.initActive("p1");
                    expect(item.definiteValue).to.be.null;
                    sh.initActive("p2", kecleon);

                    pctx = init("p2", "damage",
                    {
                        move: dex.getMove(dex.moves["judgment"]), userRef: "p1"
                    });
                    await ph.handle(
                    {
                        args:
                        [
                            "-start", toIdent("p2", kecleon),
                            toEffectName("typechange"), toTypes("water")
                        ],
                        kwArgs: {from: toEffectName("colorchange", "ability")}
                    });
                    await ph.halt();
                    await ph.return([undefined]);
                    expect(item.definiteValue).to.equal("splashplate"); // water
                });

                it("Should infer judgment plate type if ability didn't " +
                    "activate", async function()
                {
                    const mon = sh.initActive("p1", kecleon);
                    mon.volatile.changeTypes(["electric", "???"]);
                    const {item} = sh.initActive("p2");
                    expect(item.definiteValue).to.be.null;

                    pctx = init("p1", "damage",
                    {
                        move: dex.getMove(dex.moves["judgment"]), userRef: "p2"
                    });
                    await ph.halt();
                    await ph.return([]);
                    expect(item.definiteValue).to.equal("zapplate"); // electric
                });
            });
        });
    });

    describe("onMoveDrain()", function()
    {
        /** Initializes the onMoveDrain parser. */
        const init = setupUnorderedDeadline(ictx.startArgs,
            effectAbility.onMoveDrain);
        let pctx: ParserContext<[] | ["invert" | undefined]> | undefined;
        const ph = new ParserHelpers(() => pctx);

        afterEach("Close ParserContext", async function()
        {
            await ph.close().finally(() => pctx = undefined);
        });

        it("Should infer no on-moveDrain ability if it did not activate",
        async function()
        {
            sh.initActive("p1");
            const mon = sh.initActive("p2", tentacruel);
            expect(mon.traits.ability.possibleValues)
                .to.have.keys("clearbody", "liquidooze");

            pctx = init("p2", "p1");
            await ph.halt();
            await ph.return([]);
            expect(mon.traits.ability.possibleValues).to.have.keys("clearbody");
        });

        it("Shouldn't infer no on-moveDrain ability if it did not activate " +
            "and and ability is suppressed", async function()
        {
            sh.initActive("p1");
            const mon = sh.initActive("p2", tentacruel);
            mon.volatile.suppressAbility = true;
            expect(mon.traits.ability.possibleValues)
                .to.have.keys("clearbody", "liquidooze");

            pctx = init("p2", "p1");
            await ph.halt();
            await ph.return([]);
            expect(mon.traits.ability.possibleValues)
                .to.have.keys("clearbody", "liquidooze");
        });

        describe("Invert", function()
        {
            it("Should handle", async function()
            {
                sh.initActive("p1");
                sh.initActive("p2", tentacruel);

                pctx = init("p2", "p1");
                await ph.handle(
                {
                    args: ["-damage", toIdent("p1"), toHPStatus(94, 100)],
                    kwArgs:
                    {
                        from: toEffectName("liquidooze", "ability"),
                        of: toIdent("p2", tentacruel)
                    }
                });
                await ph.return(["invert"]);
            });
        });
    });
});
