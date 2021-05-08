import { expect } from "chai";
import "mocha";
import * as dex from "../../../../src/battle/dex/dex";
import * as dexutil from "../../../../src/battle/dex/dex-util";
import * as events from "../../../../src/battle/parser/BattleEvent";
import * as item from "../../../../src/battle/parser/gen4/activateItem";
import { BattleState } from "../../../../src/battle/state/BattleState";
import { Side } from "../../../../src/battle/state/Side";
import { InitialContext, ParserContext } from "./Context";
import { ParserHelpers, setupSubParserPartial, StateHelpers } from "./helpers";

export function testActivateItem(ictx: InitialContext,
    getState: () => BattleState, sh: StateHelpers)
{
    // can have cutecharm or magicguard
    const clefable: events.SwitchOptions =
        {species: "clefable", level: 50, gender: "F", hp: 100, hpMax: 100};

    // can have cutecharm or klutz
    const lopunny: events.SwitchOptions =
        {species: "lopunny", level: 50, gender: "F", hp: 100, hpMax: 100};

    // tests for activateItem()
    describe("Event", function()
    {
        let pctx: ParserContext<item.ItemResult>;
        const ph = new ParserHelpers(() => pctx, getState);

        afterEach("Close ParserContext", async function()
        {
            await ph.close();
        });

        /** Initializes the activateItem parser. */
        const init = setupSubParserPartial(ictx.startArgs, getState,
            item.activateItem);

        /** Initializes the activateItem parser with the initial event. */
        async function initWithEvent(monRef: Side, itemName: string,
            on: dexutil.ItemOn | null = null): Promise<void>
        {
            pctx = init(on);
            await ph.handle({type: "activateItem", monRef, item: itemName});
        }

        /**
         * Initializes the activateItem parser and expects it to immediately
         * return after handling the initial event.
         */
        async function initReturn(monRef: Side, itemName: string,
            on: dexutil.ItemOn | null = null): Promise<void>
        {
            pctx = init(on);
            await ph.handleEnd({type: "activateItem", monRef, item: itemName});
        }

        /**
         * Initializes the activateItem parser and expects it to immediately
         * throw after handling the initial event.
         */
        async function initError(errorCtor: ErrorConstructor, message: string,
            monRef: Side, itemName: string, on: dexutil.ItemOn | null = null):
            Promise<void>
        {
            pctx = init(on);
            await ph.rejectError({type: "activateItem", monRef, item: itemName},
                errorCtor, message);
        }

        it("Should infer item if valid", async function()
        {
            const mon = sh.initActive("us");
            expect(mon.item.definiteValue).to.be.null;
            await initReturn("us", "pokeball");
            expect(mon.item.definiteValue).to.equal("pokeball");
        });

        it("Should throw if invalid item", async function()
        {
            await initError(Error, "Unknown item 'invalid_item'",
                "us", "invalid_item");
        });

        it("Should throw if none item", async function()
        {
            await initError(Error, "Unknown item 'none'",
                "us", "none", "turn");
        });

        it("Should reject if mismatched category", async function()
        {
            sh.initActive("us");
            await initError(Error,
                "On-turn effect shouldn't activate for item 'lifeorb'",
                "us", "lifeorb", "turn");
        });

        describe("On-movePostDamage", function()
        {
            it("Should handle percentDamage effect", async function()
            {
                sh.initActive("us");
                sh.initActive("them");
                await initWithEvent("us", "lifeorb", "movePostDamage");
                await ph.handle({type: "takeDamage", monRef: "us", hp: 56});
                await ph.halt();
            });

            it("Should infer no magicguard if damaged", async function()
            {
                sh.initActive("us");
                const mon = sh.initActive("them", clefable);
                expect(mon.traits.ability.possibleValues)
                    .to.have.keys("cutecharm", "magicguard");

                await initWithEvent("them", "lifeorb", "movePostDamage");
                await ph.handle({type: "takeDamage", monRef: "them", hp: 90});
                await ph.halt();
                expect(mon.traits.ability.possibleValues)
                    .to.have.keys("cutecharm");
            });

            it("Should throw if damaged while having magicguard",
            async function()
            {
                const mon = sh.initActive("them", clefable);
                mon.setAbility("magicguard");

                await initError(Error,
                    "Pokemon 'them' received indirect damage from item " +
                        "'lifeorb' even though its ability [magicguard] " +
                        "suppresses that damage",
                    "them", "lifeorb", "movePostDamage");
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
                    sh.initActive("them", nidoqueen).hp.set(90);
                    await initWithEvent("them", "blacksludge", "turn");
                    await ph.handleEnd(
                        {type: "takeDamage", monRef: "them", hp: 100});
                });

                it("Should have noPoison effect if not poison type",
                    async function()
                {
                    sh.initActive("them");
                    await initWithEvent("them", "blacksludge", "turn");
                    await ph.handleEnd(
                        {type: "takeDamage", monRef: "them", hp: 0});
                });
            });

            describe("effects", function()
            {
                it("Should handle percentDamage effect", async function()
                {
                    sh.initActive("us").hp.set(50);
                    await initWithEvent("us", "leftovers", "turn");
                    await ph.handleEnd(
                        {type: "takeDamage", monRef: "us", hp: 56});
                });

                it("Should handle status effect", async function()
                {
                    sh.initActive("them");
                    await initWithEvent("them", "toxicorb", "turn");
                    await ph.handleEnd(
                    {
                        type: "activateStatusEffect", monRef: "them",
                        effect: "tox", start: true
                    });
                });

                it("Should infer no magicguard if damaged", async function()
                {
                    sh.initActive("us");
                    const mon = sh.initActive("them", clefable);
                    expect(mon.traits.ability.possibleValues)
                        .to.have.keys("cutecharm", "magicguard");

                    await initWithEvent("them", "stickybarb", "turn");
                    await ph.handleEnd(
                        {type: "takeDamage", monRef: "them", hp: 94});
                    expect(mon.traits.ability.possibleValues)
                        .to.have.keys("cutecharm");
                });
            });
        });
    });

    describe("Expect functions", function()
    {
        let pctx: ParserContext<item.ExpectItemsResult>;
        const ph = new ParserHelpers(() => pctx, getState);

        afterEach("Close ParserContext", async function()
        {
            await ph.close();
        });

        describe("onMovePostDamage()", function()
        {
            /** Initializes the onMovePostDamage parser. */
            const init = setupSubParserPartial(ictx.startArgs, getState,
                item.onMovePostDamage);

            it("Should infer no on-movePostDamage item if it did not activate",
            async function()
            {
                const mon = sh.initActive("them");
                expect(mon.item.possibleValues).to.include.keys("lifeorb");

                pctx = init({them: true});
                await ph.halt({results: []});
                expect(mon.item.possibleValues).to.not.have.keys("lifeorb");
            });

            it("Shouldn't infer no on-movePostDamage item if it did not " +
                "activate and the effect should've been silent",
            async function()
            {
                const mon = sh.initActive("them");
                mon.hp.set(0);
                expect(mon.item.possibleValues).to.include.keys("lifeorb");

                pctx = init({them: true});
                await ph.halt({results: []});
                expect(mon.item.possibleValues).to.include.keys("lifeorb");
            });


            function test(name: string, ability: string,
                switchOptions: events.SwitchOptions, itemName: string,
                itemEvents: readonly events.Any[]): void
            {
                const otherAbilities =
                    dex.pokemon[switchOptions.species].abilities
                        .filter(n => n !== ability);
                describe(name, function()
                {
                    it(`Should infer no ${ability} if item activated`,
                    async function()
                    {
                        sh.initActive("us");
                        const mon = sh.initActive("them", switchOptions);
                        expect(mon.traits.ability.possibleValues)
                            .to.have.keys(ability, ...otherAbilities);

                        pctx = init({them: true});
                        for (const event of itemEvents) await ph.handle(event);
                        expect(mon.traits.ability.possibleValues)
                            .to.have.keys(...otherAbilities);
                    });

                    it(`Should infer ${ability} if item is confirmed but ` +
                        "didn't activate", async function()
                    {
                        sh.initActive("us");
                        const mon = sh.initActive("them", switchOptions);
                        mon.setItem(itemName);
                        expect(mon.traits.ability.possibleValues)
                            .to.have.keys(ability, ...otherAbilities);

                        pctx = init({them: true});
                        await ph.halt({results: []});
                        expect(mon.traits.ability.possibleValues)
                            .to.have.keys(ability);
                    });

                    it("Shouldn't infer ability if suppressed and item " +
                        "activates", async function()
                    {
                        sh.initActive("us");
                        const mon = sh.initActive("them", switchOptions);
                        mon.volatile.suppressAbility = true;
                        expect(mon.traits.ability.possibleValues)
                            .to.have.keys(ability, ...otherAbilities);

                        pctx = init({them: true});
                        for (const event of itemEvents) await ph.handle(event);
                        expect(mon.traits.ability.possibleValues)
                            .to.have.keys(ability, ...otherAbilities);
                    });

                    it("Should infer no item if ability suppressed and the " +
                        "item doesn't activate", async function()
                    {
                        const mon = sh.initActive("them", switchOptions);
                        mon.volatile.suppressAbility = true;
                        expect(mon.traits.ability.possibleValues)
                            .to.have.keys(ability, ...otherAbilities);
                        expect(mon.item.possibleValues)
                            .to.include.keys(itemName);

                        pctx = init({them: true});
                        await ph.halt({results: []});
                        expect(mon.traits.ability.possibleValues)
                            .to.have.keys(ability, ...otherAbilities);
                        expect(mon.item.possibleValues)
                            .to.not.have.keys(itemName);
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
    });
}
