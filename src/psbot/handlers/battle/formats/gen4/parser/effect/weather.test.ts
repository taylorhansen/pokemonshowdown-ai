import {expect} from "chai";
import "mocha";
import {BattleState} from "../../state";
import {createInitialContext} from "../Context.test";
import {ParserHelpers} from "../ParserHelpers.test";
import {setupBattleParser, toEffectName, toWeather} from "../helpers.test";
import * as effectWeather from "./weather";

export const test = () =>
    describe("weather", function () {
        const ictx = createInitialContext();
        const {sh} = ictx;

        let state: BattleState;

        beforeEach("Extract BattleState", function () {
            state = ictx.getState();
        });

        describe("weather()", function () {
            const init = setupBattleParser(
                ictx.startArgs,
                effectWeather.weather,
            );
            let pctx: ReturnType<typeof init> | undefined;
            const ph = new ParserHelpers(() => pctx);

            afterEach("Close ParserContext", async function () {
                // Reset variable so it doesn't leak into other tests.
                await ph.close().finally(() => (pctx = undefined));
            });

            it("Should handle weather", async function () {
                expect(state.status.weather.type).to.equal("none");
                expect(state.status.weather.source).to.be.null;

                pctx = init(null, "SunnyDay");
                await ph.handle({
                    args: ["-weather", toWeather("SunnyDay")],
                    kwArgs: {},
                });
                await ph.return(true);
                expect(state.status.weather.type).to.equal("SunnyDay");
                expect(state.status.weather.source).to.be.null;
            });

            it("Should reject invalid event", async function () {
                expect(state.status.weather.type).to.equal("none");
                expect(state.status.weather.source).to.be.null;

                pctx = init(null, "SunnyDay");
                await ph.halt();
                await ph.return(undefined);
                expect(state.status.weather.type).to.equal("none");
                expect(state.status.weather.source).to.be.null;
            });

            it("Should reject upkeep event", async function () {
                expect(state.status.weather.type).to.equal("none");
                expect(state.status.weather.source).to.be.null;

                pctx = init(null, "SunnyDay");
                await ph.reject({
                    args: ["-weather", toWeather("SunnyDay")],
                    kwArgs: {upkeep: true},
                });
                await ph.return(undefined);
                expect(state.status.weather.type).to.equal("none");
                expect(state.status.weather.source).to.be.null;
            });

            it("Should reject invalid weather", async function () {
                expect(state.status.weather.type).to.equal("none");
                expect(state.status.weather.source).to.be.null;

                pctx = init(null, "Sandstorm");
                await ph.reject({
                    args: ["-weather", toWeather("Hail")],
                    kwArgs: {},
                });
                await ph.return(undefined);
                expect(state.status.weather.type).to.equal("none");
                expect(state.status.weather.source).to.be.null;
            });

            it("Should handle silent weather effect", async function () {
                state.status.weather.start(null, "Sandstorm");
                expect(state.status.weather.type).to.equal("Sandstorm");
                expect(state.status.weather.source).to.be.null;

                pctx = init(null, "Sandstorm");
                await ph.return("silent");
                expect(state.status.weather.type).to.equal("Sandstorm");
                expect(state.status.weather.source).to.be.null;
            });

            it("Should set source", async function () {
                const mon = sh.initActive("p1");
                expect(state.status.weather.type).to.equal("none");
                expect(state.status.weather.source).to.be.null;

                pctx = init(mon, "RainDance");
                await ph.handle({
                    args: ["-weather", toWeather("RainDance")],
                    kwArgs: {},
                });
                await ph.return(true);
                expect(state.status.weather.type).to.equal("RainDance");
                expect(state.status.weather.source).to.equal(mon.item);
            });

            it("Should handle predicate arg", async function () {
                expect(state.status.weather.type).to.equal("none");
                expect(state.status.weather.source).to.be.null;

                pctx = init(null, "Hail", event => event.kwArgs.from === "x");
                await ph.handle({
                    args: ["-weather", toWeather("Hail")],
                    kwArgs: {from: toEffectName("x")},
                });
                await ph.return(true);
                expect(state.status.weather.type).to.equal("Hail");
                expect(state.status.weather.source).to.be.null;
            });

            it("Should handle predicate arg reject", async function () {
                expect(state.status.weather.type).to.equal("none");
                expect(state.status.weather.source).to.be.null;

                pctx = init(null, "Hail", event => event.kwArgs.from === "x");
                await ph.reject({
                    args: ["-weather", toWeather("Hail")],
                    kwArgs: {},
                });
                await ph.return(undefined);
                expect(state.status.weather.type).to.equal("none");
                expect(state.status.weather.source).to.be.null;
            });
        });
    });
