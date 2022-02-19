import "mocha";
import * as psBot from "./PsBot.test";
import * as handlers from "./handlers/index.test";
import * as parser from "./parser/index.test";

export const test = () =>
    describe("psbot", function () {
        handlers.test();
        parser.test();
        psBot.test();
    });
