import "mocha";
import * as psbot from "./psbot/index.test";
import * as train from "./train/index.test";
import * as util from "./util/index.test";

export function test() {
    psbot.test();
    train.test();
    util.test();
}
