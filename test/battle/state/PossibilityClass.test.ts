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
            expect(pc.definiteValue).to.equal("c");
        });

        it("Should throw if unknown type is given", function()
        {
            const pc = new PossibilityClass(map);
            expect(() => pc.remove("d")).to.throw(Error,
                "PossibilityClass has no value name 'd'");
        });

        it("Should reject call if it would overnarrow", function()
        {
            const pc = new PossibilityClass(map);
            expect(() => pc.remove("a", "b", "c")).to.throw(Error,
                "Tried to remove 3 possibilities when there were 3 left");
            expect(pc.possibleValues).to.have.keys("a", "b", "c");
        });
    });

    describe("#narrow()", function()
    {
        it("Should narrow values", function()
        {
            const pc = new PossibilityClass(map);
            pc.narrow("a");

            expect(pc.isSet("a")).to.be.true;
            expect(pc.definiteValue).to.equal("a");
            expect(pc.possibleValues).to.have.keys("a");
        });

        it("Should reject call if it would overnarrow", function()
        {
            const pc = new PossibilityClass(map);
            pc.narrow("c");
            expect(() => pc.narrow("a", "b")).to.throw(Error,
                "Rejected narrow with [a, b] as it would overnarrow {c}");
            expect(pc.possibleValues).to.have.keys("c");
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
                expect(p.definiteValue).to.equal("a");
                done();
            });
            pc.narrow("a");
        });

        it("Should not be called more than once", function()
        {
            const pc = new PossibilityClass(map);
            let count = 0;
            pc.onNarrow(p =>
            {
                expect(pc).to.equal(p);
                expect(p.definiteValue).to.equal("a");
                ++count;
            });
            pc.narrow("a");
            pc.narrow("a");
            pc.remove("b");
            expect(count).to.equal(1, "Expected to be called once but got " +
                `${count} times`);
        });

        it("Should immediately call if already narrowed", function(done)
        {
            const pc = new PossibilityClass(map);
            pc.narrow("a");
            pc.onNarrow(p =>
            {
                expect(pc).to.equal(p);
                expect(p.definiteValue).to.equal("a");
                done();
            });
        });
    });
});
