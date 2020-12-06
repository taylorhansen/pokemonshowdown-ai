import { expect } from "chai";
import "mocha";
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

    const {handle, exitParser} = createParserHelpers(() => parser);

    async function initParser(monRef: Side, consumed: string | boolean,
        on: dexutil.ItemConsumeOn | null = null): Promise<SubParser>
    {
        parser = consumeItem.removeItem(pstate,
            {type: "removeItem", monRef, consumed}, on);
        // first yield doesn't return anything
        await expect(parser.next())
            .to.eventually.become({value: undefined, done: false});
        return parser;
    }

    async function initReturn(monRef: Side, consumed: string | boolean,
        on: dexutil.ItemConsumeOn | null = null,
        result: consumeItem.ItemConsumeResult = {}):
        Promise<SubParser<consumeItem.ItemConsumeResult>>
    {
        parser = consumeItem.removeItem(pstate,
            {type: "removeItem", monRef, consumed}, on);
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

            await initReturn("them", /*consumed*/ false, /*on*/ null, {});
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

        describe("On-moveCharge", function()
        {
            it("Should indicate shortened charge", async function()
            {
                const mon = initActive("us");
                mon.volatile.twoTurn.start("dig");
                await initReturn("us", "powerherb", "moveCharge",
                    {shorten: true});
            });

            it("Should reject unrelated item", async function()
            {
                const mon = initActive("us");
                mon.volatile.twoTurn.start("dive");
                await expect(initParser("us", "sitrusberry", "moveCharge"))
                    .to.eventually.be.rejectedWith(Error,
                        "ConsumeOn-moveCharge effect shouldn't activate for " +
                        "item 'sitrusberry'");
            });
        });
    });

    describe("consumeOnMoveCharge()", function()
    {
        it("Should handle normal removeItem event", async function()
        {
            const mon = initActive("them");
            mon.volatile.twoTurn.start("solarbeam");
            expect(mon.item.possibleValues).to.include.keys("powerherb");

            await altParser(consumeItem.consumeOnMoveCharge(pstate,
                {them: true}));
            await handle(
                {type: "removeItem", monRef: "them", consumed: "powerherb"});
            await exitParser<consumeItem.ExpectConsumeResult>(
                {results: [{shorten: true}]});
            expect(mon.lastItem.possibleValues).to.have.keys("powerherb");
        });

        it("Should infer no consumeOn-moveCharge item if it did not activate",
        async function()
        {
            const mon = initActive("them");
            mon.volatile.twoTurn.start("solarbeam");
            expect(mon.item.possibleValues).to.include.keys("powerherb");

            await altParser(consumeItem.consumeOnMoveCharge(pstate,
                {them: true}));
            await exitParser<consumeItem.ExpectConsumeResult>({results: []});
            expect(mon.item.possibleValues).to.not.have.keys("powerherb");
        });

        it("Shouldn't infer no consumeOn-moveCharge item if it did not " +
            "activate and the effect should've been silent",
        async function()
        {
            const mon = initActive("them");
            mon.volatile.twoTurn.start("razorwind");
            mon.volatile.embargo.start();
            expect(mon.item.possibleValues).to.include.keys("powerherb");

            await altParser(consumeItem.consumeOnMoveCharge(pstate,
                {them: true}));
            await exitParser<consumeItem.ExpectConsumeResult>({results: []});
            expect(mon.item.possibleValues).to.include.keys("powerherb");
        });
    });

    // TODO: onTurn() once added
}
