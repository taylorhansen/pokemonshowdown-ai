import { expect } from "chai";
import "mocha";
import * as dexutil from "../../../../src/battle/dex/dex-util";
import * as events from "../../../../src/battle/parser/BattleEvent";
import { ParserState, SubParser } from
    "../../../../src/battle/parser/BattleParser";
import * as item from "../../../../src/battle/parser/gen4/activateItem";
import { Pokemon } from "../../../../src/battle/state/Pokemon";
import { Side } from "../../../../src/battle/state/Side";
import { Context } from "./Context";
import { createParserHelpers } from "./helpers";

export function testActivateItem(f: () => Context,
    initActive: (monRef: Side, options?: events.SwitchOptions) => Pokemon)
{
    let pstate: ParserState;
    let parser: SubParser;

    beforeEach("Extract Context", function()
    {
        ({pstate, parser} = f());
    });

    const {exitParser} = createParserHelpers(() => parser);

    // tests for activateItem()
    describe("Event", function()
    {
        async function initParser(monRef: Side, itemName: string,
            on: dexutil.ItemOn | null = null): Promise<SubParser>
        {
            parser = item.activateItem(pstate,
                {type: "activateItem", monRef, item: itemName}, on);
            // first yield doesn't return anything
            await expect(parser.next())
                .to.eventually.become({value: undefined, done: false});
            return parser;
        }

        async function initReturn(monRef: Side, itemName: string,
            on: dexutil.ItemOn | null = null): Promise<SubParser>
        {
            parser = item.activateItem(pstate,
                {type: "activateItem", monRef, item: itemName}, on);
            // first yield doesn't return anything
            await expect(parser.next())
                .to.eventually.become({value: {}, done: true});
            return parser;
        }

        const {handleEnd} = createParserHelpers(() => parser);

        it("Should infer item if valid", async function()
        {
            const mon = initActive("us");
            expect(mon.item.definiteValue).to.be.null;
            await initReturn("us", "pokeball");
            expect(mon.item.definiteValue).to.equal("pokeball");
        });

        it("Should throw if invalid item", async function()
        {
            await expect(initParser("us", "invalid_item"))
                .to.eventually.be.rejectedWith(Error,
                    "Unknown item 'invalid_item'");
        });

        it("Should throw if none item", async function()
        {
            await expect(initParser("us", "none", "turn"))
                .to.eventually.be.rejectedWith(Error, "Unknown item 'none'");
        });

        it("Should reject if mismatched category", async function()
        {
            initActive("us");
            await expect(initParser("us", "lifeorb", "turn"))
                .to.eventually.be.rejectedWith(Error,
                    "On-turn effect shouldn't activate for item 'lifeorb'");
        });

        describe("On-movePostDamage", function()
        {
            it("Should handle percentDamage effect", async function()
            {
                initActive("us");
                await initParser("us", "lifeorb", "movePostDamage");
                await handleEnd({type: "takeDamage", monRef: "us", hp: 56});
            });
        });

        describe("On-turn", function()
        {
            describe("poison/noPoison", function()
            {
                // poison type
                const nidoqueen: events.SwitchOptions =
                {
                    species: "nidoqueen", level: 83, gender: "F", hp: 100,
                    hpMax: 100
                };

                it("Should have poison effect if poison type", async function()
                {
                    initActive("them", nidoqueen).hp.set(90);
                    await initParser("them", "blacksludge", "turn");
                    await handleEnd(
                        {type: "takeDamage", monRef: "them", hp: 100});
                });

                it("Should have noPoison effect if not poison type",
                    async function()
                {
                    initActive("them");
                    await initParser("them", "blacksludge", "turn");
                    await handleEnd(
                        {type: "takeDamage", monRef: "them", hp: 0});
                });
            });

            describe("effects", function()
            {
                it("Should handle percentDamage effect", async function()
                {
                    initActive("us").hp.set(50);
                    await initParser("us", "leftovers", "turn");
                    await handleEnd({type: "takeDamage", monRef: "us", hp: 56});
                });

                it("Should handle status effect", async function()
                {
                    initActive("us");
                    await initParser("us", "toxicorb", "turn");
                    await handleEnd(
                    {
                        type: "activateStatusEffect", monRef: "us",
                        effect: "tox", start: true
                    });
                });
            });
        });
    });

    // TODO: move to helpers
    async function altParser<TParser extends SubParser>(gen: TParser):
        Promise<TParser>
    {
        parser = gen;
        // first yield doesn't return anything
        await expect(parser.next())
            .to.eventually.become({value: undefined, done: false});
        return gen;
    }

    describe("onMovePostDamage()", function()
    {
        it("Should infer no on-movePostDamage item if it did not activate",
        async function()
        {
            const mon = initActive("them");
            expect(mon.item.possibleValues).to.include.keys("lifeorb");

            await altParser(item.onMovePostDamage(pstate, {them: true}));
            await exitParser<item.ExpectItemsResult>({results: []});
            expect(mon.item.possibleValues).to.not.have.keys("lifeorb");
        });
    });

    // TODO: onTurn() once added
}
