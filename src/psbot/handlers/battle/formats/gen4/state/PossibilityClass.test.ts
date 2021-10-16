import { expect } from "chai";
import "mocha";
import { PossibilityClass } from "./PossibilityClass";

export const test = () => describe("PossibilityClass", function()
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

    describe("#onNarrow()", function()
    {
        it("Should set listener", function()
        {
            const pc = new PossibilityClass(map);
            let called = false;
            pc.onNarrow((key, data) =>
            {
                expect(key).to.equal("a");
                expect(data).to.equal(map.a);
                expect(pc.definiteValue).to.equal(key);
                called = true;
            });
            expect(called).to.be.false;
            pc.narrow("a");
            expect(called).to.be.true;
        });

        it("Should not be called more than once", function()
        {
            const pc = new PossibilityClass(map);
            let count = 0;
            pc.onNarrow((key, data) =>
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

        it("Should immediately call if already narrowed", function()
        {
            const pc = new PossibilityClass(map);
            pc.narrow("a");
            let called = false;
            pc.onNarrow((key, data) =>
            {
                expect(key).to.equal("a");
                expect(data).to.equal(map.a);
                expect(pc.definiteValue).to.equal(key);
                called = true;
            });
            expect(called).to.be.true;
        });
    });

    describe("#onUpdate()", function()
    {
        it("Should call with kept=true when narrowed down", function()
        {
            const pc = new PossibilityClass(map);
            let kept: boolean | null = null;
            pc.onUpdate(new Set("a"), k => kept = k);
            expect(kept).to.be.null;
            pc.narrow("a");
            expect(kept).to.be.true;
        });

        it("Should call with kept=true when narrowed down to a subset",
        function()
        {
            const pc = new PossibilityClass(map);
            let kept: boolean | null = null;
            pc.onUpdate(new Set(["a", "b"]), k => kept = k);
            expect(kept).to.be.null;
            pc.remove("c");
            expect(kept).to.be.true;
        });

        it("Should call with kept=false when ruled out", function()
        {
            const pc = new PossibilityClass(map);
            let kept: boolean | null = null;
            pc.onUpdate(new Set("a"), k => kept = k);
            expect(kept).to.be.null;
            pc.remove("a");
            expect(kept).to.be.false;
        });

        it("Should call with kept=false when entire subset is ruled out",
        function()
        {
            const pc = new PossibilityClass(map);
            let kept: boolean | null = null;
            pc.onUpdate(new Set(["a", "b"]), k => kept = k);
            expect(kept).to.be.null;
            pc.remove("a");
            expect(kept).to.be.null;
            pc.remove("b");
            expect(kept).to.be.false;
        });

        it("Should allow cancelling callback", function()
        {
            const pc = new PossibilityClass(map);
            const cancel = pc.onUpdate(new Set(["a"]),
                () => { throw new Error("Didn't cancel callback"); });
            cancel();
            pc.remove("a");
        });

        it("Should call immediately with kept=false when subset over-narrowed",
        function()
        {
            const pc = new PossibilityClass(map);
            let kept: boolean | null = null;
            pc.remove("a");
            pc.onUpdate(new Set("a"), k => kept = k);
            expect(kept).to.be.false;
        });

        it("Should call immediately with kept=true when already narrowed",
        function()
        {
            const pc = new PossibilityClass(map);
            pc.narrow("a");
            let kept: boolean | null = null;
            pc.onUpdate(new Set("a"), k => kept = k);
            expect(kept).to.be.true;
        });

        it("Should allow filter predicate", function()
        {
            const pc = new PossibilityClass(map);
            let kept: boolean | null = null;
            pc.onUpdate(x => x === "a" || x === "b", k => kept = k);
            expect(kept).to.be.null;
            pc.narrow("c");
            expect(kept).to.be.false;
        });

        it("Should have same behavior if predicate and kept callback are " +
            "inverted",
        function()
        {
            const pc = new PossibilityClass(map);
            let kept1: boolean | null = null;
            pc.onUpdate(x => x === "a" || x === "b", k => kept1 = k);
            let kept2: boolean | null = null;
            pc.onUpdate(x => x !== "a" && x !== "b", k => kept2 = !k);

            expect(kept1).to.be.null;
            expect(kept2).to.be.null;
            pc.narrow("c");
            expect(kept1).to.be.false;
            expect(kept2).to.be.false;
        });

        it("Should cancel callback within callback in order", function()
        {
            const pc = new PossibilityClass(map);
            let kept1: boolean | null = null;
            pc.onUpdate(x => x === "a" || x === "b",
                k => { kept1 = k; cancel() });
            let kept2: boolean | null = null;
            const cancel = pc.onUpdate(x => x !== "a" && x !== "b",
                k => kept2 = !k);

            expect(kept1).to.be.null;
            expect(kept2).to.be.null;
            pc.narrow("c");
            expect(kept1).to.be.false;
            expect(kept2).to.be.null;
        });
    });
});
