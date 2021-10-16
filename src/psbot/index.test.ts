import "mocha";
import * as handlers from "./handlers/index.test";
import * as parser from "./parser/index.test";
import * as helpers from "./helpers.test";
import * as psbot from "./PSBot.test";

export const test = () => describe("psbot", function()
{
    handlers.test();
    parser.test();
    helpers.test();
    psbot.test();
});
