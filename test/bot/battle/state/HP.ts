import { expect } from "chai";
import "mocha";
import { HP } from "../../../../src/bot/battle/state/HP";

describe("HP", function()
{
    describe("set", function()
    {
        it("Should set current and max hp", function()
        {
            const hp = new HP(/*isPercent*/ false);
            hp.set(50, 100);
            expect(hp.current).to.equal(50);
            expect(hp.max).to.equal(100);
        });
    });

    describe("current", function()
    {
        it("Should be 0 if set to a negative number", function()
        {
            const hp = new HP(/*isPercent*/ false);
            hp.set(-1, 100);
            expect(hp.current).to.equal(0);
        });

        it("Should be max if set to a larger number", function()
        {
            const hp = new HP(/*isPercent*/ false);
            hp.set(1000, 100);
            expect(hp.current).to.equal(100);
        });
    });

    describe("toArray", function()
    {
        it("Should be the same size as HP.getArraySize()", function()
        {
            const hp = new HP(/*isPercent*/ false);
            expect(hp.toArray()).to.have.lengthOf(HP.getArraySize());
        });

        it("Should contain current and max", function()
        {
            const hp = new HP(/*isPercent*/ false);
            hp.set(50, 100);
            const arr = hp.toArray();
            expect(arr[0]).to.equal(50);
            expect(arr[1]).to.equal(100);
        });
    });

    describe("toString", function()
    {
        it("Should not display percent", function()
        {
            const hp = new HP(/*isPercent*/ false);
            expect(hp.toString()).to.equal("0/0");
        });

        it("Should display percent", function()
        {
            const hp = new HP(/*isPercent*/ true);
            expect(hp.toString()).to.equal("0/0%");
        });
    });
});
