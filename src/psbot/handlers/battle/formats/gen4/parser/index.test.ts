import "mocha";
import * as events from "./events.test";
import * as main from "./main.test";

export const test = () =>
    describe("parser", function () {
        // Directory structure order.
        events.test();
        main.test();
    });
