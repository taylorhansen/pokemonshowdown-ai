import { expect } from "chai";
import "mocha";

describe("example suite", () =>
{
    it("should pass", () =>
    {
        const x = "hi";
        expect(x).to.equal("hi");
    });

    it("should fail", () =>
    {
        const x = "no";
        expect(x).to.equal("hi");
    });
});
