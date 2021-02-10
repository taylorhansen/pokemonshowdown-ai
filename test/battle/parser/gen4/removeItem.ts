import { expect } from "chai";
import "mocha";
import * as dex from "../../../../src/battle/dex/dex";
import * as dexutil from "../../../../src/battle/dex/dex-util";
import * as events from "../../../../src/battle/parser/BattleEvent";
import { ParserState, SubParser } from
    "../../../../src/battle/parser/BattleParser";
import * as consumeItem from "../../../../src/battle/parser/gen4/removeItem";
import { Pokemon } from "../../../../src/battle/state/Pokemon";
import { Side } from "../../../../src/battle/state/Side";
import { Context } from "./Context";
import { createParserHelpers } from "./helpers";

export function testRemoveItem(f: () => Context,
    initActive: (monRef: Side, options?: events.SwitchOptions) => Pokemon)
{
    let pstate: ParserState;
    let parser: SubParser;

    beforeEach("Extract Context", function()
    {
        ({pstate, parser} = f());
    });

    const {handle, handleEnd, exitParser} = createParserHelpers(() => parser);

    async function initParser(monRef: Side, consumed: string | boolean,
        on: dexutil.ItemConsumeOn | null = null, hitByMove?: dexutil.MoveData,
        userRef?: Side): Promise<SubParser>
    {
        parser = consumeItem.removeItem(pstate,
            {type: "removeItem", monRef, consumed}, on, hitByMove, userRef);
        // first yield doesn't return anything
        await expect(parser.next())
            .to.eventually.become({value: undefined, done: false});
        return parser;
    }

    async function initReturn(monRef: Side, consumed: string | boolean,
        on: dexutil.ItemConsumeOn | null = null, hitByMove?: dexutil.MoveData,
        userRef?: Side, result: consumeItem.ItemConsumeResult = {}):
        Promise<SubParser<consumeItem.ItemConsumeResult>>
    {
        parser = consumeItem.removeItem(pstate,
            {type: "removeItem", monRef, consumed}, on, hitByMove, userRef);
        await expect(parser.next())
            .to.eventually.become({value: result, done: true});
        return parser;
    }

    async function altParser<TParser extends SubParser>(gen: TParser):
        Promise<TParser>
    {
        parser = gen;
        // first yield doesn't return anything
        await expect(parser.next())
            .to.eventually.become({value: undefined, done: false});
        return gen;
    }

    // tests for removeItem()
    describe("Event", function()
    {
        it("Should remove unknown item with consumed=false", async function()
        {
            const mon = initActive("them");
            const oldItem = mon.item;
            expect(mon.item.definiteValue).to.be.null;

            await initReturn("them", /*consumed*/ false);
            expect(mon.item).to.not.equal(oldItem);
            expect(mon.item.definiteValue).to.equal("none");
        });

        it("Should consume item", async function()
        {
            const mon = initActive("us");
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
            await expect(initParser("us", "invalid_item"))
                .to.eventually.be.rejectedWith(Error,
                    "Unknown item 'invalid_item'");
        });

        it("Should throw if none item", async function()
        {
            await expect(initParser("us", "none"))
                .to.eventually.be.rejectedWith(Error, "Unknown item 'none'");
        });

        describe("ConsumeOn-preMove", function()
        {
            it("Should indicate increased fractional priority", async function()
            {
                initActive("us").hp.set(1); // within berry threshold
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
                const mon = initActive("us");
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
                initActive("us").volatile.addedType = "water";
                initActive("them");
                await initReturn("us", "rindoberry", "preHit", dex.moves.absorb,
                    "them", {resistSuper: "grass"});
            });

            it("Should throw if not super-effective", async function()
            {
                initActive("us");
                initActive("them");
                await expect(initParser("us", "rindoberry", "preHit",
                        dex.moves.absorb, "them"))
                    .to.eventually.be.rejectedWith(Error,
                        "Expected type effectiveness to be 'super' but got " +
                        "'regular' for ")
            });

            shouldRejectUnrelatedItem("preHit", "sitrusberry");
        });

        describe("ConsumeOn-super (enigmaberry)", function()
        {
            it("Should handle heal effect", async function()
            {
                initActive("us").hp.set(99);
                initActive("them");
                await initParser("us", "enigmaberry", "super",
                    dex.moves.drainpunch, "them");
                await handleEnd(
                    {type: "takeDamage", monRef: "us", hp: 100});
            });

            it("Should handle silent heal effect", async function()
            {
                initActive("us");
                initActive("them");
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
                        initActive("us");
                        initActive("them");
                        await initParser("us", item, "postHit", move, "them");
                        await handle(
                            {type: "takeDamage", monRef: "them", hp: 1});
                        await exitParser();
                    });

                    it("Should handle silent damage effect", async function()
                    {
                        initActive("us");
                        initActive("them").hp.set(0);
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
                            initActive("us").hp.set(1);
                            await initParser("us", item, "update");
                            await handleEnd(
                                {type: "takeDamage", monRef: "us", hp: 100});
                        });

                        // TODO: silent heal effect?

                        it("Should throw if no heal effect", async function()
                        {
                            initActive("us").hp.set(1);
                            await initParser("us", item, "update");
                            await expect(exitParser()).to.be.rejectedWith(Error,
                                "ConsumeOn-update heal effect failed");
                        });

                        if (dislike)
                        {
                            it("Should handle dislike berry", async function()
                            {
                                initActive("us").hp.set(1);
                                await initParser("us", dislike, "update");
                                await handle(
                                {
                                    type: "takeDamage", monRef: "us", hp: 100
                                });
                                await handleEnd(
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
                        initActive("us").hp.set(1);
                        await initParser("us", "starfberry", "update");
                        await handleEnd(
                        {
                            type: "boost", monRef: "us", stat: "atk", amount: 2
                        });
                    });

                    it("Should throw if invalid boost", async function()
                    {
                        initActive("us").hp.set(1);
                        await initParser("us", "starfberry", "update");
                        await expect(handleEnd(
                            {
                                type: "boost", monRef: "us", stat: "evasion",
                                amount: 2
                            }))
                            .to.be.rejectedWith(Error,
                                "ConsumeOn-update boost effect failed");
                    });

                    it("Should throw if no boost effect", async function()
                    {
                        initActive("us").hp.set(1);
                        await initParser("us", "starfberry", "update");
                        await expect(exitParser()).to.be.rejectedWith(Error,
                            "ConsumeOn-update boost effect failed");
                    });
                });

                describe("focusEnergy", function()
                {
                    it("Should handle focusEnergy effect", async function()
                    {
                        initActive("us").hp.set(1);
                        await initParser("us", "lansatberry", "update");
                        await handleEnd(
                        {
                            type: "activateStatusEffect", monRef: "us",
                            effect: "focusEnergy", start: true
                        });
                    });

                    it("Should throw if no focusEnergy effect", async function()
                    {
                        initActive("us").hp.set(1);
                        await initParser("us", "lansatberry", "update");
                        await expect(exitParser()).to.be.rejectedWith(Error,
                            "ConsumeOn-update focusEnergy effect failed");
                    });
                });
            });

            describe("condition = status", function()
            {
                it("Should handle cure effect", async function()
                {
                    const mon = initActive("us");
                    mon.majorStatus.afflict("slp");
                    mon.volatile.confusion.start();
                    await initParser("us", "lumberry", "update");
                    await handle(
                    {
                        type: "activateStatusEffect", monRef: "us",
                        effect: "slp", start: false
                    });
                    await handleEnd(
                    {
                        type: "activateStatusEffect", monRef: "us",
                        effect: "confusion", start: false
                    });
                });

                it("Should throw if no cure effect", async function()
                {
                    const mon = initActive("us");
                    mon.majorStatus.afflict("slp");
                    mon.volatile.confusion.start();
                    await initParser("us", "lumberry", "update");
                    await expect(exitParser()).to.be.rejectedWith(Error,
                        "ConsumeOn-update cure effect failed");
                });

                it("Should throw if partial cure effect", async function()
                {
                    const mon = initActive("us");
                    mon.majorStatus.afflict("slp");
                    mon.volatile.confusion.start();
                    await initParser("us", "lumberry", "update");
                    await handle(
                    {
                        type: "activateStatusEffect", monRef: "us",
                        effect: "slp", start: false
                    });
                    await expect(exitParser()).to.be.rejectedWith(Error,
                        "ConsumeOn-update cure effect failed");
                });
            });

            describe("condition = depleted", function()
            {
                it("Should handle restore effect", async function()
                {
                    initActive("us").moveset.reveal("tackle").pp = 0;
                    await initParser("us", "leppaberry", "update");
                    await handleEnd(
                    {
                        type: "modifyPP", monRef: "us", move: "tackle",
                        amount: 10
                    });
                });

                it("Should still pass for unrevealed/undepleted moves",
                async function()
                {
                    initActive("us");
                    await initParser("us", "leppaberry", "update");
                    await handleEnd(
                    {
                        type: "modifyPP", monRef: "us", move: "splash",
                        amount: 10
                    });
                });

                it("Should throw if invalid restore effect", async function()
                {
                    initActive("us").moveset.reveal("tackle").pp = 0;
                    await initParser("us", "leppaberry", "update");
                    await expect(handleEnd(
                        {
                            type: "modifyPP", monRef: "us", move: "tackle",
                            amount: 5
                        }))
                        .to.be.rejectedWith(Error,
                            "ConsumeOn-update restore effect failed");
                });

                it("Should throw if no restore effect", async function()
                {
                    initActive("us").moveset.reveal("tackle").pp = 0;
                    await initParser("us", "leppaberry", "update");
                    await expect(exitParser()).to.be.rejectedWith(Error,
                        "ConsumeOn-update restore effect failed");
                });
            });
        });

        describe("ConsumeOn-residual", function()
        {
            it("Should handle implicit effect", async function()
            {
                const mon = initActive("us");
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
                initActive("us");
                await expect(initParser("us", itemName, consumeOn))
                    .to.eventually.be.rejectedWith(Error,
                        `ConsumeOn-${consumeOn} effect shouldn't activate ` +
                        `for item '${itemName}'`);
            });
        }
    });

    describe("consumeOnPreMove()", function()
    {
        function preMoveSetup(lowHP?: boolean)
        {
            initActive("us");
            const mon = initActive("them");
            if (lowHP) mon.hp.set(1);
            return mon;
        }

        async function preMoveTaken()
        {
            await altParser(consumeItem.consumeOnPreMove(pstate, {them: true}));
            await handle(
                {type: "removeItem", monRef: "them", consumed: "custapberry"});
            await exitParser<consumeItem.ExpectConsumeItemsResult>(
                {results: [{moveFirst: true}]});
        }

        async function preMoveAbsent()
        {
            await altParser(consumeItem.consumeOnPreMove(pstate, {them: true}));
            await exitParser<consumeItem.ExpectConsumeItemsResult>(
                {results: []});
        }

        testHasItem("custapberry", () => preMoveSetup(/*lowHP*/ true),
            preMoveTaken, preMoveAbsent);
        // TODO: additional tests for lowHP=false?

        describe("HP threshold", () =>
            testHPThreshold("custapberry", preMoveSetup, preMoveAbsent));

        describe("Early-berry ability (gluttony)", () =>
            testEarlyBerryAbilities("custapberry", ["gluttony"], preMoveSetup,
                preMoveTaken, preMoveAbsent));

        describe("Item-ignoring ability (klutz)", () =>
            testBlockingAbilities("custapberry", ["klutz"],
                () => preMoveSetup(/*lowHP*/ true),
                preMoveTaken, preMoveAbsent));
    });

    describe("consumeOnMoveCharge()", function()
    {
        // TODO: add tests/options for other kinds of charging moves
        function moveChargeSetup(charge?: boolean)
        {
            initActive("us");
            const mon = initActive("them");
            if (charge) mon.volatile.twoTurn.start("solarbeam");
            return mon;
        }

        async function moveChargeTaken()
        {
            await altParser(consumeItem.consumeOnMoveCharge(pstate,
                {them: true}));
            await handle(
                {type: "removeItem", monRef: "them", consumed: "powerherb"});
            await exitParser<consumeItem.ExpectConsumeItemsResult>(
                {results: [{shorten: true}]});
        }

        async function moveChargeAbsent()
        {
            await altParser(consumeItem.consumeOnMoveCharge(pstate,
                {them: true}));
            await exitParser<consumeItem.ExpectConsumeItemsResult>(
                {results: []});
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
        function preHitSetup(weak?: boolean)
        {
            initActive("us");
            const mon = initActive("them");
            if (weak) mon.volatile.addedType = "flying";
            return mon;
        }

        async function preHitTaken()
        {
            await altParser(consumeItem.consumeOnPreHit(pstate, {them: true},
                dex.moves.thunder, "us"));
            await handle(
                {type: "removeItem", monRef: "them", consumed: "wacanberry"});
            await exitParser<consumeItem.ExpectConsumeItemsResult>(
                {results: [{resistSuper: "electric"}]});
        }

        async function preHitAbsent()
        {
            await altParser(consumeItem.consumeOnPreHit(pstate, {them: true},
                dex.moves.thunder, "us"));
            await exitParser<consumeItem.ExpectConsumeItemsResult>(
                {results: []});
        }

        testHasItem("wacanberry", () => preHitSetup(/*weak*/ true), preHitTaken,
            preHitAbsent);
        // TODO: additional tests for weak=false

        // TODO: test moveIsType

        describe("Item-ignoring ability (klutz)", () =>
            testBlockingAbilities("wacanberry", ["klutz"],
                () => preHitSetup(/*weak*/ true),
                preHitTaken, preHitAbsent));
    });

    describe("consumeOnSuper()", function()
    {
        function superSetup(weak?: boolean)
        {
            initActive("us");
            const mon = initActive("them");
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
            await altParser(consumeItem.consumeOnSuper(pstate, {them: true},
                dex.moves.lowkick, "us"));
            await handle(
                {type: "removeItem", monRef: "them", consumed: "enigmaberry"});
            // enigmaberry heals holder
            await handle({type: "takeDamage", monRef: "them", hp: 100});
            await exitParser<consumeItem.ExpectConsumeItemsResult>(
                {results: [{}]});
        }

        async function superAbsent()
        {
            await altParser(consumeItem.consumeOnSuper(pstate, {them: true},
                dex.moves.lowkick, "us"));
            await exitParser<consumeItem.ExpectConsumeItemsResult>(
                {results: []});
        }

        testHasItem("enigmaberry", () => superSetup(/*weak*/ true),
            superTaken, superAbsent);
        // TODO: additional tests for weak=false

        describe("Item-ignoring ability (klutz)", () =>
            testBlockingAbilities("enigmaberry", ["klutz"],
                () => superSetup(/*weak*/ true), superTaken, superAbsent));

        // TODO: test moveIsType
    });

    describe("consumeOnHit()", function()
    {
        function postHitSetup()
        {
            initActive("us");
            return initActive("them");
        }

        // TODO: options for silent, damage user, heal holder
        async function postHitTaken(move: dexutil.MoveData, itemName: string)
        {
            await altParser(consumeItem.consumeOnPostHit(pstate, {them: true},
                move, "us"));
            await handle(
                {type: "removeItem", monRef: "them", consumed: itemName});
            // jaboca/rowap berry damage user
            await handle({type: "takeDamage", monRef: "us", hp: 1});
            // since damage effect checks for an on-damage effect, it needs to
            //  explicitly fail for the consumeOn-hit parser to return
            await exitParser<consumeItem.ExpectConsumeItemsResult>(
                {results: [{event: {type: "halt", reason: "decide"}}]});
        }

        async function postHitAbsent(move: dexutil.MoveData)
        {
            await altParser(consumeItem.consumeOnPostHit(pstate, {them: true},
                move, "us"));
            await exitParser<consumeItem.ExpectConsumeItemsResult>(
                {results: []});
        }

        describe("condition = physical (jabocaberry)", function()
        {
            const postHitTakenPhys =
                () => postHitTaken(dex.moves.pound, "jabocaberry");
            const postHitAbsentPhys = () => postHitAbsent(dex.moves.pound);

            testHasItem("jabocaberry", postHitSetup, postHitTakenPhys,
                postHitAbsentPhys);

            describe("Item-ignoring ability (klutz)", () =>
                testBlockingAbilities("jabocaberry", ["klutz"], postHitSetup,
                    postHitTakenPhys, postHitAbsentPhys));
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
        function updateSetup()
        {
            initActive("us");
            return initActive("them");
        }

        async function updateTaken(itemName: string,
            effectEvents: readonly events.Any[] = [])
        {
            await altParser(consumeItem.consumeOnUpdate(pstate, {them: true}));
            await handle(
                {type: "removeItem", monRef: "them", consumed: itemName});
            for (const event of effectEvents) await handle(event);
            await exitParser<consumeItem.ExpectConsumeItemsResult>(
                {results: [{}]});
        }

        async function updateAbsent()
        {
            await altParser(consumeItem.consumeOnUpdate(pstate, {them: true}));
            await exitParser<consumeItem.ExpectConsumeItemsResult>(
                {results: []});
        }

        describe("condition = hp", function()
        {
            function updateHPSetup(lowHP?: boolean)
            {
                const mon = updateSetup();
                if (lowHP) mon.hp.set(1); // within hp threshold
                return mon;
            }

            // TODO: add tests/options to test each kind of consumeOn-update hp
            //  effect/item
            const updateHPTaken =
                () => updateTaken("salacberry",
                    [{type: "boost", monRef: "them", stat: "spe", amount: 1}]);
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
            // TODO: add tests/options for each kind of consumeOn-status item
            function updateStatusSetup(statused?: boolean)
            {
                const mon = updateSetup();
                if (statused) mon.majorStatus.afflict("par");
                return mon;
            }

            // TODO: add tests/options to test each kind of consumeOn-update hp
            //  effect/item
            const updateStatusTaken =
                () => updateTaken("cheriberry",
                [{
                    type: "activateStatusEffect", monRef: "them", effect: "par",
                    start: false
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
                    type: "modifyPP", monRef: "them", move: "tackle", amount: 10
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
        function residualSetup(weak?: boolean)
        {
            initActive("us");
            const mon = initActive("them");
            if (weak) mon.hp.set(1);
            return mon;
        }

        async function residualTaken()
        {
            await altParser(consumeItem.consumeOnResidual(pstate,
                {them: true}));
            await handle(
                {type: "removeItem", monRef: "them", consumed: "micleberry"});
            await exitParser<consumeItem.ExpectConsumeItemsResult>(
                {results: [{}]});
        }

        async function residualAbsent()
        {
            await altParser(consumeItem.consumeOnResidual(pstate,
                {them: true}));
            await exitParser<consumeItem.ExpectConsumeItemsResult>(
                {results: []});
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
        it("Shouldn't infer no item if above HP threshold and didn't activate",
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
            mon.setItem(itemName);
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

        it("Shouldn't infer ability if item didn't activate within original " +
            "hp threshold", async function()
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

        it("Should infer blocking ability if item is confirmed but didn't " +
            "activate", async function()
        {
            const mon = setup();
            mon.setAbility(...abilities, "illuminate");
            mon.setItem(itemName);
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
            expect(mon.item.possibleValues).to.not.have.keys(itemName);
        });
    }
}
