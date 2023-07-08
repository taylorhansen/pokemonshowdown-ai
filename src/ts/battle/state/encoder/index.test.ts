import "mocha";
import * as encodeState from "./encodeState.test";
import * as encoders from "./encoders.test";
import * as helpers from "./helpers.test";

export const test = () =>
    describe("encoder", function () {
        encoders.test();
        encodeState.test();
        helpers.test();
    });
