import "mocha";
import * as format from "./format.test";

export const test = () =>
    describe("util", function () {
        format.test();
    });
