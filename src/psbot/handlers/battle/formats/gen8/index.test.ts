import { expect } from "chai";
import "mocha";
import { encoder, parser } from "./index";

export const test = () => describe("gen8", function()
{
    describe("encoder", function()
    {
        it("Should throw since not implemented", async function()
        {
            expect(() => encoder.encode([] as any, {} as any)).to.throw(Error,
                "gen8 encoder not implemented");
        });
    });

    describe("parser", function()
    {
        it("Should throw since not implemented", async function()
        {
            await expect(parser({} as any)).to.eventually.be.rejectedWith(Error,
                "gen8 parser not implemented");
        });
    });
});
