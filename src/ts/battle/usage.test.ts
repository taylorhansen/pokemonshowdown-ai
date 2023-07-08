import "mocha";
import {expect} from "chai";
import {lookup} from "./usage";

export const test = () =>
    describe("usage", function () {
        describe("lookup()", function () {
            it("Should lookup format usage stats", async function () {
                const usageStats = await lookup("gen4randombattle");
                expect(usageStats).to.not.be.empty;
            });
        });
    });
