import "mocha";
import * as encoders from "./encoders.test";
import * as helpers from "./helpers.test";

export const test = () =>
    describe("encoder", function () {
        encoders.test();
        helpers.test();
    });
