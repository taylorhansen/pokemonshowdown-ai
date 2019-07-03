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

    describe("#happiness", function()
    {
        it("Should be null initially", function()
        {
            expect(moveset).to.have.property("happiness", null);
        });

        it("Should calc from return power", function()
        {
            moveset.reveal("return102");
            expect(moveset.get("return")).to.not.be.null;
            expect(moveset).to.have.property("happiness", 255);
        });

        it("Should calc from frustration power", function()
        {
            moveset.reveal("frustration102");
            expect(moveset.get("frustration")).to.not.be.null;
            expect(moveset).to.have.property("happiness", 0);
        });

        it("Should cap at 255 max", function()
        {
            moveset.happiness = 500;
            expect(moveset).to.have.property("happiness", 255);
        });

        it("Should cap at 0 min", function()
        {
            moveset.happiness = -500;
            expect(moveset).to.have.property("happiness", 0);
        });

        it("Should be resettable", function()
        {
            // TODO: is this necessary?
            moveset.happiness = 255;
            expect(moveset).to.have.property("happiness", 255);
            moveset.happiness = null;
            expect(moveset).to.have.property("happiness", null);
        });
    });
});
