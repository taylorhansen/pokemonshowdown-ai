import "mocha";
import * as psbot from "./psbot/index.test";
import * as train from "./train/index.test";

export function test()
{
    psbot.test();
    train.test();
}
