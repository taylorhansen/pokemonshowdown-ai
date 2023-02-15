import "mocha";
import * as agent from "./agent/index.test";

export const test = () =>
    describe("game", function () {
        agent.test();
    });
