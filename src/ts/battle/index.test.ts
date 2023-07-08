import "mocha";
import * as battleDriver from "./BattleDriver.test";
import * as agent from "./agent/index.test";
import * as helpers from "./helpers.test";
import * as parser from "./parser/index.test";
import * as state from "./state/index.test";
import * as usage from "./usage.test";

export const test = () =>
    describe("battle", function () {
        agent.test();
        parser.test();
        state.test();
        helpers.test();
        usage.test();
        battleDriver.test();
    });
