import * as encoder from "./encoder/index.test";

export const test = () =>
    describe("ai", function () {
        encoder.test();
        // TODO: Test helpers, networkAgent, policyAgent.
    });
