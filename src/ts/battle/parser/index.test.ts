import "mocha";
import * as events from "./events.test";
import * as gen4 from "./gen4.test";

export const test = () =>
    describe("parser", function () {
        events.test();
        gen4.test();
    });
