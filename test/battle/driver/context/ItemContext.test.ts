import { expect } from "chai";
import "mocha";
import * as effects from "../../../../src/battle/dex/effects";
import * as events from "../../../../src/battle/driver/BattleEvent";
import { ContextResult } from "../../../../src/battle/driver/context/context";
import { ItemContext } from "../../../../src/battle/driver/context/ItemContext";
import { BattleState } from "../../../../src/battle/state/BattleState";
import { Pokemon } from "../../../../src/battle/state/Pokemon";
import { Side } from "../../../../src/battle/state/Side";
import { Logger } from "../../../../src/Logger";
import { smeargle } from "../helpers";

const nidoqueen: events.DriverSwitchOptions =
    {species: "nidoqueen", level: 83, gender: "F", hp: 100, hpMax: 100};

describe("ItemContext", function()
{
    let state: BattleState;

    beforeEach("Initialize BattleState", function()
    {
        state = new BattleState();
    });

    function initActive(monRef: Side, options = smeargle, teamSize = 1): Pokemon
    {
        state.teams[monRef].size = teamSize;
        return state.teams[monRef].switchIn(options)!;
    }

    function ctxFrom(event: events.ActivateItem, ctg: effects.item.Category):
        ContextResult
    {
        return ItemContext.from(state, event, Logger.null, ctg);
    }

    function initCtx(event: events.ActivateItem, ctg: effects.item.Category):
        ItemContext
    {
        const ctx = ctxFrom(event, ctg);
        expect(ctx).to.be.an.instanceOf(ItemContext);
        return ctx as ItemContext;
    }

    describe("constructor", function()
    {
        it("Should return ItemContext and infer item if valid", function()
        {
            const mon = initActive("us");
            expect(mon.item.definiteValue).to.be.null;
            initCtx({type: "activateItem", monRef: "us", item: "pokeball"},
                "turn");
            expect(mon.item.definiteValue).to.equal("pokeball");
        });

        it("Should throw if invalid item", function()
        {
            expect(() => ctxFrom(
                    {type: "activateItem", monRef: "us", item: "invalid_item"},
                    "turn"))
                .to.throw(Error, "Unknown item 'invalid_item'");
        });

        it("Should throw if none item", function()
        {
            expect(() => ctxFrom(
                    {type: "activateItem", monRef: "us", item: "none"}, "turn"))
                .to.throw(Error, "Unknown item 'none'");
        });

        it("Should reject if mismatched category", function()
        {
            expect(ctxFrom(
                    {type: "activateItem", monRef: "us", item: "lifeorb"},
                    "turn"))
                .to.not.be.ok;
        });

        describe("blacksludge", function()
        {
            it("Should have only-poison effect if poison type", function()
            {
                initActive("them", nidoqueen);
                const ctx = initCtx(
                    {type: "activateItem", monRef: "them", item: "blacksludge"},
                    "turn");
                expect(() => ctx.expire()).to.throw(Error, "Expected effects " +
                    "that didn't happen: blacksludge percentDamage turn " +
                    "only-poison ['6.25%']");
            });

            it("Should have no-poison effect if not poison type", function()
            {
                initActive("them");
                const ctx = initCtx(
                    {type: "activateItem", monRef: "them", item: "blacksludge"},
                    "turn");
                expect(() => ctx.expire()).to.throw(Error, "Expected effects " +
                    "that didn't happen: blacksludge percentDamage turn " +
                    "no-poison ['-12.5%']");
            });
        });
    });

    describe("#expire()", function()
    {
        it("Should throw if pending effects", function()
        {
            initActive("us");
            const ctx = initCtx(
                {type: "activateItem", monRef: "us", item: "leftovers"},
                "turn");
            expect(() => ctx.expire()).to.throw(Error, "Expected effects " +
                "that didn't happen: leftovers percentDamage turn ['6.25%']");
        });
    });

    describe("#handle()", function()
    {
        describe("takeDamage", function()
        {
            it("Should handle percentDamage effect", function()
            {
                const mon = initActive("us");
                mon.hp.set(50, smeargle.hpMax);
                const ctx = initCtx(
                    {type: "activateItem", monRef: "us", item: "leftovers"},
                    "turn");
                expect(ctx.handle({type: "takeDamage", monRef: "us", hp: 56}))
                    .to.be.ok;
                expect(mon.hp.current).to.equal(56); // should also handle
                ctx.expire();
            });

            describe("blacksludge", function()
            {
                it("Should consume only-poison effect if poison type",
                function()
                {
                    initActive("them", nidoqueen).hp.set(99, 100);
                    const ctx = initCtx(
                    {
                        type: "activateItem", monRef: "them",
                        item: "blacksludge"
                    },
                        "turn");
                    expect(ctx.handle(
                            {type: "takeDamage", monRef: "them", hp: 100}))
                        .to.be.ok;
                    ctx.expire();
                });

                it("Should have no-poison effect if not poison type", function()
                {
                    initActive("them").hp.set(1, 100);
                    const ctx = initCtx(
                    {
                        type: "activateItem", monRef: "them",
                        item: "blacksludge"
                    },
                        "turn");
                    expect(ctx.handle(
                            {type: "takeDamage", monRef: "them", hp: 0}))
                        .to.be.ok;
                    ctx.expire();
                });
            });
        });
    });
});
