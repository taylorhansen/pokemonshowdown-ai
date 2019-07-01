import { expect } from "chai";
import "mocha";
import { pluralTurns } from "../../../src/battle/state/utility";

describe("utility", function()
{
    describe("pluralTurns()", function()
    {
        it("Should use singular", function()
        {
            expect(pluralTurns(1)).to.equal("1 turn");
        });

        it("Should use singular denom", function()
        {
            expect(pluralTurns(2, 1)).to.equal("2/1 turn");
        });

        it("Should use plural", function()
        {
            expect(pluralTurns(5)).to.equal("5 turns");
        });

        it("Should use plural denom", function()
        {
            expect(pluralTurns(1, 5)).to.equal("1/5 turns");
        });

        it("Should use status prefix", function()
        {
            expect(pluralTurns("tox", 1)).to.equal("tox for 1 turn");
        });

        it("Should use status prefix with denom", function()
        {
            expect(pluralTurns("slp", 3, 4)).to.equal("slp for 3/4 turns");
        });
    });
});
