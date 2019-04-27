import { expect } from "chai";
import "mocha";
import { RewardTracker } from "../../src/ai/RewardTracker";

describe("RewardTracker", function()
{
    let reward: RewardTracker;

    beforeEach("Initialize RewardTracker", function()
    {
        reward = new RewardTracker();
    });

    describe("#apply()", function()
    {
        it("Should apply positive if us", function()
        {
            reward.apply("us", 1);
            expect(reward.value).to.equal(1);
        });

        it("Should apply negative if them", function()
        {
            reward.apply("them", 1);
            expect(reward.value).to.equal(-1);
        });

        it("Should apply multiple times", function()
        {
            reward.apply("us", -2);
            expect(reward.value).to.equal(-2);
            reward.apply("them", 1);
            expect(reward.value).to.equal(-3);
        });
    });

    describe("#reset()", function()
    {
        it("Should reset reward", function()
        {
            reward.apply("us", 1);
            reward.reset();
            expect(reward.value).to.equal(0);
        });
    });
});
