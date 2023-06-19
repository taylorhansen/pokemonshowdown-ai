import "mocha";
import * as psBot from "./PsBot.test";
import * as handlers from "./handlers/index.test";

export const test = () =>
    describe("psbot", function () {
        handlers.test();
        psBot.test();
    });
