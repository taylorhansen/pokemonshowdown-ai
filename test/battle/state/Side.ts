import { expect } from "chai";
import "mocha";
import { otherSide } from "../../../src/battle/state/Side";

describe("Side", function()
{
    describe("otherSide", function()
    {
        it("Should return \"us\" if given \"them\"", function()
        {
            expect(otherSide("them")).to.equal("us");
        });

        it("Should return \"them\" if given \"us\"", function()
        {
            expect(otherSide("us")).to.equal("them");
        });
    });
});
