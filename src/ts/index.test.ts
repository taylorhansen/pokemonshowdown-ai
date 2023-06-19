import "mocha";
import * as battle from "./battle/index.test";
import * as protocol from "./protocol/index.test";
import * as psbot from "./psbot/index.test";

export function test() {
    battle.test();
    protocol.test();
    psbot.test();
}
