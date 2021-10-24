import "mocha";
import * as messageParser from "./MessageParser.test";

export const test = () =>
    describe("parser", function () {
        messageParser.test();
    });
