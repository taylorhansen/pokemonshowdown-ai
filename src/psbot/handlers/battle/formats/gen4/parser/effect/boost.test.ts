import { BoostID } from "@pkmn/types";
import { expect } from "chai";
import "mocha";
import * as dex from "../../dex";
import { ParserContext } from "../Context.test";
import { createInitialContext } from "../Context.test";
import { ParserHelpers, setupBattleParser, toIdent, toNum } from
    "../helpers.test";
import * as effectBoost from "./boost";

export const test = () => describe("boost", function()
{
    const ictx = createInitialContext();
    const {sh} = ictx;

    const boost0: dex.BoostTable<0> =
        {atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0};

    describe("boost()", function()
    {
        const init = setupBattleParser(ictx.startArgs, effectBoost.boost);
        let pctx: ParserContext<Partial<dex.BoostTable<number>>> | undefined;
        const ph = new ParserHelpers(() => pctx);

        afterEach("Close ParserContext", async function()
        {
            // reset variable so it doesn't leak into other tests
            await ph.close().finally(() => pctx = undefined);
        });

        it("Should handle boost", async function()
        {
            const mon = sh.initActive("p1");
            expect(mon.volatile.boosts).to.deep.equal(boost0);

            pctx = init({side: "p1", table: {atk: 1}});
            await ph.handle(
                {args: ["-boost", toIdent("p1"), "atk", toNum(1)], kwArgs: {}});
            await ph.halt();
            await ph.return({});
            expect(mon.volatile.boosts).to.deep.equal({...boost0, atk: 1});
        });

        it("Should reject if invalid event", async function()
        {
            const mon = sh.initActive("p1");
            expect(mon.volatile.boosts).to.deep.equal(boost0);

            pctx = init({side: "p1", table: {atk: 1}});
            await ph.reject(
            {
                args: ["-unboost", toIdent("p1"), "atk", toNum(1)], kwArgs: {}
            });
            await ph.return({atk: 1});
            expect(mon.volatile.boosts).to.deep.equal(boost0);
        });

        it("Should reject if invalid side", async function()
        {
            const mon = sh.initActive("p1");
            expect(mon.volatile.boosts).to.deep.equal(boost0);

            pctx = init({side: "p1", table: {atk: 1}});
            await ph.reject(
                {args: ["-boost", toIdent("p2"), "atk", toNum(1)], kwArgs: {}});
            await ph.return({atk: 1});
            expect(mon.volatile.boosts).to.deep.equal(boost0);
        });

        it("Should reject if invalid stat", async function()
        {
            const mon = sh.initActive("p1");
            expect(mon.volatile.boosts).to.deep.equal(boost0);

            pctx = init({side: "p1", table: {atk: 1}});
            await ph.reject(
            {
                args: ["-unboost", toIdent("p1"), "spe", toNum(1)], kwArgs: {}
            });
            await ph.return({atk: 1});
            expect(mon.volatile.boosts).to.deep.equal(boost0);
        });

        it("Should reject if invalid amount", async function()
        {
            const mon = sh.initActive("p1");
            expect(mon.volatile.boosts).to.deep.equal(boost0);

            pctx = init({side: "p1", table: {atk: 1}});
            await ph.reject(
            {
                args: ["-unboost", toIdent("p1"), "atk", toNum(2)], kwArgs: {}
            });
            await ph.return({atk: 1});
            expect(mon.volatile.boosts).to.deep.equal(boost0);
        });

        it("Should handle saturated boost", async function()
        {
            const mon = sh.initActive("p1");
            mon.volatile.boosts.spa = 6;
            expect(mon.volatile.boosts).to.deep.equal({...boost0, spa: 6});

            pctx = init({side: "p1", table: {spa: 1}});
            // boost limit is 6, indicate that it can't go over
            await ph.handle(
                {args: ["-boost", toIdent("p1"), "spa", toNum(0)], kwArgs: {}});
            await ph.halt();
            await ph.return({});
            expect(mon.volatile.boosts).to.deep.equal({...boost0, spa: 6});
        });

        it("Should cap saturated boost", async function()
        {
            const mon = sh.initActive("p1")
            mon.volatile.boosts.spa = 6;
            expect(mon.volatile.boosts).to.deep.equal({...boost0, spa: 6});

            pctx = init({side: "p1", table: {spa: 1}});
            // boost limit is 6, indicate that it can't go over
            await ph.handle(
                {args: ["-boost", toIdent("p1"), "spa", toNum(1)], kwArgs: {}});
            await ph.halt();
            await ph.return({});
            expect(mon.volatile.boosts).to.deep.equal({...boost0, spa: 6});
        });

        it("Should handle multiple boost", async function()
        {
            const mon = sh.initActive("p1");
            mon.volatile.boosts.spa = 6;
            expect(mon.volatile.boosts).to.deep.equal({...boost0, spa: 6});

            pctx = init({side: "p1", table: {def: 2, spa: 1, spd: -1}});
            await ph.handle(
                {args: ["-boost", toIdent("p1"), "def", toNum(2)], kwArgs: {}});
            // boost limit is 6, indicate that it can't go over
            await ph.handle(
                {args: ["-boost", toIdent("p1"), "spa", toNum(0)], kwArgs: {}});
            await ph.handle(
            {
                args: ["-unboost", toIdent("p1"), "spd", toNum(1)], kwArgs: {}
            });
            await ph.halt();
            await ph.return({});
            expect(mon.volatile.boosts)
                .to.deep.equal({...boost0, def: 2, spa: 6, spd: -1});
        });

        it("Should handle multiple boost reject", async function()
        {
            const mon = sh.initActive("p1");
            mon.volatile.boosts.spa = 6;
            expect(mon.volatile.boosts).to.deep.equal({...boost0, spa: 6});

            pctx = init({side: "p1", table: {def: 2, spa: 1, spd: -1}});
            await ph.handle(
                {args: ["-boost", toIdent("p1"), "def", toNum(2)], kwArgs: {}});
            await ph.reject(
            {
                args: ["-unboost", toIdent("p1"), "spa", toNum(1)], kwArgs: {}
            });
            await ph.return({spa: 1, spd: -1});
            expect(mon.volatile.boosts)
                .to.deep.equal({...boost0, def: 2, spa: 6});
        });

        it("Should handle silent boost", async function()
        {
            const mon = sh.initActive("p1");
            mon.volatile.boosts.accuracy = 6;
            expect(mon.volatile.boosts).to.deep.equal({...boost0, accuracy: 6});

            pctx = init(
                {side: "p1", table: {accuracy: 1, evasion: 1}, silent: true});
            await ph.handle(
            {
                args: ["-boost", toIdent("p1"), "evasion", toNum(1)], kwArgs: {}
            });
            await ph.halt();
            await ph.return({});
            expect(mon.volatile.boosts)
                .to.deep.equal({...boost0, accuracy: 6, evasion: 1});
        });

        it("Should handle incomplete silent boost", async function()
        {
            const mon = sh.initActive("p1");
            mon.volatile.boosts.accuracy = 6;
            expect(mon.volatile.boosts).to.deep.equal({...boost0, accuracy: 6});

            pctx = init(
                {side: "p1", table: {accuracy: 1, evasion: 1}, silent: true});
            await ph.halt();
            await ph.return({evasion: 1});
            expect(mon.volatile.boosts).to.deep.equal({...boost0, accuracy: 6});
        });

        it("Should handle predicate arg", async function()
        {
            const mon = sh.initActive("p1");
            mon.volatile.boosts.spa = 6;
            expect(mon.volatile.boosts).to.deep.equal({...boost0, spa: 6});

            pctx = init(
            {
                side: "p1", table: {spa: 1, spe: 1},
                pred: e => e.kwArgs.from === "x"
            });
            await ph.handle(
            {
                args: ["-boost", toIdent("p1"), "spa", toNum(0)],
                kwArgs: {from: "x"}
            });
            await ph.handle(
            {
                args: ["-boost", toIdent("p1"), "spe", toNum(1)],
                kwArgs: {from: "x"}
            });
            await ph.halt();
            await ph.return({});
            expect(mon.volatile.boosts)
                .to.deep.equal({...boost0, spa: 6, spe: 1});
        });

        it("Should handle predicate arg reject", async function()
        {
            const mon = sh.initActive("p1");
            expect(mon.volatile.boosts).to.deep.equal(boost0);

            pctx = init(
            {
                side: "p1", table: {accuracy: 1, spe: 1},
                pred: e => e.kwArgs.from === "x"
            });
            await ph.handle(
            {
                args: ["-boost", toIdent("p1"), "accuracy", toNum(1)],
                kwArgs: {from: "x"}
            });
            await ph.reject(
                {args: ["-boost", toIdent("p1"), "spe", toNum(1)], kwArgs: {}});
            await ph.return({spe: 1});
            expect(mon.volatile.boosts).to.deep.equal({...boost0, accuracy: 1});
        });
    });

    describe("setBoost()", function()
    {
        const init = setupBattleParser(ictx.startArgs, effectBoost.setBoost);
        let pctx: ParserContext<Partial<dex.BoostTable<number>>> | undefined;
        const ph = new ParserHelpers(() => pctx);

        afterEach("Close ParserContext", async function()
        {
            // reset variable so it doesn't leak into other tests
            await ph.close().finally(() => pctx = undefined);
        });

        it("Should handle setboost", async function()
        {
            const mon = sh.initActive("p1");
            mon.volatile.boosts.atk = -5;
            expect(mon.volatile.boosts).to.deep.equal({...boost0, atk: -5});

            pctx = init({side: "p1", table: {atk: 1}});
            await ph.handle(
            {
                args: ["-setboost", toIdent("p1"), "atk", toNum(1)], kwArgs: {}
            });
            await ph.halt();
            await ph.return({});
            expect(mon.volatile.boosts).to.deep.equal({...boost0, atk: 1});
        });

        it("Should reject if invalid event", async function()
        {
            const mon = sh.initActive("p1");
            expect(mon.volatile.boosts).to.deep.equal(boost0);

            pctx = init({side: "p1", table: {atk: 1}});
            await ph.reject(
            {
                args: ["-unboost", toIdent("p1"), "atk", toNum(1)], kwArgs: {}
            });
            await ph.return({atk: 1});
            expect(mon.volatile.boosts).to.deep.equal(boost0);
        });

        it("Should reject if invalid event", async function()
        {
            const mon = sh.initActive("p1");
            expect(mon.volatile.boosts).to.deep.equal(boost0);

            pctx = init({side: "p1", table: {atk: 1}});
            await ph.reject(
            {
                args: ["-setboost", toIdent("p2"), "atk", toNum(1)], kwArgs: {}
            });
            await ph.return({atk: 1});
            expect(mon.volatile.boosts).to.deep.equal(boost0);
        });

        it("Should reject if invalid stat", async function()
        {
            const mon = sh.initActive("p1");
            expect(mon.volatile.boosts).to.deep.equal(boost0);

            pctx = init({side: "p1", table: {atk: -1}});
            await ph.reject(
            {
                args: ["-setboost", toIdent("p1"), "spe", toNum(-1)], kwArgs: {}
            });
            await ph.return({atk: -1});
            expect(mon.volatile.boosts).to.deep.equal(boost0);
        });

        it("Should reject if invalid amount", async function()
        {
            const mon = sh.initActive("p1");
            expect(mon.volatile.boosts).to.deep.equal(boost0);

            pctx = init({side: "p1", table: {atk: 1}});
            await ph.reject(
            {
                args: ["-setboost", toIdent("p1"), "atk", toNum(2)], kwArgs: {}
            });
            await ph.return({atk: 1});
            expect(mon.volatile.boosts).to.deep.equal(boost0);
        });

        it("Should handle multiple boost", async function()
        {
            const mon = sh.initActive("p1");
            mon.volatile.boosts.spa = 2;
            expect(mon.volatile.boosts).to.deep.equal({...boost0, spa: 2});

            pctx = init({side: "p1", table: {def: 2, spa: 2, spd: -1}});
            await ph.handle(
            {
                args: ["-setboost", toIdent("p1"), "def", toNum(2)], kwArgs: {}
            });
            await ph.handle(
            {
                args: ["-setboost", toIdent("p1"), "spa", toNum(2)], kwArgs: {}
            });
            await ph.handle(
            {
                args: ["-setboost", toIdent("p1"), "spd", toNum(-1)], kwArgs: {}
            });
            await ph.halt();
            await ph.return({});
            expect(mon.volatile.boosts)
                .to.deep.equal({...boost0, def: 2, spa: 2, spd: -1});
        });

        it("Should handle multiple boost reject", async function()
        {
            const mon = sh.initActive("p1");
            mon.volatile.boosts.evasion = 3;
            expect(mon.volatile.boosts).to.deep.equal({...boost0, evasion: 3});

            pctx = init({side: "p1", table: {accuracy: 2, evasion: 4}});
            await ph.handle(
            {
                args: ["-setboost", toIdent("p1"), "accuracy", toNum(2)],
                kwArgs: {}
            });
            await ph.reject(
            {
                args: ["-setboost", toIdent("p1"), "evasion", toNum(2)],
                kwArgs: {}
            });
            await ph.return({evasion: 4});
            expect(mon.volatile.boosts)
                .to.deep.equal({...boost0, accuracy: 2, evasion: 3});
        });

        it("Should handle silent boost", async function()
        {
            const mon = sh.initActive("p1");
            mon.volatile.boosts.atk = 6;
            expect(mon.volatile.boosts).to.deep.equal({...boost0, atk: 6});

            pctx = init({side: "p1", table: {atk: 6, def: 2}, silent: true});
            await ph.handle(
            {
                args: ["-setboost", toIdent("p1"), "def", toNum(2)], kwArgs: {}
            });
            await ph.halt();
            await ph.return({});
            expect(mon.volatile.boosts)
                .to.deep.equal({...boost0, atk: 6, def: 2});
        });

        it("Should handle predicate arg", async function()
        {
            const mon = sh.initActive("p1");
            expect(mon.volatile.boosts).to.deep.equal(boost0);

            pctx = init(
            {
                side: "p1", table: {spa: 1, spe: 1},
                pred: e => e.kwArgs.from === "x"
            });
            await ph.handle(
            {
                args: ["-setboost", toIdent("p1"), "spa", toNum(1)],
                kwArgs: {from: "x"}
            });
            await ph.handle(
            {
                args: ["-setboost", toIdent("p1"), "spe", toNum(1)],
                kwArgs: {from: "x"}
            });
            await ph.halt();
            await ph.return({});
            expect(mon.volatile.boosts)
                .to.deep.equal({...boost0, spa: 1, spe: 1});
        });

        it("Should handle predicate arg reject", async function()
        {
            const mon = sh.initActive("p1");
            expect(mon.volatile.boosts).to.deep.equal(boost0);

            pctx = init(
            {
                side: "p1", table: {def: 2, spd: 3},
                pred: e => e.kwArgs.from === "x"
            });
            await ph.handle(
            {
                args: ["-setboost", toIdent("p1"), "def", toNum(2)],
                kwArgs: {from: "x"}
            });
            await ph.reject(
            {
                args: ["-setboost", toIdent("p1"), "spd", toNum(3)], kwArgs: {}
            });
            await ph.return({spd: 3});
            expect(mon.volatile.boosts).to.deep.equal({...boost0, def: 2});
        });
    });

    describe("boostOne()", function()
    {
        const init = setupBattleParser(ictx.startArgs, effectBoost.boostOne);
        let pctx: ParserContext<"silent" | BoostID | undefined> | undefined;
        const ph = new ParserHelpers(() => pctx);

        afterEach("Close ParserContext", async function()
        {
            // reset variable so it doesn't leak into other tests
            await ph.close().finally(() => pctx = undefined);
        });

        it("Should handle boost", async function()
        {
            const mon = sh.initActive("p1");
            expect(mon.volatile.boosts).to.deep.equal(boost0);

            pctx = init({side: "p1", table: {atk: 1, spe: 1}});
            await ph.handle(
                {args: ["-boost", toIdent("p1"), "atk", toNum(1)], kwArgs: {}});
            await ph.return("atk");
            expect(mon.volatile.boosts).to.deep.equal({...boost0, atk: 1});
        });

        it("Should reject if invalid event", async function()
        {
            const mon = sh.initActive("p1");
            expect(mon.volatile.boosts).to.deep.equal(boost0);

            pctx = init({side: "p1", table: {def: 1, spd: -1}});
            await ph.reject(
            {
                args: ["-setboost", toIdent("p1"), "def", toNum(1)], kwArgs: {}
            });
            await ph.return(undefined);
            expect(mon.volatile.boosts).to.deep.equal(boost0);
        });

        it("Should reject if invalid side", async function()
        {
            const mon = sh.initActive("p1");
            expect(mon.volatile.boosts).to.deep.equal(boost0);

            pctx = init({side: "p1", table: {spa: -1, evasion: 2}});
            await ph.reject(
            {
                args: ["-unboost", toIdent("p2"), "spa", toNum(1)], kwArgs: {}
            });
            await ph.return(undefined);
            expect(mon.volatile.boosts).to.deep.equal(boost0);
        });

        it("Should reject if invalid stat", async function()
        {
            const mon = sh.initActive("p1");
            expect(mon.volatile.boosts).to.deep.equal(boost0);

            pctx = init({side: "p1", table: {spa: -1, evasion: 2}});
            await ph.reject(
            {
                args: ["-unboost", toIdent("p1"), "spe", toNum(1)], kwArgs: {}
            });
            await ph.return(undefined);
            expect(mon.volatile.boosts).to.deep.equal(boost0);
        });

        it("Should reject if invalid amount", async function()
        {
            const mon = sh.initActive("p1");
            expect(mon.volatile.boosts).to.deep.equal(boost0);

            pctx = init({side: "p1", table: {spd: -2, spe: 1}});
            await ph.reject(
            {
                args: ["-unboost", toIdent("p1"), "spd", toNum(1)], kwArgs: {}
            });
            await ph.return(undefined);
            expect(mon.volatile.boosts).to.deep.equal(boost0);
        });

        it("Should handle saturated boost", async function()
        {
            const mon = sh.initActive("p1");
            mon.volatile.boosts.spa = 6;
            expect(mon.volatile.boosts).to.deep.equal({...boost0, spa: 6});

            pctx = init({side: "p1", table: {spa: 1, spd: 1}});
            // boost limit is 6, indicate that it can't go over
            await ph.handle(
                {args: ["-boost", toIdent("p1"), "spa", toNum(0)], kwArgs: {}});
            await ph.return("spa");
            expect(mon.volatile.boosts).to.deep.equal({...boost0, spa: 6});
        });

        it("Should cap saturated boost", async function()
        {
            const mon = sh.initActive("p1")
            mon.volatile.boosts.spa = 6;
            expect(mon.volatile.boosts).to.deep.equal({...boost0, spa: 6});

            pctx = init({side: "p1", table: {spa: 1}});
            await ph.handle(
                {args: ["-boost", toIdent("p1"), "spa", toNum(1)], kwArgs: {}});
            await ph.return("spa");
            expect(mon.volatile.boosts).to.deep.equal({...boost0, spa: 6});
        });

        it("Should handle silent boost", async function()
        {
            const mon = sh.initActive("p1");
            mon.volatile.boosts.accuracy = 6;
            expect(mon.volatile.boosts).to.deep.equal({...boost0, accuracy: 6});

            pctx = init({side: "p1", table: {accuracy: 1}, silent: true});
            await ph.return("silent");
            expect(mon.volatile.boosts).to.deep.equal({...boost0, accuracy: 6});
        });

        it("Should handle alternative to silent boost", async function()
        {
            const mon = sh.initActive("p1");
            mon.volatile.boosts.def = -6;
            expect(mon.volatile.boosts).to.deep.equal({...boost0, def: -6});

            pctx = init({side: "p1", table: {def: -2, spa: 2}, silent: true});
            await ph.handle(
                {args: ["-boost", toIdent("p1"), "spa", toNum(2)], kwArgs: {}});
            await ph.return("spa");
            expect(mon.volatile.boosts)
                .to.deep.equal({...boost0, def: -6, spa: 2});
        });

        it("Should allow saturated silent boost", async function()
        {
            const mon = sh.initActive("p1");
            mon.volatile.boosts.accuracy = 6;
            expect(mon.volatile.boosts).to.deep.equal({...boost0, accuracy: 6});

            pctx = init(
                {side: "p1", table: {accuracy: 1, evasion: 2}, silent: true});
            await ph.handle(
            {
                args: ["-boost", toIdent("p1"), "accuracy", toNum(0)],
                kwArgs: {}
            });
            await ph.return("accuracy");
            expect(mon.volatile.boosts).to.deep.equal({...boost0, accuracy: 6});
        });

        it("Should handle predicate arg", async function()
        {
            const mon = sh.initActive("p1");
            mon.volatile.boosts.spa = 6;
            expect(mon.volatile.boosts).to.deep.equal({...boost0, spa: 6});

            pctx = init(
            {
                side: "p1", table: {spa: 1, spe: 1},
                pred: e => e.kwArgs.from === "x"
            });
            await ph.handle(
            {
                args: ["-boost", toIdent("p1"), "spa", toNum(0)],
                kwArgs: {from: "x"}
            });
            await ph.return("spa");
            expect(mon.volatile.boosts).to.deep.equal({...boost0, spa: 6});
        });

        it("Should handle predicate arg reject", async function()
        {
            const mon = sh.initActive("p1");
            expect(mon.volatile.boosts).to.deep.equal(boost0);

            pctx = init(
            {
                side: "p1", table: {accuracy: 1, spe: 1},
                pred: e => e.kwArgs.from === "x"
            });
            await ph.reject(
            {
                args: ["-boost", toIdent("p1"), "accuracy", toNum(1)],
                kwArgs: {}
            });
            await ph.return(undefined);
            expect(mon.volatile.boosts).to.deep.equal(boost0);
        });
    });
});
