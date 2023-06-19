import "mocha";
import * as globalHandler from "./GlobalHandler.test";

export const test = () =>
    describe("handlers", function () {
        globalHandler.test();
    });
