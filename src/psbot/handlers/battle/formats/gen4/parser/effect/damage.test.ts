import { expect } from "chai";
import "mocha";
import { smeargle } from "../../state/switchOptions.test";
import { ParserContext } from "../Context.test";
import { createInitialContext } from "../Context.test";
import { ParserHelpers, setupBattleParser, toHPStatus, toIdent } from
    "../helpers.test";
import * as effectDamage from "./damage";

export const test = () => describe("damage", function()
{
    const ictx = createInitialContext();
    const {sh} = ictx;

    describe("percentDamage()", function()
    {
        const init = setupBattleParser(ictx.startArgs,
            effectDamage.percentDamage);
        let pctx: ParserContext<true | "silent" | undefined> | undefined;
        const ph = new ParserHelpers(() => pctx);

        afterEach("Close ParserContext", async function()
        {
            // reset variable so it doesn't leak into other tests
            await ph.close().finally(() => pctx = undefined);
        });

        it("Should handle damage", async function()
        {
            const mon = sh.initActive("p1");
            expect(mon.hp.current).to.equal(mon.hp.max);

            pctx = init("p1", -1);
            await ph.handle(
            {
                args: ["-damage", toIdent("p1"), toHPStatus(90, 100)],
                kwArgs: {}
            });
            await ph.return(true);
            expect(mon.hp.current).to.equal(90);
        });

        it("Should handle heal", async function()
        {
            const mon = sh.initActive("p1");
            mon.hp.set(90);
            expect(mon.hp.current).to.equal(90);

            pctx = init("p1", 1);
            await ph.handle(
            {
                args: ["-heal", toIdent("p1"), toHPStatus(95, 100)], kwArgs: {}
            });
            await ph.return(true);
            expect(mon.hp.current).to.equal(95);
        });

        it("Should reject invalid side", async function()
        {
            const mon = sh.initActive("p1");
            expect(mon.hp.current).to.equal(mon.hp.max);

            pctx = init("p1", -1);
            await ph.reject(
            {
                args: ["-damage", toIdent("p2"), toHPStatus(90, 100)],
                kwArgs: {}
            });
            await ph.return(undefined);
            expect(mon.hp.current).to.equal(mon.hp.max);
        });

        it("Should reject invalid hp", async function()
        {
            const mon = sh.initActive("p1");
            mon.hp.set(90);
            expect(mon.hp.current).to.equal(90);

            pctx = init("p1", -1);
            await ph.reject(
            {
                args: ["-heal", toIdent("p1"), toHPStatus(95, 100)], kwArgs: {}
            });
            await ph.return(undefined);
            expect(mon.hp.current).to.equal(90);
        });

        it("Should reject invalid health format", async function()
        {
            const mon = sh.initActive("p1");
            expect(mon.hp.current).to.equal(mon.hp.max);

            pctx = init("p1", -1);
            await ph.reject(
            {
                // invalid format: should have finite hp number
                args: ["-damage", toIdent("p1"), toHPStatus(NaN, Infinity)],
                kwArgs: {}
            });
            await ph.return(undefined);
            expect(mon.hp.current).to.equal(mon.hp.max);
        });

        it("Should handle silent damage", async function()
        {
            const mon = sh.initActive("p1");
            mon.hp.set(0);
            expect(mon.hp.current).to.equal(0);

            pctx = init("p1", -1);
            await ph.return("silent");
            expect(mon.hp.current).to.equal(0);
        });

        it("Should explicitly handle silent damage if noSilent=true",
        async function()
        {
            const mon = sh.initActive("p1");
            expect(mon.hp.current).to.equal(100);

            pctx = init("p1", 1, /*pred*/ undefined, /*noSilent*/ true);
            await ph.handle(
            {
                args: ["-damage", toIdent("p1"), toHPStatus(100)], kwArgs: {}
            });
            await ph.return(true);
            expect(mon.hp.current).to.equal(100);
        });

        it("Should handle silent heal", async function()
        {
            const mon = sh.initActive("p1");
            expect(mon.hp.current).to.equal(mon.hp.max);

            pctx = init("p1", 1);
            await ph.return("silent");
            expect(mon.hp.current).to.equal(mon.hp.max);
        });

        it("Should handle predicate arg", async function()
        {
            const mon = sh.initActive("p1");
            expect(mon.hp.current).to.equal(mon.hp.max);

            pctx = init("p1", -1, event => event.kwArgs.from === "x");
            await ph.handle(
            {
                args: ["-damage", toIdent("p1"), toHPStatus(90, 100)],
                kwArgs: {from: "x"}
            });
            await ph.return(true);
            expect(mon.hp.current).to.equal(90);
        });

        it("Should handle predicate arg reject", async function()
        {
            const mon = sh.initActive("p1");
            expect(mon.hp.current).to.equal(mon.hp.max);

            pctx = init("p1", -1, event => event.kwArgs.from === "x");
            await ph.reject(
            {
                args: ["-damage", toIdent("p1"), toHPStatus(90, 100)],
                kwArgs: {}
            });
            await ph.return(undefined);
            expect(mon.hp.current).to.equal(mon.hp.max);
        });
    });
});
