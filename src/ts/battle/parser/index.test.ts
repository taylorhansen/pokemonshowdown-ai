import "mocha";
import * as events from "./events.test";
import * as main from "./main.test";

export const test = () =>
    describe("parser", function () {
        events.test();
        main.test();
    });
