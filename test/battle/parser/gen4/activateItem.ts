import { expect } from "chai";
import "mocha";
import * as dex from "../../../../src/battle/dex/dex";
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

    const {handle, handleEnd, exitParser} = createParserHelpers(() => parser);

    // can have cutecharm or magicguard
    const clefable: events.SwitchOptions =
        {species: "clefable", level: 50, gender: "F", hp: 100, hpMax: 100};

    // can have cutecharm or klutz
    const lopunny: events.SwitchOptions =
        {species: "lopunny", level: 50, gender: "F", hp: 100, hpMax: 100};

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

            it("Should infer no magicguard if damaged", async function()
            {
                const mon = initActive("them", clefable);
                expect(mon.traits.ability.possibleValues)
                    .to.have.keys("cutecharm", "magicguard");

                await initParser("them", "lifeorb", "movePostDamage");
                await handleEnd(
                    {type: "takeDamage", monRef: "them", hp: 90});
                expect(mon.traits.ability.possibleValues)
                    .to.have.keys("cutecharm");
            });

            it("Should throw if damaged while having magicguard",
            async function()
            {
                const mon = initActive("them", clefable);
                mon.setAbility("magicguard");

                await initParser("them", "lifeorb", "movePostDamage");
                await expect(handle(
                        {type: "takeDamage", monRef: "them", hp: 90}))
                    .to.eventually.be.rejectedWith(Error,
                        "Pokemon 'them' received indirect damage from item " +
                        "'lifeorb' even though its ability [magicguard] " +
                        "suppresses that damage");
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

                it("Should infer no magicguard if damaged", async function()
                {
                    const mon = initActive("them", clefable);
                    expect(mon.traits.ability.possibleValues)
                        .to.have.keys("cutecharm", "magicguard");

                    await initParser("them", "stickybarb", "turn");
                    await handleEnd(
                        {type: "takeDamage", monRef: "them", hp: 94});
                    expect(mon.traits.ability.possibleValues)
                        .to.have.keys("cutecharm");
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

        it("Shouldn't infer no on-movePostDamage item if it did not activate " +
            "and the effect should've been silent",
        async function()
        {
            const mon = initActive("them");
            mon.hp.set(0);
            expect(mon.item.possibleValues).to.include.keys("lifeorb");

            await altParser(item.onMovePostDamage(pstate, {them: true}));
            await exitParser<item.ExpectItemsResult>({results: []});
            expect(mon.item.possibleValues).to.include.keys("lifeorb");
        });


        function test(name: string, ability: string,
            switchOptions: events.SwitchOptions, itemName: string,
            itemEvents: readonly events.Any[]): void
        {
            const otherAbilities = dex.pokemon[switchOptions.species].abilities
                .filter(n => n !== ability);
            describe(name, function()
            {
                it(`Should infer no ${ability} if item activated`,
                async function()
                {
                    const mon = initActive("them", switchOptions);
                    expect(mon.traits.ability.possibleValues)
                        .to.have.keys(ability, ...otherAbilities);

                    await altParser(item.onMovePostDamage(pstate,
                            {them: true}));
                    for (const event of itemEvents) await handle(event);
                    expect(mon.traits.ability.possibleValues)
                        .to.have.keys(...otherAbilities);
                });

                it(`Should infer ${ability} if item is confirmed but didn't ` +
                    "activate", async function()
                {
                    const mon = initActive("them", switchOptions);
                    mon.setItem(itemName);
                    expect(mon.traits.ability.possibleValues)
                        .to.have.keys(ability, ...otherAbilities);

                    await altParser(item.onMovePostDamage(pstate,
                            {them: true}));
                    await exitParser<item.ExpectItemsResult>({results: []});
                    expect(mon.traits.ability.possibleValues)
                        .to.have.keys(ability);
                });

                it("Shouldn't infer ability if suppressed and item activates",
                async function()
                {
                    const mon = initActive("them", switchOptions);
                    mon.volatile.suppressAbility = true;
                    expect(mon.traits.ability.possibleValues)
                        .to.have.keys(ability, ...otherAbilities);

                    await altParser(item.onMovePostDamage(pstate,
                            {them: true}));
                    for (const event of itemEvents) await handle(event);
                    expect(mon.traits.ability.possibleValues)
                        .to.have.keys(ability, ...otherAbilities);
                });

                it("Should infer no item if ability suppressed and the item " +
                    "doesn't activate", async function()
                {
                    const mon = initActive("them", switchOptions);
                    mon.volatile.suppressAbility = true;
                    expect(mon.traits.ability.possibleValues)
                        .to.have.keys(ability, ...otherAbilities);
                    expect(mon.item.possibleValues).to.include.keys(itemName);

                    await altParser(item.onMovePostDamage(pstate,
                            {them: true}));
                    await exitParser<item.ExpectItemsResult>({results: []});
                    expect(mon.traits.ability.possibleValues)
                        .to.have.keys(ability, ...otherAbilities);
                    expect(mon.item.possibleValues).to.not.have.keys(itemName);
                });
            });
        }

        const lifeorbEvents: readonly events.Any[] =
        [
            {type: "activateItem", monRef: "them", item: "lifeorb"},
            {type: "takeDamage", monRef: "them", hp: 90}
        ];

        test("Klutz", "klutz", lopunny, "lifeorb", lifeorbEvents);
        test("Magic Guard (lifeorb)", "magicguard", clefable, "lifeorb",
            lifeorbEvents);
    });

    // TODO: onTurn() once added
}
