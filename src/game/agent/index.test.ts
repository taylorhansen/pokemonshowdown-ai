import "mocha";
import * as random from "./random.test";

export const test = () =>
    describe("agent", function () {
        random.test();
    });
