import "mocha";
import { testGen4 } from "./gen4";
import { testHelpers } from "./helpers";

describe("BattleParsers", function()
{
    describe("Helpers", testHelpers);
    describe("Gen4", testGen4);
});
