import "mocha";
import * as encoders from "./encoders/encoders.test";
import * as parser from "./parser/index.test";
import * as state from "./state/index.test";

export const test = () =>
    describe("gen4", function () {
        encoders.test();
        parser.test();
        state.test();
    });
