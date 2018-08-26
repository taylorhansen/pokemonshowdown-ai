import { expect } from "chai";
import { otherId } from "../src/parser/MessageData";
import "mocha";

describe("MessageData", function()
{
    describe("otherId", function()
    {
        it("Should return p1 if given p2", function()
        {
            expect(otherId("p2")).to.equal("p1");
        });

        it("Should return p2 if given p1", function()
        {
            expect(otherId("p1")).to.equal("p2");
        });
    });
});
