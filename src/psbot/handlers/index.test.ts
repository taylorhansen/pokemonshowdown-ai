import "mocha";
import * as battle from "./battle/index.test";
import * as global from "./global/index.test";

export const test = () =>
    describe("handlers", function () {
        battle.test();
        global.test();
    });
