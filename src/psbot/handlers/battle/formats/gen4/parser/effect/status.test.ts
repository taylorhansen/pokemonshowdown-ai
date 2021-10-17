import { expect } from "chai";
import "mocha";
import * as util from "util";
import { Event } from "../../../../../../parser";
import * as dex from "../../dex";
import { ParserContext } from "../Context.test";
import { createInitialContext } from "../Context.test";
import { ParserHelpers, setupBattleParser, toEffectName, toIdent, toMessage,
    toMoveName } from "../helpers.test";
import * as effectStatus from "./status";

export const test = () => describe("status", function()
{
    const ictx = createInitialContext();
    const {sh} = ictx;

    describe("status()", function()
    {
        const init = setupBattleParser(ictx.startArgs, effectStatus.status);
        let pctx: ParserContext<true | dex.StatusType | undefined> | undefined;
        const ph = new ParserHelpers(() => pctx);

        afterEach("Close ParserContext", async function()
        {
            await ph.close();
        });

        it("Should handle status", async function()
        {
            const mon = sh.initActive("p1");
            expect(mon.volatile.confusion.isActive).to.be.false;

            pctx = init("p1", ["confusion"]);
            await ph.handle(
            {
                args: ["-start", toIdent("p1"), toEffectName("confusion")],
                kwArgs: {}
            });
            await ph.return("confusion");
            expect(mon.volatile.confusion.isActive).to.be.true;
        });

        it("Should reject invalid event", async function()
        {
            const mon = sh.initActive("p1");
            expect(mon.volatile.confusion.isActive).to.be.false;

            pctx = init("p1", ["confusion"]);
            await ph.reject(
            {
                args: ["-end", toIdent("p1"), toEffectName("confusion")],
                kwArgs: {}
            });
            await ph.return(undefined);
            expect(mon.volatile.confusion.isActive).to.be.false;
        });

        it("Should reject invalid side", async function()
        {
            const mon = sh.initActive("p1");
            expect(mon.volatile.confusion.isActive).to.be.false;

            pctx = init("p1", ["confusion"]);
            await ph.reject(
            {
                args: ["-start", toIdent("p2"), toEffectName("confusion")],
                kwArgs: {}
            });
            await ph.return(undefined);
            expect(mon.volatile.confusion.isActive).to.be.false;
        });

        it("Should reject invalid status", async function()
        {
            const mon = sh.initActive("p1");
            expect(mon.volatile.confusion.isActive).to.be.false;

            pctx = init("p1", ["confusion"]);
            await ph.reject(
            {
                args:
                    ["-start", toIdent("p1"), toEffectName("aquaring", "move")],
                kwArgs: {}
            });
            await ph.return(undefined);
            expect(mon.volatile.confusion.isActive).to.be.false;
        });

        it("Should handle silent status", async function()
        {
            const mon = sh.initActive("p1");
            mon.volatile.encoreMove("tackle");
            expect(mon.volatile.encore.ts.isActive).to.be.true;

            pctx = init("p1", ["encore"]);
            await ph.return(true);
            expect(mon.volatile.encore.ts.isActive).to.be.true;
        });

        it("Should handle alternative to silent status", async function()
        {
            const mon = sh.initActive("p1");
            mon.volatile.confusion.start();
            expect(mon.volatile.confusion.isActive).to.be.true;
            expect(mon.majorStatus.current).to.be.null;

            pctx = init("p1", ["confusion", "brn"]);
            await ph.handle(
                {args: ["-status", toIdent("p1"), "brn"], kwArgs: {}});
            await ph.return("brn");
            expect(mon.volatile.confusion.isActive).to.be.true;
            expect(mon.majorStatus.current).to.equal("brn");
        });

        it("Should still allow redundant status event", async function()
        {
            const mon = sh.initActive("p1");
            mon.volatile.confusion.start();
            expect(mon.volatile.confusion.isActive).to.be.true;
            expect(mon.majorStatus.current).to.be.null;

            pctx = init("p1", ["confusion", "brn"]);
            await ph.handle(
            {
                args: ["-start", toIdent("p1"), toEffectName("confusion")],
                kwArgs: {}
            });
            await ph.return("confusion");
            expect(mon.volatile.confusion.isActive).to.be.true;
            expect(mon.majorStatus.current).to.be.null;
        });

        it("Should handle predicate arg", async function()
        {
            const mon = sh.initActive("p1");
            expect(mon.volatile.confusion.isActive).to.be.false;
            expect(mon.majorStatus.current).to.be.null;

            pctx = init("p1", ["confusion", "brn"],
                event => event.args[0] === "-start" &&
                    (event as Event<"|-start|">).kwArgs.from === "x");
            await ph.handle(
            {
                args: ["-start", toIdent("p1"), toEffectName("confusion")],
                kwArgs: {from: "x"}
            });
            await ph.return("confusion");
            expect(mon.volatile.confusion.isActive).to.be.true;
            expect(mon.majorStatus.current).to.be.null;
        });

        it("Should handle predicate arg reject", async function()
        {
            const mon = sh.initActive("p1");
            expect(mon.volatile.bide.isActive).to.be.false;
            expect(mon.majorStatus.current).to.be.null;

            pctx = init("p1", ["bide", "brn"],
                event => event.args[0] === "-start" &&
                    (event as Event<"|-start|">).kwArgs.from === "x");
            await ph.reject(
            {
                args: ["-start", toIdent("p1"), toEffectName("Bide")],
                kwArgs: {}
            });
            await ph.return(undefined);
            expect(mon.volatile.bide.isActive).to.be.false;
            expect(mon.majorStatus.current).to.be.null;
        });

        it("Should handle sleep clause message", async function()
        {
            const mon = sh.initActive("p1");
            expect(mon.majorStatus.current).to.be.null;

            pctx = init("p1", ["slp"]);
            await ph.handle(
            {
                args: ["-message", toMessage("Sleep Clause Mod activated.")],
                kwArgs: {}
            });
            await ph.return("slp");
            expect(mon.majorStatus.current).to.be.null;
        });

        it("Should reject sleep clause message if not listed", async function()
        {
            const mon = sh.initActive("p1");
            expect(mon.volatile.flashfire).to.be.false;

            pctx = init("p1", ["aquaring"]);
            await ph.reject(
            {
                args: ["-message", toMessage("Sleep Clause Mod activated.")],
                kwArgs: {}
            });
            await ph.return(undefined);
            expect(mon.volatile.flashfire).to.be.false;
        });

        it("Should reject invalid message", async function()
        {
            const mon = sh.initActive("p1");
            expect(mon.majorStatus.current).to.be.null;

            pctx = init("p1", ["slp"]);
            await ph.reject(
                {args: ["-message", toMessage("Sleep")], kwArgs: {}});
            await ph.return(undefined);
            expect(mon.majorStatus.current).to.be.null;
        });

        it("Should handle stall effect", async function()
        {
            const mon = sh.initActive("p1");
            expect(mon.volatile.stalling).to.be.false;

            pctx = init("p1", ["endure"]);
            await ph.handle(
            {
                args: ["-singleturn", toIdent("p1"), toMoveName("endure")],
                kwArgs: {}
            });
            await ph.return("endure");
            expect(mon.volatile.stalling).to.be.true;
        });

        it("Should handle foresight effect", async function()
        {
            const mon = sh.initActive("p1");
            expect(mon.volatile.identified).to.be.null;

            pctx = init("p1", ["foresight"]);
            await ph.handle(
            {
                args:
                [
                    "-start", toIdent("p1"), toEffectName("foresight", "move")
                ],
                kwArgs: {}
            });
            await ph.return("foresight");
            expect(mon.volatile.identified).to.equal("foresight");
        });

        it("Should allow no ident for splash effect", async function()
        {
            pctx = init("p2", ["splash"]);
            await ph.handle(
            {
                args: ["-activate", "", toEffectName("splash", "move")],
                kwArgs: {}
            });
            await ph.return("splash");
        });
    });

    describe("cure()", async function()
    {
        const init = setupBattleParser(ictx.startArgs, effectStatus.cure);
        let pctx: ParserContext<"silent" | Set<dex.StatusType>> | undefined;
        const ph = new ParserHelpers(() => pctx);

        afterEach("Close ParserContext", async function()
        {
            await ph.close();
        });

        it("Should handle cure", async function()
        {
            const mon = sh.initActive("p1");
            mon.volatile.aquaring = true;
            expect(mon.volatile.aquaring).to.be.true;

            pctx = init("p1", ["aquaring"]);
            await ph.handle(
            {
                args: ["-end", toIdent("p1"), toEffectName("aquaring", "move")],
                kwArgs: {}
            });
            await ph.return(
                ret => expect(ret).to.eventually.satisfy(util.types.isSet)
                    .and.to.be.empty);
            expect(mon.volatile.aquaring).to.be.false;
        });

        it("Should reject invalid event", async function()
        {
            const mon = sh.initActive("p1");
            mon.volatile.bide.start();
            expect(mon.volatile.bide.isActive).to.be.true;

            pctx = init("p1", ["bide"]);
            await ph.reject(
            {
                args: ["-start", toIdent("p1"), toEffectName("Bide")],
                kwArgs: {}
            });
            await ph.return(
                ret => expect(ret).to.eventually.satisfy(util.types.isSet)
                    .and.to.have.keys("bide"));
            expect(mon.volatile.bide.isActive).to.be.true;
        });

        it("Should reject invalid side", async function()
        {
            const mon = sh.initActive("p1");
            mon.volatile.confusion.start();
            expect(mon.volatile.confusion.isActive).to.be.true;

            pctx = init("p1", ["confusion"]);
            await ph.reject(
            {
                args: ["-end", toIdent("p2"), toEffectName("confusion")],
                kwArgs: {}
            });
            await ph.return(
                ret => expect(ret).to.eventually.satisfy(util.types.isSet)
                    .and.to.have.keys("confusion"));
            expect(mon.volatile.confusion.isActive).to.be.true;
        });

        it("Should reject invalid cure", async function()
        {
            const mon = sh.initActive("p1");
            mon.volatile.confusion.start();
            mon.volatile.aquaring = true;
            expect(mon.volatile.confusion.isActive).to.be.true;
            expect(mon.volatile.aquaring).to.be.true;

            pctx = init("p1", ["confusion"]);
            await ph.reject(
            {
                args: ["-end", toIdent("p1"), toEffectName("aquaring", "move")],
                kwArgs: {}
            });
            await ph.return(
                ret => expect(ret).to.eventually.satisfy(util.types.isSet)
                    .and.to.have.keys("confusion"));
            expect(mon.volatile.confusion.isActive).to.be.true;
            expect(mon.volatile.aquaring).to.be.true;
        });

        it("Should handle silent status", async function()
        {
            const mon = sh.initActive("p1");
            expect(mon.volatile.encore.ts.isActive).to.be.false;

            pctx = init("p1", ["encore"]);
            await ph.return("silent");
            expect(mon.volatile.encore.ts.isActive).to.be.false;
        });

        it("Should handle alternative to silent status", async function()
        {
            const mon = sh.initActive("p1");
            mon.volatile.identified = "foresight";
            expect(mon.volatile.stalling).to.be.false;
            expect(mon.volatile.identified).to.equal("foresight");

            pctx = init("p1", ["endure", "foresight"]);
            await ph.handle(
            {
                args: ["-end", toIdent("p1"), toEffectName("Foresight")],
                kwArgs: {}
            });
            await ph.return(
                ret => expect(ret).to.eventually.satisfy(util.types.isSet)
                    .and.to.be.empty);
            expect(mon.volatile.stalling).to.be.false;
            expect(mon.volatile.identified).to.be.null;
        });

        it("Should handle predicate arg", async function()
        {
            const mon = sh.initActive("p1");
            mon.volatile.encoreMove("tackle");
            expect(mon.volatile.encore.ts.isActive).to.be.true;

            pctx = init("p1", ["encore"], event => event.kwArgs.from === "x");
            await ph.handle(
            {
                args: ["-end", toIdent("p1"), toEffectName("encore", "move")],
                kwArgs: {from: "x"}
            });
            await ph.return(
                ret => expect(ret).to.eventually.satisfy(util.types.isSet)
                    .and.to.be.empty);
            expect(mon.volatile.encore.ts.isActive).to.be.false;
        });

        it("Should handle predicate arg reject", async function()
        {
            const mon = sh.initActive("p1");
            mon.volatile.confusion.start();
            expect(mon.volatile.confusion.isActive).to.be.true;
            expect(mon.majorStatus.current).to.be.null;

            pctx = init("p1", ["confusion", "brn"],
                event => event.kwArgs.from === "x");
            await ph.reject(
            {
                args: ["-end", toIdent("p1"), toEffectName("confusion")],
                kwArgs: {}
            });
            await ph.return(
                ret => expect(ret).to.eventually.satisfy(util.types.isSet)
                    .and.to.have.keys("confusion"));
            expect(mon.volatile.confusion.isActive).to.be.true;
            expect(mon.majorStatus.current).to.be.null;
        });

        it("Should also expect nightmare cure if curing slp", async function()
        {
            const mon = sh.initActive("p1");
            mon.majorStatus.afflict("slp");
            mon.volatile.nightmare = true;
            expect(mon.majorStatus.current).to.equal("slp");
            expect(mon.volatile.nightmare).to.be.true;

            pctx = init("p1", ["slp"]);
            await ph.handle(
                {args: ["-curestatus", toIdent("p1"), "slp"], kwArgs: {}});
            await ph.handle(
            {
                args:
                    ["-end", toIdent("p1"), toEffectName("nightmare", "move")],
                kwArgs: {}
            });
            await ph.return(
                ret => expect(ret).to.eventually.satisfy(util.types.isSet)
                    .and.to.be.empty);
            expect(mon.majorStatus.current).to.be.null;
            expect(mon.volatile.nightmare).to.be.false;
        });
    });
});
