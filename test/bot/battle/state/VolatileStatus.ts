import { expect } from "chai";
import "mocha";
import { VolatileStatus } from
    "../../../../src/bot/battle/state/VolatileStatus";
import { BoostableStatName, boostableStatNames } from
    "../../../../src/bot/helpers";

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
            volatile.disableMove(0);
            volatile.lockedMove = true;
            volatile.twoTurn = "Bounce";
            volatile.mustRecharge = true;
            volatile.stall(true);
            volatile.overrideAbility = 1;
            volatile.overrideAbilityName = "something"; // not actually valid

            volatile.clear();
            // tslint:disable:no-unused-expression
            expect(volatile.boosts.atk).to.equal(0);
            expect(volatile.isConfused).to.be.false;
            expect(volatile.confuseTurns).to.equal(0);
            expect(volatile.isDisabled(0)).to.be.false;
            expect(volatile.lockedMove).to.be.false;
            expect(volatile.twoTurn).to.equal("");
            expect(volatile.mustRecharge).to.be.false;
            expect(volatile.stallTurns).to.equal(0);
            expect(volatile.overrideAbility).to.equal(0);
            expect(volatile.overrideAbilityName).to.equal("");
            expect(volatile.truant).to.be.false;
            // tslint:enable:no-unused-expression
        });
    });

    describe("shallowClone", function()
    {
        it("Should copy only passable statuses", function()
        {
            volatile.boost("atk", 1);
            volatile.confuse(true);
            volatile.disableMove(0);
            volatile.lockedMove = true;
            volatile.twoTurn = "Bounce";
            volatile.mustRecharge = true;
            volatile.stall(true);

            const newVolatile = volatile.shallowClone();
            volatile.clear();
            // tslint:disable:no-unused-expression
            expect(newVolatile).to.not.equal(volatile);
            // passed
            expect(newVolatile.boosts).to.not.equal(volatile.boosts);
            expect(newVolatile.boosts.atk).to.equal(1);
            expect(newVolatile.isConfused).to.be.true;
            expect(newVolatile.confuseTurns).to.equal(1);
            // not passed
            expect(newVolatile.isDisabled(0)).to.be.false;
            expect(newVolatile.lockedMove).to.be.false;
            expect(volatile.twoTurn).to.equal("");
            expect(volatile.mustRecharge).to.be.false;
            expect(volatile.stallTurns).to.equal(0);
            // tslint:enable:no-unused-expression
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
            volatile.disableMove(0);
            expect(volatile.isDisabled(0)).to.equal(true);
            volatile.enableMoves();
            expect(volatile.isDisabled(0)).to.equal(false);
        });
    });

    describe("confuse", function()
    {
        it("Should increment/reset confuseTurns", function()
        {
            expect(volatile.isConfused).to.equal(false);
            expect(volatile.confuseTurns).to.equal(0);
            volatile.confuse(true);
            expect(volatile.isConfused).to.equal(true);
            expect(volatile.confuseTurns).to.equal(1);
            volatile.confuse(true);
            expect(volatile.isConfused).to.equal(true);
            expect(volatile.confuseTurns).to.equal(2);
            volatile.confuse(false);
            expect(volatile.isConfused).to.equal(false);
            expect(volatile.confuseTurns).to.equal(0);
        });
    });

    describe("stall", function()
    {
        it("Should increment/reset stallTurns", function()
        {
            expect(volatile.stallTurns).to.equal(0);
            volatile.stall(true);
            expect(volatile.stallTurns).to.equal(1);
            volatile.stall(true);
            expect(volatile.stallTurns).to.equal(2);
            volatile.stall(false);
            expect(volatile.stallTurns).to.equal(0);
        });
    });

    describe("toArray", function()
    {
        it("Should have the same size as VolatileStatus.getArraySize()",
        function()
        {
            expect(volatile.toArray()).to.have.lengthOf(
                VolatileStatus.getArraySize());
        });
    });
});
