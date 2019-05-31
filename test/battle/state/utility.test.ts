import { expect } from "chai";
import "mocha";
import { pluralTurns } from "../../../src/battle/state/utility";

describe("utility", function()
{
    describe("pluralTurns()", function()
    {
        it("Should use singular", function()
        {
            expect(pluralTurns("tox", 1)).to.equal("tox for 1 turn");
        });

        it("Should use singular with limit", function()
        {
            expect(pluralTurns("tox", 1, 1)).to.equal("tox for 1/1 turn");
        });

        it("Should use plural", function()
        {
            expect(pluralTurns("tox", 5)).to.equal("tox for 5 turns");
        });

        it("Should use plural with limit", function()
        {
            expect(pluralTurns("reflect", 2, 5))
                .to.equal("reflect for 2/5 turns");
        });
    });
});
