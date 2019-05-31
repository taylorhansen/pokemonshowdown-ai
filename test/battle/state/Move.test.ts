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

    describe("#name", function()
    {
        it("Should be empty initially", function()
        {
            expect(move.name).to.be.empty;
        });

        it("Should set id name", function()
        {
            move.name = "splash";
            expect(move.name).to.equal("splash");
        });

        it("Should not set invalid id name", function()
        {
            expect(() => move.name = "something invalid").to.throw();
            expect(move.name).to.be.empty;
        });
    });

    describe("#pp", function()
    {
        it("Should start at 0", function()
        {
            expect(move.pp).to.equal(0);
        });

        it("Should initialize pp when id is set", function()
        {
            move.name = "splash";
            expect(move.pp).to.equal(64);
            expect(move.maxpp).to.equal(64);
        });

        it("Should set pp to 0 if overused", function()
        {
            move.name = "splash";
            move.pp = -1;
            expect(move.pp).to.equal(0);
        });

        it("Should set to max if over", function()
        {
            move.name = "splash";
            move.pp = 100;
            expect(move.pp).to.equal(move.maxpp);
        });
    });
});
