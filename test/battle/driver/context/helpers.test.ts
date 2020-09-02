import { expect } from "chai";
import "mocha";
import { deepClone } from "../../../../src/battle/driver/context/helpers";

describe("DriverContext helpers", function()
{
    describe("deepClone", function()
    {
        it("Should deep clone object", function()
        {
            const obj = {a: ["b", 1, {c: true}], d: {e: "f"}};
            const copy = deepClone(obj);
            expect(copy).to.deep.equal(obj);
            expect(copy).to.not.equal(obj);
        });

        it("Should handle null", function()
        {
            expect(deepClone(null)).to.be.null;
        });

        it("Should handle undefined", function()
        {
            expect(deepClone(undefined)).to.be.undefined;
        });
    });
});
