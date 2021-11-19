import {expect} from "chai";
import "mocha";
import * as dex from "../../dex";
import {createInitialContext} from "../Context.test";
import {ParserHelpers} from "../ParserHelpers.test";
import {setupBattleParser, toEffectName, toIdent, toNum} from "../helpers.test";
import * as effectBoost from "./boost";

export const test = () =>
    describe("boost", function () {
        const ictx = createInitialContext();
        const {sh} = ictx;

        const boost0: dex.BoostTable<0> = {
            atk: 0,
            def: 0,
            spa: 0,
            spd: 0,
            spe: 0,
            accuracy: 0,
            evasion: 0,
        };

        describe("boost()", function () {
            const init = setupBattleParser(ictx.startArgs, effectBoost.boost);
            let pctx: ReturnType<typeof init> | undefined;
            const ph = new ParserHelpers(() => pctx);

            afterEach("Close ParserContext", async function () {
                // Reset variable so it doesn't leak into other tests.
                await ph.close().finally(() => (pctx = undefined));
            });

            it("Should handle boost", async function () {
                const mon = sh.initActive("p1");
                expect(mon.volatile.boosts).to.deep.equal(boost0);

                const table = new Map([["atk", 1]] as const);
                pctx = init({side: "p1", table});
                await ph.handle({
                    args: ["-boost", toIdent("p1"), "atk", toNum(1)],
                    kwArgs: {},
                });
                await ph.halt();
                await ph.return(table);
                expect([...table]).to.be.empty;
                expect(mon.volatile.boosts).to.deep.equal({...boost0, atk: 1});
            });

            it("Should reject if invalid event", async function () {
                const mon = sh.initActive("p1");
                expect(mon.volatile.boosts).to.deep.equal(boost0);

                const table = new Map([["atk", 1]] as const);
                pctx = init({side: "p1", table});
                await ph.reject({
                    args: ["-unboost", toIdent("p1"), "atk", toNum(1)],
                    kwArgs: {},
                });
                await ph.return(table);
                expect([...table]).to.have.deep.members([["atk", 1]]);
                expect(mon.volatile.boosts).to.deep.equal(boost0);
            });

            it("Should reject if invalid side", async function () {
                const mon = sh.initActive("p1");
                expect(mon.volatile.boosts).to.deep.equal(boost0);

                const table = new Map([["atk", 1]] as const);
                pctx = init({side: "p1", table});
                await ph.reject({
                    args: ["-boost", toIdent("p2"), "atk", toNum(1)],
                    kwArgs: {},
                });
                await ph.return(table);
                expect([...table]).to.have.deep.members([["atk", 1]]);
                expect(mon.volatile.boosts).to.deep.equal(boost0);
            });

            it("Should reject if invalid stat", async function () {
                const mon = sh.initActive("p1");
                expect(mon.volatile.boosts).to.deep.equal(boost0);

                const table = new Map([["atk", 1]] as const);
                pctx = init({side: "p1", table});
                await ph.reject({
                    args: ["-unboost", toIdent("p1"), "spe", toNum(1)],
                    kwArgs: {},
                });
                await ph.return(table);
                expect([...table]).to.have.deep.members([["atk", 1]]);
                expect(mon.volatile.boosts).to.deep.equal(boost0);
            });

            it("Should reject if invalid amount", async function () {
                const mon = sh.initActive("p1");
                expect(mon.volatile.boosts).to.deep.equal(boost0);

                const table = new Map([["atk", 1]] as const);
                pctx = init({side: "p1", table});
                await ph.reject({
                    args: ["-unboost", toIdent("p1"), "atk", toNum(2)],
                    kwArgs: {},
                });
                await ph.return(table);
                expect([...table]).to.have.deep.members([["atk", 1]]);
                expect(mon.volatile.boosts).to.deep.equal(boost0);
            });

            it("Should handle saturated boost", async function () {
                const mon = sh.initActive("p1");
                mon.volatile.boosts.spa = 6;
                expect(mon.volatile.boosts).to.deep.equal({...boost0, spa: 6});

                const table = new Map([["spa", 1]] as const);
                pctx = init({side: "p1", table});
                // Boost limit is 6, indicate that it can't go over.
                await ph.handle({
                    args: ["-boost", toIdent("p1"), "spa", toNum(0)],
                    kwArgs: {},
                });
                await ph.halt();
                await ph.return(table);
                expect([...table]).to.be.empty;
                expect(mon.volatile.boosts).to.deep.equal({...boost0, spa: 6});
            });

            it("Should cap saturated boost", async function () {
                const mon = sh.initActive("p1");
                mon.volatile.boosts.spa = 6;
                expect(mon.volatile.boosts).to.deep.equal({...boost0, spa: 6});

                const table = new Map([["spa", 1]] as const);
                pctx = init({side: "p1", table});
                // Boost limit is 6, indicate that it can't go over.
                await ph.handle({
                    args: ["-boost", toIdent("p1"), "spa", toNum(1)],
                    kwArgs: {},
                });
                await ph.halt();
                await ph.return(table);
                expect([...table]).to.be.empty;
                expect(mon.volatile.boosts).to.deep.equal({...boost0, spa: 6});
            });

            it("Should handle multiple boost", async function () {
                const mon = sh.initActive("p1");
                mon.volatile.boosts.spa = 6;
                expect(mon.volatile.boosts).to.deep.equal({...boost0, spa: 6});

                const table = new Map([
                    ["def", 2],
                    ["spa", 1],
                    ["spd", -1],
                ] as const);
                pctx = init({side: "p1", table});
                await ph.handle({
                    args: ["-boost", toIdent("p1"), "def", toNum(2)],
                    kwArgs: {},
                });
                // Boost limit is 6, indicate that it can't go over.
                await ph.handle({
                    args: ["-boost", toIdent("p1"), "spa", toNum(0)],
                    kwArgs: {},
                });
                await ph.handle({
                    args: ["-unboost", toIdent("p1"), "spd", toNum(1)],
                    kwArgs: {},
                });
                await ph.halt();
                await ph.return(table);
                expect([...table]).to.be.empty;
                expect(mon.volatile.boosts).to.deep.equal({
                    ...boost0,
                    def: 2,
                    spa: 6,
                    spd: -1,
                });
            });

            it("Should handle multiple boost reject", async function () {
                const mon = sh.initActive("p1");
                mon.volatile.boosts.spa = 6;
                expect(mon.volatile.boosts).to.deep.equal({...boost0, spa: 6});

                const table = new Map([
                    ["def", 2],
                    ["spa", 1],
                    ["spd", -1],
                ] as const);
                pctx = init({side: "p1", table});
                await ph.handle({
                    args: ["-boost", toIdent("p1"), "def", toNum(2)],
                    kwArgs: {},
                });
                await ph.reject({
                    args: ["-unboost", toIdent("p1"), "spa", toNum(1)],
                    kwArgs: {},
                });
                await ph.return(table);
                expect([...table]).to.have.deep.members([
                    ["spa", 1],
                    ["spd", -1],
                ]);
                expect(mon.volatile.boosts).to.deep.equal({
                    ...boost0,
                    def: 2,
                    spa: 6,
                });
            });

            it("Should handle silent boost", async function () {
                const mon = sh.initActive("p1");
                mon.volatile.boosts.accuracy = 6;
                expect(mon.volatile.boosts).to.deep.equal({
                    ...boost0,
                    accuracy: 6,
                });

                const table = new Map([
                    ["accuracy", 1],
                    ["evasion", 1],
                ] as const);
                pctx = init({side: "p1", table, silent: true});
                await ph.handle({
                    args: ["-boost", toIdent("p1"), "evasion", toNum(1)],
                    kwArgs: {},
                });
                await ph.halt();
                await ph.return(table);
                expect([...table]).to.be.empty;
                expect(mon.volatile.boosts).to.deep.equal({
                    ...boost0,
                    accuracy: 6,
                    evasion: 1,
                });
            });

            it("Should handle incomplete silent boost", async function () {
                const mon = sh.initActive("p1");
                mon.volatile.boosts.accuracy = 6;
                expect(mon.volatile.boosts).to.deep.equal({
                    ...boost0,
                    accuracy: 6,
                });

                const table = new Map([
                    ["accuracy", 1],
                    ["evasion", 1],
                ] as const);
                pctx = init({side: "p1", table, silent: true});
                await ph.halt();
                await ph.return(table);
                expect([...table]).to.have.deep.members([["evasion", 1]]);
                expect(mon.volatile.boosts).to.deep.equal({
                    ...boost0,
                    accuracy: 6,
                });
            });

            it("Should handle predicate arg", async function () {
                const mon = sh.initActive("p1");
                mon.volatile.boosts.spa = 6;
                expect(mon.volatile.boosts).to.deep.equal({...boost0, spa: 6});

                const table = new Map([
                    ["spa", 1],
                    ["spe", 1],
                ] as const);
                pctx = init({
                    side: "p1",
                    table,
                    pred: e => e.kwArgs.from === "x",
                });
                await ph.handle({
                    args: ["-boost", toIdent("p1"), "spa", toNum(0)],
                    kwArgs: {from: toEffectName("x")},
                });
                await ph.handle({
                    args: ["-boost", toIdent("p1"), "spe", toNum(1)],
                    kwArgs: {from: toEffectName("x")},
                });
                await ph.halt();
                await ph.return(table);
                expect([...table]).to.be.empty;
                expect(mon.volatile.boosts).to.deep.equal({
                    ...boost0,
                    spa: 6,
                    spe: 1,
                });
            });

            it("Should handle predicate arg reject", async function () {
                const mon = sh.initActive("p1");
                expect(mon.volatile.boosts).to.deep.equal(boost0);

                const table = new Map([
                    ["accuracy", 1],
                    ["spe", 1],
                ] as const);
                pctx = init({
                    side: "p1",
                    table,
                    pred: e => e.kwArgs.from === "x",
                });
                await ph.handle({
                    args: ["-boost", toIdent("p1"), "accuracy", toNum(1)],
                    kwArgs: {from: toEffectName("x")},
                });
                await ph.reject({
                    args: ["-boost", toIdent("p1"), "spe", toNum(1)],
                    kwArgs: {},
                });
                await ph.return(table);
                expect([...table]).to.have.deep.members([["spe", 1]]);
                expect(mon.volatile.boosts).to.deep.equal({
                    ...boost0,
                    accuracy: 1,
                });
            });
        });

        describe("setBoost()", function () {
            const init = setupBattleParser(
                ictx.startArgs,
                effectBoost.setBoost,
            );
            let pctx: ReturnType<typeof init> | undefined;
            const ph = new ParserHelpers(() => pctx);

            afterEach("Close ParserContext", async function () {
                // Reset variable so it doesn't leak into other tests.
                await ph.close().finally(() => (pctx = undefined));
            });

            it("Should handle setboost", async function () {
                const mon = sh.initActive("p1");
                mon.volatile.boosts.atk = -5;
                expect(mon.volatile.boosts).to.deep.equal({...boost0, atk: -5});

                const table = new Map([["atk", 1]] as const);
                pctx = init({side: "p1", table});
                await ph.handle({
                    args: ["-setboost", toIdent("p1"), "atk", toNum(1)],
                    kwArgs: {},
                });
                await ph.halt();
                await ph.return(table);
                expect([...table]).to.be.empty;
                expect(mon.volatile.boosts).to.deep.equal({...boost0, atk: 1});
            });

            it("Should reject if invalid event", async function () {
                const mon = sh.initActive("p1");
                expect(mon.volatile.boosts).to.deep.equal(boost0);

                const table = new Map([["atk", 1]] as const);
                pctx = init({side: "p1", table});
                await ph.reject({
                    args: ["-unboost", toIdent("p1"), "atk", toNum(1)],
                    kwArgs: {},
                });
                await ph.return(table);
                expect([...table]).to.have.deep.members([["atk", 1]]);
                expect(mon.volatile.boosts).to.deep.equal(boost0);
            });

            it("Should reject if invalid side", async function () {
                const mon = sh.initActive("p1");
                expect(mon.volatile.boosts).to.deep.equal(boost0);

                const table = new Map([["atk", 1]] as const);
                pctx = init({side: "p1", table});
                await ph.reject({
                    args: ["-setboost", toIdent("p2"), "atk", toNum(1)],
                    kwArgs: {},
                });
                await ph.return(table);
                expect([...table]).to.have.deep.members([["atk", 1]]);
                expect(mon.volatile.boosts).to.deep.equal(boost0);
            });

            it("Should reject if invalid stat", async function () {
                const mon = sh.initActive("p1");
                expect(mon.volatile.boosts).to.deep.equal(boost0);

                const table = new Map([["atk", -1]] as const);
                pctx = init({side: "p1", table});
                await ph.reject({
                    args: ["-setboost", toIdent("p1"), "spe", toNum(-1)],
                    kwArgs: {},
                });
                await ph.return(table);
                expect([...table]).to.have.deep.members([["atk", -1]]);
                expect(mon.volatile.boosts).to.deep.equal(boost0);
            });

            it("Should reject if invalid amount", async function () {
                const mon = sh.initActive("p1");
                expect(mon.volatile.boosts).to.deep.equal(boost0);

                const table = new Map([["atk", 1]] as const);
                pctx = init({side: "p1", table});
                await ph.reject({
                    args: ["-setboost", toIdent("p1"), "atk", toNum(2)],
                    kwArgs: {},
                });
                await ph.return(table);
                expect([...table]).to.have.deep.members([["atk", 1]]);
                expect(mon.volatile.boosts).to.deep.equal(boost0);
            });

            it("Should handle multiple boost", async function () {
                const mon = sh.initActive("p1");
                mon.volatile.boosts.spa = 2;
                expect(mon.volatile.boosts).to.deep.equal({...boost0, spa: 2});

                const table = new Map([
                    ["def", 2],
                    ["spa", 2],
                    ["spd", -1],
                ] as const);
                pctx = init({side: "p1", table});
                await ph.handle({
                    args: ["-setboost", toIdent("p1"), "def", toNum(2)],
                    kwArgs: {},
                });
                await ph.handle({
                    args: ["-setboost", toIdent("p1"), "spa", toNum(2)],
                    kwArgs: {},
                });
                await ph.handle({
                    args: ["-setboost", toIdent("p1"), "spd", toNum(-1)],
                    kwArgs: {},
                });
                await ph.halt();
                await ph.return(table);
                expect([...table]).to.be.empty;
                expect(mon.volatile.boosts).to.deep.equal({
                    ...boost0,
                    def: 2,
                    spa: 2,
                    spd: -1,
                });
            });

            it("Should handle multiple boost reject", async function () {
                const mon = sh.initActive("p1");
                mon.volatile.boosts.evasion = 3;
                expect(mon.volatile.boosts).to.deep.equal({
                    ...boost0,
                    evasion: 3,
                });

                const table = new Map([
                    ["accuracy", 2],
                    ["evasion", 4],
                ] as const);
                pctx = init({side: "p1", table});
                await ph.handle({
                    args: ["-setboost", toIdent("p1"), "accuracy", toNum(2)],
                    kwArgs: {},
                });
                await ph.reject({
                    args: ["-setboost", toIdent("p1"), "evasion", toNum(2)],
                    kwArgs: {},
                });
                await ph.return(table);
                expect([...table]).to.have.deep.members([["evasion", 4]]);
                expect(mon.volatile.boosts).to.deep.equal({
                    ...boost0,
                    accuracy: 2,
                    evasion: 3,
                });
            });

            it("Should handle silent boost", async function () {
                const mon = sh.initActive("p1");
                mon.volatile.boosts.atk = 6;
                expect(mon.volatile.boosts).to.deep.equal({...boost0, atk: 6});

                const table = new Map([
                    ["atk", 6],
                    ["def", 2],
                ] as const);
                pctx = init({side: "p1", table, silent: true});
                await ph.handle({
                    args: ["-setboost", toIdent("p1"), "def", toNum(2)],
                    kwArgs: {},
                });
                await ph.halt();
                await ph.return(table);
                expect([...table]).to.be.empty;
                expect(mon.volatile.boosts).to.deep.equal({
                    ...boost0,
                    atk: 6,
                    def: 2,
                });
            });

            it("Should handle predicate arg", async function () {
                const mon = sh.initActive("p1");
                expect(mon.volatile.boosts).to.deep.equal(boost0);

                const table = new Map([
                    ["spa", 1],
                    ["spe", 1],
                ] as const);
                pctx = init({
                    side: "p1",
                    table,
                    pred: e => e.kwArgs.from === "x",
                });
                await ph.handle({
                    args: ["-setboost", toIdent("p1"), "spa", toNum(1)],
                    kwArgs: {from: toEffectName("x")},
                });
                await ph.handle({
                    args: ["-setboost", toIdent("p1"), "spe", toNum(1)],
                    kwArgs: {from: toEffectName("x")},
                });
                await ph.halt();
                await ph.return(table);
                expect([...table]).to.be.empty;
                expect(mon.volatile.boosts).to.deep.equal({
                    ...boost0,
                    spa: 1,
                    spe: 1,
                });
            });

            it("Should handle predicate arg reject", async function () {
                const mon = sh.initActive("p1");
                expect(mon.volatile.boosts).to.deep.equal(boost0);

                const table = new Map([
                    ["def", 2],
                    ["spd", 3],
                ] as const);
                pctx = init({
                    side: "p1",
                    table,
                    pred: e => e.kwArgs.from === "x",
                });
                await ph.handle({
                    args: ["-setboost", toIdent("p1"), "def", toNum(2)],
                    kwArgs: {from: toEffectName("x")},
                });
                await ph.reject({
                    args: ["-setboost", toIdent("p1"), "spd", toNum(3)],
                    kwArgs: {},
                });
                await ph.return(table);
                expect([...table]).to.have.deep.members([["spd", 3]]);
                expect(mon.volatile.boosts).to.deep.equal({...boost0, def: 2});
            });
        });

        describe("boostOne()", function () {
            const init = setupBattleParser(
                ictx.startArgs,
                effectBoost.boostOne,
            );
            let pctx: ReturnType<typeof init> | undefined;
            const ph = new ParserHelpers(() => pctx);

            afterEach("Close ParserContext", async function () {
                // Reset variable so it doesn't leak into other tests.
                await ph.close().finally(() => (pctx = undefined));
            });

            it("Should handle boost", async function () {
                const mon = sh.initActive("p1");
                expect(mon.volatile.boosts).to.deep.equal(boost0);

                pctx = init({
                    side: "p1",
                    table: new Map([
                        ["atk", 1],
                        ["spe", 1],
                    ] as const),
                });
                await ph.handle({
                    args: ["-boost", toIdent("p1"), "atk", toNum(1)],
                    kwArgs: {},
                });
                await ph.return("atk");
                expect(mon.volatile.boosts).to.deep.equal({...boost0, atk: 1});
            });

            it("Should reject if invalid event", async function () {
                const mon = sh.initActive("p1");
                expect(mon.volatile.boosts).to.deep.equal(boost0);

                pctx = init({
                    side: "p1",
                    table: new Map([
                        ["def", 1],
                        ["spd", -1],
                    ] as const),
                });
                await ph.reject({
                    args: ["-setboost", toIdent("p1"), "def", toNum(1)],
                    kwArgs: {},
                });
                await ph.return(undefined);
                expect(mon.volatile.boosts).to.deep.equal(boost0);
            });

            it("Should reject if invalid side", async function () {
                const mon = sh.initActive("p1");
                expect(mon.volatile.boosts).to.deep.equal(boost0);

                pctx = init({
                    side: "p1",
                    table: new Map([
                        ["spa", -1],
                        ["evasion", 2],
                    ] as const),
                });
                await ph.reject({
                    args: ["-unboost", toIdent("p2"), "spa", toNum(1)],
                    kwArgs: {},
                });
                await ph.return(undefined);
                expect(mon.volatile.boosts).to.deep.equal(boost0);
            });

            it("Should reject if invalid stat", async function () {
                const mon = sh.initActive("p1");
                expect(mon.volatile.boosts).to.deep.equal(boost0);

                pctx = init({
                    side: "p1",
                    table: new Map([
                        ["spa", -1],
                        ["evasion", 2],
                    ] as const),
                });
                await ph.reject({
                    args: ["-unboost", toIdent("p1"), "spe", toNum(1)],
                    kwArgs: {},
                });
                await ph.return(undefined);
                expect(mon.volatile.boosts).to.deep.equal(boost0);
            });

            it("Should reject if invalid amount", async function () {
                const mon = sh.initActive("p1");
                expect(mon.volatile.boosts).to.deep.equal(boost0);

                pctx = init({
                    side: "p1",
                    table: new Map([
                        ["spd", -2],
                        ["spe", 1],
                    ] as const),
                });
                await ph.reject({
                    args: ["-unboost", toIdent("p1"), "spd", toNum(1)],
                    kwArgs: {},
                });
                await ph.return(undefined);
                expect(mon.volatile.boosts).to.deep.equal(boost0);
            });

            it("Should handle saturated boost", async function () {
                const mon = sh.initActive("p1");
                mon.volatile.boosts.spa = 6;
                expect(mon.volatile.boosts).to.deep.equal({...boost0, spa: 6});

                pctx = init({
                    side: "p1",
                    table: new Map([
                        ["spa", 1],
                        ["spd", 1],
                    ] as const),
                });
                // Boost limit is 6, indicate that it can't go over.
                await ph.handle({
                    args: ["-boost", toIdent("p1"), "spa", toNum(0)],
                    kwArgs: {},
                });
                await ph.return("spa");
                expect(mon.volatile.boosts).to.deep.equal({...boost0, spa: 6});
            });

            it("Should cap saturated boost", async function () {
                const mon = sh.initActive("p1");
                mon.volatile.boosts.spa = 6;
                expect(mon.volatile.boosts).to.deep.equal({...boost0, spa: 6});

                pctx = init({
                    side: "p1",
                    table: new Map([["spa", 1]] as const),
                });
                await ph.handle({
                    args: ["-boost", toIdent("p1"), "spa", toNum(1)],
                    kwArgs: {},
                });
                await ph.return("spa");
                expect(mon.volatile.boosts).to.deep.equal({...boost0, spa: 6});
            });

            it("Should handle silent boost", async function () {
                const mon = sh.initActive("p1");
                mon.volatile.boosts.accuracy = 6;
                expect(mon.volatile.boosts).to.deep.equal({
                    ...boost0,
                    accuracy: 6,
                });

                pctx = init({
                    side: "p1",
                    table: new Map([["accuracy", 1]] as const),
                    silent: true,
                });
                await ph.return("silent");
                expect(mon.volatile.boosts).to.deep.equal({
                    ...boost0,
                    accuracy: 6,
                });
            });

            it("Should handle alternative to silent boost", async function () {
                const mon = sh.initActive("p1");
                mon.volatile.boosts.def = -6;
                expect(mon.volatile.boosts).to.deep.equal({...boost0, def: -6});

                pctx = init({
                    side: "p1",
                    table: new Map([
                        ["def", -2],
                        ["spa", 2],
                    ] as const),
                    silent: true,
                });
                await ph.handle({
                    args: ["-boost", toIdent("p1"), "spa", toNum(2)],
                    kwArgs: {},
                });
                await ph.return("spa");
                expect(mon.volatile.boosts).to.deep.equal({
                    ...boost0,
                    def: -6,
                    spa: 2,
                });
            });

            it("Should allow saturated silent boost", async function () {
                const mon = sh.initActive("p1");
                mon.volatile.boosts.accuracy = 6;
                expect(mon.volatile.boosts).to.deep.equal({
                    ...boost0,
                    accuracy: 6,
                });

                pctx = init({
                    side: "p1",
                    table: new Map([
                        ["accuracy", 1],
                        ["evasion", 2],
                    ] as const),
                    silent: true,
                });
                await ph.handle({
                    args: ["-boost", toIdent("p1"), "accuracy", toNum(0)],
                    kwArgs: {},
                });
                await ph.return("accuracy");
                expect(mon.volatile.boosts).to.deep.equal({
                    ...boost0,
                    accuracy: 6,
                });
            });

            it("Should handle predicate arg", async function () {
                const mon = sh.initActive("p1");
                mon.volatile.boosts.spa = 6;
                expect(mon.volatile.boosts).to.deep.equal({...boost0, spa: 6});

                pctx = init({
                    side: "p1",
                    table: new Map([
                        ["spa", 1],
                        ["spe", 1],
                    ] as const),
                    pred: e => e.kwArgs.from === "x",
                });
                await ph.handle({
                    args: ["-boost", toIdent("p1"), "spa", toNum(0)],
                    kwArgs: {from: toEffectName("x")},
                });
                await ph.return("spa");
                expect(mon.volatile.boosts).to.deep.equal({...boost0, spa: 6});
            });

            it("Should handle predicate arg reject", async function () {
                const mon = sh.initActive("p1");
                expect(mon.volatile.boosts).to.deep.equal(boost0);

                pctx = init({
                    side: "p1",
                    table: new Map([
                        ["accuracy", 1],
                        ["spe", 1],
                    ] as const),
                    pred: e => e.kwArgs.from === "x",
                });
                await ph.reject({
                    args: ["-boost", toIdent("p1"), "accuracy", toNum(1)],
                    kwArgs: {},
                });
                await ph.return(undefined);
                expect(mon.volatile.boosts).to.deep.equal(boost0);
            });
        });

        describe("boostBlockable()", function () {
            const init = setupBattleParser(
                ictx.startArgs,
                effectBoost.boostBlockable,
            );
            let pctx: ReturnType<typeof init> | undefined;
            const ph = new ParserHelpers(() => pctx);

            afterEach("Close ParserContext", async function () {
                // Reset variable so it doesn't leak into other tests.
                await ph.close().finally(() => (pctx = undefined));
            });

            it("Should handle boosts normally", async function () {
                const mon = sh.initActive("p1");
                expect(mon.volatile.boosts).to.deep.equal(boost0);
                sh.initActive("p2");

                const table = new Map([
                    ["atk", -1],
                    ["spe", -1],
                ] as const);
                pctx = init({side: "p1", source: "p2", table});
                await ph.handle({
                    args: ["-unboost", toIdent("p1"), "atk", toNum(1)],
                    kwArgs: {},
                });
                await ph.handle({
                    args: ["-unboost", toIdent("p1"), "spe", toNum(1)],
                    kwArgs: {},
                });
                await ph.halt();
                await ph.return(table);
                expect([...table]).to.be.empty;
                expect(mon.volatile.boosts).to.deep.equal({
                    ...boost0,
                    atk: -1,
                    spe: -1,
                });
            });

            it("Should handle blocked boost", async function () {
                const mon = sh.initActive("p1");
                mon.setAbility("keeneye");
                expect(mon.volatile.boosts).to.deep.equal(boost0);
                sh.initActive("p2");

                const table = new Map([
                    ["atk", -1],
                    ["accuracy", -1],
                ] as const);
                pctx = init({side: "p1", source: "p2", table});
                await ph.handle({
                    args: ["-unboost", toIdent("p1"), "atk", toNum(1)],
                    kwArgs: {},
                });
                await ph.handle({
                    args: ["-fail", toIdent("p1"), "unboost", "accuracy"],
                    kwArgs: {
                        from: toEffectName("keeneye", "ability"),
                        of: toIdent("p1"),
                    },
                });
                await ph.halt();
                await ph.return(table);
                expect([...table]).to.be.empty;
                expect(mon.volatile.boosts).to.deep.equal({
                    ...boost0,
                    atk: -1,
                });
            });

            it("Should handle blocked boost in any order", async function () {
                const mon = sh.initActive("p1");
                mon.setAbility("keeneye");
                expect(mon.volatile.boosts).to.deep.equal(boost0);
                sh.initActive("p2");

                const table = new Map([
                    ["atk", -1],
                    ["accuracy", -1],
                ] as const);
                pctx = init({side: "p1", source: "p2", table});
                await ph.handle({
                    args: ["-fail", toIdent("p1"), "unboost", "accuracy"],
                    kwArgs: {
                        from: toEffectName("keeneye", "ability"),
                        of: toIdent("p1"),
                    },
                });
                await ph.handle({
                    args: ["-unboost", toIdent("p1"), "atk", toNum(1)],
                    kwArgs: {},
                });
                await ph.halt();
                await ph.return(table);
                expect([...table]).to.be.empty;
                expect(mon.volatile.boosts).to.deep.equal({
                    ...boost0,
                    atk: -1,
                });
            });

            it("Should infer no blocking ability if it did not activate", async function () {
                const mon = sh.initActive("p1");
                mon.setAbility("keeneye", "illuminate");
                expect(mon.volatile.boosts).to.deep.equal(boost0);
                sh.initActive("p2");

                const table = new Map([
                    ["atk", -1],
                    ["accuracy", -1],
                ] as const);
                pctx = init({side: "p1", source: "p2", table});
                await ph.handle({
                    args: ["-unboost", toIdent("p1"), "atk", toNum(1)],
                    kwArgs: {},
                });
                await ph.handle({
                    args: ["-unboost", toIdent("p1"), "accuracy", toNum(1)],
                    kwArgs: {},
                });
                await ph.halt();
                await ph.return(table);
                expect([...table]).to.be.empty;
                expect(mon.volatile.boosts).to.deep.equal({
                    ...boost0,
                    atk: -1,
                    accuracy: -1,
                });
                expect(mon.ability).to.equal("illuminate");
            });
        });
    });
