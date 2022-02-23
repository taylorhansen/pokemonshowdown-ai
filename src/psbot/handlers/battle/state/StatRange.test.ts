import {expect} from "chai";
import "mocha";
import {StatRange} from "./StatRange";

export const test = () =>
    describe("StatRange", function () {
        describe("constructor", function () {
            it("Should calculate #min and #max stats normally", function () {
                const stat = new StatRange(100, 100);
                expect(stat.min).to.equal(184);
                expect(stat.max).to.equal(328);
            });

            it("Should calculate #min and #max stats with hp", function () {
                const stat = new StatRange(100, 100, true /*hp*/);
                expect(stat.min).to.equal(310);
                expect(stat.max).to.equal(404);
            });

            it("Should be 1 if base hp is 1", function () {
                const stat = new StatRange(1, 100, true /*hp*/);
                expect(stat.min).to.equal(1);
                expect(stat.max).to.equal(1);
            });
        });

        describe("#set()", function () {
            it("Should throw if stat is under min", function () {
                const stat = new StatRange(100, 100);
                expect(() => stat.set(100)).to.throw(
                    Error,
                    "Known stat value is out of range (184-328 vs 100)",
                );
            });

            it("Should throw if stat is over max", function () {
                const stat = new StatRange(100, 100);
                expect(() => stat.set(400)).to.throw(
                    Error,
                    "Known stat value is out of range (184-328 vs 400)",
                );
            });

            it("Should narrow stat range", function () {
                const stat = new StatRange(100, 100);
                stat.set(300);
                expect(stat.min).to.equal(300);
                expect(stat.max).to.equal(300);
            });
        });
    });
