import { expect } from "chai";
import "mocha";
import * as dex from "../../../src/battle/dex/dex";
import { BoostName, boostNames } from "../../../src/battle/dex/dex-util";
import { PokemonTraits } from "../../../src/battle/state/PokemonTraits";
import { VolatileStatus } from "../../../src/battle/state/VolatileStatus";
import { setAllVolatiles } from "./helpers";

describe("VolatileStatus", function()
{
    let volatile: VolatileStatus;

    beforeEach("Initialize VolatileStatus", function()
    {
        volatile = new VolatileStatus();
    });

    describe("#clear()", function()
    {
        it("Should clear all statuses", function()
        {
            setAllVolatiles(volatile);
            volatile.clear();

            expect(volatile.aquaRing).to.be.false;
            expect(volatile.boosts.atk).to.equal(0);
            expect(volatile.confusion.isActive).to.be.false;
            expect(volatile.curse).to.be.false;
            expect(volatile.embargo.isActive).to.be.false;
            expect(volatile.focusEnergy).to.be.false;
            expect(volatile.ingrain).to.be.false;
            expect(volatile.leechSeed).to.be.false;
            expect(volatile.lockedOnBy).to.be.null;
            expect(volatile.lockOnTarget).to.be.null;
            expect(volatile.lockOnTurns.isActive).to.be.false;
            expect(volatile.magnetRise.isActive).to.be.false;
            expect(volatile.nightmare).to.be.false;
            expect(volatile.perish).to.equal(0);
            expect(volatile.powerTrick).to.be.false;
            expect(volatile.substitute).to.be.false;
            expect(volatile.suppressAbility).to.be.false;
            expect(volatile.trapped).to.be.null;
            expect(volatile.trapping).to.be.null;

            expect(volatile.lastMove).to.be.null;

            expect(volatile.attract).to.be.false;
            expect(volatile.bide.isActive).to.be.false;
            expect(volatile.charge.isActive).to.be.false;
            expect(volatile.choiceLock).to.be.null;
            expect(volatile.damaged).to.be.false;
            expect(volatile.defenseCurl).to.be.false;
            expect(volatile.destinyBond).to.be.false;
            expect(volatile.disabled.move).to.be.null;
            expect(volatile.disabled.ts.isActive).to.be.false;
            expect(volatile.encore.move).to.be.null;
            expect(volatile.encore.ts.isActive).to.be.false;
            expect(volatile.flashFire).to.be.false;
            expect(volatile.focus).to.be.false;
            expect(volatile.grudge).to.be.false;
            expect(volatile.healBlock.isActive).to.be.false;
            expect(volatile.identified).to.be.null;
            expect(volatile.imprison).to.be.false;
            expect(volatile.lockedMove.isActive).to.be.false;
            expect(volatile.magicCoat).to.be.false;
            expect(volatile.micleberry).to.be.false;
            expect(volatile.minimize).to.be.false;
            expect(volatile.mirrorMove).to.be.null;
            expect(volatile.mudSport).to.be.false;
            expect(volatile.mustRecharge).to.be.false;
            // TODO: test private moveset link
            expect(volatile.overrideTraits).to.be.null;
            expect(volatile.addedType).to.equal("???");
            expect(volatile.rage).to.be.false;
            expect(volatile.rollout.isActive).to.be.false;
            expect(volatile.roost).to.be.false;
            expect(volatile.slowStart.isActive).to.be.false;
            expect(volatile.snatch).to.be.false;
            expect(volatile.stalling).to.be.false;
            expect(volatile.stallTurns).to.equal(0);
            expect(volatile.stockpile).to.equal(0);
            expect(volatile.taunt.isActive).to.be.false;
            expect(volatile.torment).to.be.false;
            expect(volatile.twoTurn.isActive).to.be.false;
            expect(volatile.unburden).to.be.false;
            expect(volatile.uproar.isActive).to.be.false;
            expect(volatile.waterSport).to.be.false;
            expect(volatile.willTruant).to.be.false;
            expect(volatile.yawn.isActive).to.be.false;
        });
    });

    describe("#clearUnpassable()", function()
    {
        it("Should keep only passable statuses", function()
        {
            setAllVolatiles(volatile);
            volatile.clearUnpassable();

            // passed
            expect(volatile.aquaRing).to.be.true;
            expect(volatile.boosts.atk).to.equal(1);
            expect(volatile.confusion.isActive).to.be.true;
            expect(volatile.confusion.turns).to.equal(0);
            expect(volatile.curse).to.be.true;
            expect(volatile.embargo.isActive).to.be.true;
            expect(volatile.embargo.turns).to.equal(0);
            expect(volatile.focusEnergy).to.be.true;
            expect(volatile.ingrain).to.be.true;
            expect(volatile.leechSeed).to.be.true;
            expect(volatile.lockedOnBy).to.not.be.null;
            expect(volatile.lockOnTarget).to.not.be.null;
            expect(volatile.lockOnTurns.isActive).to.be.true;
            expect(volatile.magnetRise.isActive).to.be.true;
            expect(volatile.magnetRise.turns).to.equal(0);
            expect(volatile.nightmare).to.be.true;
            expect(volatile.perish).to.equal(3);
            expect(volatile.powerTrick).to.be.true;
            expect(volatile.substitute).to.be.true;
            expect(volatile.suppressAbility).to.be.true;
            expect(volatile.trapped).to.not.be.null;
            expect(volatile.trapping).to.not.be.null;

            // not passed
            expect(volatile.attract).to.be.false;
            expect(volatile.bide.isActive).to.be.false;
            expect(volatile.charge.isActive).to.be.false;
            expect(volatile.choiceLock).to.be.null;
            expect(volatile.damaged).to.be.false;
            expect(volatile.defenseCurl).to.be.false;
            expect(volatile.destinyBond).to.be.false;
            expect(volatile.disabled.move).to.be.null;
            expect(volatile.disabled.ts.isActive).to.be.false;
            expect(volatile.encore.move).to.be.null;
            expect(volatile.encore.ts.isActive).to.be.false;
            expect(volatile.flashFire).to.be.false;
            expect(volatile.focus).to.be.false;
            expect(volatile.grudge).to.be.false;
            expect(volatile.healBlock.isActive).to.be.false;
            expect(volatile.identified).to.be.null;
            expect(volatile.imprison).to.be.false;
            expect(volatile.lockedMove.isActive).to.be.false;
            expect(volatile.magicCoat).to.be.false;
            expect(volatile.micleberry).to.be.false;
            expect(volatile.minimize).to.be.false;
            expect(volatile.mirrorMove).to.be.null;
            expect(volatile.mudSport).to.be.false;
            expect(volatile.mustRecharge).to.be.false;
            // TODO: test private moveset link
            expect(volatile.overrideTraits).to.be.null;
            expect(volatile.addedType).to.equal("???");
            expect(volatile.rage).to.be.false;
            expect(volatile.rollout.isActive).to.be.false;
            expect(volatile.roost).to.be.false;
            expect(volatile.slowStart.isActive).to.be.false;
            expect(volatile.snatch).to.be.false;
            expect(volatile.stalling).to.be.false;
            expect(volatile.stallTurns).to.equal(0);
            expect(volatile.stockpile).to.equal(0);
            expect(volatile.taunt.isActive).to.be.false;
            expect(volatile.torment).to.be.false;
            expect(volatile.twoTurn.isActive).to.be.false;
            expect(volatile.unburden).to.be.false;
            expect(volatile.uproar.isActive).to.be.false;
            expect(volatile.waterSport).to.be.false;
            expect(volatile.willTruant).to.be.false;
            expect(volatile.yawn.isActive).to.be.false;
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
            expect(volatile.embargo.turns).to.equal(0);
            volatile.postTurn();
            expect(volatile.embargo.turns).to.equal(1);
        });
    });

    describe("#lockedOnBy/#lockOnTarget/#lockOn()", function()
    {
        it("Should lock on", function()
        {
            const target = new VolatileStatus();
            volatile.lockOn(target);
            expect(volatile.lockedOnBy).to.be.null;
            expect(volatile.lockOnTarget).to.equal(target);
            expect(volatile.lockOnTurns.isActive).to.be.true;
            expect(target.lockedOnBy).to.equal(volatile);
            expect(target.lockOnTarget).to.be.null;
            expect(target.lockOnTurns.isActive).to.be.false;
        });

        it("Should restart on #batonPass()", function()
        {
            const target = new VolatileStatus();
            volatile.lockOn(target);
            volatile.postTurn();
            expect(volatile.lockOnTurns.turns).to.equal(1);
            volatile.batonPass();
            expect(volatile.lockOnTurns.isActive).to.be.true;
            expect(volatile.lockOnTurns.turns).to.equal(0);
        });

        it("Should tick on #postTurn()", function()
        {
            const target = new VolatileStatus();
            volatile.lockOn(target);
            expect(volatile.lockOnTurns.isActive).to.be.true;
            expect(volatile.lockOnTurns.turns).to.equal(0);

            volatile.postTurn();
            expect(volatile.lockedOnBy).to.be.null;
            expect(volatile.lockOnTarget).to.equal(target);
            expect(volatile.lockOnTurns.isActive).to.be.true;
            expect(volatile.lockOnTurns.turns).to.equal(1);
            expect(target.lockedOnBy).to.equal(volatile);
            expect(target.lockOnTarget).to.be.null;
            expect(target.lockOnTurns.isActive).to.be.false;
        });

        it("Should end properly on the next #postTurn()", function()
        {
            const target = new VolatileStatus();
            volatile.lockOn(target);

            volatile.postTurn();
            volatile.postTurn();
            expect(volatile.lockedOnBy).to.be.null;
            expect(volatile.lockOnTarget).to.be.null;
            expect(volatile.lockOnTurns.isActive).to.be.false;
            expect(target.lockedOnBy).to.be.null;
            expect(target.lockOnTarget).to.be.null;
            expect(target.lockOnTurns.isActive).to.be.false;
        });

        it("Should end on user #clear()", function()
        {
            const target = new VolatileStatus();
            volatile.lockOn(target);
            volatile.clear();
            expect(volatile.lockedOnBy).to.be.null;
            expect(volatile.lockOnTarget).to.be.null;
            expect(volatile.lockOnTurns.isActive).to.be.false;
            expect(target.lockedOnBy).to.be.null;
            expect(target.lockOnTarget).to.be.null;
            expect(target.lockOnTurns.isActive).to.be.false;
        });

        it("Should end on target #clear()", function()
        {
            const target = new VolatileStatus();
            volatile.lockOn(target);
            target.clear();
            expect(volatile.lockedOnBy).to.be.null;
            expect(volatile.lockOnTarget).to.be.null;
            expect(volatile.lockOnTurns.isActive).to.be.false;
            expect(target.lockedOnBy).to.be.null;
            expect(target.lockOnTarget).to.be.null;
            expect(target.lockOnTurns.isActive).to.be.false;
        });
    });

    describe("#magnetRise", function()
    {
        it("Should tick magnet rise on #postTurn()", function()
        {
            volatile.magnetRise.start();
            expect(volatile.magnetRise.turns).to.equal(0);
            volatile.postTurn();
            expect(volatile.magnetRise.turns).to.equal(1);
        });
    });

    describe("#nightmare", function()
    {
        it("Should not reset on #batonPass() if slp", function()
        {
            volatile.nightmare = true;
            volatile.batonPass("slp");
            expect(volatile.nightmare).to.be.true;
        });

        it("Should reset on #batonPass() if not slp", function()
        {
            volatile.nightmare = true;
            volatile.batonPass("brn");
            expect(volatile.nightmare).to.be.false;
        });
    });

    describe("#trapped/#trapping/#trap()", function()
    {
        it("Should trap", function()
        {
            const target = new VolatileStatus();
            volatile.trap(target);
            expect(volatile.trapped).to.be.null;
            expect(volatile.trapping).to.equal(target);
            expect(target.trapping).to.be.null;
            expect(target.trapped).to.equal(volatile);
        });

        it("Should clear for both on user #clear()", function()
        {
            const target = new VolatileStatus();
            volatile.trap(target);

            volatile.clear();
            expect(volatile.trapped).to.be.null;
            expect(volatile.trapping).to.be.null;
            expect(target.trapping).to.be.null;
            expect(target.trapped).to.be.null;
        });

        it("Should clear for both on target #clear()", function()
        {
            const target = new VolatileStatus();
            volatile.trap(target);

            target.clear();
            expect(volatile.trapped).to.be.null;
            expect(volatile.trapping).to.be.null;
            expect(target.trapping).to.be.null;
            expect(target.trapped).to.be.null;
        });
    });

    describe("#charge", function()
    {
        it("Should tick on #postTurn()", function()
        {
            volatile.charge.start();
            expect(volatile.charge.turns).to.equal(0);
            volatile.postTurn();
            expect(volatile.charge.turns).to.equal(1);
            volatile.postTurn();
            expect(volatile.charge.isActive).to.be.false;
            expect(volatile.charge.turns).to.equal(0);
        });
    });

    for (const [field, set, reset] of
    [
        ["disabled", "disableMove", "enableMoves"],
        ["encore", "encoreMove", "removeEncore"],
    ] as const)
    {
        describe(`#${field}`, function()
        {
            it("Should not be active initially", function()
            {
                expect(volatile[field].move).to.be.null;
                expect(volatile[field].ts.isActive).to.be.false;
            });

            it("Should tick on #postTurn()", function()
            {
                volatile[set]("splash");
                expect(volatile[field].ts.turns).to.equal(0);
                volatile.postTurn();
                expect(volatile[field].ts.turns).to.equal(1);
            });
        });

        describe(`#${set}()`, function()
        {
            it(`Should set ${field}`, function()
            {
                volatile[set]("splash");
                expect(volatile[field].move).to.equal("splash");
                expect(volatile[field].ts.isActive).to.be.true;
            });

            if (field === "encore")
            {
                it("Should reveal move", function()
                {
                    expect(volatile.overrideMoveset.get("splash")).to.be.null;
                    volatile[set]("splash");
                    expect(volatile.overrideMoveset.get("splash"))
                        .to.not.be.null;
                })
            }
        });

        describe(`#${reset}()`, function()
        {
            it(`Should end ${field} status`, function()
            {
                volatile[set]("splash");
                volatile[reset]();
                expect(volatile[field].move).to.be.null;
                expect(volatile[field].ts.isActive).to.be.false;
            });
        });
    }

    for (const type of ["damaged", "focus", "magicCoat", "roost", "snatch"] as
        const)
    {
        describe(`#${type}`, function()
        {
            it("Should reset on #postTurn()", function()
            {
                volatile[type] = true;
                volatile.postTurn();
                expect(volatile[type]).to.be.false;
            });
        });
    }

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

        it("Should reset #stallTurns on #postTurn() if inactive this turn",
        function()
        {
            volatile.stall(true);
            expect(volatile.stalling).to.be.true;
            volatile.postTurn();
            expect(volatile.stalling).to.be.false;
            expect(volatile.stallTurns).to.equal(1);

            volatile.inactive();
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
            volatile.overrideTraits =
                PokemonTraits.base(dex.pokemon.slaking, 100);
            volatile.activateTruant();
            expect(volatile.willTruant).to.be.true;
        });

        it("Should fail if ability is not truant", function()
        {
            expect(() => volatile.activateTruant()).to.throw(Error,
                "Expected ability to be truant but found unknown ability");
        });

        it("Should toggle on #postTurn() if ability is truant", function()
        {
            volatile.overrideTraits =
                PokemonTraits.base(dex.pokemon.slaking, 100);
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
            volatile.rollout.start("rollout");
            volatile.twoTurn.start("razorwind");
            volatile.stall(true);

            volatile.inactive();

            expect(volatile.destinyBond).to.be.false;
            expect(volatile.grudge).to.be.false;
            expect(volatile.bide.isActive).to.be.false;
            expect(volatile.lockedMove.isActive).to.be.false;
            expect(volatile.rollout.isActive).to.be.false;
            expect(volatile.twoTurn.isActive).to.be.false;
            expect(volatile.stalling).to.be.false;
            expect(volatile.stallTurns).to.equal(0);
        });
    });

    describe("#resetSingleMove()", function()
    {
        it("Should reset single-move statuses", function()
        {
            volatile.destinyBond = true;
            volatile.grudge = true;
            volatile.rage = true;

            volatile.resetSingleMove();
            expect(volatile.destinyBond).to.be.false;
            expect(volatile.grudge).to.be.false;
            expect(volatile.rage).to.be.false;
        });
    });

    describe("#feint()", function()
    {
        it("Should reset #stalling but not #stallTurns", function()
        {
            volatile.stall(true);

            volatile.feint();
            expect(volatile.stalling).to.be.false;
            expect(volatile.stallTurns).to.equal(1);
        });
    });
});
