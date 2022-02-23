import "mocha";
import * as encoders from "./encoders.test";

export const test = () =>
    describe("encoder", function () {
        encoders.test();
    });
