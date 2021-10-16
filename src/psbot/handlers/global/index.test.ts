import "mocha";
import * as globalHandler from "./GlobalHandler.test";

export const test = () => describe("global", function()
{
    globalHandler.test();
});
