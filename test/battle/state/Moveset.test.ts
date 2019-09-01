import { expect } from "chai";
import "mocha";
import { Move } from "../../../src/battle/state/Move";
import { Moveset } from "../../../src/battle/state/Moveset";

describe("Moveset", function()
{
    let moveset: Moveset;

    beforeEach("Initialize Moveset", function()
    {
        moveset = new Moveset();
    });

    describe("#link()", function()
    {
        describe("info = base", function()
        {
            it("Should copy moves", function()
            {
                const other = new Moveset();
                other.reveal("splash");
                moveset.link(other, "base");
                expect(moveset.get("splash")).to.equal(other.get("splash"))
                    .and.to.not.be.null;
                // not by-ref array copy
                expect(moveset.moves).to.not.equal(other.moves);
            });

            it("Should propagate #reveal() calls from child to parent",
            function()
            {
                const other = new Moveset();
                moveset.link(other, "base");
                moveset.reveal("splash");
                expect(moveset.get("splash")).to.equal(other.get("splash"))
                    .and.to.not.be.null;
                // not by-ref array copy
                expect(moveset.moves).to.not.equal(other.moves);
            });

            it("Should not notice base changes", function()
            {
                const other = new Moveset();
                moveset.link(other, "base");
                other.reveal("splash");
                expect(moveset.get("splash")).to.be.null;
            });

            it("Should throw if base changed after reveal", function()
            {
                const other = new Moveset();
                moveset.link(other, "base");
                other.reveal("splash");
                expect(() => moveset.reveal("tackle")).to.throw(Error,
                    "Base Moveset expected to not change");
            });
        });

        describe("info = transform", function()
        {
            it("Should deep copy moves", function()
            {
                const other = new Moveset();
                other.reveal("splash");
                moveset.link(other, "transform");

                // target moveset should have full pp
                expect(moveset.get("splash")).to.have.property("pp", 5);
                expect(other.get("splash")).to.have.property("pp", 64);
            });

            it("Should propagate #reveal() calls from target", function()
            {
                const other = new Moveset();
                moveset.link(other, "transform");
                other.reveal("splash");

                // target moveset should have full pp
                expect(moveset.get("splash")).to.have.property("pp", 5);
                expect(other.get("splash")).to.have.property("pp", 64);
            });

            it("Should propagate #reveal() calls from user", function()
            {
                const other = new Moveset();
                moveset.link(other, "transform");
                moveset.reveal("splash");

                // target moveset should have full pp
                expect(moveset.get("splash")).to.have.property("pp", 5);
                expect(other.get("splash")).to.have.property("pp", 64);
            });

            it("Should propagate #reveal() calls for multiple Movesets",
            function()
            {
                const other1 = new Moveset();
                const other2 = new Moveset();
                other1.link(moveset, "transform");
                other2.link(moveset, "transform");
                other2.reveal("splash");

                // target moveset should have full pp
                expect(moveset.get("splash")).to.have.property("pp", 64);
                expect(other1.get("splash")).to.have.property("pp", 5);
                expect(other2.get("splash")).to.have.property("pp", 5);
            });

            it("Should propagate to target's base Moveset from a linked " +
                "Moveset", function()
            {
                const base = new Moveset();
                const other = new Moveset();
                moveset.link(base, "base");
                other.link(moveset, "transform");
                other.reveal("splash");

                expect(moveset.get("splash")).to.equal(base.get("splash"))
                    .and.to.have.property("pp", 64);
                expect(other.get("splash")).to.have.property("pp", 5);
            });
        });
    });

    describe("#isolate()", function()
    {
        it("Should unlink from other Movesets", function()
        {
            const other1 = new Moveset();
            const other2 = new Moveset();
            other1.link(moveset, "transform");
            other2.link(moveset, "transform");
            moveset.isolate();
            other2.reveal("splash");
            expect(moveset.get("splash")).to.be.null;
            expect(other1.get("splash")).to.not.be.null;
            expect(other2.get("splash")).to.not.be.null;
        });

        it("Should link base", function()
        {
            const base = new Moveset();
            const other1 = new Moveset();
            const other2 = new Moveset();
            moveset.link(base, "base");
            other1.link(moveset, "transform");
            other2.link(moveset, "transform");
            moveset.isolate();
            other2.reveal("splash");
            expect(moveset.get("splash")).to.be.null;
            expect(base.get("splash")).to.not.be.null;
            expect(other1.get("splash")).to.not.be.null;
            expect(other2.get("splash")).to.not.be.null;
        });
    });

    describe("#get()/#reveal()", function()
    {
        it("Should be null if not revealed", function()
        {
            expect(moveset.get("splash")).to.be.null;
        });

        it("Should not be null if revealed", function()
        {
            moveset.reveal("splash");
            expect(moveset.get("splash")).to.not.be.null;
        });
    });

    describe("#reveal()", function()
    {
        it("Should throw if moveset is full", function()
        {
            moveset.reveal("splash");
            moveset.reveal("tackle");
            moveset.reveal("wish");
            moveset.reveal("metronome");
            expect(() => moveset.reveal("return")).to.throw(Error,
                "Moveset is already full");
        });

        it("Should not add duplicates", function()
        {
            const move = moveset.reveal("splash");
            expect(moveset.reveal("splash")).to.equal(move);
        });
    });

    describe("#getOrReveal()", function()
    {
        it("Should not be null if not revealed", function()
        {
            expect(moveset.getOrReveal("splash")).to.not.be.null;
        });

        it("Should not be null if revealed", function()
        {
            moveset.reveal("splash");
            expect(moveset.get("splash")).to.not.be.null;
        });
    });

    describe("#getOrRevealIndex()", function()
    {
        it("Should get index of already revealed move", function()
        {
            moveset.reveal("splash");
            moveset.reveal("tackle");
            expect(moveset.getOrRevealIndex("tackle")).to.equal(1);
        });

        it("Should reveal index of move", function()
        {
            moveset.reveal("splash");
            expect(moveset.getOrRevealIndex("tackle")).to.equal(1);
        });
    });

    describe("#replace()", function()
    {
        it("Should replace move", function()
        {
            moveset.reveal("splash");
            const move = new Move("tackle");
            moveset.replace("splash", move);
            expect(moveset.get("splash")).to.be.null;
            expect(moveset.get("tackle")).to.not.be.null;
        });

        it("Should throw if replacing unrevealed move", function()
        {
            const move = new Move("tackle");
            expect(() => moveset.replace("splash", move)).to.throw(Error,
                "Moveset does not contain 'splash'");
            expect(moveset.get("splash")).to.be.null;
            expect(moveset.get("tackle")).to.be.null;
        });
    });
});
