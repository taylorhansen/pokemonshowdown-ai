import { expect } from "chai";
import "mocha";
import { PendingPercentEffect } from
    "../../../../../src/battle/driver/context/effect/PendingPercentEffect";

describe("PendingPercentEffect", function()
{
    describe("constructor", function()
    {
        it("Should init #percent", function()
        {
            expect(new PendingPercentEffect(-6.25).percent).to.equal(-6.25);
        });
    });

    describe("#matches()", function()
    {
        function test(name: string, percent: number, initial: number,
            next: number, max: number, match: boolean): void
        {
            it(name, function()
            {
                const ppe = new PendingPercentEffect(percent);
                expect(ppe.matches(initial, next, max))
                    .to.be[match ? "true" : "false"];
            });
        }

        function shouldMatch(name: string, percent: number, initial: number,
            next: number, max: number): void
        {
            test(`Should match if ${name}`, percent, initial, next, max,
                /*match*/ true);
        }

        function shouldntMatch(name: string, percent: number, initial: number,
            next: number, max: number): void
        {
            test(`Shouldn't match if ${name}`, percent, initial, next, max,
                /*match*/ false);
        }

        shouldMatch("% diff signs match", 10, 10, 20, 100);
        shouldntMatch("% diff signs don't match", -6.25, 5, 10, 100);

        shouldMatch("% diff pushes above max", 10, 95, 100, 100);
        shouldMatch("% diff pushes below 0", -10, 5, 0, 100);
    });
});
