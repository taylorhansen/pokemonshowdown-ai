import "mocha";
import * as ability from "./ability.test";
import * as boost from "./boost.test";
import * as damage from "./damage.test";
import * as item from "./item.test";
import * as status from "./status.test";
import * as weather from "./weather.test";

export const test = () => describe("effect", function()
{
    ability.test();
    boost.test();
    damage.test();
    item.test();
    status.test();
    weather.test();
});
