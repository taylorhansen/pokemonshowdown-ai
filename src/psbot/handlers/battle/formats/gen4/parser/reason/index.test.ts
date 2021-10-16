import * as ability from "./ability.test";
import * as chance from "./chance.test";
import * as hp from "./hp.test";
import * as item from "./item.test";
import * as move from "./move.test";

export const test = () => describe("reason", function()
{
    ability.test();
    chance.test();
    hp.test();
    item.test();
    move.test();
});
