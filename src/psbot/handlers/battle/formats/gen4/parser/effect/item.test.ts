import { expect } from "chai";
import "mocha";
import { Event } from "../../../../../../parser";
import * as dex from "../../dex";
import { BattleState } from "../../state/BattleState";
import { Pokemon } from "../../state/Pokemon";
import { StatRange } from "../../state/StatRange";
import { smeargle } from "../../state/switchOptions.test";
import { SwitchOptions } from "../../state/Team";
import { createInitialContext, ParserContext } from "../Context.test";
import { ParserHelpers, setupBattleParser, setupUnorderedDeadline, toEffectName,
    toHPStatus, toIdent, toItemName, toMessage, toMoveName, toNum } from
    "../helpers.test";
import * as effectItem from "./item";

export const test = () => describe("item", function()
{
    const ictx = createInitialContext();
    const {sh} = ictx;

    let state: BattleState;

    beforeEach("Extract BattleState", function()
    {
        state = ictx.getState();
    });

    // can have cutecharm or magicguard
    const clefable: SwitchOptions =
        {species: "clefable", level: 50, gender: "F", hp: 100, hpMax: 100};

    function testHasItem(itemId: string, setup: () => Pokemon,
        takenName: string, taken: () => Promise<void>, absentName: string,
        absent: () => Promise<void>): void
    {
        it(`Should ${takenName}`, async function()
        {
            setup();
            await taken();
        });

        it(`Should infer no ${absentName} item if it did not activate`,
        async function()
        {
            const mon = setup();
            expect(mon.item.possibleValues).to.include.keys(itemId);
            await absent();
            expect(mon.item.possibleValues).to.not.have.keys(itemId);
        });
    }

    function testHPThreshold(itemId: string, setup: () => Pokemon,
        absent: () => Promise<void>): void
    {
        it("Shouldn't infer no item if above HP threshold and didn't activate",
        async function()
        {
            const mon = setup();
            expect(mon.item.possibleValues).to.include.keys(itemId);
            mon.hp.set(mon.hp.max); // should be outside hp threshold
            await absent();
            expect(mon.item.possibleValues).to.include.keys(itemId);
        });

        it("Should infer no item if below HP threshold and didn't activate",
        async function()
        {
            const mon = setup();
            expect(mon.item.possibleValues).to.include.keys(itemId);
            mon.hp.set(1); // should be below hp threshold
            await absent();
            expect(mon.item.possibleValues).to.not.include.keys(itemId);
        });
    }

    // note: only works for threshold=25
    function testEarlyBerryAbilities(itemId: string, abilities: string[],
        setup: () => Pokemon, taken: () => Promise<void>,
        absent: () => Promise<void>): void
    {
        it("Should infer early-berry ability if item activated within 25-50% " +
            "hp", async function()
        {
            const mon = setup();
            mon.setAbility(...abilities, "illuminate");
            // should be above 25% but at/below 50%
            mon.hp.set(Math.floor(mon.hp.max / 2));
            await taken();
            expect(mon.traits.ability.possibleValues)
                .to.have.keys(...abilities);
        });

        it("Should infer no early-berry ability if item confirmed but didn't " +
            "activate within 25-50% hp", async function()
        {
            const mon = setup();
            mon.setItem(itemId);
            mon.setAbility(...abilities, "illuminate");
            // should be above 25% but at/below 50%
            mon.hp.set(Math.floor(mon.hp.max / 2));
            await absent();
            expect(mon.traits.ability.possibleValues)
                .to.have.keys("illuminate");
        });

        it("Shouldn't infer item if didn't activate within 25-50% threshold " +
            "and ability suppressed", async function()
        {
            const mon = setup();
            // should be above 25% but at/below 50%
            mon.hp.set(Math.floor(mon.hp.max / 2));
            mon.setAbility(...abilities);
            mon.volatile.suppressAbility = true;
            await absent();
            expect(mon.item.possibleValues).to.include.keys(itemId);
            expect(mon.item.definiteValue).to.be.null;
        });

        it("Shouldn't infer ability if item activated within original hp " +
            "threshold", async function()
        {
            const mon = setup();
            mon.setAbility(...abilities, "illuminate");
            // should be below original 25% threshold
            mon.hp.set(Math.floor(mon.hp.max / 4));
            await taken();
            expect(mon.traits.ability.possibleValues)
                .to.have.keys(...abilities, "illuminate");
        });

        it("Shouldn't infer ability if item didn't activate within original " +
            "hp threshold", async function()
        {
            const mon = setup();
            mon.setAbility(...abilities, "illuminate");
            // should be below original 25% threshold
            mon.hp.set(Math.floor(mon.hp.max / 4));
            await absent();
            expect(mon.item.possibleValues).to.not.have.keys(itemId);
            expect(mon.traits.ability.possibleValues)
                .to.have.keys(...abilities, "illuminate");
        });
    }

    function testBlockingAbilities(itemId: string, abilities: string[],
        setup: () => Pokemon, taken: () => Promise<void>,
        absent: () => Promise<void>): void
    {
        it(`Should infer no blocking ability if item activated`,
        async function()
        {
            const mon = setup();
            mon.setAbility(...abilities, "illuminate");
            await taken();
            expect(mon.traits.ability.possibleValues)
                .to.have.keys("illuminate");
        });

        it("Should infer blocking ability if item is confirmed but didn't " +
            "activate", async function()
        {
            const mon = setup();
            mon.setAbility(...abilities, "illuminate");
            mon.setItem(itemId);
            await absent();
            expect(mon.traits.ability.possibleValues)
                .to.have.keys(...abilities);
        });

        it("Shouldn't infer blocking ability if suppressed and item activates",
            async function()
        {
            const mon = setup();
            mon.setAbility(...abilities, "illuminate");
            mon.volatile.suppressAbility = true;
            await taken();
            expect(mon.traits.ability.possibleValues)
                .to.have.keys(...abilities, "illuminate");
        });

        it("Should infer no item if blocking ability is suppressed and item " +
            "doesn't activate", async function()
        {
            const mon = setup();
            mon.setAbility(...abilities);
            mon.volatile.suppressAbility = true;
            await absent();
            expect(mon.item.possibleValues).to.not.have.keys(itemId);
        });
    }

    describe("updateItems()", function()
    {
        const init = setupBattleParser(ictx.startArgs, effectItem.updateItems);
        let pctx: ParserContext<void[]> | undefined;
        const ph = new ParserHelpers(() => pctx);

        afterEach("Close ParserContext", async function()
        {
            // reset variable so it doesn't leak into other tests
            await ph.close().finally(() => pctx = undefined);
        });

        it("Should update both sides", async function()
        {
            const us = sh.initActive("p1");
            us.setItem("sitrusberry");
            us.hp.set(1);
            const them = sh.initActive("p2");
            them.setItem("salacberry");
            them.hp.set(1);

            pctx = init();
            // p2's salacberry
            await ph.handle(
            {
                args: ["-enditem", toIdent("p2"), toItemName("salacberry")],
                kwArgs: {eat: true}
            });
            await ph.handle(
            {
                args: ["-boost", toIdent("p2"), "spe", toNum(1)],
                kwArgs: {from: toEffectName("salacberry", "item")}
            });
            // p1's sitrusberry
            await ph.handle(
            {
                args: ["-enditem", toIdent("p1"), toItemName("sitrusberry")],
                kwArgs: {eat: true}
            });
            await ph.handle(
            {
                args: ["-heal", toIdent("p1"), toHPStatus(25, 100)],
                kwArgs: {from: toEffectName("sitrusberry", "item")}
            });
            await ph.halt();
            await ph.return([undefined, undefined]);
        });
    });

    describe("onPreMove()", function()
    {
        const init = setupUnorderedDeadline(ictx.startArgs,
            effectItem.onPreMove);
        let pctx: ParserContext<[] | ["moveFirst" | void]> | undefined;
        const ph = new ParserHelpers(() => pctx);

        afterEach("Close ParserContext", async function()
        {
            await ph.close().finally(() => pctx = undefined);
        });

        function preMoveSetup(lowHP?: boolean)
        {
            sh.initActive("p1");
            const mon = sh.initActive("p2");
            if (lowHP) mon.hp.set(1);
            return mon;
        }

        async function preMoveTaken()
        {
            // custapberry requires pre-turn snapshot
            state.preTurn();

            pctx = init("p2");
            await ph.handle(
            {
                args: ["-enditem", toIdent("p2"), toItemName("custapberry")],
                kwArgs: {eat: true}
            });
            await ph.handle(
            {
                args: ["-message", toMessage("Custap Berry activated.")],
                kwArgs: {}
            });
            await ph.halt();
            await ph.return(["moveFirst"]);
        }

        async function preMoveAbsent()
        {
            // custapberry requires pre-turn snapshot
            state.preTurn();

            pctx = init("p2");
            await ph.halt();
            await ph.return([]);
        }

        testHasItem("custapberry", () => preMoveSetup(/*lowHP*/ true),
            "indicate increased move priority", preMoveTaken,
            "on-preMove", preMoveAbsent);
        // TODO: additional tests for lowHP=false?

        describe("HP threshold", () =>
            testHPThreshold("custapberry", preMoveSetup, preMoveAbsent));

        describe("Early-berry ability (gluttony)", () =>
            testEarlyBerryAbilities("custapberry", ["gluttony"],
                preMoveSetup, preMoveTaken, preMoveAbsent));

        describe("Item-ignoring ability (klutz)", () =>
            testBlockingAbilities("custapberry", ["klutz"],
                () => preMoveSetup(/*lowHP*/ true),
                preMoveTaken, preMoveAbsent));
    });

    describe("onMoveCharge()", function()
    {
        const init = setupUnorderedDeadline(ictx.startArgs,
            effectItem.onMoveCharge);
        let pctx: ParserContext<[] | ["shorten" | void]> | undefined;
        const ph = new ParserHelpers(() => pctx);

        afterEach("Close ParserContext", async function()
        {
            await ph.close().finally(() => pctx = undefined);
        });

        // TODO: add tests/options for other kinds of charging moves
        function moveChargeSetup(charge?: boolean)
        {
            sh.initActive("p1");
            const mon = sh.initActive("p2");
            if (charge) mon.volatile.twoTurn.start("solarbeam");
            return mon;
        }

        async function moveChargeTaken()
        {
            pctx = init("p2");
            await ph.handle(
            {
                args: ["-enditem", toIdent("p2"), toItemName("powerherb")],
                kwArgs: {}
            });
            await ph.halt();
            await ph.return(["shorten"]);
        }

        async function moveChargeAbsent()
        {
            pctx = init("p2");
            await ph.halt();
            await ph.return([]);
        }

        testHasItem("powerherb", () => moveChargeSetup(/*charge*/ true),
            "indicate shortened  two-turn move", moveChargeTaken,
            "on-moveCharge", moveChargeAbsent);
        // TODO: additional tests for charge=false

        it("Shouldn't infer no consumeOn-moveCharge item if it did not " +
            "activate and the effect should've been silent",
        async function()
        {
            const mon = moveChargeSetup();
            mon.volatile.embargo.start();
            expect(mon.item.possibleValues).to.include.keys("powerherb");
            expect(mon.item.definiteValue).to.be.null;
            await moveChargeAbsent();
            expect(mon.item.possibleValues).to.include.keys("powerherb");
            expect(mon.item.definiteValue).to.be.null;
        });

        describe("Item-ignoring ability (klutz)", () =>
            testBlockingAbilities("powerherb", ["klutz"],
                () => moveChargeSetup(/*charge*/ true),
                moveChargeTaken, moveChargeAbsent));
    });

    describe("onPreHit()", function()
    {
        const init = setupUnorderedDeadline(ictx.startArgs,
            effectItem.onPreHit);
        let pctx: ParserContext<[] | [dex.ItemPreHitResult | void]> | undefined;
        const ph = new ParserHelpers(() => pctx);

        afterEach("Close ParserContext", async function()
        {
            await ph.close().finally(() => pctx = undefined);
        });

        function preHitSetup(weak?: boolean)
        {
            sh.initActive("p1");
            const mon = sh.initActive("p2");
            if (weak) mon.volatile.addedType = "flying";
            return mon;
        }

        async function preHitTaken()
        {
            pctx = init("p2",
            {
                move: dex.getMove(dex.moves["thunder"]),
                user: state.getTeam("p1").active
            });
            await ph.handle(
            {
                args: ["-enditem", toIdent("p2"), toItemName("wacanberry")],
                kwArgs: {eat: true}
            });
            await ph.handle(
            {
                args: ["-enditem", toIdent("p2"), toItemName("wacanberry")],
                kwArgs: {weaken: true}
            });
            await ph.halt();
            await ph.return([{resistSuper: "electric"}]);
        }

        async function preHitAbsent()
        {
            pctx = init("p2",
            {
                move: dex.getMove(dex.moves["thunder"]),
                user: state.getTeam("p1").active
            });
            await ph.halt();
            await ph.return([]);
        }

        testHasItem("wacanberry", () => preHitSetup(/*weak*/ true),
            "indicate resist berry effect", preHitTaken,
            "on-preHit", preHitAbsent);
        // TODO: additional tests for weak=false

        // TODO: test moveIsType

        it("Should reject if not super-effective", async function()
        {
            preHitSetup();

            pctx = init("p2",
            {
                move: dex.getMove(dex.moves["thunder"]),
                user: state.getTeam("p1").active
            });
            await ph.reject(
            {
                args: ["-enditem", toIdent("p2"), toItemName("rindoberry")],
                kwArgs: {eat: true}
            });
            await ph.return([]);
        });

        describe("Item-ignoring ability (klutz)", () =>
            testBlockingAbilities("wacanberry", ["klutz"],
                () => preHitSetup(/*weak*/ true),
                preHitTaken, preHitAbsent));
    });

    describe("onTryOHKO()", function()
    {
        const init = setupUnorderedDeadline(ictx.startArgs,
            effectItem.onTryOHKO);
        let pctx: ParserContext<[] | [void]> | undefined;
        const ph = new ParserHelpers(() => pctx);

        afterEach("Close ParserContext", async function()
        {
            await ph.close().finally(() => pctx = undefined);
        });

        function tryOHKOSetup(hp = 1, maxhp = 100, percent?: boolean)
        {
            const monRef = percent ? "p2" : "p1";
            const mon = sh.initActive(monRef);
            mon.hp.set(hp, maxhp);
            return mon;
        }

        async function tryOHKOTaken(percent?: boolean)
        {
            const monRef = percent ? "p2" : "p1";
            pctx = init(monRef);
            await ph.handle(
            {
                args: ["-enditem", toIdent(monRef), toItemName("focussash")],
                kwArgs: {}
            });
            await ph.halt();
            await ph.return([undefined]);
        }

        async function tryOHKOAbsent(percent?: boolean)
        {
            const monRef = percent ? "p2" : "p1";
            pctx = init(monRef);
            await ph.halt();
            await ph.return([]);
        }

        testHasItem("focussash", tryOHKOSetup, "activate item", tryOHKOTaken,
            "on-tryOHKO", tryOHKOAbsent);

        describe("Item-ignoring ability (klutz)", () =>
            testBlockingAbilities("focussash", ["klutz"],
                () => tryOHKOSetup(), tryOHKOTaken, tryOHKOAbsent));

        describe("HP % rounding", function()
        {
            async function shouldAcceptTaken(mon: Pokemon)
            {
                const item = mon.item.possibleValues;
                expect(item).to.include.keys("focussash");
                await tryOHKOTaken(mon.team!.side !== state.ourSide);
                expect(item).to.equal(mon.lastItem.possibleValues)
                    .and.to.have.keys("focussash");
            }

            async function shouldAcceptAbsent(mon: Pokemon)
            {
                const item = mon.item.possibleValues;
                expect(item).to.include.keys("focussash");
                await tryOHKOAbsent(mon.team!.side !== state.ourSide);
                expect(item).to.equal(mon.item.possibleValues)
                    .and.to.not.have.keys("focussash");
            }

            it("Should reject if hp = 0", async function()
            {
                tryOHKOSetup(0);
                await tryOHKOAbsent();
            });

            it("Should reject if hp values known and hp > 1",
            async function()
            {
                tryOHKOSetup(2);
                await tryOHKOAbsent();
            });

            it("Should accept if hp known and hp = 1", async function()
            {
                // taken case
                await shouldAcceptTaken(tryOHKOSetup(1));
                // absent case
                await shouldAcceptAbsent(tryOHKOSetup(1));
            });

            describe("Unknown hp", function()
            {
                function setup(opts: SwitchOptions, hpDisplay: number)
                {
                    const mon = sh.initActive("p2", opts);
                    mon.hp.set(hpDisplay)
                    return mon;
                }

                function testUnknownHP(opts: SwitchOptions, actualMaxHP: number)
                {
                    // max hp under 100 but can be over 100:
                    const actualPercent = Math.ceil(100 / actualMaxHP);

                    const {min: minPossibleHP} =
                        new StatRange(
                            dex.pokemon[opts.species].baseStats.hp,
                            opts.level, /*hp*/ true);
                    // 1hp percentage with min possible hp stat
                    // this is the highest possible hp display value at 1hp
                    const minPercent = Math.ceil(100 / minPossibleHP);

                    it("Should handle item", async function()
                    {
                        setup(opts, actualPercent);
                        await tryOHKOTaken(true);
                    });

                    if (minPercent <= 50)
                    {
                        it("Should reject if definitely over 1 hp (e.g. " +
                            `${minPercent + 1}%)`, async function()
                        {
                            setup(opts, minPercent + 1);
                            await tryOHKOAbsent(/*percent*/ true);
                        });
                    }
                }

                function shouldRuleOut(opts: SwitchOptions, hpDisplay: number,
                    comment?: string)
                {
                    it("Should rule out item if it did not activate at " +
                        `${hpDisplay}%${comment}`, async function()
                    {
                        const mon = setup(opts, hpDisplay);
                        expect(mon.item.possibleValues)
                            .to.include.keys("focussash");
                        await tryOHKOAbsent(true);
                        expect(mon.item.possibleValues)
                            .to.not.include.keys("focussash");
                    });
                }

                function shouldNotRuleOut(opts: SwitchOptions,
                    hpDisplay: number, comment?: string)
                {
                    it("Should not rule out item if it did not activate " +
                        `at ${hpDisplay}%${comment}`, async function()
                    {
                        const mon = setup(opts, hpDisplay);
                        expect(mon.item.possibleValues)
                            .to.include.keys("focussash");
                        await tryOHKOAbsent(true);
                        expect(mon.item.possibleValues)
                            .to.include.keys("focussash");
                    });
                }

                describe("Max hp = 1", async function()
                {
                    const shedinja: SwitchOptions =
                    {
                        species: "shedinja", gender: "N", level: 50, hp: 100,
                        hpMax: 100
                    };
                    testUnknownHP(shedinja, 1);
                    shouldRuleOut(shedinja, 100);
                });

                describe("Max hp under 100", async function()
                {
                    const opts = {...smeargle, level: 10}; // 31-40
                    testUnknownHP(opts, 35);
                    shouldRuleOut(opts, 3, " (1hp)");
                });

                describe("Max hp under 100 but can be over 100",
                async function()
                {
                    const opts = {...smeargle, level: 40}; // 94-131
                    testUnknownHP(opts, 95);
                    shouldNotRuleOut(opts, 2, " (can be 1hp)");
                });

                describe("Max hp over 100 but can be under 100",
                async function()
                {
                    const opts = {...smeargle, level: 40}; // 94-131
                    testUnknownHP(opts, 105);
                    shouldRuleOut(opts, 1);
                    shouldNotRuleOut(opts, 2, " (can be 1hp)");
                });

                describe("Max hp between 100 and 200 exclusive",
                async function()
                {
                    const opts = {...smeargle, level: 50}; // 115-162
                    testUnknownHP(opts, 120);
                    shouldRuleOut(opts, 1);
                });

                describe("Max hp under 200 but can be over 200",
                async function()
                {
                    const opts = {...smeargle, level: 75}; // 167-238
                    testUnknownHP(opts, 195);
                    shouldNotRuleOut(opts, 1, " (can be 1hp)");
                });

                describe("Max hp over 200 but can be under 200",
                async function()
                {
                    const opts = {...smeargle, level: 75}; // 167-238
                    testUnknownHP(opts, 205);
                    shouldNotRuleOut(opts, 1, " (can be 1hp)");
                });

                describe("Max hp over 200", async function()
                {
                    const opts = {...smeargle, level: 100}; // 220-314
                    testUnknownHP(opts, 250);
                    shouldNotRuleOut(opts, 1, " (can be 1hp)");
                });
            });
        });
    });

    describe("onSuper()", function()
    {
        const init = setupUnorderedDeadline(ictx.startArgs,
            effectItem.onSuper);
        let pctx: ParserContext<[] | [void]> | undefined;
        const ph = new ParserHelpers(() => pctx);

        afterEach("Close ParserContext", async function()
        {
            await ph.close().finally(() => pctx = undefined);
        });

        function superSetup(weak?: boolean)
        {
            sh.initActive("p1");
            const mon = sh.initActive("p2");
            if (weak)
            {
                mon.volatile.addedType = "ice";
                mon.hp.set(1);
            }
            return mon;
        }

        // TODO: options for silent, heal holder
        async function superTaken()
        {
            pctx = init("p2",
            {
                move: dex.getMove(dex.moves["lowkick"]),
                user: state.getTeam("p1").active
            });
            await ph.handle(
            {
                args: ["-enditem", toIdent("p2"), toItemName("enigmaberry")],
                kwArgs: {eat: true}
            });
            await ph.handle(
            {
                args: ["-heal", toIdent("p2"), toHPStatus(100, 100)],
                kwArgs: {from: toEffectName("enigmaberry", "item")}
            });
            await ph.halt();
            await ph.return([undefined]);
        }

        async function superAbsent()
        {
            pctx = init("p2",
            {
                move: dex.getMove(dex.moves["lowkick"]),
                user: state.getTeam("p1").active
            });
            await ph.halt();
            await ph.return([]);
        }

        testHasItem("enigmaberry", () => superSetup(/*weak*/ true),
            "handle heal effect", superTaken, "on-super", superAbsent);
        // TODO: additional tests for weak=false

        it("Should handle silent heal effect", async function()
        {
            // full hp
            superSetup(/*weak*/ true).hp.set(100, 100);

            pctx = init("p2",
            {
                move: dex.getMove(dex.moves["lowkick"]),
                user: state.getTeam("p1").active
            });
            await ph.halt();
            await ph.return([]);
        });

        describe("Item-ignoring ability (klutz)", () =>
            testBlockingAbilities("enigmaberry", ["klutz"],
                () => superSetup(/*weak*/ true), superTaken, superAbsent));

        // TODO: test moveIsType
    });

    describe("onPostHit()", function()
    {
        const init = setupUnorderedDeadline(ictx.startArgs,
            effectItem.onPostHit);
        let pctx: ParserContext<[] | [void]> | undefined;
        const ph = new ParserHelpers(() => pctx);

        afterEach("Close ParserContext", async function()
        {
            await ph.close().finally(() => pctx = undefined);
        });

        function postHitSetup()
        {
            sh.initActive("p1");
            return sh.initActive("p2");
        }

        // TODO: options for silent, damage user, heal holder
        async function postHitTaken(move: dex.MoveData, itemId: string)
        {
            pctx = init("p2", {move: dex.getMove(move), userRef: "p1"});
            await ph.handle(
            {
                args: ["-enditem", toIdent("p2"), toItemName(itemId)],
                kwArgs: {eat: true}
            });
            await ph.handle(
            {
                args: ["-damage", toIdent("p1"), toHPStatus(88, 100)],
                kwArgs: {from: toEffectName(itemId, "item"), of: toIdent("p2")}
            });
            // since damage effect checks for any pending on-damage effects, it
            //  needs to explicitly fail for the consumeOn-postHit parser to
            //  return
            await ph.halt();
            await ph.return([undefined]);
        }

        async function postHitAbsent(move: dex.MoveData)
        {
            pctx = init("p2", {move: dex.getMove(move), userRef: "p1"});
            await ph.halt();
            await ph.return([]);
        }

        for (const [category, item] of
            [["physical", "jabocaberry"], ["special", "rowapberry"]] as const)
        {
            describe(`condition = ${category} (${item})`, function()
            {
                const move =
                    dex.moves[category === "physical" ? "tackle" : "ember"];

                const postHitCategorySetup = postHitSetup;
                const postHitCategoryTaken =
                    () => postHitTaken(move, item);
                const postHitCategoryAbsent = () => postHitAbsent(move);

                testHasItem(item, postHitCategorySetup,
                    `handle ${category} damage effect`, postHitCategoryTaken,
                    "on-postHit", postHitCategoryAbsent);

                it("Should handle silent damage effect", async function()
                {
                    sh.initActive("p1").setItem(item);
                    sh.initActive("p2").hp.set(0);

                    pctx = init("p1", {move: dex.getMove(move), userRef: "p2"});
                    await ph.handle(
                    {
                        args: ["-enditem", toIdent("p1"), toItemName(item)],
                        kwArgs: {eat: true}
                    });
                    await ph.halt();
                    await ph.return([undefined]);
                });

                describe("Item-ignoring ability (klutz)", () =>
                    testBlockingAbilities(item, ["klutz"],
                        postHitCategorySetup, postHitCategoryTaken,
                        postHitCategoryAbsent));
            });
        }
    });

    describe("onMovePostDamage()", function()
    {
        const init = setupUnorderedDeadline(ictx.startArgs,
            effectItem.onMovePostDamage);
        let pctx: ParserContext<[] | [void]> | undefined;
        const ph = new ParserHelpers(() => pctx);

        afterEach("Close ParserContext", async function()
        {
            await ph.close().finally(() => pctx = undefined);
        });

        function movePostDamageSetup()
        {
            sh.initActive("p1");
            return sh.initActive("p2");
        }

        // TODO: options for silent, damage user, heal holder
        async function movePostDamageTaken(itemId: string)
        {
            pctx = init("p2");
            await ph.handle(
            {
                args: ["-damage", toIdent("p2"), toHPStatus(90, 100)],
                kwArgs: {from: toEffectName(itemId, "item")}
            });
            await ph.halt();
            await ph.return([undefined]);
        }

        async function movePostDamageAbsent()
        {
            pctx = init("p2");
            await ph.halt();
            await ph.return([]);
        }

        testHasItem("lifeorb", movePostDamageSetup,
            "handle percentDamage effect", () => movePostDamageTaken("lifeorb"),
            "on-movePostDamage", movePostDamageAbsent);

        it("Should handle silent percentDamage effect", async function()
        {
            const mon = sh.initActive("p2");
            mon.hp.set(0);
            expect(mon.item.possibleValues).to.include.keys("lifeorb");
            expect(mon.item.definiteValue).to.be.null;

            pctx = init("p2");
            await ph.halt();
            await ph.return([]);
            expect(mon.item.possibleValues).to.include.keys("lifeorb");
            expect(mon.item.definiteValue).to.be.null;
        });

        it("Should infer no magicguard if damaged", async function()
        {
            sh.initActive("p1");
            const mon = sh.initActive("p2", clefable);
            expect(mon.traits.ability.possibleValues)
                .to.have.keys("cutecharm", "magicguard");

            pctx = init("p2");
            await ph.handle(
            {
                args: ["-damage", toIdent("p2", clefable), toHPStatus(90, 100)],
                kwArgs: {from: toEffectName("lifeorb", "item")}
            });
            await ph.halt();
            await ph.return([undefined]);
            expect(mon.traits.ability.possibleValues)
                .to.have.keys("cutecharm");
            expect(mon.traits.ability.definiteValue).to.equal("cutecharm");
        });

        it("Should reject if damaged while having magicguard", async function()
        {
            const mon = sh.initActive("p2", clefable);
            mon.setAbility("magicguard");

            pctx = init("p2");
            await ph.reject(
            {
                args: ["-damage", toIdent("p2", clefable), toHPStatus(90, 100)],
                kwArgs: {from: toEffectName("lifeorb", "item")}
            });
            await ph.return([]);
        });

        function testItemSuppression(name: string, ability: string,
            switchOptions: SwitchOptions, itemName: string,
            itemEvents: readonly Event[]): void
        {
            describe(name, function()
            {
                const otherAbilities =
                    dex.pokemon[switchOptions.species].abilities
                        .filter(n => n !== ability);

                it(`Should infer no ${ability} if item activated`,
                async function()
                {
                    sh.initActive("p1");
                    const mon = sh.initActive("p2", switchOptions);
                    expect(mon.traits.ability.possibleValues)
                        .to.have.keys(ability, ...otherAbilities);

                    pctx = init("p2");
                    for (const event of itemEvents) await ph.handle(event);
                    await ph.halt();
                    await ph.return([undefined]);
                    expect(mon.traits.ability.possibleValues)
                        .to.have.keys(...otherAbilities);
                });

                it(`Should infer ${ability} if item is confirmed but didn't ` +
                    "activate", async function()
                {
                    sh.initActive("p1");
                    const mon = sh.initActive("p2", switchOptions);
                    mon.setItem(itemName);
                    expect(mon.traits.ability.possibleValues)
                        .to.have.keys(ability, ...otherAbilities);

                    pctx = init("p2");
                    await ph.halt();
                    await ph.return([]);
                    expect(mon.traits.ability.possibleValues)
                        .to.have.keys(ability);
                });

                it("Shouldn't infer ability if suppressed and item activates",
                async function()
                {
                    sh.initActive("p1");
                    const mon = sh.initActive("p2", switchOptions);
                    mon.volatile.suppressAbility = true;
                    expect(mon.traits.ability.possibleValues)
                        .to.have.keys(ability, ...otherAbilities);

                    pctx = init("p2");
                    for (const event of itemEvents) await ph.handle(event);
                    await ph.halt();
                    await ph.return([undefined]);
                    expect(mon.traits.ability.possibleValues)
                        .to.have.keys(ability, ...otherAbilities);
                });

                it("Should infer no item if ability suppressed and the item " +
                    "doesn't activate", async function()
                {
                    const mon = sh.initActive("p2", switchOptions);
                    mon.volatile.suppressAbility = true;
                    expect(mon.traits.ability.possibleValues)
                        .to.have.keys(ability, ...otherAbilities);
                    expect(mon.item.possibleValues)
                        .to.include.keys(itemName);

                    pctx = init("p2");
                    await ph.halt();
                    await ph.return([]);
                    expect(mon.traits.ability.possibleValues)
                        .to.have.keys(ability, ...otherAbilities);
                    expect(mon.item.possibleValues)
                        .to.not.have.keys(itemName);
                });
            });
        }

        // can have cutecharm or klutz
        const lopunny: SwitchOptions =
        {
            species: "lopunny", level: 50, gender: "F", hp: 100, hpMax: 100
        };

        testItemSuppression("Klutz", "klutz", lopunny, "lifeorb",
            [{
                args: ["-damage", toIdent("p2", lopunny), toHPStatus(90, 100)],
                kwArgs: {from: toEffectName("lifeorb", "item")}
            }]);
        testItemSuppression("Magic Guard", "magicguard", clefable, "lifeorb",
            [{
                args: ["-damage", toIdent("p2", clefable), toHPStatus(90, 100)],
                kwArgs: {from: toEffectName("lifeorb", "item")}
            }]);
    });

    describe("onUpdate()", function()
    {
        const init = setupUnorderedDeadline(ictx.startArgs,
            effectItem.onUpdate);
        let pctx: ParserContext<[] | [void]> | undefined;
        const ph = new ParserHelpers(() => pctx);

        afterEach("Close ParserContext", async function()
        {
            await ph.close().finally(() => pctx = undefined);
        });

        function updateSetup()
        {
            return sh.initActive("p2");
        }

        async function updateTaken(itemId: string, ...events: Event[])
        {
            pctx = init("p2");
            await ph.handle(
            {
                args: ["-enditem", toIdent("p2"), toItemName(itemId)],
                kwArgs: {eat: true}
            });
            for (const event of events) await ph.handle(event);
            await ph.halt();
            await ph.return([undefined]);
        }

        async function updateAbsent()
        {
            pctx = init("p2");
            await ph.halt();
            await ph.return([]);
        }

        describe("condition = hp", function()
        {
            function updateHPSetup(lowHP?: boolean)
            {
                const mon = updateSetup();
                if (lowHP) mon.hp.set(1); // within hp threshold
                return mon;
            }

            const updateHPTaken = updateTaken;

            const updateHPAbsent = updateAbsent;
            // TODO: additional tests for lowHP=false

            testHPThreshold("sitrusberry",
                () => updateHPSetup(/*lowHP*/ true), updateHPAbsent);

            const updateHPHealSetup = updateHPSetup;
            const updateHPHealTaken = (itemId: string, ...events: Event[]) =>
                updateTaken(itemId,
                {
                    args: ["-heal", toIdent("p2"), toHPStatus(26, 100)],
                    kwArgs: {from: toEffectName(itemId, "item")}
                },
                ...events);
            const updateHPHealAbsent = updateHPAbsent;

            for (const [name, itemId, dislike] of
            [
                ["healPercent", "sitrusberry", "figyberry"],
                ["healFixed", "oranberry"]
            ])
            {
                describe(name, function()
                {
                    testHasItem("sitrusberry",
                        () => updateHPHealSetup(/*lowHP*/ true),
                        "handle heal effect", () => updateHPHealTaken(itemId),
                        `on-update ${name}`, updateHPHealAbsent);

                    if (!dislike) return;

                    it("Should handle dislike berry", async function()
                    {
                        updateHPHealSetup(/*lowHP*/ true);

                        await updateHPHealTaken(dislike,
                        {
                            args:
                            [
                                "-start", toIdent("p2"),
                                toEffectName("confusion")
                            ],
                            kwArgs: {}
                        });
                    });
                });
            }

            const updateHPBoostSetup = updateHPSetup;

            const updateHPBoostTaken = () => updateHPTaken("starfberry",
            {
                args: ["-boost", toIdent("p2"), "atk", toNum(2)],
                kwArgs: {from: toEffectName("starfberry", "item")}
            });

            const updateHPBoostAbsent = updateHPAbsent;

            describe("boost", function()
            {
                testHasItem("starfberry",
                    () => updateHPBoostSetup(/*lowHP*/ true),
                    "handle boost effect", updateHPBoostTaken,
                    "on-update boost", updateHPBoostAbsent)

                it("Should throw if invalid boost", async function()
                {
                    updateHPBoostSetup(/*lowHP*/ true);

                    pctx = init("p2");
                    await ph.handle(
                    {
                        args:
                        [
                            "-enditem", toIdent("p2"), toItemName("starfberry")
                        ],
                        kwArgs: {eat: true}
                    });
                    await ph.rejectError(
                    {
                        args: ["-boost", toIdent("p2"), "evasion", toNum(2)],
                        kwArgs: {from: toEffectName("starfberry", "item")}
                    },
                        Error, "On-eat boost effect failed");
                });

                it("Should throw if no boost effect", async function()
                {
                    updateHPSetup(/*lowHP*/ true);

                    pctx = init("p2");
                    await ph.handle(
                    {
                        args:
                        [
                            "-enditem", toIdent("p2"), toItemName("starfberry")
                        ],
                        kwArgs: {eat: true}
                    });
                    await ph.haltError(Error,
                        "On-eat boost effect failed");
                });
            });

            describe("focusenergy", function()
            {
                it("Should handle focusenergy effect", async function()
                {
                    updateHPSetup(/*lowHP*/ true);

                    pctx = init("p2");
                    await ph.handle(
                    {
                        args:
                        [
                            "-enditem", toIdent("p2"), toItemName("lansatberry")
                        ],
                        kwArgs: {eat: true}
                    });
                    await ph.handle(
                    {
                        args:
                        [
                            "-start", toIdent("p2"),
                            toEffectName("Focus Energy")
                        ],
                        kwArgs: {}
                    });
                    await ph.halt();
                    await ph.return([undefined]);
                });

                it("Should throw if no focusenergy effect", async function()
                {
                    updateHPSetup(/*lowHP*/ true);

                    pctx = init("p2");
                    await ph.handle(
                    {
                        args:
                        [
                            "-enditem", toIdent("p2"), toItemName("lansatberry")
                        ],
                        kwArgs: {eat: true}
                    });
                    await ph.haltError(Error,
                        "On-eat focusenergy effect failed");
                });
            });

            describe("Early-berry ability (gluttony)", () =>
                testEarlyBerryAbilities("starfberry", ["gluttony"],
                    updateHPBoostSetup, updateHPBoostTaken,
                    updateHPBoostAbsent));

            describe("Item-ignoring ability (klutz)", () =>
                testBlockingAbilities("sitrusberry", ["klutz"],
                    () => updateHPHealSetup(/*lowHP*/ true),
                    () => updateHPHealTaken("sitrusberry"),
                    updateHPHealAbsent));
        });

        describe("condition = status", function()
        {
            // TODO: test each kind of consumeOn-status item
            function updateStatusSetup(statused?: boolean)
            {
                const mon = updateSetup();
                if (statused)
                {
                    mon.majorStatus.afflict("slp");
                    mon.volatile.confusion.start();
                }
                return mon;
            }

            // TODO: test each kind of consumeOn-update hp effect/item
            const updateStatusTaken = () => updateTaken("lumberry",
                {args: ["-curestatus", toIdent("p2"), "slp"], kwArgs: {}},
                {
                    args: ["-end", toIdent("p2"), toEffectName("confusion")],
                    kwArgs: {}
                });
            const updateStatusAbsent = updateAbsent;

            testHasItem("cheriberry",
                () => updateStatusSetup(/*statused*/ true),
                "handle cure effect", updateStatusTaken, "on-update cure",
                updateStatusAbsent);
            // TODO: additional tests for updateStatused=false

            describe("Item-ignoring ability (klutz)", () =>
                testBlockingAbilities("lumberry", ["klutz"],
                    () => updateStatusSetup(/*statused*/ true),
                    updateStatusTaken, updateStatusAbsent));

            it("Should throw if no cure effect", async function()
            {
                updateStatusSetup(/*statused*/ true).setItem("lumberry");

                pctx = init("p2");
                await ph.handle(
                {
                    args: ["-enditem", toIdent("p2"), toItemName("lumberry")],
                    kwArgs: {eat: true}
                });
                await ph.haltError(Error,
                    "On-eat cure effect failed: Missing cure events: " +
                    "[slp, confusion]");
            });

            it("Should throw if partial cure effect", async function()
            {
                updateStatusSetup(/*statused*/ true);

                pctx = init("p2");
                await ph.handle(
                {
                    args: ["-enditem", toIdent("p2"), toItemName("lumberry")],
                    kwArgs: {eat: true}
                });
                await ph.handle(
                    {args: ["-curestatus", toIdent("p2"), "slp"], kwArgs: {}});
                await ph.haltError(Error,
                    "On-eat cure effect failed: Missing cure events: " +
                    "[confusion]");
            });
        });

        describe("condition = depleted", function()
        {
            function updateDepletedSetup(depleted?: boolean): Pokemon
            {
                const mon = updateSetup();
                const move = mon.moveset.reveal("tackle");
                if (depleted) move.pp = 0;
                return mon;
            }

            // TODO: add item effect events as parameter
            async function updateDepletedTaken(): Promise<void>
            {
                await updateTaken("leppaberry",
                {
                    args:
                    [
                        "-activate", toIdent("p2"),
                        toEffectName("leppaberry", "item"), toMoveName("tackle")
                    ],
                    kwArgs: {consumed: true}
                });
                const mon = state.getTeam("p2").active;
                expect(mon.moveset.get("tackle")).to.have.property("pp", 10);
            }
            const updateDepletedAbsent = updateAbsent;

            testHasItem("leppaberry",
                () => updateDepletedSetup(/*depleted*/ true),
                "handle restore effect", updateDepletedTaken,
                "on-update restore", updateDepletedAbsent);
            // TODO: additional tests for depleted=false

            // TODO(later): handle move pp ambiguity corner cases

            it("Should throw if no restore effect", async function()
            {
                updateDepletedSetup(/*depleted*/ true)

                pctx = init("p2");
                await ph.handle(
                {
                    args: ["-enditem", toIdent("p2"), toItemName("leppaberry")],
                    kwArgs: {eat: true}
                });
                await ph.haltError(Error,
                    "On-eat restore effect failed: Missing |-activate| event");
            });

            describe("Item-ignoring ability (klutz)", () =>
                testBlockingAbilities("leppaberry", ["klutz"],
                    () => updateDepletedSetup(/*depleted*/ true),
                    updateDepletedTaken, updateDepletedAbsent));
        });
    });

    describe("onResidual()", function()
    {
        const init = setupUnorderedDeadline(ictx.startArgs,
            effectItem.onResidual);
        let pctx: ParserContext<void[]> | undefined;
        const ph = new ParserHelpers(() => pctx);

        afterEach("Close ParserContext", async function()
        {
            // reset variable so it doesn't leak into other tests
            await ph.close().finally(() => pctx = undefined);
        });

        function residualSetup(lowHP?: boolean)
        {
            const mon = sh.initActive("p2");
            if (lowHP) mon.hp.set(1);
            return mon;
        }

        async function residualTaken(...events: Event[])
        {
            pctx = init("p2");
            for (const event of events) await ph.handle(event);
            await ph.halt();
            await ph.return([undefined]);
        }

        async function residualAbsent()
        {
            pctx = init("p2");
            await ph.halt();
            await ph.return([]);
        }

        const micleEvent: Event =
        {
            args: ["-enditem", toIdent("p2"), toItemName("micleberry")],
            kwArgs: {eat: true}
        };

        testHasItem("micleberry", () => residualSetup(/*lowHP*/ true),
            "handle item", () => residualTaken(micleEvent), "on-residual",
            residualAbsent);
        // TODO: additional tests for noStatus=false

        describe("Item-ignoring ability (klutz)", () =>
            testBlockingAbilities("micleberry", ["klutz"],
                () => residualSetup(/*lowHP*/ true),
                () => residualTaken(micleEvent), residualAbsent));

        describe("poison/noPoison", function()
        {
            // poison type
            const nidoqueen: SwitchOptions =
            {
                species: "nidoqueen", level: 83, gender: "F", hp: 100,
                hpMax: 100
            };

            it("Should have poison effect if poison type", async function()
            {
                sh.initActive("p2", nidoqueen).hp.set(90);

                pctx = init("p2");
                await ph.handle(
                {
                    args:
                    [
                        "-heal", toIdent("p2", nidoqueen), toHPStatus(100, 100)
                    ],
                    kwArgs: {from: toEffectName("blacksludge", "item")}
                });
                await ph.halt();
                await ph.return([undefined]);
            });

            it("Should have noPoison effect if not poison type",
                async function()
            {
                sh.initActive("p2");

                pctx = init("p2");
                await ph.handle(
                {
                    args: ["-damage", toIdent("p2"), toHPStatus(88, 100)],
                    kwArgs: {from: toEffectName("blacksludge", "item")}
                });
                await ph.halt();
                await ph.return([undefined]);
            });
        });

        describe("effects", function()
        {
            it("Should handle percentDamage effect", async function()
            {
                sh.initActive("p1").hp.set(50);

                pctx = init("p1");
                await ph.handle(
                {
                    args: ["-heal", toIdent("p1"), toHPStatus(56, 100)],
                    kwArgs: {from: toEffectName("leftovers", "item")}
                });
                await ph.halt();
                await ph.return([undefined]);
            });

            it("Should infer no magicguard if damaged", async function()
            {
                sh.initActive("p1");
                const mon = sh.initActive("p2", clefable);
                expect(mon.traits.ability.possibleValues)
                    .to.have.keys("cutecharm", "magicguard");

                pctx = init("p2");
                await ph.handle(
                {
                    args:
                    [
                        "-damage", toIdent("p2", clefable), toHPStatus(94, 100)
                    ],
                    kwArgs: {from: toEffectName("stickybarb", "item")}
                });
                await ph.halt();
                await ph.return([undefined]);
                expect(mon.traits.ability.possibleValues)
                    .to.have.keys("cutecharm");
            });

            it("Should handle status effect", async function()
            {
                sh.initActive("p2");

                pctx = init("p2");
                await ph.handle(
                {
                    args: ["-status", toIdent("p2"), "tox"],
                    kwArgs: {from: toEffectName("toxicorb", "item")}
                });
                await ph.halt();
                await ph.return([undefined]);
            });

            it("Should handle implicit effect", async function()
            {
                const mon = sh.initActive("p1");
                mon.hp.set(1);
                expect(mon.volatile.micleberry).to.be.false;

                pctx = init("p1");
                await ph.handle(
                {
                    args: ["-enditem", toIdent("p1"), toItemName("micleberry")],
                    kwArgs: {eat: true}
                });
                await ph.halt();
                await ph.return([undefined]);
                expect(mon.volatile.micleberry).to.be.true;
            });
        });
    });
});
