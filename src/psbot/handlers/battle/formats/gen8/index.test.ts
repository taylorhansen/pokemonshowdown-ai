import { expect } from "chai";
import "mocha";
import { BattleParserContext } from "../../parser";
import { BattleState } from "./state";
import { encoder, parser } from "./index";

export const test = () => describe("gen8", function()
{
    describe("encoder", function()
    {
        it("Should throw since not implemented", function()
        {
            expect(() => encoder.encode(new Float32Array(), new BattleState()))
                .to.throw(Error, "gen8 encoder not implemented");
        });
    });

    describe("parser", function()
    {
        it("Should throw since not implemented", async function()
        {
            await expect(parser({} as BattleParserContext<"gen8">))
                .to.eventually.be.rejectedWith(Error,
                    "gen8 parser not implemented");
        });
    });
});
