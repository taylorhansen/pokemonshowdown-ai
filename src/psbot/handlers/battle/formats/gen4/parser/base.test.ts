import { Protocol } from "@pkmn/protocol";
import { expect } from "chai";
import "mocha";
import { Event } from "../../../../../parser";
import * as dex from "../dex";
import { BattleState } from "../state/BattleState";
import { ditto, smeargle } from "../state/switchOptions.test";
import { ReadonlyVolatileStatus } from "../state/VolatileStatus";
import { dispatch, ignoredEvents } from "./base";
import { createInitialContext, ParserContext } from "./Context.test";
import { initParser, ParserHelpers, toAbilityName, toBoostIDs, toDetails,
    toEffectName, toFieldCondition, toHPStatus, toIdent, toItemName, toMoveName,
    toNum, toSide, toSideCondition, toSpeciesName, toTypes, toUsername,
    toWeather } from "./helpers.test";

export const test = () => describe("base", function()
{
    const ictx = createInitialContext();
    const {sh} = ictx;

    let state: BattleState;

    beforeEach("Extract BattleState", function()
    {
        state = ictx.getState();
    });

    let pctx: ParserContext<void | null> | undefined;
    const ph = new ParserHelpers(() => pctx);

    beforeEach("Initialize base BattleParser", async function()
    {
        pctx = initParser(ictx.startArgs, dispatch);
    });

    afterEach("Close ParserContext", async function()
    {
        await ph.close().finally(() => pctx = undefined);
    });

    describe("invalid event", function()
    {
        it("Should reject and return null", async function()
        {
            await ph.reject({args: ["invalid" as any], kwArgs: {}});
            await ph.return(null);
        });
    });

    // note: for |request|, refer to request.test.ts

    describe("|turn|", function()
    {
        it("Should handle", async function()
        {
            await ph.handle({args: ["turn", toNum(2)], kwArgs: {}});
            await ph.return();
        });
    });

    describe("|win|", function()
    {
        it("Should handle", async function()
        {
            await ph.handle({args: ["win", toUsername("player1")], kwArgs: {}});
            await ph.return();
        });
    });

    describe("|tie|", function()
    {
        it("Should handle", async function()
        {
            await ph.handle({args: ["tie"], kwArgs: {}});
            await ph.return();
        });
    });

    describe("|move|", function()
    {
        it("Should handle move use", async function()
        {
            sh.initActive("p1");
            sh.initActive("p2");

            await ph.handle(
            {
                args: ["move", toIdent("p1"), toMoveName("tackle")], kwArgs: {}
            });
            await ph.handle(
            {
                args: ["-damage", toIdent("p2"), toHPStatus(78)], kwArgs: {}
            });
            await ph.halt();
            await ph.return();
        });
    });

    describe("|switch|", function()
    {
        it("Should handle switch-in", async function()
        {
            sh.initActive("p1");
            sh.initActive("p2", smeargle, /*size*/ 2);

            await ph.handle(
            {
                args:
                [
                    "switch", toIdent("p2", ditto), toDetails(ditto),
                    toHPStatus(100)
                ],
                kwArgs: {}
            });
            await ph.halt();
            await ph.return();
        });
    });

    describe("|drag|", function()
    {
        it("Should handle forced switch-in", async function()
        {
            sh.initActive("p1");
            sh.initActive("p2", smeargle, /*size*/ 2);

            await ph.handle(
            {
                args:
                [
                    "drag", toIdent("p2", ditto), toDetails(ditto),
                    toHPStatus(100)
                ],
                kwArgs: {}
            });
            await ph.halt();
            await ph.return();
        });
    });

    describe("|detailschange|", function()
    {
        it("Should handle permanent form change", async function()
        {
            const mon = sh.initActive("p1", smeargle);
            expect(mon.traits.species.name).to.equal("smeargle");
            expect(mon.baseTraits.species.name).to.equal("smeargle");

            await ph.handle(
            {
                args:
                [
                    "detailschange", toIdent("p1", ditto), toDetails(ditto)
                ],
                kwArgs: {}
            });
            await ph.return();
            expect(mon.traits.species.name).to.equal("ditto");
            expect(mon.baseTraits.species.name).to.equal("ditto");
        });
    });

    describe("|cant|", function()
    {
        it("Should handle inactivity and clear single-move statuses",
        async function()
        {
            const mon = sh.initActive("p1");
            mon.volatile.destinybond = true;

            await ph.handle(
                {args: ["cant", toIdent("p1"), "flinch"], kwArgs: {}});
            await ph.return();
        });

        it("Should reveal move if mentioned", async function()
        {
            const mon = sh.initActive("p1");
            mon.volatile.destinybond = true;
            expect(mon.moveset.get("tackle")).to.be.null;

            await ph.handle(
            {
                args: ["cant", toIdent("p1"), "flinch", toMoveName("tackle")],
                kwArgs: {}
            });
            await ph.return();
            expect(mon.moveset.get("tackle")).to.not.be.null;
        });

        describe("reason = Focus Punch move", function()
        {
            it("Should ignore since the |move| context should already be " +
                "handling this", async function()
            {
                const mon = sh.initActive("p1");
                mon.volatile.focus = true;
                mon.volatile.damaged = true;

                await ph.reject(
                {
                    args: ["cant", toIdent("p1"), toMoveName("focuspunch")],
                    kwArgs: {}
                });
                await ph.return();
            });
        });

        describe("reason = Imprison move", function()
        {
            it("Should reveal move for both sides", async function()
            {
                const us = sh.initActive("p1").moveset;
                const them = sh.initActive("p2").moveset;
                expect(us.get("splash")).to.be.null;
                expect(them.get("splash")).to.be.null;

                await ph.handle(
                {
                    args:
                    [
                        "cant", toIdent("p2"), toMoveName("imprison"),
                        toMoveName("splash")
                    ],
                    kwArgs: {}
                });
                await ph.return();
                expect(us.get("splash")).to.not.be.null;
                expect(them.get("splash")).to.not.be.null;
            });
        });

        describe("reason = recharge", function()
        {
            it("Should reset mustRecharge status", async function()
            {
                const mon = sh.initActive("p1");
                mon.volatile.mustRecharge = true;

                await ph.handle(
                {
                    args: ["cant", toIdent("p1"), "recharge"],
                    kwArgs: {}
                });
                await ph.return();
                expect(mon.volatile.mustRecharge).to.be.false;
            });
        });

        describe("reason = slp", function()
        {
            it("Should tick slp turns", async function()
            {
                const mon = sh.initActive("p1");
                mon.majorStatus.afflict("slp");
                expect(mon.majorStatus.turns).to.equal(1);

                await ph.handle(
                    {args: ["cant", toIdent("p1"), "slp"], kwArgs: {}});
                await ph.return();
                expect(mon.majorStatus.turns).to.equal(2);
            });
        });

        describe("reason = Truant ability", function()
        {
            it("Should flip Truant state", async function()
            {
                // first make sure the pokemon has truant
                const mon = sh.initActive("p1");
                mon.setAbility("truant");
                expect(mon.volatile.willTruant).to.be.false;

                // also flipped back on postTurn to sync with this event
                await ph.handle(
                {
                    args:
                    [
                        "cant", toIdent("p1"), toEffectName("truant", "ability")
                    ],
                    kwArgs: {}
                });
                await ph.return();
                expect(mon.volatile.willTruant).to.be.true;
            });

            it("Should overlap Truant turn with recharge turn", async function()
            {
                // first make sure the pokemon has truant
                const mon = sh.initActive("p1");
                mon.setAbility("truant");
                expect(mon.volatile.willTruant).to.be.false;
                mon.volatile.mustRecharge = true;

                await ph.handle(
                {
                    args:
                    [
                        "cant", toIdent("p1"), toEffectName("truant", "ability")
                    ],
                    kwArgs: {}
                });
                await ph.return();
                expect(mon.volatile.willTruant).to.be.true;
                expect(mon.volatile.mustRecharge).to.be.false;
            });
        });
    });

    describe("|faint|", function()
    {
        it("Should set hp to 0", async function()
        {
            const mon = sh.initActive("p2");
            expect(mon.hp.current).to.equal(100);

            await ph.handle({args: ["faint", toIdent("p2")], kwArgs: {}});
            await ph.return();
            expect(mon.hp.current).to.equal(0);
            expect(mon.fainted).to.be.true;
        });
    });

    describe("|-formechange|", function()
    {
        it("Should handle temporary form change", async function()
        {
            const mon = sh.initActive("p1", smeargle);
            expect(mon.traits.species.name).to.equal("smeargle");
            expect(mon.baseTraits.species.name).to.equal("smeargle");

            await ph.handle(
            {
                args:
                [
                    "-formechange", toIdent("p1", smeargle),
                    toSpeciesName("ditto")
                ],
                kwArgs: {}
            });
            await ph.return();
            expect(mon.traits.species.name).to.equal("ditto");
            expect(mon.baseTraits.species.name).to.equal("smeargle");
        });
    });

    describe("|-fail|", function()
    {
        it("Should do nothing", async function()
        {
            await ph.handle({args: ["-fail", toIdent("p1")], kwArgs: {}});
            await ph.return();
        });
    });

    describe("|-block|", function()
    {
        it("Should throw since unsupported", async function()
        {
            await ph.rejectError(
            {
                args: ["-block", toIdent("p1"), toEffectName("Dynamax")],
                kwArgs: {}
            },
                Error, "Unsupported event type |-block|");
        });
    });

    describe("|-notarget|", function()
    {
        it("Should do nothing", async function()
        {
            await ph.handle({args: ["-notarget"], kwArgs: {}});
            await ph.return();
        });
    });

    describe("|-miss|", function()
    {
        it("Should do nothing", async function()
        {
            await ph.handle({args: ["-miss", toIdent("p2")], kwArgs: {}});
            await ph.return();
        });
    });

    describe("|-damage|", function()
    {
        it("Should set hp", async function()
        {
            const mon = sh.initActive("p2");
            expect(mon.hp.current).to.equal(100);

            await ph.handle(
                {args: ["-damage", toIdent("p2"), toHPStatus(64)], kwArgs: {}});
            await ph.return();
            expect(mon.hp.current).to.equal(64);
        });
    });

    describe("|-heal|", function()
    {
        it("Should set hp", async function()
        {
            const mon = sh.initActive("p2");
            mon.hp.set(43);

            await ph.handle(
                {args: ["-heal", toIdent("p2"), toHPStatus(92)], kwArgs: {}});
            await ph.return();
            expect(mon.hp.current).to.equal(92);
        });

        it("Should consume wish status if mentioned", async function()
        {
            const [, mon] = sh.initTeam("p2", [ditto, smeargle])
            mon.hp.set(2);
            state.getTeam("p2").status.wish.start();

            await ph.handle(
            {
                args: ["-heal", toIdent("p2"), toHPStatus(100)],
                kwArgs: {from: toEffectName("wish", "move"), wisher: "Ditto"}
            });
            await ph.return();
            expect(mon.hp.current).to.equal(100);
            expect(mon.team!.status.wish.isActive).to.be.false;
        });

        it("Should consume healingwish status if mentioned", async function()
        {
            const mon = sh.initActive("p2");
            mon.team!.status.healingwish = true;
            mon.hp.set(31);
            mon.majorStatus.afflict("psn");

            await ph.handle(
            {
                args: ["-heal", toIdent("p2"), toHPStatus(100)],
                kwArgs: {from: toEffectName("healingwish", "move")}
            });
            await ph.return();
            expect(mon.hp.current).to.equal(100);
            expect(mon.majorStatus.current).to.be.null;
            expect(mon.team!.status.healingwish).to.be.false;
        });

        it("Should consume lunardance status and restore move pp if mentioned",
        async function()
        {
            const mon = sh.initActive("p2");
            mon.team!.status.lunardance = true;
            mon.hp.set(31);
            mon.majorStatus.afflict("slp");
            const move = mon.moveset.reveal("tackle");
            move.pp = 3;

            await ph.handle(
            {
                args: ["-heal", toIdent("p2"), toHPStatus(100)],
                kwArgs: {from: toEffectName("lunardance", "move")}
            });
            await ph.return();
            expect(mon.hp.current).to.equal(100);
            expect(mon.majorStatus.current).to.be.null;
            expect(mon.team!.status.lunardance).to.be.false;
            expect(move.pp).to.equal(move.maxpp);
        });
    });

    describe("|-sethp|", function()
    {
        it("Should set hp for one target", async function()
        {
            const mon = sh.initActive("p2");
            mon.hp.set(11);

            await ph.handle(
                {args: ["-sethp", toIdent("p2"), toHPStatus(1)], kwArgs: {}});
            await ph.return();
            expect(mon.hp.current).to.equal(1);
        });

        it("Should set hp for two targets", async function()
        {
            const mon1 = sh.initActive("p1");
            mon1.hp.set(16)
            const mon2 = sh.initActive("p2");
            mon2.hp.set(11);

            await ph.handle(
            {
                args:
                [
                    "-sethp", toIdent("p2"), toNum(19),
                    toIdent("p1"), toNum(13)
                ],
                kwArgs: {}
            });
            await ph.return();
            expect(mon1.hp.current).to.equal(13);
            expect(mon2.hp.current).to.equal(19);
        });

        it("Should throw if first health number is invalid", async function()
        {
            sh.initActive("p1");
            sh.initActive("p2");

            await ph.rejectError(
            {
                args:
                [
                    "-sethp", toIdent("p2"), toNum(NaN),
                    toIdent("p1"), toNum(13)
                ],
                kwArgs: {}
            },
                Error, "Invalid health number 'NaN'");
        });

        it("Should throw if second health number is invalid", async function()
        {
            sh.initActive("p1");
            sh.initActive("p2");

            await ph.rejectError(
            {
                args:
                [
                    "-sethp", toIdent("p2"), toNum(50),
                    toIdent("p1"), toNum(NaN)
                ],
                kwArgs: {}
            },
                Error, "Invalid health number 'NaN'");
        });
    });

    describe("|-status|", function()
    {
        it("Should afflict major status", async function()
        {
            const mon = sh.initActive("p1");
            expect(mon.majorStatus.current).to.be.null;

            await ph.handle(
                {args: ["-status", toIdent("p1"), "brn"], kwArgs: {}});
            await ph.return();
            expect(mon.majorStatus.current).to.equal("brn");
        });
    });

    describe("|-curestatus|", function()
    {
        it("Should cure major status", async function()
        {
            const mon = sh.initActive("p1");
            mon.majorStatus.afflict("frz")

            await ph.handle(
                {args: ["-curestatus", toIdent("p1"), "frz"], kwArgs: {}});
            await ph.return();
            expect(mon.majorStatus.current).to.be.null;
        });

        it("Should throw if mentioning an unrelated status", async function()
        {
            const mon = sh.initActive("p1");
            mon.majorStatus.afflict("psn");

            await ph.rejectError(
                {args: ["-curestatus", toIdent("p1"), "tox"], kwArgs: {}},
                Error, "MajorStatus 'psn' was expected to be 'tox'");
        });
    });

    describe("|-cureteam|", function()
    {
        it("Should cure major status of every pokemon on the team",
        async function()
        {
            const [bench, active] = sh.initTeam("p1", [ditto, smeargle]);
            bench.majorStatus.afflict("slp");
            active.majorStatus.afflict("par");

            await ph.handle(
                {args: ["-cureteam", toIdent("p1")], kwArgs: {}});
            await ph.return();
            expect(bench.majorStatus.current).to.be.null;
            expect(active.majorStatus.current).to.be.null;
        });
    });

    describe("|-boost|", function()
    {
        it("Should add boost", async function()
        {
            const {boosts} = sh.initActive("p1").volatile;
            boosts.atk = 1;

            await ph.handle(
                {args: ["-boost", toIdent("p1"), "atk", toNum(2)], kwArgs: {}});
            await ph.return();
            expect(boosts.atk).to.equal(3);
        });

        it("Should throw if invalid boost number", async function()
        {
            sh.initActive("p1");

            await ph.rejectError(
            {
                args: ["-boost", toIdent("p1"), "atk", toNum(NaN)], kwArgs: {}
            },
                Error, "Invalid boost num 'NaN'");
        });
    });

    describe("|-unboost|", function()
    {
        it("Should subtract boost", async function()
        {
            const {boosts} = sh.initActive("p2").volatile;
            boosts.spe = 5;

            await ph.handle(
            {
                args: ["-unboost", toIdent("p2"), "spe", toNum(4)], kwArgs: {}
            });
            await ph.return();
            expect(boosts.spe).to.equal(1);
        });

        it("Should throw if invalid unboost number", async function()
        {
            sh.initActive("p1");

            await ph.rejectError(
            {
                args: ["-unboost", toIdent("p1"), "atk", toNum(NaN)], kwArgs: {}
            },
                Error, "Invalid unboost num 'NaN'");
        });
    });

    describe("|-setboost|", function()
    {
        it("Should set boost", async function()
        {
            const {boosts} = sh.initActive("p2").volatile;
            boosts.evasion = -2;

            await ph.handle(
            {
                args: ["-setboost", toIdent("p2"), "evasion", toNum(2)],
                kwArgs: {}
            });
            await ph.return();
            expect(boosts.evasion).to.equal(2);
        });

        it("Should throw if invalid boost number", async function()
        {
            sh.initActive("p2");

            await ph.rejectError(
            {
                args: ["-setboost", toIdent("p2"), "spe", toNum(NaN)],
                kwArgs: {}
            },
                Error, "Invalid setboost num 'NaN'");
        });
    });

    describe("|-swapboost|", function()
    {
        it("Should swap stat boosts", async function()
        {
            const us = sh.initActive("p1").volatile.boosts;
            const them = sh.initActive("p2").volatile.boosts;
            us.accuracy = 4;
            them.accuracy = 3;
            them.spd = -1;
            them.spe = 2;

            await ph.handle(
            {
                args:
                [
                    "-swapboost", toIdent("p1"), toIdent("p2"),
                    toBoostIDs("accuracy", "spe")
                ],
                kwArgs: {}
            });
            await ph.return();
            expect(us.accuracy).to.equal(3);
            expect(us.spd).to.equal(0);
            expect(us.spe).to.equal(2);
            expect(them.accuracy).to.equal(4);
            expect(them.spd).to.equal(-1);
            expect(them.spe).to.equal(0);
        });

        it("Should swap all stat boosts if none are mentioned", async function()
        {
            const us = sh.initActive("p1").volatile.boosts;
            const them = sh.initActive("p2").volatile.boosts;
            us.def = 2;
            us.spa = 1;
            us.spd = -5;
            us.evasion = 6;
            them.atk = 4;
            them.spa = -1;
            them.spe = -3;
            them.accuracy = 3;
            const usOld = {...us};
            const themOld = {...them};

            await ph.handle(
            {
                args: ["-swapboost", toIdent("p1"), toIdent("p2")], kwArgs: {}
            });
            await ph.return();
            expect(us).to.deep.equal(themOld);
            expect(them).to.deep.equal(usOld);
        });
    });

    describe("|-invertboost|", function()
    {
        it("Should invert boosts", async function()
        {
            const {boosts} = sh.initActive("p1").volatile;
            boosts.spe = 1;
            boosts.atk = -1;

            await ph.handle(
                {args: ["-invertboost", toIdent("p1")], kwArgs: {}});
            await ph.return();
            expect(boosts.spe).to.equal(-1);
            expect(boosts.atk).to.equal(1);
        });
    });

    describe("|-clearboost|", function()
    {
        it("Should clear boosts", async function()
        {
            const {boosts} = sh.initActive("p1").volatile;
            boosts.spe = -3;
            boosts.accuracy = 6;

            await ph.handle({args: ["-clearboost", toIdent("p1")], kwArgs: {}});
            await ph.return();
            expect(boosts.spe).to.equal(0);
            expect(boosts.accuracy).to.equal(0);
        });
    });

    describe("|-clearallboost|", function()
    {
        it("Should clear all boosts from both sides", async function()
        {
            const us = sh.initActive("p1").volatile.boosts;
            const them = sh.initActive("p2").volatile.boosts;
            us.accuracy = 2;
            them.spe = -2;

            await ph.handle({args: ["-clearallboost"], kwArgs: {}});
            await ph.return();
            expect(us.accuracy).to.equal(0);
            expect(them.spe).to.equal(0);
        });
    });

    describe("|-clearpositiveboost|", function()
    {
        it("Should clear positive boosts", async function()
        {
            const {boosts} = sh.initActive("p1").volatile;
            boosts.spd = 3;
            boosts.def = -1;

            await ph.handle(
            {
                args:
                [
                    "-clearpositiveboost", toIdent("p1"),
                    // source pokemon/effect (note: unsupported move)
                    toIdent("p2"), toEffectName("move: Spectral Thief")
                ],
                kwArgs: {}
            });
            await ph.return();
            expect(boosts.spd).to.equal(0);
            expect(boosts.def).to.equal(-1);
        });
    });

    describe("|-clearnegativeboost|", function()
    {
        it("Should clear negative boosts", async function()
        {
            const {boosts} = sh.initActive("p1").volatile;
            boosts.evasion = 2;
            boosts.spa = -3;

            await ph.handle(
                {args: ["-clearnegativeboost", toIdent("p1")], kwArgs: {}});
            await ph.return();
            expect(boosts.evasion).to.equal(2);
            expect(boosts.spa).to.equal(0);
        });
    });

    describe("|-copyboost|", function()
    {
        it("Should copy boosts", async function()
        {
            const us = sh.initActive("p1").volatile.boosts;
            const them = sh.initActive("p2").volatile.boosts;
            us.evasion = 3;
            us.def = -1;
            them.def = 4;

            await ph.handle(
            {
                args:
                [
                    // order of idents is [source, target]
                    "-copyboost", toIdent("p1"), toIdent("p2"),
                    toBoostIDs("def")
                ],
                kwArgs: {}
            });
            await ph.return();
            expect(us.evasion).to.equal(3);
            expect(us.def).to.equal(-1);
            expect(them.def).to.equal(-1);
        });

        it("Should copy all boosts if none are mentioned", async function()
        {
            const us = sh.initActive("p1").volatile.boosts;
            const them = sh.initActive("p2").volatile.boosts;
            us.atk = 2;
            them.atk = -2;

            await ph.handle(
            {
                args: ["-copyboost", toIdent("p1"), toIdent("p2")], kwArgs: {}
            });
            await ph.return();
            expect(us.atk).to.equal(2);
            expect(them.atk).to.equal(2);
        });
    });

    describe("|-weather|", function()
    {
        function weatherEvent(type: dex.WeatherType | "none",
            kwArgs: Event<"|-weather|">["kwArgs"] = {}): Event<"|-weather|">
        {
            return {
                args: ["-weather", type === "none" ? type : toWeather(type)],
                kwArgs
            };
        }

        beforeEach("Assert weather is none initially", function()
        {
            expect(state.status.weather.type).to.equal("none");
        });

        it("Should set weather", async function()
        {
            await ph.handle(weatherEvent("Sandstorm"));
            await ph.return();
            expect(state.status.weather.type).to.equal("Sandstorm");
            expect(state.status.weather.duration).to.equal(5);
            expect(state.status.weather.source).to.be.null;
        });

        // note: move effect test for item inference is handled in
        //  action/move.test.ts

        // TODO: support in dex data then move test to effect/ability.test.ts
        describe("ability effect", function()
        {
            it("Should infer infinite duration if ability matches weather",
            async function()
            {
                const mon = sh.initActive("p2");
                mon.setAbility("drought", "illuminate")

                await ph.handle(
                    weatherEvent("SunnyDay",
                    {
                        from: toEffectName("drought", "ability"),
                        of: toIdent("p2")
                    }));
                await ph.return();
                expect(state.status.weather.type).to.equal("SunnyDay");
                expect(state.status.weather.duration).to.be.null;
                expect(mon.traits.ability.possibleValues)
                    .to.have.keys("drought");
            });

            it("Should reject ability if it doesn't match event",
            async function()
            {
                const mon = sh.initActive("p2");
                mon.setAbility("drizzle", "illuminate")

                await ph.handle(
                    weatherEvent("Hail",
                    {
                        from: toEffectName("drizzle", "ability"),
                        of: toIdent("p2")
                    }));
                await ph.return();
                expect(state.status.weather.type).to.equal("Hail");
                expect(state.status.weather.duration).to.equal(5);
                expect(mon.traits.ability.possibleValues)
                    .to.have.keys("drizzle", "illuminate");
            });
        });

        it("Should reset weather back to normal if 'none'", async function()
        {
            state.status.weather.start(null, "Hail");
            expect(state.status.weather.type).to.equal("Hail");

            await ph.handle(weatherEvent("none"));
            await ph.return();
            expect(state.status.weather.type).to.equal("none");
        });

        it("Should tick weather if [upkeep] suffix", async function()
        {
            state.status.weather.start(null, "RainDance");
            expect(state.status.weather.turns).to.equal(0);

            await ph.handle(weatherEvent("RainDance", {upkeep: true}));
            await ph.return();
            expect(state.status.weather.turns).to.equal(1);
        });

        it("Should throw if a different weather is upkept", async function()
        {
            state.status.weather.start(null, "SunnyDay");
            expect(state.status.weather.turns).to.equal(0);

            await ph.rejectError(weatherEvent("Hail", {upkeep: true}),
                Error, "Weather is 'SunnyDay' but ticked weather is 'Hail'");
        });
    });

    // fieldstart/fieldend
    for (const start of [true, false])
    {
        const verb = start ? "start" : "end";
        const eventName = `-field${verb}` as const;
        const name = `|${eventName}|`;
        describe(name, function()
        {
            // pseudo-weathers
            for (const effect of ["gravity", "trickroom"] as const)
            {
                it(`Should ${verb} ${effect}`, async function()
                {
                    if (!start) state.status[effect].start();
                    expect(state.status[effect].isActive)
                        .to.be[start ? "false" : "true"];

                    await ph.handle(
                    {
                        args: [eventName, toFieldCondition(effect)], kwArgs: {}
                    });
                    await ph.return();
                    expect(state.status[effect].isActive)
                        .to.be[start ? "true" : "false"];
                });
            }
        });
    }

    // sidestart/sideend
    for (const start of [true, false])
    {
        const verb = start ? "start" : "end";
        const eventName = `-side${verb}` as const;
        const name = `|${eventName}|`;
        describe(name, function()
        {
            for (const effect of ["lightscreen", "reflect"] as const)
            {
                const condition = toSideCondition(effect);
                it(`Should ${verb} ${effect}`, async function()
                {
                    const {status: ts} = state.getTeam("p2");
                    if (!start) ts[effect].start();
                    expect(ts[effect].isActive).to.be[start ? "false" : "true"];

                    await ph.handle(
                    {
                        args: [eventName, toSide("p2", "player2"), condition],
                        kwArgs: {}
                    });
                    await ph.return();
                    expect(ts[effect].isActive).to.be[start ? "true" : "false"];
                    expect(ts[effect].source).to.be.null;
                });
            }

            for (const effect of
                ["spikes", "stealthrock", "toxicspikes"] as const)
            {
                const condition = toSideCondition(effect);
                it(`Should ${verb} ${effect}`, async function()
                {
                    const {status: ts} = state.getTeam("p1");
                    if (!start) ts[effect] = 1;
                    expect(ts[effect]).to.equal(start ? 0 : 1);

                    await ph.handle(
                    {
                        args: [eventName, toSide("p1", "player1"), condition],
                        kwArgs: {}
                    });
                    await ph.return();
                    expect(ts[effect]).to.equal(start ? 1 : 0);
                });
            }

            for (const effect of
                ["luckychant", "mist", "safeguard", "tailwind"] as const)
            {
                const condition = toSideCondition(effect);
                it(`Should ${verb} ${effect}`, async function()
                {
                    const ts = state.getTeam("p1").status;
                    if (!start) ts[effect].start();
                    expect(ts[effect].isActive).to.be[start ? "false" : "true"];

                    await ph.handle(
                    {
                        args: [eventName, toSide("p1", "player1"), condition],
                        kwArgs: {}
                    });
                    await ph.return();
                    expect(ts[effect].isActive).to.be[start ? "true" : "false"];
                });
            }
        });
    }

    describe("|-swapsideconditions|", function()
    {
        it("Should throw since unsupported", async function()
        {
            await ph.rejectError({args: ["-swapsideconditions"], kwArgs: {}},
                Error, "Unsupported event type |-swapsideconditions|");
        });
    });

    // start/end
    for (const start of [true, false])
    {
        const verb = start ? "start" : "end";
        const eventName = `-${verb}` as const;
        const name = `|${eventName}|`;
        describe(name, function()
        {
            if (start)
            {
                it("Should start flashfire", async function()
                {
                    const {volatile: v} = sh.initActive("p1");
                    expect(v.flashfire).to.be.false;

                    await ph.handle(
                    {
                        args:
                        [
                            "-start", toIdent("p1"),
                            toEffectName("flashfire", "ability")
                        ],
                        kwArgs: {}
                    });
                    await ph.return();
                    expect(v.flashfire).to.be.true;
                });

                it("Should start typeadd", async function()
                {
                    const {volatile: v} = sh.initActive("p1");
                    expect(v.addedType).to.equal("???");

                    await ph.handle(
                    {
                        args:
                        [
                            "-start", toIdent("p1"), toEffectName("typeadd"),
                            toTypes("fire")
                        ],
                        kwArgs: {}
                    });
                    await ph.return();
                    expect(v.addedType).to.equal("fire");
                });

                it("Should start typechange and reset typeadd", async function()
                {
                    const {volatile: v} = sh.initActive("p1", ditto);
                    expect(v.overrideTraits).to.not.be.null;
                    expect(v.overrideTraits!.types)
                        .to.have.members(["normal", "???"]);
                    v.addedType = "bug";

                    await ph.handle(
                    {
                        args:
                        [
                            "-start", toIdent("p1"), toEffectName("typechange"),
                            toTypes("dark", "rock")
                        ],
                        kwArgs: {}
                    });
                    await ph.return();
                    expect(v.overrideTraits).to.not.be.null;
                    expect(v.overrideTraits!.types)
                        .to.have.members(["dark", "rock"]);
                    expect(v.addedType).to.equal("???");
                });

                it("Should truncate typechange if more than 2 types given",
                async function()
                {
                    const {volatile: v} = sh.initActive("p1", ditto);
                    expect(v.overrideTraits).to.not.be.null;
                    expect(v.overrideTraits!.types)
                        .to.have.members(["normal", "???"]);

                    await ph.handle(
                    {
                        args:
                        [
                            "-start", toIdent("p1"), toEffectName("typechange"),
                            toTypes("dragon", "ghost", "psychic")
                        ],
                        kwArgs: {}
                    });
                    await ph.return();
                    expect(v.overrideTraits).to.not.be.null;
                    expect(v.overrideTraits!.types)
                        .to.have.members(["dragon", "ghost"]);
                });

                it("Should expand typechange if 1 type given", async function()
                {
                    const {volatile: v} = sh.initActive("p1", ditto);
                    expect(v.overrideTraits).to.not.be.null;
                    expect(v.overrideTraits!.types)
                        .to.have.members(["normal", "???"]);

                    await ph.handle(
                    {
                        args:
                        [
                            "-start", toIdent("p1"), toEffectName("typechange"),
                            toTypes("psychic")
                        ],
                        kwArgs: {}
                    });
                    await ph.return();
                    expect(v.overrideTraits).to.not.be.null;
                    expect(v.overrideTraits!.types)
                        .to.have.members(["psychic", "???"]);
                });

                it("Should expand typechange if 0 types given", async function()
                {
                    const {volatile: v} = sh.initActive("p1", ditto);
                    expect(v.overrideTraits).to.not.be.null;
                    expect(v.overrideTraits!.types)
                        .to.have.members(["normal", "???"]);

                    await ph.handle(
                    {
                        args:
                        [
                            "-start", toIdent("p1"), toEffectName("typechange"),
                            toTypes()
                        ],
                        kwArgs: {}
                    });
                    await ph.return();
                    expect(v.overrideTraits).to.not.be.null;
                    expect(v.overrideTraits!.types)
                        .to.have.members(["???", "???"]);
                });

                it("Should count perish", async function()
                {
                    const {volatile: v} = sh.initActive("p1", ditto);
                    expect(v.perish).to.equal(0);

                    await ph.handle(
                    {
                        args:
                        [
                            "-start", toIdent("p1"), toEffectName("perish2")
                        ],
                        kwArgs: {}
                    });
                    await ph.return();
                    expect(v.perish).to.equal(2);
                });

                it("Should count stockpile", async function()
                {
                    const {volatile: v} = sh.initActive("p1", ditto);
                    expect(v.stockpile).to.equal(0);

                    await ph.handle(
                    {
                        args:
                        [
                            "-start", toIdent("p1"), toEffectName("stockpile1")
                        ],
                        kwArgs: {}
                    });
                    await ph.return();
                    expect(v.stockpile).to.equal(1);
                });
            }
            else
            {
                it("Should end stockpile", async function()
                {
                    const {volatile: v} = sh.initActive("p1", ditto);
                    v.stockpile = 3;

                    await ph.handle(
                    {
                        args:
                            ["-end", toIdent("p1"), toEffectName("stockpile")],
                        kwArgs: {}
                    });
                    await ph.return();
                    expect(v.stockpile).to.equal(0);
                });
            }

            for (const effect of
            [
                "aquaring", "attract", "curse", "focusenergy", "imprison",
                "ingrain", "mudsport", "leechseed", "nightmare", "powertrick",
                "substitute", "torment", "watersport"
            ] as const)
            {
                const effectStr = toEffectName(effect, "move");
                it(`Should ${verb} ${effect}`, async function()
                {
                    const {volatile: v} = sh.initActive("p1");
                    if (!start) v[effect] = true;
                    expect(v[effect]).to.be[start ? "false" : "true"];

                    await ph.handle(
                    {
                        args: [eventName, toIdent("p1"), effectStr], kwArgs: {}
                    });
                    await ph.return();
                    expect(v[effect]).to.be[start ? "true" : "false"];
                });
            }

            for (const [effect, type] of
            [
                ["bide", "move"], ["confusion"], ["embargo", "move"],
                ["healblock", "move"], ["magnetrise", "move"],
                ["slowstart", "ability"], ["taunt", "move"], ["uproar", "move"],
                ["yawn", "move"]
            ] as const)
            {
                const effectStr =
                    type ? toEffectName(effect, type) : toEffectName(effect);
                it(`Should ${verb} ${effect}`, async function()
                {
                    const {volatile: v} = sh.initActive("p1");
                    if (!start) v[effect].start();
                    expect(v[effect].isActive).to.be[start ? "false" : "true"];

                    await ph.handle(
                    {
                        args: [eventName, toIdent("p1"), effectStr], kwArgs: {}
                    });
                    await ph.return();
                    expect(v[effect].isActive).to.be[start ? "true" : "false"];
                });

                if (start && effect === "confusion")
                {
                    it("Should reset lockedMove status if starting " +
                        "confusion due to fatigue", async function()
                    {
                        const v = sh.initActive("p2").volatile;
                        v.lockedMove.start("outrage");

                        await ph.handle(
                        {
                            args: ["-start", toIdent("p2"), effectStr],
                            kwArgs: {fatigue: true}
                        });
                        await ph.return();
                        expect(v.lockedMove.isActive).to.be.false;
                    });
                }

                if (start && effect === "uproar")
                {
                    it("Should update uproar if upkeep and already active",
                    async function()
                    {
                        const v = sh.initActive("p1").volatile;
                        expect(v[effect].isActive).to.be.false;

                        // first start the effect
                        v[effect].start();
                        expect(v[effect].isActive).to.be.true;
                        expect(v[effect].turns).to.equal(0);

                        // then update it
                        await ph.handle(
                        {
                            args: ["-start", toIdent("p1"), effectStr],
                            kwArgs: {upkeep: true}
                        });
                        await ph.return();
                        expect(v[effect].isActive).to.be.true;
                        expect(v[effect].turns).to.equal(1);
                    });
                }
            }

            // disable
            if (start)
            {
                it("Should disable move", async function()
                {
                    const mon = sh.initActive("p2");

                    await ph.handle(
                    {
                        args:
                        [
                            "-start", toIdent("p2"),
                            toEffectName("disable", "move"),
                            toMoveName("tackle")
                        ],
                        kwArgs: {}
                    });
                    await ph.return();
                    expect(mon.volatile.disabled.move).to.equal("tackle");
                    expect(mon.volatile.disabled.ts.isActive).to.be.true;
                });
            }
            else
            {
                it("Should re-enable disabled moves", async function()
                {
                    const v = sh.initActive("p2").volatile;
                    v.disableMove("tackle");
                    expect(v.disabled.move).to.equal("tackle");
                    expect(v.disabled.ts.isActive).to.be.true;

                    await ph.handle(
                    {
                        args:
                        [
                            "-end", toIdent("p2"),
                            toEffectName("disable", "move")
                        ],
                        kwArgs: {}
                    });
                    await ph.return();
                    expect(v.disabled.move).to.be.null;
                    expect(v.disabled.ts.isActive).to.be.false;
                });
            }

            for (const effect of ["foresight", "miracleeye"] as const)
            {
                const effectStr = toEffectName(effect, "move");
                it(`Should ${verb} ${effect}`, async function()
                {
                    const {volatile: v} = sh.initActive("p1");
                    if (!start) v.identified = effect;
                    else expect(v.identified).to.be.null;

                    await ph.handle(
                    {
                        args: [eventName, toIdent("p1"), effectStr], kwArgs: {}
                    });
                    await ph.return();
                    if (start) expect(v.identified).to.equal(effect);
                    else expect(v.identified).to.be.null;
                });
            }

            const futureVerb = start ? "prepare" : "release";
            it(`Should ${futureVerb} future move`, async function()
            {
                sh.initActive("p1");
                sh.initActive("p2");
                const {futureMoves: fm} = state.getTeam("p1").status;
                if (!start) fm.doomdesire.start();
                expect(fm.doomdesire.isActive).to.be[start ? "false" : "true"];

                await ph.handle(
                {
                    args:
                    [
                        // note: start mentions user, end mentions target
                        eventName, toIdent(start ? "p1" : "p2"),
                        toMoveName("doomdesire")
                    ],
                    kwArgs: {}
                });
                await ph.return();
                expect(fm.doomdesire.isActive).to.be[start ? "true" : "false"];
            });

            it(`Should ${verb} encore`, async function()
            {
                const {volatile: v} = sh.initActive("p1");
                if (!start)
                {
                    v.encoreMove("tackle");
                    expect(v.encore.ts.isActive).to.be.true;
                    expect(v.encore.move).to.equal("tackle");
                }
                else
                {
                    v.lastMove = "tackle";
                    expect(v.encore.ts.isActive).to.be.false;
                    expect(v.encore.move).to.be.null;
                }

                await ph.handle(
                {
                    args:
                    [
                        eventName, toIdent("p1"), toEffectName("encore", "move")
                    ],
                    kwArgs: {}
                });
                await ph.return();
                expect(v.encore.ts.isActive).to.be[start ? "true" : "false"];
                if (start) expect(v.encore.move).to.equal("tackle");
                else expect(v.encore.move).to.be.null;
            });

            if (start)
            {
                it("Should throw if starting encore but no lastMove was set",
                async function()
                {
                    const {volatile: v} = sh.initActive("p1");
                    expect(v.encore.ts.isActive).to.be.false;
                    expect(v.encore.move).to.be.null;

                    await ph.rejectError(
                    {
                        args:
                        [
                            eventName, toIdent("p1"),
                            toEffectName("encore", "move")
                        ],
                        kwArgs: {}
                    },
                        Error, "Can't Encore if lastMove is null");
                });
            }

            it("Should ignore invalid effect", async function()
            {
                sh.initActive("p1");

                await ph.handle(
                {
                    args:
                    [
                        eventName, toIdent("p1"), toEffectName("invalid")
                    ],
                    kwArgs: {}
                });
                await ph.return();
            });
        });
    }

    describe("|-crit|", function()
    {
        it("Should do nothing", async function()
        {
            await ph.handle({args: ["-crit", toIdent("p2")], kwArgs: {}});
            await ph.return();
        });
    });

    describe("|-supereffective|", function()
    {
        it("Should do nothing", async function()
        {
            await ph.handle(
                {args: ["-supereffective", toIdent("p2")], kwArgs: {}});
            await ph.return();
        });
    });

    describe("|-resisted|", function()
    {
        it("Should do nothing", async function()
        {
            await ph.handle({args: ["-resisted", toIdent("p2")], kwArgs: {}});
            await ph.return();
        });
    });

    describe("|-immune|", function()
    {
        it("Should do nothing", async function()
        {
            await ph.handle({args: ["-immune", toIdent("p2")], kwArgs: {}});
            await ph.return();
        });
    });

    describe("|-item|", function()
    {
        it("Should set item", async function()
        {
            const mon = sh.initActive("p1");
            expect(mon.item.possibleValues).to.include.keys("pokeball", "mail");

            await ph.handle(
            {
                args: ["-item", toIdent("p1"), toItemName("mail")], kwArgs: {}
            });
            await ph.return();
            expect(mon.item.possibleValues).to.have.keys("mail");
        });

        // TODO: move to move effect tests
        it("Should handle recycle effect", async function()
        {
            const mon = sh.initActive("p1");
            mon.removeItem("mail");
            expect(mon.lastItem.possibleValues).to.have.keys("mail");
            expect(mon.item.possibleValues).to.have.keys("none");

            await ph.handle(
            {
                args: ["-item", toIdent("p1"), toItemName("mail")],
                kwArgs: {from: toEffectName("recycle", "move")}
            });
            await ph.return();
            expect(mon.item.possibleValues).to.have.keys("mail");
            expect(mon.lastItem.possibleValues).to.have.keys("none");
        });
    });

    describe("|-enditem|", function()
    {
        it("Should consume item", async function()
        {
            const mon = sh.initActive("p1");
            const {item, lastItem} = mon;
            expect(item.possibleValues).to.include.keys("focussash", "mail");
            expect(lastItem.possibleValues).to.have.keys("none");

            await ph.handle(
            {
                args: ["-enditem", toIdent("p1"), toItemName("focussash")],
                kwArgs: {}
            });
            await ph.return();
            expect(item.possibleValues).to.have.keys("focussash");
            expect(mon.item.possibleValues).to.have.keys("none");
            expect(mon.lastItem).to.not.equal(lastItem,
                "lastItem wasn't reassigned");
            expect(mon.lastItem).to.equal(item,
                "item wasn't transfered to lastItem");
        });

        it("Should destroy item if '[from] stealeat'", async function()
        {
            const mon = sh.initActive("p1");
            const {item, lastItem} = mon;
            expect(item.possibleValues).to.include.keys("oranberry", "mail");
            expect(lastItem.possibleValues).to.have.keys("none");

            await ph.handle(
            {
                args: ["-enditem", toIdent("p1"), toItemName("oranberry")],
                kwArgs: {from: "stealeat", of: toIdent("p2")}
            });
            await ph.return();
            expect(item.possibleValues).to.have.keys("oranberry");
            expect(lastItem.possibleValues).to.have.keys("none");
            expect(mon.item.possibleValues).to.have.keys("none");
            expect(mon.lastItem).to.not.equal(item,
                "item was transfered to lastItem");
            expect(mon.lastItem).to.equal(lastItem, "lastItem was reassigned");
            // TODO: item on-eat effects?
        });

        it("Should destroy item if from item-removal move", async function()
        {
            const mon = sh.initActive("p1");
            const {item, lastItem} = mon;
            expect(item.possibleValues).to.include.keys("oranberry", "mail");
            expect(lastItem.possibleValues).to.have.keys("none");

            await ph.handle(
            {
                args: ["-enditem", toIdent("p1"), toItemName("oranberry")],
                kwArgs: {from: toEffectName("knockoff", "move")}
            });
            await ph.return();
            expect(item.possibleValues).to.have.keys("oranberry");
            expect(lastItem.possibleValues).to.have.keys("none");
            expect(mon.item.possibleValues).to.have.keys("none");
            expect(mon.lastItem).to.not.equal(item,
                "item was transfered to lastItem");
            expect(mon.lastItem).to.equal(lastItem, "lastItem was reassigned");
        });

        it("Should consume micleberry status", async function()
        {
            const mon = sh.initActive("p1");
            const {item, lastItem} = mon;
            mon.volatile.micleberry = true;

            await ph.handle(
            {
                args: ["-enditem", toIdent("p1"), toItemName("micleberry")],
                kwArgs: {}
            });
            await ph.return();
            expect(mon.volatile.micleberry).to.be.false;
            expect(mon.item).to.equal(item, "item was reassigned");
            expect(mon.lastItem).to.equal(lastItem, "lastItem was reassigned");
        });
    });

    describe("|-ability|", function()
    {
        it("Should reveal ability", async function()
        {
            const mon = sh.initActive("p1");
            expect(mon.ability).to.equal("");

            await ph.handle(
            {
                args: ["-ability", toIdent("p1"), toAbilityName("swiftswim")],
                kwArgs: {}
            });
            await ph.return();
            expect(mon.ability).to.equal("swiftswim");
        });

        it("Should throw if unknown ability", async function()
        {
            sh.initActive("p1");

            await ph.rejectError(
            {
                args:
                [
                    "-ability", toIdent("p1"), "invalid" as Protocol.AbilityName
                ],
                kwArgs: {}
            },
                Error, "Unknown ability 'invalid'");
        });
    });

    describe("|-endability|", function()
    {
        it("Should start gastroacid", async function()
        {
            const {volatile: v} = sh.initActive("p2");
            expect(v.suppressAbility).to.be.false;

            await ph.handle({args: ["-endability", toIdent("p2")], kwArgs: {}});
            await ph.return();
            expect(v.suppressAbility).to.be.true;
        });

        it("Should also reveal ability if specified", async function()
        {
            const mon = sh.initActive("p2");
            mon.setAbility("illuminate", "frisk");
            expect(mon.volatile.suppressAbility).to.be.false;

            await ph.handle(
            {
                args: ["-endability", toIdent("p2"), toAbilityName("frisk")],
                kwArgs: {}
            });
            await ph.return();
            expect(mon.volatile.suppressAbility).to.be.true;
            expect(mon.traits.ability.possibleValues).to.have.keys("frisk");
        });
    });

    describe("|-transform|", function()
    {
        it("Should transform pokemon", async function()
        {
            const us = sh.initActive("p1", smeargle);
            const them = sh.initActive("p2", ditto);

            await ph.handle(
            {
                args: ["-transform", toIdent("p2", ditto), toIdent("p1")],
                kwArgs: {}
            });
            await ph.return();
            expect(them.volatile.transformed).to.be.true;
            expect(them.species).to.equal(us.species);
        });
    });

    describe("|-mega|", function()
    {
        it("Should throw since unsupported", async function()
        {
            await ph.rejectError(
            {
                args:
                [
                    "-mega", toIdent("p1"), toSpeciesName("gengar"),
                    "Gengarite" as Protocol.ItemName
                ],
                kwArgs: {}
            },
                Error, "Unsupported event type |-mega|");
        });
    });

    describe("|-primal|", function()
    {
        it("Should throw since unsupported", async function()
        {
            await ph.rejectError({args: ["-primal", toIdent("p1")], kwArgs: {}},
                Error, "Unsupported event type |-primal|");
        });
    });

    describe("|-burst|", function()
    {
        it("Should throw since unsupported", async function()
        {
            await ph.rejectError(
            {
                args:
                [
                    "-burst", toIdent("p1"),
                    "Necrozma-DM" as Protocol.SpeciesName,
                    "Ultranecrozium Z" as Protocol.ItemName
                ],
                kwArgs: {}
            },
                Error, "Unsupported event type |-burst|");
        });
    });

    describe("|-zpower|", function()
    {
        it("Should throw since unsupported", async function()
        {
            await ph.rejectError({args: ["-zpower", toIdent("p1")], kwArgs: {}},
                Error, "Unsupported event type |-zpower|");
        });
    });

    describe("|-zbroken|", function()
    {
        it("Should throw since unsupported", async function()
        {
            await ph.rejectError(
                {args: ["-zbroken", toIdent("p1")], kwArgs: {}}, Error,
                "Unsupported event type |-zbroken|");
        });
    });

    describe("|-activate|", function()
    {
        it("Should handle forewarn", async function()
        {
            // note that usually this happens inside an Ability activation
            //  context since more information is available
            sh.initActive("p1");
            const mon = sh.initActive("p2");
            expect(mon.moveset.get("takedown")).to.be.null;

            await ph.handle(
            {
                args:
                [
                    "-activate", toIdent("p1"),
                    toEffectName("forewarn", "ability"), toMoveName("takedown")
                ],
                kwArgs: {of: toIdent("p2")}
            });
            await ph.return();
            expect(mon.moveset.get("takedown")).to.not.be.null;
        });

        for (const [effect, type] of [["bide", "move"], ["confusion"]] as const)
        {
            const effectStr =
                type ? toEffectName(effect, type) : toEffectName(effect);
            it(`Should update ${effect}`, async function()
            {
                const v = sh.initActive("p1").volatile;
                expect(v[effect].isActive).to.be.false;

                // first start the effect
                v[effect].start();
                expect(v[effect].isActive).to.be.true;
                expect(v[effect].turns).to.equal(0);

                // then update it
                await ph.handle(
                {
                    args: ["-activate", toIdent("p1"), effectStr], kwArgs: {}
                });
                await ph.return();
                expect(v[effect].isActive).to.be.true;
                expect(v[effect].turns).to.equal(1);
            });
        }

        for (const [effect, type] of [["charge", "move"]] as const)
        {
            const effectStr =
                type ? toEffectName(effect, type) : toEffectName(effect);
            it(`Should start ${effect}`, async function()
            {
                const v = sh.initActive("p1").volatile;
                expect(v[effect].isActive).to.be.false;

                await ph.handle(
                {
                    args: ["-activate", toIdent("p1"), effectStr], kwArgs: {}
                });
                await ph.return();
                expect(v[effect].isActive).to.be.true;
                expect(v[effect].turns).to.equal(0);
            });
        }

        for (const effect of
            ["endure", "mist", "protect", "safeguard", "substitute"] as const)
        {
            it(`Should handle blocked effect if ${effect}`, async function()
            {
                const mon = sh.initActive("p1");
                switch (effect)
                {
                    case "endure": case "protect":
                        mon.volatile.stall(true);
                        break;
                    case "mist": case "safeguard":
                        mon.team!.status[effect].start();
                        break;
                    case "substitute":
                        mon.volatile[effect] = true;
                        break;
                }

                await ph.handle(
                {
                    args:
                    [
                        "-activate", toIdent("p1"), toEffectName(effect, "move")
                    ],
                    kwArgs: {}
                });
                await ph.return();
            });

            if (effect !== "substitute") continue;

            it("Should throw if substitute mentioned but pokemon doesn't " +
                "have a Substitute", async function()
            {
                sh.initActive("p1");
                await ph.rejectError(
                {
                    args:
                    [
                        "-activate", toIdent("p1"), toEffectName(effect, "move")
                    ],
                    kwArgs: {}
                },
                    Error,
                    "Substitute blocked an effect but no Substitute exists");
            });
        }

        it("Should break stall if feint", async function()
        {
            const v = sh.initActive("p2").volatile;
            v.stall(true);
            expect(v.stalling).to.be.true;
            expect(v.stallTurns).to.equal(1);

            // assume "us" uses Feint move
            await ph.handle(
            {
                args:
                [
                    "-activate", toIdent("p2"), toEffectName("feint", "move")
                ],
                kwArgs: {}
            });
            await ph.return();
            expect(v.stalling).to.be.false;
            // should not reset stall turns
            expect(v.stallTurns).to.equal(1);
        });

        it("Should fully deplete move pp if grudge", async function()
        {
            const {moveset} = sh.initActive("p2");
            expect(moveset.get("splash")).to.be.null;

            await ph.handle(
            {
                args:
                [
                    "-activate", toIdent("p2"), toEffectName("grudge", "move"),
                    toMoveName("splash")
                ],
                kwArgs: {}
            });
            await ph.return();
            const move = moveset.get("splash");
            expect(move).to.not.be.null;
            expect(move!.pp).to.equal(0);
            expect(move!.maxpp).to.equal(64);
        });

        it("Should restore 10 move pp if leppaberry", async function()
        {
            const {moveset} = sh.initActive("p2");
            const move = moveset.reveal("ember");
            move.pp -= 20;
            expect(move.pp).to.equal(move.maxpp - 20);

            await ph.handle(
            {
                args:
                [
                    "-activate", toIdent("p2"),
                    toEffectName("leppaberry", "item"), toMoveName("ember")
                ],
                kwArgs: {}
            });
            await ph.return();
            expect(move.pp).to.equal(move.maxpp - 10);
        });

        for (const effect of ["lockon", "mindreader"] as const)
        {
            it(`Should set lockon status if ${effect}`, async function()
            {
                const us = sh.initActive("p1").volatile;
                const them = sh.initActive("p2").volatile;
                expect(us.lockedOnBy).to.be.null;
                expect(us.lockOnTarget).to.be.null;
                expect(us.lockOnTurns.isActive).to.be.false;
                expect(them.lockedOnBy).to.be.null;
                expect(them.lockOnTarget).to.be.null;
                expect(them.lockOnTurns.isActive).to.be.false;

                // p1 locks onto p2
                await ph.handle(
                {
                    args:
                    [
                        "-activate", toIdent("p1"), toEffectName(effect, "move")
                    ],
                    kwArgs: {of: toIdent("p2")}
                });
                await ph.return();
                expect(us.lockedOnBy).to.be.null;
                expect(us.lockOnTarget).to.equal(them);
                expect(us.lockOnTurns.isActive).to.be.true;
                expect(them.lockedOnBy).to.equal(us);
                expect(them.lockOnTarget).to.be.null;
                expect(them.lockOnTurns.isActive).to.be.false;
            });
        }

        it("Should activate mimic", async function()
        {
            const mon = sh.initActive("p2");
            mon.moveset.reveal("mimic");
            mon.volatile.lastMove = "mimic";

            await ph.handle(
            {
                args:
                [
                    "-activate", toIdent("p2"), toEffectName("mimic", "move"),
                    toMoveName("splash")
                ],
                kwArgs: {}
            });
            await ph.return();
            // replaces override moveset but not base, so switching will still
            //  restore the original mimic move
            expect(mon.moveset.get("splash")).to.not.be.null;
            expect(mon.moveset.get("mimic")).to.be.null;
            expect(mon.baseMoveset.get("splash")).to.be.null;
            expect(mon.baseMoveset.get("mimic")).to.not.be.null;
        });

        it("Should activate sketch", async function()
        {
            const mon = sh.initActive("p2");
            mon.moveset.reveal("sketch");
            mon.volatile.lastMove = "sketch";

            await ph.handle(
            {
                args:
                [
                    "-activate", toIdent("p2"), toEffectName("mimic", "move"),
                    toMoveName("tackle")
                ],
                kwArgs: {}
            });
            await ph.return();
            // works like mimic but also changes base moveset
            expect(mon.moveset.get("tackle")).to.not.be.null;
            expect(mon.moveset.get("sketch")).to.be.null;
            expect(mon.baseMoveset.get("tackle")).to.not.be.null;
            expect(mon.baseMoveset.get("sketch")).to.be.null;
        });

        it("Should throw if no lastMove on sketch/mimic", async function()
        {
            const mon = sh.initActive("p1");
            expect(mon.volatile.lastMove).to.be.null;

            await ph.rejectError(
            {
                args:
                [
                    "-activate", toIdent("p1"), toEffectName("mimic", "move"),
                    toMoveName("ember")
                ],
                kwArgs: {}
            },
                Error, "Don't know how Mimic/Sketch was caused");
        });

        it("Should throw if invalid lastMove on sketch/mimic", async function()
        {
            const mon = sh.initActive("p1");
            mon.volatile.lastMove = "invalid";

            await ph.rejectError(
            {
                args:
                [
                    "-activate", toIdent("p1"), toEffectName("mimic", "move"),
                    toMoveName("ember")
                ],
                kwArgs: {}
            },
                Error, "Unknown Mimic-like move 'invalid'");
        });

        it("Should deplete arbitrary move pp if spite", async function()
        {
            const {moveset} = sh.initActive("p2");
            expect(moveset.get("splash")).to.be.null;

            await ph.handle(
            {
                args:
                [
                    "-activate", toIdent("p2"), toEffectName("spite", "move"),
                    toMoveName("splash"), toNum(4)
                ] as any, // TODO: fix protocol typings
                kwArgs: {}
            });
            await ph.return();
            const move = moveset.get("splash");
            expect(move).to.not.be.null;
            expect(move!.pp).to.equal(60);
            expect(move!.maxpp).to.equal(64);
        });

        it("Should activate trapped", async function()
        {
            const us = sh.initActive("p1").volatile;
            const them = sh.initActive("p2").volatile;

            // p1 being trapped by p2
            await ph.handle(
            {
                args: ["-activate", toIdent("p1"), toEffectName("trapped")],
                kwArgs: {}
            });
            await ph.return();
            expect(us.trapped).to.equal(them);
            expect(us.trapping).to.be.null;
            expect(them.trapped).to.be.null;
            expect(them.trapping).to.equal(us);
        });

        it("Should ignore invalid effect", async function()
        {
            sh.initActive("p1");

            await ph.handle(
            {
                args: ["-activate", toIdent("p1"), toEffectName("invalid")],
                kwArgs: {}
            });
            await ph.return();
        });
    });

    describe("|-fieldactivate|", function()
    {
        it("Should handle", async function()
        {
            await ph.handle(
            {
                args: ["-fieldactivate", toEffectName("payday", "move")],
                kwArgs: {}
            });
            await ph.return();
        });
    });

    describe("|-center|", function()
    {
        it("Should throw since unsupported", async function()
        {
            await ph.rejectError({args: ["-center"], kwArgs: {}}, Error,
                "Unsupported event type |-center|");
        });
    });

    describe("|-combine|", function()
    {
        it("Should throw since unsupported", async function()
        {
            await ph.rejectError({args: ["-combine"], kwArgs: {}}, Error,
                "Unsupported event type |-combine|");
        });
    });

    describe("|-waiting|", function()
    {
        it("Should throw since unsupported", async function()
        {
            await ph.rejectError(
            {
                args: ["-waiting", toIdent("p1"), toIdent("p1", ditto, "b")],
                kwArgs: {}
            },
                Error, "Unsupported event type |-waiting|");
        });
    });

    describe("|-prepare|", function()
    {
        it("Should prepare two-turn move", async function()
        {
            const vts = sh.initActive("p2").volatile.twoTurn;

            await ph.handle(
            {
                args: ["-prepare", toIdent("p2"), toMoveName("fly")], kwArgs: {}
            });
            await ph.return();
            expect(vts.isActive).to.be.true;
            expect(vts.type).to.equal("fly");
        });

        it("Should throw if not a two-turn move", async function()
        {
            sh.initActive("p2");

            await ph.rejectError(
            {
                args:
                [
                    "-prepare", toIdent("p2"), toMoveName("ember")
                ],
                kwArgs: {}
            },
                Error, "Move 'ember' is not a two-turn move");
        });
    });

    describe("|-mustrecharge|", function()
    {
        it("Should indicate recharge", async function()
        {
            const {volatile: v} = sh.initActive("p1");
            expect(v.mustRecharge).to.be.false;

            await ph.handle(
                {args: ["-mustrecharge", toIdent("p1")], kwArgs: {}});
            await ph.return();
            expect(v.mustRecharge).to.be.true;
        });
    });

    describe("|-hitcount|", function()
    {
        it("Should do nothing", async function()
        {
            await ph.handle(
                {args: ["-hitcount", toIdent("p2"), toNum(4)], kwArgs: {}});
            await ph.return();
        });
    });

    describe("|-singlemove|", function()
    {
        function testSingleMove(effect: dex.SingleMoveType,
            getter: (v: ReadonlyVolatileStatus) => boolean, moveId?: string):
            void
        {
            const moveName = toMoveName(moveId ?? effect);
            it(`Should start ${effect}`, async function()
            {
                const {volatile: v} = sh.initActive("p1");
                expect(getter(v)).to.be.false;

                await ph.handle(
                {
                    args: ["-singlemove", toIdent("p1"), moveName], kwArgs: {}
                });
                await ph.return();
                expect(getter(v)).to.be.true;
            });
        }

        testSingleMove("destinybond", v => v.destinybond);
        testSingleMove("grudge", v => v.grudge);
        testSingleMove("rage", v => v.rage);
    });

    describe("|-singleturn|", function()
    {
        function testSingleTurn(effect: dex.SingleTurnType,
            getter: (v: ReadonlyVolatileStatus) => boolean, moveId?: string):
            void
        {
            const moveName = toMoveName(moveId ?? effect);
            it(`Should start ${effect}`, async function()
            {
                const {volatile: v} = sh.initActive("p1");
                expect(getter(v)).to.be.false;

                await ph.handle(
                {
                    args: ["-singleturn", toIdent("p1"), moveName], kwArgs: {}
                });
                await ph.return();
                expect(getter(v)).to.be.true;
            });
        }

        testSingleTurn("endure", v => v.stallTurns > 0);
        testSingleTurn("focus", v => v.focus, "focuspunch");
        testSingleTurn("magiccoat", v => v.magiccoat);
        testSingleTurn("protect", v => v.stallTurns > 0);
        testSingleTurn("roost", v => v.roost);
        testSingleTurn("snatch", v => v.snatch);
    });

    describe("|-candynamax|", function()
    {
        it("Should throw since unsupported", async function()
        {
            await ph.rejectError({args: ["-candynamax", "p1"], kwArgs: {}},
                Error, "Unsupported event type |-candynamax|");
        });
    });

    describe("|updatepoke|", function()
    {
        it("Should throw since unsupported", async function()
        {
            await ph.rejectError(
            {
                args: ["updatepoke", toIdent("p1"), toDetails(smeargle)],
                kwArgs: {}
            },
                Error, "Unsupported event type |updatepoke|");
        });
    });

    describe("ignoredEvents", function()
    {
        it("Should consume ignored events", async function()
        {
            const pctx2 = initParser(ictx.startArgs, ignoredEvents);
            const ph2 = new ParserHelpers(() => pctx2);
            await ph2.handle({args: ["done"], kwArgs: {}});
            await ph2.handle(
                {args: ["t:", "time" as Protocol.Timestamp], kwArgs: {}});
            await ph2.close();
        });
    });
});
