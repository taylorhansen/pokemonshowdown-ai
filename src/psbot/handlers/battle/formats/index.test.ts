import "mocha";
import * as gen4 from "./gen4/index.test";
import * as gen8 from "./gen8/index.test";

export const test = () => describe("formats", function()
{
    gen4.test();
    gen8.test();
});
