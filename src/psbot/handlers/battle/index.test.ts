import "mocha";
import * as formats from "./formats/index.test";
import * as battleHandler from "./BattleHandler.test";

export const test = () => describe("battle", function()
{
    // TODO: ai
    formats.test();
    // TODO: parser
    battleHandler.test();
});
