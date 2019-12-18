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
        volatile.aquaRing = true;
        volatile.boosts.atk = 1;
        volatile.confusion.start();
        volatile.curse = true;
        volatile.embargo.start();
        volatile.focusEnergy = true;
        volatile.gastroAcid = true;
        volatile.ingrain = true;
        volatile.leechSeed = true;
        volatile.magnetRise.start();
        volatile.nightmare = true;
        volatile.perish = 3;
        volatile.powerTrick = true;
        volatile.substitute = true;
        volatile.trap(new VolatileStatus());
        (new VolatileStatus()).trap(volatile);

        volatile.attract = true;
        volatile.bide.start();
        volatile.charge.start();
        volatile.defenseCurl = true;
        volatile.destinyBond = true;
        volatile.disabledMoves[0].start();
        volatile.encore.start();
        volatile.grudge = true;
        volatile.healBlock.start();
        volatile.identified = "foresight";
        volatile.lockedMove.start("outrage");
        volatile.magicCoat = true;
        volatile.minimize = true;
        volatile.mudSport = true;
        volatile.mustRecharge = true;
        // TODO: test private moveset link
        volatile.overrideTraits.init();
        volatile.overrideTraits.setSpecies("Slaking"); // has truant ability
        volatile.overrideTraits.stats.level = 100;
        volatile.addedType = "ice";
        volatile.rollout.start("iceball");
        volatile.roost = true;
        volatile.slowStart.start();
        volatile.stall(true);
        volatile.stockpile = 2;
        volatile.taunt.start();
        volatile.torment = true;
        volatile.twoTurn.start("solarbeam");
        volatile.unburden = true;
        volatile.uproar.start();
        volatile.activateTruant();
    }

    describe("#clear()", function()
    {
        it("Should clear all statuses", function()
        {
            setEverything();
            volatile.clear();

            expect(volatile.aquaRing).to.be.false;
            expect(volatile.boosts.atk).to.equal(0);
            expect(volatile.confusion.isActive).to.be.false;
            expect(volatile.curse).to.be.false;
            expect(volatile.embargo.isActive).to.be.false;
            expect(volatile.focusEnergy).to.be.false;
            expect(volatile.gastroAcid).to.be.false;
            expect(volatile.ingrain).to.be.false;
            expect(volatile.leechSeed).to.be.false;
            expect(volatile.magnetRise.isActive).to.be.false;
            expect(volatile.nightmare).to.be.false;
            expect(volatile.perish).to.equal(0);
            expect(volatile.powerTrick).to.be.false;
            expect(volatile.substitute).to.be.false;
            expect(volatile.trapped).to.be.null;
            expect(volatile.trapping).to.be.null;

            expect(volatile.attract).to.be.false;
            expect(volatile.bide.isActive).to.be.false;
            expect(volatile.charge.isActive).to.be.false;
            expect(volatile.defenseCurl).to.be.false;
            expect(volatile.destinyBond).to.be.false;
            expect(volatile.disabledMoves[0].isActive).to.be.false;
            expect(volatile.encore.isActive).to.be.false;
            expect(volatile.grudge).to.be.false;
            expect(volatile.healBlock.isActive).to.be.false;
            expect(volatile.identified).to.be.null;
            expect(volatile.lockedMove.isActive).to.be.false;
            expect(volatile.magicCoat).to.be.false;
            expect(volatile.minimize).to.be.false;
            expect(volatile.mudSport).to.be.false;
            expect(volatile.mustRecharge).to.be.false;
            // TODO: test private moveset link
            expect(volatile.overrideTraits.hasAbility).to.be.false;
            expect(() => volatile.overrideTraits.ability).to.throw(Error,
                "Ability not initialized");
            expect(() => volatile.overrideTraits.data).to.throw(Error,
                "Species not initialized or narrowed");
            expect(() => volatile.overrideTraits.species).to.throw(Error,
                "Species not initialized");
            expect(() => volatile.overrideTraits.stats).to.throw(Error,
                "Stat table not initialized");
            expect(() => volatile.overrideTraits.types).to.throw(Error,
                "Types not initialized");
            expect(volatile.addedType).to.equal("???");
            expect(volatile.rollout.isActive).to.be.false;
            expect(volatile.roost).to.be.false;
            expect(volatile.slowStart.isActive).to.be.false;
            expect(volatile.stalling).to.be.false;
            expect(volatile.stallTurns).to.equal(0);
            expect(volatile.stockpile).to.equal(0);
            expect(volatile.taunt.isActive).to.be.false;
            expect(volatile.torment).to.be.false;
            expect(volatile.twoTurn.isActive).to.be.false;
            expect(volatile.unburden).to.be.false;
            expect(volatile.uproar.isActive).to.be.false;
            expect(volatile.willTruant).to.be.false;
        });
    });

    describe("#clearUnpassable()", function()
    {
        it("Should keep only passable statuses", function()
        {
            setEverything();
            volatile.clearUnpassable();

            // passed
            expect(volatile.aquaRing).to.be.true;
            expect(volatile.boosts.atk).to.equal(1);
            expect(volatile.confusion.isActive).to.be.true;
            expect(volatile.confusion.turns).to.equal(1);
            expect(volatile.curse).to.be.true;
            expect(volatile.embargo.isActive).to.be.true;
            expect(volatile.embargo.turns).to.equal(1);
            expect(volatile.focusEnergy).to.be.true;
            expect(volatile.gastroAcid).to.be.true;
            expect(volatile.ingrain).to.be.true;
            expect(volatile.leechSeed).to.be.true;
            expect(volatile.magnetRise.isActive).to.be.true;
            expect(volatile.magnetRise.turns).to.equal(1);
            expect(volatile.nightmare).to.be.true;
            expect(volatile.perish).to.equal(3);
            expect(volatile.powerTrick).to.be.true;
            expect(volatile.substitute).to.be.true;
            expect(volatile.trapped).to.not.be.null;
            expect(volatile.trapping).to.not.be.null;

            // not passed
            expect(volatile.attract).to.be.false;
            expect(volatile.bide.isActive).to.be.false;
            expect(volatile.charge.isActive).to.be.false;
            expect(volatile.defenseCurl).to.be.false;
            expect(volatile.destinyBond).to.be.false;
            expect(volatile.disabledMoves[0].isActive).to.be.false;
            expect(volatile.encore.isActive).to.be.false;
            expect(volatile.grudge).to.be.false;
            expect(volatile.healBlock.isActive).to.be.false;
            expect(volatile.identified).to.be.null;
            expect(volatile.lockedMove.isActive).to.be.false;
            expect(volatile.magicCoat).to.be.false;
            expect(volatile.minimize).to.be.false;
            expect(volatile.mudSport).to.be.false;
            expect(volatile.mustRecharge).to.be.false;
            // TODO: test private moveset link
            expect(volatile.overrideTraits.hasAbility).to.be.false;
            expect(() => volatile.overrideTraits.ability).to.throw(Error,
                "Ability not initialized");
            expect(() => volatile.overrideTraits.data).to.throw(Error,
                "Species not initialized or narrowed");
            expect(() => volatile.overrideTraits.species).to.throw(Error,
                "Species not initialized");
            expect(() => volatile.overrideTraits.stats).to.throw(Error,
                "Stat table not initialized");
            expect(() => volatile.overrideTraits.types).to.throw(Error,
                "Types not initialized");
            expect(volatile.addedType).to.equal("???");
            expect(volatile.rollout.isActive).to.be.false;
            expect(volatile.roost).to.be.false;
            expect(volatile.slowStart.isActive).to.be.false;
            expect(volatile.stalling).to.be.false;
            expect(volatile.stallTurns).to.equal(0);
            expect(volatile.stockpile).to.equal(0);
            expect(volatile.taunt.isActive).to.be.false;
            expect(volatile.torment).to.be.false;
            expect(volatile.twoTurn.isActive).to.be.false;
            expect(volatile.unburden).to.be.false;
            expect(volatile.uproar.isActive).to.be.false;
            expect(volatile.willTruant).to.be.false;
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

    describe("#trapped/#trapping/#trap()", function()
    {
        it("Should set trap fields", function()
        {
            const other = new VolatileStatus();
            volatile.trap(other);
            expect(volatile.trapped).to.be.null;
            expect(volatile.trapping).to.equal(other);
            expect(other.trapping).to.be.null;
            expect(other.trapped).to.equal(volatile);
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

    describe("#magicCoat", function()
    {
        it("Should reset on #postTurn()", function()
        {
            volatile.magicCoat = true;
            volatile.postTurn();
            expect(volatile.magicCoat).to.be.false;
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

    describe("#stalling/#stallTurns/#stall()", function()
    {
        it("Should increment/reset #stallTurns", function()
        {
            expect(volatile.stallTurns).to.equal(0);

            volatile.stall(true);
            expect(volatile.stalling).to.be.true;
            expect(volatile.stallTurns).to.equal(1);

            volatile.stall(true);
            expect(volatile.stalling).to.be.true;
            expect(volatile.stallTurns).to.equal(2);

            volatile.stall(false);
            expect(volatile.stalling).to.be.false;
            expect(volatile.stallTurns).to.equal(0);
        });

        it("Should reset #stallTurns on #postTurn() if no stall happened " +
            "this turn", function()
        {
            volatile.stall(true);
            expect(volatile.stalling).to.be.true;
            volatile.postTurn();
            expect(volatile.stalling).to.be.false;
            expect(volatile.stallTurns).to.equal(1);
            volatile.postTurn();
            expect(volatile.stalling).to.be.false;
            expect(volatile.stallTurns).to.equal(0);
        });

        it("Should not reset stallTurns on #postTurn() if a stall happened " +
            "this turn", function()
        {
            volatile.stall(true);
            volatile.postTurn();
            expect(volatile.stalling).to.be.false;
            expect(volatile.stallTurns).to.equal(1);
        });
    });

    describe("#willTruant/#activateTruant()", function()
    {
        it("Should set #willTruant if ability is truant", function()
        {
            volatile.overrideTraits.init();
            volatile.overrideTraits.setAbility("truant");
            volatile.activateTruant();
            expect(volatile.willTruant).to.be.true;
        });

        it("Should fail if ability is not truant", function()
        {
            expect(() => volatile.activateTruant()).to.throw(Error,
                "Expected ability to equal truant but found unknown ability");
        });

        it("Should toggle on #postTurn() if ability is truant", function()
        {
            volatile.overrideTraits.init();
            volatile.overrideTraits.setAbility("truant");
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

    describe("#inactive()", function()
    {
        it("Should reset active move locks/statuses", function()
        {
            volatile.destinyBond = true;
            volatile.grudge = true;
            volatile.bide.start();
            volatile.lockedMove.start("thrash");
            volatile.twoTurn.start("razorwind");
            volatile.stall(true);

            volatile.inactive();

            expect(volatile.destinyBond).to.be.false;
            expect(volatile.grudge).to.be.false;
            expect(volatile.bide.isActive).to.be.false;
            expect(volatile.lockedMove.isActive).to.be.false;
            expect(volatile.twoTurn.isActive).to.be.false;
            expect(volatile.stalling).to.be.false;
            expect(volatile.stallTurns).to.equal(0);
        });
    });
});
