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

    describe("#override()", function()
    {
        it("Should override move", function()
        {
            moveset.reveal("splash");
            const move = new Move("tackle");
            moveset.override("splash", move);
            expect(moveset.get("splash")).to.be.null;
            expect(moveset.get("tackle")).to.not.be.null;
        });

        it("Should throw if overriding unrevealed move", function()
        {
            const move = new Move("tackle");
            expect(() => moveset.override("splash", move)).to.throw(Error,
                "Moveset does not contain 'splash'");
            expect(moveset.get("splash")).to.be.null;
            expect(moveset.get("tackle")).to.be.null;
        });
    });

    describe("#clearOverrides()", function()
    {
        it("Should revert override move", function()
        {
            moveset.reveal("splash");
            const move = new Move("tackle");
            moveset.override("splash", move);
            moveset.clearOverrides();
            expect(moveset.get("tackle")).to.be.null;
            expect(moveset.get("splash")).to.not.be.null;
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
