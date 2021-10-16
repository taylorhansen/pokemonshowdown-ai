import "mocha";
import * as action from "./action/index.test";
import * as base from "./base.test";
import * as effect from "./effect/index.test";
import * as faint from "./faint.test";
import * as init from "./init.test";
import * as main from "./main.test";
import * as reason from "./reason/index.test";
import * as request from "./request.test";
import * as turnLoop from "./turnLoop.test";

export const test = () => describe("parser", function()
{
    // directory structure order
    action.test();
    effect.test();
    reason.test();
    base.test();
    faint.test();
    init.test();
    main.test();
    request.test();
    turnLoop.test();
});
