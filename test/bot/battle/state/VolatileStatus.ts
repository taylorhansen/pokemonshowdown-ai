import { expect } from "chai";
import "mocha";
import { BoostableStatName, boostableStatNames, VolatileStatus } from
    "./../../../../src/bot/battle/state/VolatileStatus";

describe("VolatileStatus", function()
{
    let volatile: VolatileStatus;

    beforeEach("Initialize VolatileStatus", function()
    {
        volatile = new VolatileStatus();
    });

    describe("clear", function()
    {
        it("Should clear all statuses", function()
        {
            volatile.boost("atk", 1);
            volatile.confuse(true);
            volatile.disableMove(0, true);
            volatile.lockedMove = true;
            volatile.clear();
            expect(volatile.boosts.atk).to.equal(0);
            expect(volatile.isConfused).to.equal(false);
            expect(volatile.confuseTurns).to.equal(0);
            expect(volatile.isDisabled(0)).to.equal(false);
            expect(volatile.lockedMove).to.equal(false);
        });
    });

    describe("shallowClone", function()
    {
        it("Should copy only passable statuses", function()
        {
            volatile.boost("atk", 1);
            volatile.confuse(true);
            volatile.disableMove(0, true);
            volatile.lockedMove = true;

            const newVolatile = volatile.shallowClone();
            volatile.clear();

            expect(newVolatile).to.not.equal(volatile);
            expect(newVolatile.boosts).to.not.equal(volatile.boosts);
            expect(newVolatile.boosts.atk).to.equal(1);
            expect(newVolatile.isDisabled(0)).to.equal(true);
            expect(newVolatile.isConfused).to.equal(false);
            expect(newVolatile.confuseTurns).to.equal(0);
            expect(newVolatile.lockedMove).to.equal(false);
        });
    });

    describe("boost", function()
    {
        it("Should not be boosted initially", function()
        {
            for (const stat in boostableStatNames)
            {
                if (!boostableStatNames.hasOwnProperty(stat)) continue;

                expect(volatile.boosts[stat as BoostableStatName]).to.equal(0);
            }
        });

        for (const stat in boostableStatNames)
        {
            if (!boostableStatNames.hasOwnProperty(stat)) continue;

            it(`Should boost ${stat}`, function()
            {
                volatile.boost(stat as BoostableStatName, 1);
                expect(volatile.boosts[stat as BoostableStatName]).to.equal(1);
            });
        }
    });

    describe("disableMove", function()
    {
        it("Should not be disabled initially", function()
        {
            expect(volatile.isDisabled(0)).to.equal(false);
        });

        it("Should disable/enable move", function()
        {
            volatile.disableMove(0, true);
            expect(volatile.isDisabled(0)).to.equal(true);
            volatile.disableMove(0, false);
            expect(volatile.isDisabled(0)).to.equal(false);
        });
    });

    describe("confuse", function()
    {
        it("Should not be disabled initially", function()
        {
            expect(volatile.isConfused).to.equal(false);
            expect(volatile.confuseTurns).to.equal(0);
        });

        it("Should be confused if set", function()
        {
            volatile.confuse(true);
            expect(volatile.isConfused).to.equal(true);
            expect(volatile.confuseTurns).to.equal(1);
        });

        it("Should increment confuseTurns", function()
        {
            volatile.confuse(true);
            volatile.confuse(true);
            expect(volatile.isConfused).to.equal(true);
            expect(volatile.confuseTurns).to.equal(2);
        });

        it("Should reset confuseTurns", function()
        {
            volatile.confuse(true);
            volatile.confuse(true);
            volatile.confuse(false);
            expect(volatile.isConfused).to.equal(false);
            expect(volatile.confuseTurns).to.equal(0);
        });
    });

    describe("toArray", function()
    {
        it("Should have the same size as VolatileStatus.getArraySize()",
        function()
        {
            volatile.disableMove(0, true);
            volatile.lockedMove = true;
            expect(volatile.toArray()).to.have.lengthOf(
                VolatileStatus.getArraySize());
        });
    });
});
