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
        describe("base = true", function()
        {
            it("Should copy moves", function()
            {
                const other = new Moveset();
                other.reveal("splash");
                moveset.link(other, /*base*/true);
                expect(moveset.get("splash")).to.equal(other.get("splash"))
                    .and.to.not.be.null;
                // not by-ref array copy
                expect(moveset.moves).to.not.equal(other.moves);
            });

            it("Should propagate #reveal() calls from child to parent",
            function()
            {
                const other = new Moveset();
                moveset.link(other, /*base*/true);
                moveset.reveal("splash");
                expect(moveset.get("splash")).to.equal(other.get("splash"))
                    .and.to.not.be.null;
                // not by-ref array copy
                expect(moveset.moves).to.not.equal(other.moves);
            });

            it("Should not notice base changes", function()
            {
                const other = new Moveset();
                moveset.link(other, /*base*/true);
                other.reveal("splash");
                expect(moveset.get("splash")).to.be.null;
            });
        });

        describe("base = false", function()
        {
            it("Should deep copy moves", function()
            {
                const other = new Moveset();
                other.reveal("splash");
                moveset.link(other, /*base*/false);
                expect(moveset.get("splash")).to.not.be.null;
                // not by-ref copy
                expect(moveset.get("splash")).not.to.equal(other.get("splash"));
                expect(moveset.moves).to.not.equal(other.moves);
            });

            it("Should propagate #reveal() calls", function()
            {
                const other = new Moveset();
                moveset.link(other, /*base*/false);
                other.reveal("splash");
                expect(moveset.get("splash")).to.not.be.null;
                // not by-ref copy
                expect(moveset.get("splash")).not.to.equal(other.get("splash"));
                expect(moveset.moves).to.not.equal(other.moves);
            });

            it("Should propagate #reveal() calls for multiple Movesets",
            function()
            {
                const other1 = new Moveset();
                const other2 = new Moveset();
                other1.link(moveset, /*base*/false);
                other2.link(moveset, /*base*/false);
                other2.reveal("splash");
                expect(moveset.get("splash")).to.not.be.null;
                expect(other1.get("splash")).to.not.be.null;
                expect(other2.get("splash")).to.not.be.null;
            });
        });
    });

    describe("#isolate()", function()
    {
        it("Should unlink from other Movesets", function()
        {
            const other1 = new Moveset();
            const other2 = new Moveset();
            other1.link(moveset, /*base*/false);
            other2.link(moveset, /*base*/false);
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
            moveset.link(base, /*base*/true);
            other1.link(moveset, /*base*/false);
            other2.link(moveset, /*base*/false);
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
            expect(() => moveset.reveal("return")).to.throw();
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
