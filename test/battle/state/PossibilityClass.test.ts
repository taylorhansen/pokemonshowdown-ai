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

    describe("#narrow()", function()
    {
        it("Should narrow keys via spread", function()
        {
            const pc = new PossibilityClass(map);
            pc.narrow("a");

            expect(pc.isSet("a")).to.be.true;
            expect(pc.definiteValue).to.equal("a");
            expect(pc.possibleValues).to.have.keys("a");
        });

        it("Should narrow keys via array", function()
        {
            const pc = new PossibilityClass(map);
            pc.narrow(["a", "c"]);

            expect(pc.isSet("a")).to.be.true;
            expect(pc.isSet("c")).to.be.true;
            expect(pc.definiteValue).to.be.null;
            expect(pc.possibleValues).to.have.keys("a", "c");
        });

        it("Should narrow keys via Set", function()
        {
            const pc = new PossibilityClass(map);
            pc.narrow(new Set(["a", "c"]));

            expect(pc.isSet("a")).to.be.true;
            expect(pc.isSet("c")).to.be.true;
            expect(pc.definiteValue).to.be.null;
            expect(pc.possibleValues).to.have.keys("a", "c");
        });

        it("Should narrow keys via predicate", function()
        {
            const pc = new PossibilityClass(map);
            pc.narrow(n => n === "b");

            expect(pc.isSet("b")).to.be.true;
            expect(pc.definiteValue).to.equal("b");
            expect(pc.possibleValues).to.have.keys("b");
        });

        it("Should throw if overnarrowed", function()
        {
            const pc = new PossibilityClass(map);
            pc.narrow("c");
            expect(() => pc.narrow("a", "b")).to.throw(Error,
                "All possibilities have been ruled out (should never happen)");
            expect(pc.possibleValues).to.be.empty;
        });
    });

    describe("#remove()", function()
    {
        it("Should rule out types via spread", function()
        {
            const pc = new PossibilityClass(map);
            pc.remove("a", "b");
            expect(pc.isSet("a")).to.be.false;
            expect(pc.isSet("b")).to.be.false;
            expect(pc.possibleValues).to.have.keys("c");
            expect(pc.definiteValue).to.equal("c");
        });

        it("Should rule out types via array", function()
        {
            const pc = new PossibilityClass(map);
            pc.remove(["a", "b"]);
            expect(pc.isSet("a")).to.be.false;
            expect(pc.isSet("b")).to.be.false;
            expect(pc.possibleValues).to.have.keys("c");
            expect(pc.definiteValue).to.equal("c");
        });

        it("Should rule out types via Set", function()
        {
            const pc = new PossibilityClass(map);
            pc.remove(new Set(["a", "c"]));
            expect(pc.isSet("a")).to.be.false;
            expect(pc.isSet("c")).to.be.false;
            expect(pc.possibleValues).to.have.keys("b");
            expect(pc.definiteValue).to.equal("b");
        });

        it("Should rule out types via predicate", function()
        {
            const pc = new PossibilityClass(map);
            pc.remove(n => n === "c");
            expect(pc.isSet("c")).to.be.false;
            expect(pc.possibleValues).to.have.keys("a", "b");
        });

        it("Should throw if overnarrowed", function()
        {
            const pc = new PossibilityClass(map);
            expect(() => pc.remove("a", "b", "c")).to.throw(Error,
                "All possibilities have been ruled out (should never happen)");
            expect(pc.possibleValues).to.be.empty;
        });
    });

    describe("#then()", function()
    {
        it("Should set listener", function(done)
        {
            const pc = new PossibilityClass(map);
            pc.then((key, data) =>
            {
                expect(key).to.equal("a");
                expect(data).to.equal(map.a);
                expect(pc.definiteValue).to.equal(key);
                done();
            });
            pc.narrow("a");
        });

        it("Should not be called more than once", function()
        {
            const pc = new PossibilityClass(map);
            let count = 0;
            pc.then((key, data) =>
            {
                expect(key).to.equal("a");
                expect(data).to.equal(map.a);
                expect(pc.definiteValue).to.equal(key);
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
            pc.then((key, data) =>
            {
                expect(key).to.equal("a");
                expect(data).to.equal(map.a);
                expect(pc.definiteValue).to.equal(key);
                done();
            });
        });
    });
});
