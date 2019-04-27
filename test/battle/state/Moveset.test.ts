import { expect } from "chai";
import "mocha";
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

    describe("#hpType", function()
    {
        it("Should reveal hidden power move and type", function()
        {
            moveset.reveal("hiddenpowerfire10");
            expect(moveset.get("hiddenpower")).to.not.be.null;
            expect(moveset.hpType.isSet("fire")).to.be.true;
            expect(moveset.hpType.definiteValue).to.not.be.null;
            expect(moveset.hpType.definiteValue!.name).to.equal("fire");
        });
    });

    describe("#toArray()", function()
    {
        it("Should be the same length as #getArraySize()", function()
        {
            expect(moveset.toArray()).to.have.lengthOf(Moveset.getArraySize());
        });
    });
});
