import { expect } from "chai";
import "mocha";
import { PossibilityClass } from "../../../src/battle/state/PossibilityClass";

describe("PossibilityClass", function()
{
    const map = {a: 0, b: 1, c: 2};

    describe("ctor", function()
    {
        it("Should initially include all keys", function()
        {
            const pc = new PossibilityClass(map);
            expect(pc.possibleValues).to.have.keys("a", "b", "c");
        });

        it("Should narrow to provided keys", function()
        {
            const pc = new PossibilityClass(map, "a", "b");
            expect(pc.possibleValues).to.have.keys("a", "b");
        });
    });

    describe("#remove()", function()
    {
        it("Should rule out one type if removed", function()
        {
            const pc = new PossibilityClass(map);
            pc.remove("a");
            expect(pc.isSet("a")).to.be.false;
            expect(pc.possibleValues).to.have.keys("b", "c");
        });

        it("Should rule out multiple types", function()
        {
            const pc = new PossibilityClass(map);
            pc.remove("a", "b");
            expect(pc.isSet("a")).to.be.false;
            expect(pc.isSet("b")).to.be.false;
            expect(pc.possibleValues).to.have.keys("c");
            expect(pc.definiteValue).to.not.be.null;
            expect(pc.definiteValue!.name).to.equal("c");
        });

        it("Should throw if unknown type is given", function()
        {
            const pc = new PossibilityClass(map);
            expect(() => pc.remove("d")).to.throw(Error,
                "PossibilityClass has no value name 'd'");
        });

        it("Should throw if overnarrowed", function()
        {
            const pc = new PossibilityClass(map);
            expect(() => pc.remove("a", "b", "c")).to.throw(Error,
                "All possibilities have been ruled out");
        });
    });

    describe("#narrow()", function()
    {
        it("Should narrow values", function()
        {
            const pc = new PossibilityClass(map);
            pc.narrow("a");

            expect(pc.isSet("a")).to.be.true;
            expect(pc.definiteValue).to.not.be.null;
            expect(pc.definiteValue!.name).to.equal("a");
            expect(pc.possibleValues).to.have.keys("a");
        });

        it("Should throw if overnarrowed", function()
        {
            const pc = new PossibilityClass(map);
            pc.narrow("c");
            expect(() => pc.narrow("a")).to.throw(Error,
                "All possibilities have been ruled out");
        });
    });

    describe("#onNarrow()", function()
    {
        it("Should set listener", function(done)
        {
            const pc = new PossibilityClass(map);
            pc.onNarrow(p =>
            {
                expect(pc).to.equal(p);
                expect(p.definiteValue).to.not.be.null;
                expect(p.definiteValue!.name).to.equal("a");
                done();
            });
            pc.narrow("a");
        });

        it("Should immediately call if already narrowed", function(done)
        {
            const pc = new PossibilityClass(map);
            pc.narrow("a");
            pc.onNarrow(p =>
            {
                expect(pc).to.equal(p);
                expect(p.definiteValue).to.not.be.null;
                expect(p.definiteValue!.name).to.equal("a");
                done();
            });
        });
    });
});
