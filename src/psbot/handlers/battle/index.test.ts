import "mocha";
import * as battleHandler from "./BattleHandler.test";
import * as ai from "./ai/index.test";
import * as helpers from "./helpers.test";
import * as parser from "./parser/index.test";
import * as state from "./state/index.test";

export const test = () =>
    describe("battle", function () {
        ai.test();
        parser.test();
        state.test();
        battleHandler.test();
        helpers.test();
    });
