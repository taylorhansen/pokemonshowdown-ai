import { expect } from "chai";
import "mocha";
import { PossibilityClass } from "../../../src/battle/state/PossibilityClass";

describe("PossibilityClass", function()
{
    const map = {a: 0, b: 1, c: 2};
    let pc: PossibilityClass<number>;

    beforeEach("Initialize PossibilityClass", function()
    {
        pc = new PossibilityClass(map);
    });

    it("Should initially include all keys", function()
    {
        expect(pc.possibleValues).to.have.keys("a", "b", "c");
    });

    describe("#remove()", function()
    {
        it("Should rule out one type if removed", function()
        {
            pc.remove("a");
            expect(pc.isSet("a")).to.be.false;
            expect(pc.possibleValues).to.have.keys("b", "c");
        });

        it("Should rule out multiple types", function()
        {
            pc.remove("a", "b");
            expect(pc.isSet("a")).to.be.false;
            expect(pc.isSet("b")).to.be.false;
            expect(pc.possibleValues).to.have.keys("c");
            expect(pc.definiteValue).to.not.be.null;
            expect(pc.definiteValue!.name).to.equal("c");
        });

        it("Should throw if unknown type is given", function()
        {
            expect(() => pc.remove("d")).to.throw(Error,
                "PossibilityClass has no value name 'd'");
        });

        it("Should throw if overnarrowed", function()
        {
            expect(() => pc.remove("a", "b", "c")).to.throw(Error,
                "All possibilities have been ruled out");
        });
    });

    describe("#narrow()", function()
    {
        it("Should narrow values", function()
        {
            pc.narrow("a");

            expect(pc.isSet("a")).to.be.true;
            expect(pc.definiteValue).to.not.be.null;
            expect(pc.definiteValue!.name).to.equal("a");
            expect(pc.possibleValues).to.have.keys("a");
        });

        it("Should throw if overnarrowed", function()
        {
            pc.narrow("c");
            expect(() => pc.narrow("a")).to.throw(Error,
                "All possibilities have been ruled out");
        });
    });

    describe("#onNarrow()", function()
    {
        it("Should set listener", function(done)
        {
            pc.onNarrow(p =>
            {
                expect(pc).to.equal(p);
                expect(p.definiteValue).to.not.be.null;
                expect(p.definiteValue!.name).to.equal("a");
                done();
            });
            pc.narrow("a");
        });
    });
});
