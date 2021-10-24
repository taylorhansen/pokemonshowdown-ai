import "mocha";
import * as actionMove from "./move.test";
import * as actionSwitch from "./switch.test";

export const test = () =>
    describe("action", function () {
        actionMove.test();
        actionSwitch.test();
    });
