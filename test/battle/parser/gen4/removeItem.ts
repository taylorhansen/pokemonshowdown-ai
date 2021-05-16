import { expect } from "chai";
import "mocha";
import * as dex from "../../../../src/battle/dex/dex";
import * as dexutil from "../../../../src/battle/dex/dex-util";
import * as events from "../../../../src/battle/parser/BattleEvent";
import * as consumeItem from "../../../../src/battle/parser/gen4/removeItem";
import { BattleState } from "../../../../src/battle/state/BattleState";
import { Pokemon } from "../../../../src/battle/state/Pokemon";
import { Side } from "../../../../src/battle/state/Side";
import { StatRange } from "../../../../src/battle/state/StatRange";
import { smeargle } from "../../../helpers/switchOptions";
import { InitialContext, ParserContext } from "./Context";
import { ParserHelpers, setupSubParserPartial, StateHelpers } from "./helpers";

export function testRemoveItem(ictx: InitialContext,
    getState: () => BattleState, sh: StateHelpers)
{
    // tests for removeItem()
    describe("Event", function()
    {
        /** Initializes the removeItem parser. */
        const init = setupSubParserPartial(ictx.startArgs, getState,
            consumeItem.removeItem);

        let pctx: ParserContext<consumeItem.ItemConsumeResult>;
        const ph = new ParserHelpers(() => pctx, getState);

        afterEach("Close ParserContext", async function()
        {
            await ph.close();
        });

        /** Initializes the removeItem parser with the initial event. */
        async function initWithEvent(monRef: Side, consumed: string | boolean,
            on: dexutil.ItemConsumeOn | null = null,
            hitByMove?: dexutil.MoveData, userRef?: Side): Promise<void>
        {
            let hitBy: dexutil.MoveAndUserRef | undefined;
            if (hitByMove && userRef)
            {
                hitBy = {move: dex.getMove(hitByMove), userRef};
            }

            pctx = init(on, hitBy);
            await ph.handle({type: "removeItem", monRef, consumed});
        }

        /**
         * Initializes the removeItem parser with the initial event and expects
         * it to return immediately after.
         */
        async function initReturn(monRef: Side, consumed: string | boolean,
            on: dexutil.ItemConsumeOn | null = null,
            hitByMove?: dexutil.MoveData, userRef?: Side,
            ret?: consumeItem.ItemConsumeResult): Promise<void>
        {
            let hitBy: dexutil.MoveAndUserRef | undefined;
            if (hitByMove && userRef)
            {
                hitBy = {move: dex.getMove(hitByMove), userRef};
            }

            pctx = init(on, hitBy);
            await ph.handleEnd({type: "removeItem", monRef, consumed}, ret);
        }

        /**
         * Initializes the removeItem parser with the initial event and expects
         * it to throw immediately after.
         */
        async function initError(errorCtor: ErrorConstructor, message: string,
            monRef: Side, consumed: string | boolean,
            on: dexutil.ItemConsumeOn | null = null,
            hitByMove?: dexutil.MoveData, userRef?: Side): Promise<void>
        {
            let hitBy: dexutil.MoveAndUserRef | undefined;
            if (hitByMove && userRef)
            {
                hitBy = {move: dex.getMove(hitByMove), userRef};
            }

            pctx = init(on, hitBy);
            await ph.rejectError({type: "removeItem", monRef, consumed},
                errorCtor, message);
        }

        it("Should remove unknown item with consumed=false", async function()
        {
            const mon = sh.initActive("them");
            const oldItem = mon.item;
            expect(mon.item.definiteValue).to.be.null;

            await initReturn("them", /*consumed*/ false);
            expect(mon.item).to.not.equal(oldItem);
            expect(mon.item.definiteValue).to.equal("none");
        });

        it("Should consume item", async function()
        {
            const mon = sh.initActive("us");
            const oldItem = mon.item;
            expect(mon.item.definiteValue).to.be.null;
            await initReturn("us", "pokeball");
            expect(mon.item).to.not.equal(oldItem);
            expect(mon.item.definiteValue).to.equal("none");
            expect(mon.lastItem).to.equal(oldItem);
            expect(mon.lastItem.definiteValue).to.equal("pokeball");
        });

        it("Should throw if invalid item", async function()
        {
            await initError(Error, "Unknown item 'invalid_item'",
                "us", "invalid_item");
        });

        it("Should throw if none item", async function()
        {
            await initError(Error, "Unknown item 'none'", "us", "none");
        });

        describe("ConsumeOn-preMove", function()
        {
            it("Should indicate increased fractional priority", async function()
            {
                sh.initActive("us").hp.set(1); // within berry threshold
                await initReturn("us", "custapberry", "preMove",
                    /*hitByMove*/ undefined, /*userRef*/ undefined,
                    {moveFirst: true});
            });

            shouldRejectUnrelatedItem("preMove", "sitrusberry");
        });

        describe("ConsumeOn-moveCharge", function()
        {
            it("Should indicate shortened charge", async function()
            {
                const mon = sh.initActive("us");
                mon.volatile.twoTurn.start("dig");
                await initReturn("us", "powerherb", "moveCharge", undefined,
                    undefined, {shorten: true});
            });

            shouldRejectUnrelatedItem("moveCharge", "sitrusberry");
        });

        describe("ConsumeOn-preHit", function()
        {
            it("Should indicate resist berry effect", async function()
            {
                sh.initActive("us").volatile.addedType = "water";
                sh.initActive("them");
                await initReturn("us", "rindoberry", "preHit", dex.moves.absorb,
                    "them", {resistSuper: "grass"});
            });

            it("Should throw if not super-effective", async function()
            {
                sh.initActive("us");
                sh.initActive("them");
                await initError(Error,
                    "Expected type effectiveness to be 'super' but got " +
                        "'regular' for ",
                    "us", "rindoberry", "preHit", dex.moves.absorb, "them");
            });

            shouldRejectUnrelatedItem("preHit", "sitrusberry");
        });

        describe("ConsumeOn-tryOHKO", function()
        {
            it("Should activate item", async function()
            {
                sh.initActive("us").hp.set(1);
                await initReturn("us", "focussash", "tryOHKO",
                    /*hitByMove*/ undefined, /*userRef*/ undefined, {});
            });

            shouldRejectUnrelatedItem("tryOHKO", "sitrusberry");
        });

        describe("ConsumeOn-super (enigmaberry)", function()
        {
            it("Should handle heal effect", async function()
            {
                sh.initActive("us").hp.set(99);
                sh.initActive("them");
                await initWithEvent("us", "enigmaberry", "super",
                    dex.moves.drainpunch, "them");
                await ph.handleEnd(
                    {type: "takeDamage", monRef: "us", hp: 100});
            });

            it("Should handle silent heal effect", async function()
            {
                sh.initActive("us");
                sh.initActive("them");
                await initReturn("us", "enigmaberry", "super",
                    dex.moves.drainpunch, "them");
            });

            shouldRejectUnrelatedItem("super", "sitrusberry");
        });

        describe("ConsumeOn-postHit", function()
        {
            for (const [category, item] of
                [["physical", "jabocaberry"], ["special", "rowapberry"]] as
                    const)
            {
                describe(`condition = ${category} (${item})`, function()
                {
                    const move =
                        dex.moves[category === "physical" ? "tackle" : "ember"];

                    it(`Should handle ${category} damage effect`,
                    async function()
                    {
                        sh.initActive("us");
                        sh.initActive("them");
                        await initWithEvent("us", item, "postHit", move,
                            "them");
                        await ph.handle(
                            {type: "takeDamage", monRef: "them", hp: 1});
                        await ph.halt();
                    });

                    it("Should handle silent damage effect", async function()
                    {
                        sh.initActive("us");
                        sh.initActive("them").hp.set(0);
                        await initReturn("us", item, "postHit", move, "them");
                    });
                });
            }

            shouldRejectUnrelatedItem("postHit", "sitrusberry");
        });

        describe("ConsumeOn-update", function()
        {
            shouldRejectUnrelatedItem("update", "powerherb");

            describe("condition = hp", function()
            {
                for (const [name, item, dislike] of
                [
                    ["healPercent", "sitrusberry", "figyberry"],
                    ["healFixed", "oranberry"]
                ])
                {
                    describe(name, function()
                    {
                        it("Should handle heal effect", async function()
                        {
                            sh.initActive("us").hp.set(1);
                            await initWithEvent("us", item, "update");
                            await ph.handleEnd(
                                {type: "takeDamage", monRef: "us", hp: 100});
                        });

                        // TODO: silent heal effect?

                        it("Should throw if no heal effect", async function()
                        {
                            sh.initActive("us").hp.set(1);
                            await initWithEvent("us", item, "update");
                            await ph.haltError(Error,
                                "ConsumeOn-update heal effect failed");
                        });

                        if (dislike)
                        {
                            it("Should handle dislike berry", async function()
                            {
                                sh.initActive("us").hp.set(1);
                                await initWithEvent("us", dislike, "update");
                                await ph.handle(
                                {
                                    type: "takeDamage", monRef: "us", hp: 100
                                });
                                await ph.handleEnd(
                                {
                                    type: "activateStatusEffect", monRef: "us",
                                    effect: "confusion", start: true
                                });
                            });
                        }
                    });
                }

                describe("boost", function()
                {
                    it("Should handle boost effect", async function()
                    {
                        sh.initActive("us").hp.set(1);
                        await initWithEvent("us", "starfberry", "update");
                        await ph.handleEnd(
                        {
                            type: "boost", monRef: "us", stat: "atk", amount: 2
                        });
                    });

                    it("Should throw if invalid boost", async function()
                    {
                        sh.initActive("us").hp.set(1);
                        await initWithEvent("us", "starfberry", "update");
                        await ph.rejectError(
                            {
                                type: "boost", monRef: "us", stat: "evasion",
                                amount: 2
                            },
                            Error, "ConsumeOn-update boost effect failed");
                    });

                    it("Should throw if no boost effect", async function()
                    {
                        sh.initActive("us").hp.set(1);
                        await initWithEvent("us", "starfberry", "update");
                        await ph.haltError(Error,
                            "ConsumeOn-update boost effect failed");
                    });
                });

                describe("focusEnergy", function()
                {
                    it("Should handle focusEnergy effect", async function()
                    {
                        sh.initActive("us").hp.set(1);
                        await initWithEvent("us", "lansatberry", "update");
                        await ph.handleEnd(
                        {
                            type: "activateStatusEffect", monRef: "us",
                            effect: "focusEnergy", start: true
                        });
                    });

                    it("Should throw if no focusEnergy effect", async function()
                    {
                        sh.initActive("us").hp.set(1);
                        await initWithEvent("us", "lansatberry", "update");
                        await ph.haltError(Error,
                            "ConsumeOn-update focusEnergy effect failed");
                    });
                });
            });

            describe("condition = status", function()
            {
                it("Should handle cure effect", async function()
                {
                    const mon = sh.initActive("us");
                    mon.majorStatus.afflict("slp");
                    mon.volatile.confusion.start();
                    await initWithEvent("us", "lumberry", "update");
                    await ph.handle(
                    {
                        type: "activateStatusEffect", monRef: "us",
                        effect: "slp", start: false
                    });
                    await ph.handleEnd(
                    {
                        type: "activateStatusEffect", monRef: "us",
                        effect: "confusion", start: false
                    });
                });

                it("Should throw if no cure effect", async function()
                {
                    const mon = sh.initActive("us");
                    mon.majorStatus.afflict("slp");
                    mon.volatile.confusion.start();
                    await initWithEvent("us", "lumberry", "update");
                    await ph.haltError(Error,
                        "ConsumeOn-update cure effect failed");
                });

                it("Should throw if partial cure effect", async function()
                {
                    const mon = sh.initActive("us");
                    mon.majorStatus.afflict("slp");
                    mon.volatile.confusion.start();
                    await initWithEvent("us", "lumberry", "update");
                    await ph.handle(
                    {
                        type: "activateStatusEffect", monRef: "us",
                        effect: "slp", start: false
                    });
                    await ph.haltError(Error,
                        "ConsumeOn-update cure effect failed");
                });
            });

            describe("condition = depleted", function()
            {
                it("Should handle restore effect", async function()
                {
                    sh.initActive("us").moveset.reveal("tackle").pp = 0;
                    await initWithEvent("us", "leppaberry", "update");
                    await ph.handleEnd(
                    {
                        type: "modifyPP", monRef: "us", move: "tackle",
                        amount: 10
                    });
                });

                it("Should still pass for unrevealed/undepleted moves",
                async function()
                {
                    sh.initActive("us");
                    await initWithEvent("us", "leppaberry", "update");
                    await ph.handleEnd(
                    {
                        type: "modifyPP", monRef: "us", move: "splash",
                        amount: 10
                    });
                });

                it("Should throw if invalid restore effect", async function()
                {
                    sh.initActive("us").moveset.reveal("tackle").pp = 0;
                    await initWithEvent("us", "leppaberry", "update");
                    await ph.rejectError(
                        {
                            type: "modifyPP", monRef: "us", move: "tackle",
                            amount: 5
                        },
                        Error, "ConsumeOn-update restore effect failed");
                });

                it("Should throw if no restore effect", async function()
                {
                    sh.initActive("us").moveset.reveal("tackle").pp = 0;
                    await initWithEvent("us", "leppaberry", "update");
                    await ph.haltError(Error,
                        "ConsumeOn-update restore effect failed");
                });
            });
        });

        describe("ConsumeOn-residual", function()
        {
            it("Should handle implicit effect", async function()
            {
                const mon = sh.initActive("us");
                mon.hp.set(1);
                expect(mon.volatile.micleberry).to.be.false;
                await initReturn("us", "micleberry", "residual");
                expect(mon.volatile.micleberry).to.be.true;
            });

            shouldRejectUnrelatedItem("residual", "sitrusberry");
        });

        function shouldRejectUnrelatedItem(consumeOn: dexutil.ItemConsumeOn,
            itemName: string)
        {
            it("Should reject unrelated item", async function()
            {
                sh.initActive("us");
                await initError(Error,
                    `ConsumeOn-${consumeOn} effect shouldn't activate ` +
                        `for item '${itemName}'`,
                    "us", itemName, consumeOn, dex.moves.tackle, "them");
            });
        }
    });

    describe("Expect functions", function()
    {
        let pctx: ParserContext<consumeItem.ExpectConsumeItemsResult>;
        const ph = new ParserHelpers(() => pctx, getState);

        afterEach("Close ParserContext", async function()
        {
            await ph.close();
        });

        describe("consumeOnPreMove()", function()
        {
            /** Initializes the consumeOnPreMove parser. */
            const init = setupSubParserPartial(ictx.startArgs, getState,
                consumeItem.consumeOnPreMove);

            function preMoveSetup(lowHP?: boolean)
            {
                sh.initActive("us");
                const mon = sh.initActive("them");
                if (lowHP) mon.hp.set(1);
                return mon;
            }

            async function preMoveTaken()
            {
                pctx = init({them: true});
                await ph.handle(
                {
                    type: "removeItem", monRef: "them", consumed: "custapberry"
                });
                await ph.halt({results: [{moveFirst: true}]});
            }

            async function preMoveAbsent()
            {
                pctx = init({them: true});
                await ph.halt({results: []});
            }

            testHasItem("custapberry", () => preMoveSetup(/*lowHP*/ true),
                preMoveTaken, preMoveAbsent);
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

        describe("consumeOnMoveCharge()", function()
        {
            /** Initializes the consumeOnMoveCharge parser. */
            const init = setupSubParserPartial(ictx.startArgs, getState,
                consumeItem.consumeOnMoveCharge);

            // TODO: add tests/options for other kinds of charging moves
            function moveChargeSetup(charge?: boolean)
            {
                sh.initActive("us");
                const mon = sh.initActive("them");
                if (charge) mon.volatile.twoTurn.start("solarbeam");
                return mon;
            }

            async function moveChargeTaken()
            {
                pctx = init({them: true});
                await ph.handle(
                {
                    type: "removeItem", monRef: "them", consumed: "powerherb"
                });
                await ph.halt({results: [{shorten: true}]});
            }

            async function moveChargeAbsent()
            {
                pctx = init({them: true});
                await ph.halt({results: []});
            }

            testHasItem("powerherb", () => moveChargeSetup(/*charge*/ true),
                moveChargeTaken, moveChargeAbsent);
            // TODO: additional tests for charge=false

            it("Shouldn't infer no consumeOn-moveCharge item if it did not " +
                "activate and the effect should've been silent",
            async function()
            {
                const mon = moveChargeSetup();
                mon.volatile.embargo.start();
                expect(mon.item.possibleValues).to.include.keys("powerherb");
                await moveChargeAbsent();
                expect(mon.item.possibleValues).to.include.keys("powerherb");
            });

            describe("Item-ignoring ability (klutz)", () =>
                testBlockingAbilities("powerherb", ["klutz"],
                    () => moveChargeSetup(/*charge*/ true),
                    moveChargeTaken, moveChargeAbsent));
        });

        describe("consumeOnPreHit()", function()
        {
            /** Initializes the consumeOnPreHit parser. */
            const init = setupSubParserPartial(ictx.startArgs, getState,
                consumeItem.consumeOnPreHit);

            function preHitSetup(weak?: boolean)
            {
                sh.initActive("us");
                const mon = sh.initActive("them");
                if (weak) mon.volatile.addedType = "flying";
                return mon;
            }

            async function preHitTaken()
            {
                pctx = init({them: true},
                    {move: dex.getMove(dex.moves.thunder), userRef: "us"});
                await ph.handle(
                {
                    type: "removeItem", monRef: "them", consumed: "wacanberry"
                });
                await ph.halt({results: [{resistSuper: "electric"}]});
            }

            async function preHitAbsent()
            {
                pctx = init({them: true},
                    {move: dex.getMove(dex.moves.thunder), userRef: "us"});
                await ph.halt({results: []});
            }

            testHasItem("wacanberry", () => preHitSetup(/*weak*/ true),
                preHitTaken, preHitAbsent);
            // TODO: additional tests for weak=false

            // TODO: test moveIsType

            describe("Item-ignoring ability (klutz)", () =>
                testBlockingAbilities("wacanberry", ["klutz"],
                    () => preHitSetup(/*weak*/ true),
                    preHitTaken, preHitAbsent));
        });

        describe("consumeOnTryOHKO()", function()
        {
            /** Initializes the consumeOnTryOHKO parser. */
            const init = setupSubParserPartial(ictx.startArgs, getState,
                consumeItem.consumeOnTryOHKO);

            function tryOHKOSetup(hp = 1, maxhp = 100, percent?: boolean)
            {
                const monRef = percent ? "them" : "us";
                const mon = sh.initActive(monRef);
                mon.hp.set(hp, maxhp);
                return mon;
            }

            async function tryOHKOTaken(percent?: boolean)
            {
                const monRef = percent ? "them" : "us";
                pctx = init({[monRef]: true});
                await ph.handle(
                    {type: "removeItem", monRef, consumed: "focussash"});
                await ph.halt({results: [{}]});
            }

            async function tryOHKOAbsent(percent?: boolean)
            {
                const monRef = percent ? "them" : "us";
                pctx = init({[monRef]: true});
                await ph.halt({results: []});
            }

            testHasItem("focussash", tryOHKOSetup, tryOHKOTaken, tryOHKOAbsent);

            describe("Item-ignoring ability (klutz)", () =>
                testBlockingAbilities("focussash", ["klutz"],
                    () => tryOHKOSetup(), tryOHKOTaken, tryOHKOAbsent));

            describe("HP % rounding", function()
            {
                async function shouldReject(percent?: boolean)
                {
                    const monRef = percent ? "them" : "us";
                    pctx = init({[monRef]: true});
                    await ph.return({results: []});
                }

                async function shouldAcceptTaken(mon: Pokemon)
                {
                    const item = mon.item.possibleValues;
                    expect(item).to.include.keys("focussash");
                    await tryOHKOTaken(mon.hp.isPercent);
                    expect(item).to.equal(mon.lastItem.possibleValues)
                        .and.to.have.keys("focussash");
                }

                async function shouldAcceptAbsent(mon: Pokemon)
                {
                    const item = mon.item.possibleValues;
                    expect(item).to.include.keys("focussash");
                    await tryOHKOAbsent(mon.hp.isPercent);
                    expect(item).to.equal(mon.item.possibleValues)
                        .and.to.not.have.keys("focussash");
                }

                it("Should reject if hp = 0", async function()
                {
                    tryOHKOSetup(0);
                    await shouldReject();
                });

                it("Should reject if hp values known and hp > 1",
                async function()
                {
                    tryOHKOSetup(2);
                    await shouldReject();
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
                    function setup(opts: events.SwitchOptions,
                        hpDisplay: number)
                    {
                        const mon = sh.initActive("them", opts);
                        mon.hp.set(hpDisplay)
                        return mon;
                    }

                    function test(opts: events.SwitchOptions,
                        actualMaxHP: number)
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
                                await shouldReject(true);
                            });
                        }
                    }

                    function shouldRuleOut(opts: events.SwitchOptions,
                        hpDisplay: number, comment?: string)
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

                    function shouldNotRuleOut(opts: events.SwitchOptions,
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
                        const shedinja: events.SwitchOptions =
                        {
                            species: "shedinja", gender: null, level: 50,
                            hp: 100, hpMax: 100
                        };
                        test(shedinja, 1);
                        shouldRuleOut(shedinja, 100);
                   });

                    describe("Max hp under 100", async function()
                    {
                        const opts = {...smeargle, level: 10}; // 31-40
                        test(opts, 35);
                        shouldRuleOut(opts, 3, " (1hp)");
                    });

                    describe("Max hp under 100 but can be over 100",
                    async function()
                    {
                        const opts = {...smeargle, level: 40}; // 94-131
                        test(opts, 95);
                        shouldNotRuleOut(opts, 2, " (can be 1hp)");
                    });

                    describe("Max hp over 100 but can be under 100",
                    async function()
                    {
                        const opts = {...smeargle, level: 40}; // 94-131
                        test(opts, 105);
                        shouldRuleOut(opts, 1);
                        shouldNotRuleOut(opts, 2, " (can be 1hp)");
                    });

                    describe("Max hp between 100 and 200 exclusive",
                    async function()
                    {
                        const opts = {...smeargle, level: 50}; // 115-162
                        test(opts, 120);
                        shouldRuleOut(opts, 1);
                    });

                    describe("Max hp under 200 but can be over 200",
                    async function()
                    {
                        const opts = {...smeargle, level: 75}; // 167-238
                        test(opts, 195);
                        shouldNotRuleOut(opts, 1, " (can be 1hp)");
                    });

                    describe("Max hp over 200 but can be under 200",
                    async function()
                    {
                        const opts = {...smeargle, level: 75}; // 167-238
                        test(opts, 205);
                        shouldNotRuleOut(opts, 1, " (can be 1hp)");
                    });

                    describe("Max hp over 200", async function()
                    {
                        const opts = {...smeargle, level: 100}; // 220-314
                        test(opts, 250);
                        shouldNotRuleOut(opts, 1, " (can be 1hp)");
                    });
                });
            });
        });

        describe("consumeOnSuper()", function()
        {
            /** Initializes the consumeOnSuper parser. */
            const init = setupSubParserPartial(ictx.startArgs, getState,
                consumeItem.consumeOnSuper);

            function superSetup(weak?: boolean)
            {
                sh.initActive("us");
                const mon = sh.initActive("them");
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
                pctx = init({them: true},
                    {move: dex.getMove(dex.moves.lowkick), userRef: "us"});
                await ph.handle(
                {
                    type: "removeItem", monRef: "them", consumed: "enigmaberry"
                });
                // enigmaberry heals holder
                await ph.handle({type: "takeDamage", monRef: "them", hp: 100});
                await ph.halt({results: [{}]});
            }

            async function superAbsent()
            {
                pctx = init({them: true},
                    {move: dex.getMove(dex.moves.lowkick), userRef: "us"});
                await ph.halt({results: []});
            }

            testHasItem("enigmaberry", () => superSetup(/*weak*/ true),
                superTaken, superAbsent);
            // TODO: additional tests for weak=false

            describe("Item-ignoring ability (klutz)", () =>
                testBlockingAbilities("enigmaberry", ["klutz"],
                    () => superSetup(/*weak*/ true), superTaken, superAbsent));

            // TODO: test moveIsType
        });

        describe("consumeOnPostHit()", function()
        {
            /** Initializes the consumeOnPostHit parser. */
            const init = setupSubParserPartial(ictx.startArgs, getState,
                consumeItem.consumeOnPostHit);

            function postHitSetup()
            {
                sh.initActive("us");
                return sh.initActive("them");
            }

            // TODO: options for silent, damage user, heal holder
            async function postHitTaken(move: dexutil.MoveData,
                itemName: string)
            {
                pctx = init({them: true},
                    {move: dex.getMove(move), userRef: "us"});
                await ph.handle(
                    {type: "removeItem", monRef: "them", consumed: itemName});
                // jaboca/rowap berry damage user
                await ph.handle({type: "takeDamage", monRef: "us", hp: 1});
                // since damage effect checks for any pending on-damage effects,
                //  it needs to explicitly fail for the consumeOn-postHit parser
                //  to return
                await ph.halt({results: [{}]});
            }

            async function postHitAbsent(move: dexutil.MoveData)
            {
                pctx = init({them: true},
                    {move: dex.getMove(move), userRef: "us"});
                await ph.halt({results: []});
            }

            describe("condition = physical (jabocaberry)", function()
            {
                const postHitTakenPhys =
                    () => postHitTaken(dex.moves.pound, "jabocaberry");
                const postHitAbsentPhys = () => postHitAbsent(dex.moves.pound);

                testHasItem("jabocaberry", postHitSetup, postHitTakenPhys,
                    postHitAbsentPhys);

                describe("Item-ignoring ability (klutz)", () =>
                    testBlockingAbilities("jabocaberry", ["klutz"],
                        postHitSetup, postHitTakenPhys, postHitAbsentPhys));
            });

            describe("condition = special (rowapberry)", function()
            {
                const postHitTakenSpec =
                    () => postHitTaken(dex.moves.ember, "rowapberry");
                const postHitAbsentSpec = () => postHitAbsent(dex.moves.ember);

                testHasItem("rowapberry", postHitSetup, postHitTakenSpec,
                    postHitAbsentSpec);

                describe("Item-ignoring ability (klutz)", () =>
                    testBlockingAbilities("rowapberry", ["klutz"], postHitSetup,
                        postHitTakenSpec, postHitAbsentSpec));
            });
        });

        describe("consumeOnUpdate()", function()
        {
            /** Initializes the consumeOnUpdate parser. */
            const init = setupSubParserPartial(ictx.startArgs, getState,
                consumeItem.consumeOnUpdate);

            function updateSetup()
            {
                sh.initActive("us");
                return sh.initActive("them");
            }

            async function updateTaken(itemName: string,
                effectEvents: readonly events.Any[] = [])
            {
                pctx = init({them: true});
                await ph.handle(
                    {type: "removeItem", monRef: "them", consumed: itemName});
                for (const event of effectEvents) await ph.handle(event);
                await ph.halt({results: [{}]});
            }

            async function updateAbsent()
            {
                pctx = init({them: true});
                await ph.halt({results: []});
            }

            describe("condition = hp", function()
            {
                function updateHPSetup(lowHP?: boolean)
                {
                    const mon = updateSetup();
                    if (lowHP) mon.hp.set(1); // within hp threshold
                    return mon;
                }

                // TODO: test each kind of consumeOn-update hp effect/item
                const updateHPTaken =
                    () => updateTaken("salacberry",
                        [{
                            type: "boost", monRef: "them", stat: "spe",
                            amount: 1
                        }]);
                const updateHPAbsent = updateAbsent;

                testHasItem("salacberry", () => updateHPSetup(/*lowHP*/ true),
                    updateHPTaken, updateHPAbsent);
                // TODO: additional tests for lowHP=false

                describe("HP threshold", () =>
                    testHPThreshold("salacberry",
                        () => updateHPSetup(/*lowHP*/ true), updateHPAbsent));

                describe("Early-berry ability (gluttony)", () =>
                    testEarlyBerryAbilities("salacberry", ["gluttony"],
                        () => updateHPSetup(/*lowHP*/ true),
                        updateHPTaken, updateHPAbsent));

                describe("Item-ignoring ability (klutz)", () =>
                    testBlockingAbilities("salacberry", ["klutz"],
                        () => updateHPSetup(/*lowHP*/ true),
                        updateHPTaken, updateHPAbsent));
            });

            describe("condition = status", function()
            {
                // TODO: test each kind of consumeOn-status item
                function updateStatusSetup(statused?: boolean)
                {
                    const mon = updateSetup();
                    if (statused) mon.majorStatus.afflict("par");
                    return mon;
                }

                // TODO: test each kind of consumeOn-update hp effect/item
                const updateStatusTaken =
                    () => updateTaken("cheriberry",
                    [{
                        type: "activateStatusEffect", monRef: "them",
                        effect: "par", start: false
                    }]);
                const updateStatusAbsent = updateAbsent;

                testHasItem("cheriberry",
                    () => updateStatusSetup(/*statused*/ true),
                    updateStatusTaken, updateStatusAbsent);
                // TODO: additional tests for updateStatused=false

                describe("Item-ignoring ability (klutz)", () =>
                    testBlockingAbilities("cheriberry", ["klutz"],
                        () => updateStatusSetup(/*statused*/ true),
                        updateStatusTaken, updateStatusAbsent));
            });

            describe("condition = depleted", function()
            {
                function updateDepletedSetup(depleted?: boolean)
                {
                    const mon = updateSetup();
                    const move = mon.moveset.reveal("tackle");
                    if (depleted) move.pp = 0;
                    return mon;
                }

                // TODO: add item effect events as parameter
                const updateDepletedTaken =
                    () => updateTaken("leppaberry",
                    [{
                        type: "modifyPP", monRef: "them", move: "tackle",
                        amount: 10
                    }]);
                const updateDepletedAbsent = updateAbsent;

                testHasItem("leppaberry",
                    () => updateDepletedSetup(/*depleted*/ true),
                    updateDepletedTaken, updateDepletedAbsent);
                // TODO: additional tests for depleted=false

                // TODO(later): handle move pp ambiguity corner cases

                describe("Item-ignoring ability (klutz)", () =>
                    testBlockingAbilities("leppaberry", ["klutz"],
                        () => updateDepletedSetup(/*depleted*/ true),
                        updateDepletedTaken, updateDepletedAbsent));
            });
        });

        describe("consumeOnResidual()", function()
        {
            /** Initializes the consumeOnResidual parser. */
            const init = setupSubParserPartial(ictx.startArgs, getState,
                consumeItem.consumeOnResidual);

            function residualSetup(weak?: boolean)
            {
                sh.initActive("us");
                const mon = sh.initActive("them");
                if (weak) mon.hp.set(1);
                return mon;
            }

            async function residualTaken()
            {
                pctx = init({them: true});
                await ph.handle(
                {
                    type: "removeItem", monRef: "them", consumed: "micleberry"
                });
                await ph.halt({results: [{}]});
            }

            async function residualAbsent()
            {
                pctx = init({them: true});
                await ph.halt({results: []});
            }

            testHasItem("micleberry", () => residualSetup(/*weak*/ true),
                residualTaken, residualAbsent);
            // TODO: additional tests for noStatus=false

            describe("Item-ignoring ability (klutz)", () =>
                testBlockingAbilities("micleberry", ["klutz"],
                    () => residualSetup(/*weak*/ true),
                    residualTaken, residualAbsent));
        });

        // basic test builders to verify consumeOnX() assertions

        function testHasItem(itemName: string, setup: () => Pokemon,
            taken: () => Promise<void>, absent: () => Promise<void>): void
        {
            it("Should handle item", async function()
            {
                setup();
                await taken();
            });

            it("Should infer no item if it did not activate",
            async function()
            {
                const mon = setup();
                expect(mon.item.possibleValues).to.include.keys(itemName);
                await absent();
                expect(mon.item.possibleValues).to.not.have.keys(itemName);
            });
        }

        // SubReason test builders to verify consumeOnX() assertions

        function testHPThreshold(itemName: string, setup: () => Pokemon,
            absent: () => Promise<void>): void
        {
            it("Shouldn't infer no item if above HP threshold and didn't " +
                "activate",
            async function()
            {
                const mon = setup();
                expect(mon.item.possibleValues).to.include.keys(itemName);
                mon.hp.set(mon.hp.max); // should be outside hp threshold
                await absent();
                expect(mon.item.possibleValues).to.include.keys(itemName);
            });

            it("Should infer no item if below HP threshold and didn't activate",
            async function()
            {
                const mon = setup();
                expect(mon.item.possibleValues).to.include.keys(itemName);
                mon.hp.set(1); // should be below hp threshold
                await absent();
                expect(mon.item.possibleValues).to.not.include.keys(itemName);
            });
        }

        // note: only works for threshold=25
        function testEarlyBerryAbilities(itemName: string, abilities: string[],
            setup: () => Pokemon, taken: () => Promise<void>,
            absent: () => Promise<void>): void
        {
            it("Should infer early-berry ability if item activated within " +
                "25-50% hp", async function()
            {
                const mon = setup();
                mon.setAbility(...abilities, "illuminate");
                // should be above 25% but at/below 50%
                mon.hp.set(Math.floor(mon.hp.max / 2));
                await taken();
                expect(mon.traits.ability.possibleValues)
                    .to.have.keys(...abilities);
            });

            it("Should infer no early-berry ability if item confirmed but " +
                "didn't activate within 25-50% hp", async function()
            {
                const mon = setup();
                mon.setItem(itemName);
                mon.setAbility(...abilities, "illuminate");
                // should be above 25% but at/below 50%
                mon.hp.set(Math.floor(mon.hp.max / 2));
                await absent();
                expect(mon.traits.ability.possibleValues)
                    .to.have.keys("illuminate");
            });

            it("Shouldn't infer item if didn't activate within 25-50% " +
                "threshold and ability suppressed", async function()
            {
                const mon = setup();
                // should be above 25% but at/below 50%
                mon.hp.set(Math.floor(mon.hp.max / 2));
                mon.setAbility(...abilities);
                mon.volatile.suppressAbility = true;
                await absent();
                expect(mon.item.possibleValues).to.include.keys(itemName);
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

            it("Shouldn't infer ability if item didn't activate within " +
                "original hp threshold", async function()
            {
                const mon = setup();
                mon.setAbility(...abilities, "illuminate");
                // should be below original 25% threshold
                mon.hp.set(Math.floor(mon.hp.max / 4));
                await absent();
                expect(mon.item.possibleValues).to.not.have.keys(itemName);
                expect(mon.traits.ability.possibleValues)
                    .to.have.keys(...abilities, "illuminate");
            });
        }

        function testBlockingAbilities(itemName: string, abilities: string[],
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

            it("Should infer blocking ability if item is confirmed but " +
                "didn't activate", async function()
            {
                const mon = setup();
                mon.setAbility(...abilities, "illuminate");
                mon.setItem(itemName);
                await absent();
                expect(mon.traits.ability.possibleValues)
                    .to.have.keys(...abilities);
            });

            it("Shouldn't infer blocking ability if suppressed and item " +
                "activates", async function()
            {
                const mon = setup();
                mon.setAbility(...abilities, "illuminate");
                mon.volatile.suppressAbility = true;
                await taken();
                expect(mon.traits.ability.possibleValues)
                    .to.have.keys(...abilities, "illuminate");
            });

            it("Should infer no item if blocking ability is suppressed and " +
                "item doesn't activate", async function()
            {
                const mon = setup();
                mon.setAbility(...abilities);
                mon.volatile.suppressAbility = true;
                await absent();
                expect(mon.item.possibleValues).to.not.have.keys(itemName);
            });
        }
    });
}
