import { expect } from "chai";
import "mocha";
import { BoostName, boostNames } from "../../../src/battle/dex/dex-util";
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
        volatile.boosts.atk = 1;
        volatile.confusion.start();
        volatile.embargo.start();
        volatile.ingrain = true;
        volatile.magnetRise.start();
        volatile.substitute = true;
        volatile.overrideAbility = "truant";
        volatile.bide.start();
        volatile.charge.start();
        volatile.disabledMoves[0].start();
        volatile.lastUsed = 1;
        volatile.lockedMove.start();
        volatile.mustRecharge = true;
        volatile.overrideSpecies = "Magikarp";
        volatile.overrideTypes = ["???", "water"];
        volatile.addedType = "ice";
        volatile.roost = true;
        volatile.slowStart.start();
        volatile.stall(true);
        volatile.taunt.start();
        volatile.torment = true;
        volatile.twoTurn = "bounce";
        volatile.unburden = true;
        volatile.activateTruant();
    }

    describe("#clear()", function()
    {
        it("Should clear all statuses", function()
        {
            setEverything();
            volatile.clear();

            expect(volatile.boosts.atk).to.equal(0);
            expect(volatile.confusion.isActive).to.be.false;
            expect(volatile.embargo.isActive).to.be.false;
            expect(volatile.ingrain).to.be.false;
            expect(volatile.magnetRise.isActive).to.be.false;
            expect(volatile.substitute).to.be.false;
            expect(volatile.overrideAbility).to.be.empty;
            expect(volatile.overrideAbilityId).to.be.null;
            expect(volatile.bide.isActive).to.be.false;
            expect(volatile.charge.isActive).to.be.false;
            expect(volatile.disabledMoves[0].isActive).to.be.false;
            expect(volatile.lastUsed).to.equal(-1);
            expect(volatile.lockedMove.isActive).to.be.false;
            expect(volatile.mustRecharge).to.be.false;
            expect(volatile.overrideSpecies).to.be.empty;
            expect(volatile.overrideSpeciesId).to.be.null;
            expect(volatile.overrideTypes).to.have.members(["???", "???"]);
            expect(volatile.addedType).to.equal("???");
            expect(volatile.roost).to.be.false;
            expect(volatile.slowStart.isActive).to.be.false;
            expect(volatile.stallTurns).to.equal(0);
            expect(volatile.taunt.isActive).to.be.false;
            expect(volatile.torment).to.be.false;
            expect(volatile.twoTurn).to.be.empty;
            expect(volatile.unburden).to.be.false;
            expect(volatile.willTruant).to.be.false;
        });

        it("Should clear suppressed ability", function()
        {
            volatile.suppressAbility();
            volatile.clear();
            expect(volatile.isAbilitySuppressed()).to.be.false;
            expect(volatile.overrideAbility).to.be.empty;
        });
    });

    describe("#shallowClone()", function()
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
            expect(newVolatile.confusion.isActive).to.be.true;
            expect(newVolatile.confusion.turns).to.equal(1);
            expect(newVolatile.embargo.isActive).to.be.true;
            expect(newVolatile.embargo.turns).to.equal(1);
            expect(newVolatile.ingrain).to.be.true;
            expect(newVolatile.magnetRise.isActive).to.be.true;
            expect(newVolatile.magnetRise.turns).to.equal(1);
            expect(newVolatile.substitute).to.be.true;
            // not passed
            expect(newVolatile.overrideAbility).to.be.empty;
            expect(newVolatile.overrideAbilityId).to.be.null;
            expect(newVolatile.bide.isActive).to.be.false;
            expect(newVolatile.charge.isActive).to.be.false;
            expect(newVolatile.disabledMoves[0].isActive).to.be.false;
            expect(newVolatile.lastUsed).to.equal(-1);
            expect(newVolatile.lockedMove.isActive).to.be.false;
            expect(newVolatile.mustRecharge).to.be.false;
            expect(newVolatile.overrideSpecies).to.be.empty;
            expect(newVolatile.overrideSpeciesId).to.be.null;
            expect(newVolatile.overrideTypes).to.have.members(["???", "???"]);
            expect(newVolatile.addedType).to.equal("???");
            expect(newVolatile.roost).to.be.false;
            expect(newVolatile.slowStart.isActive).to.be.false;
            expect(newVolatile.stallTurns).to.equal(0);
            expect(newVolatile.taunt.isActive).to.be.false;
            expect(newVolatile.twoTurn).to.be.empty;
            expect(newVolatile.unburden).to.be.false;
            expect(newVolatile.willTruant).to.be.false;
        });

        it("Should copy suppressed ability status", function()
        {
            volatile.suppressAbility();

            const newVolatile = volatile.shallowClone();
            volatile.clear();
            expect(newVolatile.isAbilitySuppressed()).to.be.true;
            expect(newVolatile.overrideAbility).to.equal("<suppressed>");
            expect(newVolatile.overrideAbilityId).to.be.null;
        });
    });

    describe("#boosts", function()
    {
        it("Should not be boosted initially", function()
        {
            for (const stat of Object.keys(boostNames) as BoostName[])
            {
                expect(volatile.boosts[stat]).to.equal(0);
            }
        });
    });

    describe("#embargo", function()
    {
        it("Should tick embargo on #postTurn()", function()
        {
            volatile.embargo.start();
            volatile.postTurn();
            expect(volatile.embargo.turns).to.equal(2);
        });
    });

    describe("#magnetRise", function()
    {
        it("Should tick magnet rise on #postTurn()", function()
        {
            volatile.magnetRise.start();
            volatile.postTurn();
            expect(volatile.magnetRise.turns).to.equal(2);
        });
    });

    describe("#suppressAbility()", function()
    {
        it("Should suppress ability", function()
        {
            volatile.suppressAbility();
            expect(volatile.isAbilitySuppressed()).to.be.true;
            expect(volatile.overrideAbility).to.equal("<suppressed>");
            expect(volatile.overrideAbilityId).to.be.null;
        });
    });

    describe("#overrideAbility/#overrideAbilityId", function()
    {
        it("Should set override ability", function()
        {
            volatile.overrideAbility = "swiftswim";
            expect(volatile.overrideAbility).to.equal("swiftswim");
            expect(volatile.overrideAbilityId).to.not.be.null;
        });

        it("Should throw if unknown ability", function()
        {
            expect(() => volatile.overrideAbility = "not-a real_ability")
                .to.throw();
        });
    });

    describe("#charge", function()
    {
        it("Should have silent=true", function()
        {
            expect(volatile.charge).to.have.property("silent", true);
        });

        it("Should tick on #postTurn()", function()
        {
            volatile.charge.start();
            expect(volatile.charge.turns).to.equal(1);
            volatile.postTurn();
            expect(volatile.charge.turns).to.equal(2);
        });
    });

    describe("#disabledMoves/#enableMoves()", function()
    {
        it("Should not be disabled initially", function()
        {
            for (let i = 0; i < volatile.disabledMoves.length; ++i)
            {
                expect(volatile.disabledMoves[i].isActive).to.equal(false,
                    `Move ${i + 1} was expected to not be disabled`);
            }
        });

        it("Should end disabled status", function()
        {
            // disable moves
            for (const d of volatile.disabledMoves) d.start();
            for (let i = 0; i < volatile.disabledMoves.length; ++i)
            {
                expect(volatile.disabledMoves[i].isActive).to.equal(true,
                    `Move ${i + 1} was expected to be disabled`);
            }

            // re-enable moves
            volatile.enableMoves();
            for (let i = 0; i < volatile.disabledMoves.length; ++i)
            {
                expect(volatile.disabledMoves[i].isActive).to.equal(false,
                    `Move ${i + 1} was expected to not be disabled`);
            }
        });

        it("Should tick on #postTurn()", function()
        {
            volatile.disabledMoves[0].start();
            volatile.postTurn();
            expect(volatile.disabledMoves[0].turns).to.equal(2);
        });
    });

    describe("#overrideSpecies/#overrideSpeciesId", function()
    {
        it("Should set override species", function()
        {
            volatile.overrideSpecies = "Magikarp";
            expect(volatile.overrideSpecies).to.equal("Magikarp");
            expect(volatile.overrideSpeciesId).to.not.be.null;
        });

        it("Should throw if unknown species", function()
        {
            expect(() => volatile.overrideSpecies = "not-a real_species")
                .to.throw();
        });
    });

    describe("#roost", function()
    {
        it("Should reset on #postTurn()", function()
        {
            volatile.roost = true;
            volatile.postTurn();
            expect(volatile.roost).to.be.false;
        });
    });

    describe("#stallTurns/#stall()", function()
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

        it("Should reset stallTurns on #postTurn() if no stall happened this " +
            "turn", function()
        {
            volatile.stall(true);
            volatile.postTurn();
            volatile.postTurn();
            expect(volatile.stallTurns).to.equal(0);
        });

        it("Should not reset stallTurns on #postTurn() if a stall happened " +
            "this turn", function()
        {
            volatile.stall(true);
            volatile.postTurn();
            expect(volatile.stallTurns).to.equal(1);
        });
    });

    describe("#twoTurn", function()
    {
        it("Should set two-turn move", function()
        {
            volatile.twoTurn = "bounce";
            expect(volatile.twoTurn).to.equal("bounce");
        });

        it("Should countdown on #postTurn()", function()
        {
            volatile.twoTurn = "dig";
            volatile.postTurn();
            expect(volatile.twoTurn).to.equal("dig");
            volatile.postTurn();
            expect(volatile.twoTurn).to.be.empty;
        });
    });

    describe("#willTruant/#activateTruant()", function()
    {
        it("Should set #willTruant if ability is truant", function()
        {
            volatile.overrideAbility = "truant";
            volatile.activateTruant();
            expect(volatile.willTruant).to.be.true;
        });

        it("Should fail if ability is not truant", function()
        {
            expect(() => volatile.activateTruant()).to.throw();
        });

        it("Should reset if ability changed from truant", function()
        {
            volatile.overrideAbility = "truant";
            volatile.activateTruant();
            volatile.overrideAbility = "swiftswim";
            expect(volatile.willTruant).to.be.false;
        });

        it("Should toggle on #postTurn() if ability is truant", function()
        {
            volatile.overrideAbility = "truant";
            volatile.activateTruant();
            volatile.postTurn();
            expect(volatile.willTruant).to.be.false;
            volatile.postTurn();
            expect(volatile.willTruant).to.be.true;
        });

        it("Should not toggle on #postTurn() if ability is not truant",
        function()
        {
            volatile.postTurn();
            expect(volatile.willTruant).to.be.false;
        });
    });
});
