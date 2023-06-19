import "mocha";
import * as eventParser from "./EventParser.test";

export const test = () =>
    describe("protocol", function () {
        eventParser.test();
    });
