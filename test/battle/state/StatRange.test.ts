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

    describe("#baseStat", function()
    {
        it("Should be null initially", function()
        {
            const stat = new StatRange();
            expect(stat.base).to.be.null;
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
