import { expect } from "chai";
import "mocha";
import { StatRange } from "../../../src/battle/state/StatRange";

describe("StatRange", function()
{
    describe("#min", function()
    {
        it("Should be null initially", function()
        {
            const stat = new StatRange();
            expect(stat.min).to.be.null;
        });
    });

    describe("#max", function()
    {
        it("Should be null initially", function()
        {
            const stat = new StatRange();
            expect(stat.max).to.be.null;
        });
    });

    describe("#base", function()
    {
        it("Should be null initially", function()
        {
            const stat = new StatRange();
            expect(stat.base).to.be.null;
        });
    });

    describe("#reset()", function()
    {
        it("Should reset everything", function()
        {
            const stat = new StatRange();
            stat.calc(100, 100);
            stat.reset();
            expect(stat.min).to.be.null;
            expect(stat.max).to.be.null;
            expect(stat.base).to.be.null;
        });
    });

    describe("#set()", function()
    {
        it("Should throw if base stat not initialized", function()
        {
            const stat = new StatRange();
            expect(() => stat.set(100)).to.throw(Error,
                "Base stat not yet initialized");
        });

        it("Should throw if stat is under min", function()
        {
            const stat = new StatRange();
            stat.calc(100, 100);
            expect(() => stat.set(100)).to.throw(Error,
                "Known stat value is out of range (184-328 vs 100)");
        });

        it("Should throw if stat is over max", function()
        {
            const stat = new StatRange();
            stat.calc(100, 100);
            expect(() => stat.set(400)).to.throw(Error,
                "Known stat value is out of range (184-328 vs 400)");
        });

        it("Should narrow stat range", function()
        {
            const stat = new StatRange();
            stat.calc(100, 100);
            stat.set(300);
            expect(stat.min).to.equal(300);
            expect(stat.max).to.equal(300);
        });
    });

    describe("#calc()", function()
    {
        it("Should initialize #base, #min, and #max", function()
        {
            const stat = new StatRange();
            stat.calc(100, 100);
            expect(stat.min).to.not.be.null;
            expect(stat.max).to.not.be.null;
            expect(stat.base).to.not.be.null;
        });

        it("Should calculate #min and #max stats normally", function()
        {
            const stat = new StatRange();
            stat.calc(100, 100);
            expect(stat.min).to.equal(184);
            expect(stat.max).to.equal(328);
        });

        it("Should calculate #min and #max stats with hp", function()
        {
            const stat = new StatRange(/*hp*/true);
            stat.calc(100, 100);
            expect(stat.min).to.equal(310);
            expect(stat.max).to.equal(404);
        });
    });
});
