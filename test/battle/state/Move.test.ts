import { expect } from "chai";
import "mocha";
import { Move } from "../../../src/battle/state/Move";

describe("Move", function()
{
    let move: Move;

    beforeEach("Initialize Move", function()
    {
        move = new Move();
    });

    describe("#init()", function()
    {
        it("Should initialize name and pp", function()
        {
            move.init("splash");
            expect(move.name).to.equal("splash");
            expect(move.pp).to.equal(64);
            expect(move.maxpp).to.equal(64); // default max value
        });

        it("Should throw if invalid move name", function()
        {
            expect(() => move.init("something invalid")).to.throw(Error,
                "Invalid move name 'something invalid'");
            expect(move.name).to.be.empty;
        });

        describe("pp parameter", function()
        {
            it("Should add no pp ups if \"min\"", function()
            {
                move.init("splash", "min");
                expect(move.pp).to.equal(40);
                expect(move.maxpp).to.equal(40);
            });

            it("Should add pp ups if \"max\"", function()
            {
                move.init("splash", "max");
                expect(move.pp).to.equal(64);
                expect(move.maxpp).to.equal(64);
            });

            it("Should handle custom value", function()
            {
                move.init("splash", 5);
                expect(move.pp).to.equal(5);
                expect(move.maxpp).to.equal(5);
            });
        });
    });

    describe("#name", function()
    {
        it("Should be empty initially", function()
        {
            expect(move.name).to.be.empty;
        });
    });

    describe("#pp", function()
    {
        it("Should start at 0", function()
        {
            expect(move.pp).to.equal(0);
        });

        it("Should set to 0 if negative", function()
        {
            move.init("splash");
            move.pp = -1;
            expect(move.pp).to.equal(0);
        });

        it("Should set to max if over", function()
        {
            move.init("splash");
            move.pp = 100;
            expect(move.pp).to.equal(move.maxpp);
        });
    });
});
