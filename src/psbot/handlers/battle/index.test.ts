import "mocha";
import * as battleHandler from "./BattleHandler.test";
import * as formats from "./formats/index.test";

export const test = () =>
    describe("battle", function () {
        // TODO: ai.
        formats.test();
        // TODO: parser.
        battleHandler.test();
    });
