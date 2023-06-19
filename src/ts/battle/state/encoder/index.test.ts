import "mocha";
import * as encodeState from "./encodeState.test";
import * as encoders from "./encoders.test";

export const test = () =>
    describe("encoder", function () {
        encoders.test();
        encodeState.test();
    });
