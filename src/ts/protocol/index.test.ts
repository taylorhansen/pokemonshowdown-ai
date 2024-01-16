import "mocha";
import * as parser from "./parser.test";

export const test = () =>
    describe("protocol", function () {
        parser.test();
    });
