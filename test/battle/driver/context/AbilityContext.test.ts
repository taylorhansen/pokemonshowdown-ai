import { expect } from "chai";
import "mocha";
import * as effects from "../../../../src/battle/dex/effects";
import * as events from "../../../../src/battle/driver/BattleEvent";
import { AbilityContext } from "../../../../src/battle/driver/context/context";
import { BattleState } from "../../../../src/battle/state/BattleState";
import { Pokemon } from "../../../../src/battle/state/Pokemon";
import { Side } from "../../../../src/battle/state/Side";
import { Logger } from "../../../../src/Logger";
import { smeargle } from "../helpers";

/** flamebody pokemon. */
const magmar: events.DriverSwitchOptions =
    {species: "magmar", level: 40, gender: "F", hp: 100, hpMax: 100};

/** colorchange pokemon. */
const kecleon: events.DriverSwitchOptions =
    {species: "kecleon", level: 40, gender: "M", hp: 100, hpMax: 100};

/** roughskin pokemon. */
const sharpedo: events.DriverSwitchOptions =
    {species: "sharpedo", level: 40, gender: "M", hp: 100, hpMax: 100};

describe("AbilityContext", function()
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

    function initCtx(monRef: Side, ability: string,
        on: effects.ability.On | null = null, hitByMove?: string):
        AbilityContext
    {
        return AbilityContext.from(state,
            {type: "activateAbility", monRef, ability}, Logger.null, on,
            hitByMove);
    }

    describe("from()", function()
    {
        it("Should reveal ability", function()
        {
            const mon = initActive("them");
            expect(mon.ability).to.equal("");
            initCtx("them", "swiftswim");
            expect(mon.ability).to.equal("swiftswim");
        });

        it("Should throw if unknown ability", function()
        {
            expect(() => initCtx("them", "invalid_ability")).to.throw(Error,
                "Unknown ability 'invalid_ability'");
        });
    });


    describe("#expire()", function()
    {
        it("Should not throw if no pending effects", function()
        {
            initActive("us");
            const ctx = initCtx("us", "aftermath");
            expect(() => ctx.expire()).to.not.throw();
        });

        it("Should throw if effects are still pending", function()
        {
            initActive("us");
            const ctx = initCtx("us", "aftermath", "contactKO");
            expect(() => ctx.expire()).to.throw(Error, "Expected effects " +
                "that didn't happen: aftermath on-contactKO hit " +
                "percentDamage ['-25%']");
        });
    });

    describe("#handle()", function()
    {
        describe("activateFieldEffect", function()
        {
            describe("weather", function()
            {
                it("Should infer infinite duration if ability matches weather",
                function()
                {
                    initActive("them");
                    expect(initCtx("them", "drought")
                            .handle(
                            {
                                type: "activateFieldEffect",
                                effect: "SunnyDay", start: true
                            }))
                        .to.be.true;
                    expect(state.status.weather.type).to.equal("SunnyDay");
                    expect(state.status.weather.duration).to.be.null;
                });

                it("Should expire if mismatched ability", function()
                {
                    initActive("them");
                    expect(initCtx("them", "snowwarning")
                            .handle(
                            {
                                type: "activateFieldEffect",
                                effect: "SunnyDay", start: true
                            }))
                        .to.not.be.ok;
                    expect(state.status.weather.type).to.equal("none");
                });
            });
        });

        describe("activateStatusEffect", function()
        {
            it("Should handle status effect", function()
            {
                initActive("us");
                initActive("them", magmar);
                const ctx = initCtx("them", "flamebody", "contact");
                expect(ctx.handle(
                    {
                        type: "activateStatusEffect", monRef: "us",
                        effect: "brn", start: true
                    }))
                    .to.be.true;
                ctx.expire();
            });

            it("Should handle if `on` is overqualified", function()
            {
                initActive("us");
                initActive("them", magmar);
                const ctx = initCtx("them", "flamebody", "contactKO");
                expect(ctx.handle(
                    {
                        type: "activateStatusEffect", monRef: "us",
                        effect: "brn", start: true
                    }))
                    .to.be.true;
                ctx.expire();
            });

            it("Should not handle if `on` is underqualified", function()
            {
                initActive("us");
                initActive("them", magmar);
                const ctx = initCtx("them", "flamebody", "damaged");
                expect(ctx.handle(
                    {
                        type: "activateStatusEffect", monRef: "us",
                        effect: "brn", start: true
                    }))
                    .to.not.be.ok;
                ctx.expire();
            });
        });

        describe("changeType", function()
        {
            it("Should handle colorchange ability effect", function()
            {
                initActive("us");
                initActive("them", kecleon);
                const ctx = initCtx("them", "colorchange", "damaged",
                    "watergun");
                expect(ctx.handle(
                    {
                        type: "changeType", monRef: "them",
                        newTypes: ["water", "???"]
                    }))
                    .to.be.true;
                ctx.expire();
            });
        });

        describe("takeDamage", function()
        {
            it("Should handle percentDamage effect", function()
            {
                initActive("us");
                initActive("them", sharpedo);
                const ctx = initCtx("them", "roughskin", "contact");
                expect(ctx.handle({type: "takeDamage", monRef: "us", hp: 94}))
                    .to.be.true;
                ctx.expire();
            });
        });
    });
});
