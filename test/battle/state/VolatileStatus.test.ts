import { expect } from "chai";
import "mocha";
import { BoostableStatName, boostableStatNames } from
    "../../../src/battle/state/utility";
import { VolatileStatus } from "../../../src/battle/state/VolatileStatus";

describe("VolatileStatus", function()
{
    let volatile: VolatileStatus;

    beforeEach("Initialize VolatileStatus", function()
    {
        volatile = new VolatileStatus();
    });

    function setEverything()
    {
        volatile.boost("atk", 1);
        volatile.confuse(true);
        volatile.magnetRise = true;
        volatile.embargo = true;
        volatile.overrideAbility = "swiftswim";
        volatile.disableMove(0);
        volatile.lockedMove = true;
        volatile.twoTurn = "bounce";
        volatile.mustRecharge = true;
        volatile.stall(true);
        volatile.overrideTypes = ["???", "water"];
        volatile.addedType = "ice";
        volatile.roost = true;
    }

    describe("clear", function()
    {
        it("Should clear all statuses", function()
        {
            setEverything();
            volatile.clear();

            expect(volatile.boosts.atk).to.equal(0);
            expect(volatile.isConfused).to.be.false;
            expect(volatile.confuseTurns).to.equal(0);
            expect(volatile.magnetRise).to.be.false;
            expect(volatile.embargo).to.be.false;
            expect(volatile.overrideAbility).to.be.empty;
            expect(volatile.isDisabled(0)).to.be.false;
            expect(volatile.lockedMove).to.be.false;
            expect(volatile.twoTurn).to.equal("");
            expect(volatile.mustRecharge).to.be.false;
            expect(volatile.stallTurns).to.equal(0);
            expect(volatile.overrideTypes).to.have.members(["???", "???"]);
            expect(volatile.addedType).to.equal("???");
            expect(volatile.willTruant).to.be.false;
            expect(volatile.roost).to.be.false;
        });

        it("Should clear suppressed ability", function()
        {
            volatile.suppressAbility();
            volatile.clear();
            expect(volatile.isAbilitySuppressed()).to.be.false;
            expect(volatile.overrideAbility).to.be.empty;
        });
    });

    describe("shallowClone", function()
    {
        it("Should copy only passable statuses", function()
        {
            setEverything();

            const newVolatile = volatile.shallowClone();
            volatile.clear();
            expect(newVolatile).to.not.equal(volatile);
            // passed
            expect(newVolatile.boosts).to.not.equal(volatile.boosts);
            expect(newVolatile.boosts.atk).to.equal(1);
            expect(newVolatile.isConfused).to.be.true;
            expect(newVolatile.confuseTurns).to.equal(1);
            expect(newVolatile.magnetRise).to.be.true;
            expect(newVolatile.embargo).to.be.true;
            // not passed
            expect(newVolatile.isDisabled(0)).to.be.false;
            expect(newVolatile.lockedMove).to.be.false;
            expect(volatile.twoTurn).to.equal("");
            expect(volatile.mustRecharge).to.be.false;
            expect(volatile.stallTurns).to.equal(0);
            expect(volatile.overrideAbility).to.be.empty;
            expect(volatile.overrideTypes).to.have.members(["???", "???"]);
            expect(volatile.addedType).to.equal("???");
            expect(volatile.willTruant).to.be.false;
        });

        it("Should copy suppressed ability status", function()
        {
            volatile.suppressAbility();

            const newVolatile = volatile.shallowClone();
            volatile.clear();
            expect(newVolatile.isAbilitySuppressed()).to.be.true;
            expect(newVolatile.overrideAbility).to.equal("<suppressed>");
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

    describe("magnet rise", function()
    {
        it("Should set magnetRise", function()
        {
            volatile.magnetRise = true;
            expect(volatile.magnetRise).to.be.true;
            volatile.magnetRise = false;
            expect(volatile.magnetRise).to.be.false;
        });
    });

    describe("embargo", function()
    {
        it("Should set embargo", function()
        {
            volatile.embargo = true;
            expect(volatile.embargo).to.be.true;
            volatile.embargo = false;
            expect(volatile.embargo).to.be.false;
        });
    });

    describe("overrideAbility", function()
    {
        it("Should set override ability", function()
        {
            volatile.overrideAbility = "swiftswim";
            expect(volatile.overrideAbility).to.equal("swiftswim");
        });

        it("Should throw if unknown ability", function()
        {
            expect(() => volatile.overrideAbility = "not-a real_ability")
                .to.throw();
        });

        describe("suppressAbility", function()
        {
            it("Should suppress ability", function()
            {
                volatile.suppressAbility();
                expect(volatile.isAbilitySuppressed()).to.be.true;
                expect(volatile.overrideAbility).to.equal("<suppressed>");
            });
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
