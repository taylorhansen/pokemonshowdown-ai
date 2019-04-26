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

    describe("id", function()
    {
        it("Should be empty initially", function()
        {
            // tslint:disable-next-line:no-unused-expression
            expect(move.id).to.be.empty;
        });

        it("Should set id name", function()
        {
            move.id = "splash";
            expect(move.id).to.equal("splash");
        });

        it("Should not set invalid id name", function()
        {
            expect(() => move.id = "something invalid").to.throw();
            expect(move.id).to.equal("");
        });

        it("Should initialize pp", function()
        {
            move.id = "splash";
            expect(move.pp).to.equal(64);
        });
    });

    describe("pp", function()
    {
        it("Should start at 0", function()
        {
            expect(move.pp).to.equal(0);
        });

        it("Should set pp if id is set", function()
        {
            move.id = "splash";
            expect(move.pp).to.equal(64);
        });

        it("Should set pp to 0 if overused", function()
        {
            move.id = "splash";
            move.pp = -1;
            expect(move.pp).to.equal(0);
        });

        it("Should set to max if over", function()
        {
            move.id = "splash";
            move.pp = 100;
            expect(move.pp).to.equal(64);
        });
    });

    describe("toArray", function()
    {
        it("Should have the same length as Move.getArraySize()", function()
        {
            expect(move.toArray()).to.have.lengthOf(Move.getArraySize());
        });
    });
});
