import "mocha";
import * as agent from "./agent/index.test";
import * as experience from "./experience/index.test";

export const test = () =>
    describe("game", function () {
        agent.test();
        experience.test();
    });
