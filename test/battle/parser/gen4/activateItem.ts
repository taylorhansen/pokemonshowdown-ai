import { expect } from "chai";
import "mocha";
import * as effects from "../../../../src/battle/dex/effects";
import * as events from "../../../../src/battle/parser/BattleEvent";
import { ParserState, SubParser } from
    "../../../../src/battle/parser/BattleParser";
import { activateItem } from
    "../../../../src/battle/parser/gen4/activateItem";
import { Pokemon } from "../../../../src/battle/state/Pokemon";
import { Side } from "../../../../src/battle/state/Side";
import { smeargle } from "../../../helpers/switchOptions";
import { Context } from "./Context";
import { createParserHelpers } from "./helpers";

/** poison type. */
const nidoqueen: events.SwitchOptions =
    {species: "nidoqueen", level: 83, gender: "F", hp: 100, hpMax: 100};

export function testActivateItem(f: () => Context,
    initActive: (monRef: Side, options?: events.SwitchOptions) => Pokemon)
{
    let pstate: ParserState;
    let parser: SubParser;

    beforeEach("Extract Context", function()
    {
        ({pstate, parser} = f());
    });

    async function initParser(monRef: Side, item: string,
        ctg: effects.item.Category | null = null): Promise<SubParser>
    {
        parser = activateItem(pstate, {type: "activateItem", monRef, item},
            ctg);
        // first yield doesn't return anything
        await expect(parser.next())
            .to.eventually.become({value: undefined, done: false});
        return parser;
    }

    async function initReject(monRef: Side, item: string,
        ctg: effects.item.Category | null = null): Promise<SubParser>
    {
        const event: events.ActivateItem = {type: "activateItem", monRef, item};
        parser = activateItem(pstate, event, ctg);
        await expect(parser.next())
            .to.eventually.become({value: {event}, done: true});
        return parser;
    }

    const {handle, reject, exitParser} = createParserHelpers(() => parser);

    it("Should infer item if valid", async function()
    {
        const mon = initActive("us");
        expect(mon.item.definiteValue).to.be.null;
        await initParser("us", "pokeball", "turn");
        expect(mon.item.definiteValue).to.equal("pokeball");
    });

    it("Should throw if invalid item", async function()
    {
        await expect(initParser("us", "invalid_item", "turn"))
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
        await initReject("us", "lifeorb", "turn");
    });

    describe("blacksludge", function()
    {
        it("Should have only-poison effect if poison type", async function()
        {
            initActive("them", nidoqueen);
            await initParser("them", "blacksludge", "turn");
            await expect(exitParser()).to.eventually.be.rejectedWith(Error,
                "Expected effects that didn't happen: " +
                "blacksludge percentDamage turn only-poison ['6.25%']");
        });

        it("Should have no-poison effect if not poison type", async function()
        {
            initActive("them");
            await initParser("them", "blacksludge", "turn");
            await expect(exitParser()).to.eventually.be.rejectedWith(Error,
                "Expected effects that didn't happen: " +
                "blacksludge percentDamage turn no-poison ['-12.5%']");
        });
    });

    describe("halt", function()
    {
        it("Should reject", async function()
        {
            initActive("us");
            await initParser("us", "pokeball");
            await reject({type: "halt", reason: "decide"});
        });
    });

    describe("takeDamage", function()
    {
        it("Should handle percentDamage effect", async function()
        {
            const mon = initActive("us", smeargle);
            mon.hp.set(50, smeargle.hpMax);
            await initParser("us", "leftovers", "turn");
            await handle({type: "takeDamage", monRef: "us", hp: 56});
            expect(mon.hp.current).to.equal(56); // should also handle
            await exitParser();
        });

        describe("blacksludge", function()
        {
            it("Should consume only-poison effect if poison type",
            async function()
            {
                initActive("them", nidoqueen).hp.set(99, 100);
                await initParser("them", "blacksludge", "turn");
                await handle({type: "takeDamage", monRef: "them", hp: 100});
                await exitParser();
            });

            it("Should have no-poison effect if not poison type",
            async function()
            {
                initActive("them").hp.set(1, 100);
                await initParser("them", "blacksludge", "turn");
                await handle({type: "takeDamage", monRef: "them", hp: 0});
                await exitParser();
            });
        });
    });
}
