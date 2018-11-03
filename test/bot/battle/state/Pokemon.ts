import { expect } from "chai";
import "mocha";
import { Pokemon } from "./../../../../src/bot/battle/state/Pokemon";

describe("Pokemon", function()
{
    let mon: Pokemon;

    beforeEach("Initialize Pokemon", function()
    {
        mon = new Pokemon(/*hpPercent*/ false);
    });

    describe("active", function()
    {
        it("Should be inactive initially", function()
        {
            expect(mon.active).to.equal(false);
        });

        it("Should be active if switched in", function()
        {
            mon.switchIn();
            expect(mon.active).to.equal(true);
        });

        it("Should be inactive if switched out", function()
        {
            mon.switchIn();
            mon.switchOut();
            expect(mon.active).to.equal(false);
        });

        it("Should clear volatile when switched out", function()
        {
            mon.volatile.lockedMove = true;
            mon.switchOut();
            expect(mon.volatile.lockedMove).to.equal(false);
        });
    });

    describe("species", function()
    {
        it("Should be empty initially", function()
        {
            expect(mon.species).to.equal("");
        });

        it("Should set species name", function()
        {
            mon.species = "Magikarp";
            expect(mon.species).to.equal("Magikarp");
        });
    });

    describe("baseAbility", function()
    {
        it("Should be empty initially", function()
        {
            expect(mon.baseAbility).to.equal("");
        });

        it("Should not set baseAbility without first setting species",
        function()
        {
            expect(() => mon.baseAbility = "swiftswim").to.throw();
            expect(mon.baseAbility).to.equal("");
        });

        it("Should not set baseAbility if the species doesn't have the ability",
        function()
        {
            mon.species = "Bulbasaur";
            expect(() => mon.baseAbility = "swiftswim").to.throw();
            expect(mon.baseAbility).to.equal("");
        });

        it("Should set baseAbility after setting species", function()
        {
            mon.species = "Magikarp";
            mon.baseAbility = "swiftswim";
            expect(mon.baseAbility).to.equal("swiftswim");
        });

        it("Should allow display name", function()
        {
            mon.species = "Magikarp";
            mon.baseAbility = "Swift Swim";
            expect(mon.baseAbility).to.equal("swiftswim");

        });
    });

    describe("item", function()
    {
        it("Should be empty initially", function()
        {
            expect(mon.item).to.equal("");
        });

        it("Should set item name", function()
        {
            mon.item = "choiceband";
            expect(mon.item).to.equal("choiceband");
        });

        it("Should allow display name", function()
        {
            mon.item = "Choice Band";
            expect(mon.item).to.equal("choiceband");
        });

        it("should not set invalid item name", function()
        {
            expect(() => mon.item = "something that isn't an item").to.throw();
            expect(mon.item).to.equal("");
        });
    });

    describe("level", function()
    {
        it("Should be 0 initially", function()
        {
            expect(mon.level).to.equal(0);
        });

        it("Should be 1 if set to 0", function()
        {
            mon.level = 0;
            expect(mon.level).to.equal(1);
        });

        it("Should be 1 if set to a negative number", function()
        {
            mon.level = -1;
            expect(mon.level).to.equal(1);
        });

        it("Should be 100 if set to a larger number", function()
        {
            mon.level = 101;
            expect(mon.level).to.equal(100);
        });

        it("Should set level", function()
        {
            mon.level = 50;
            expect(mon.level).to.equal(50);
        });
    });

    describe("moves", function()
    {
        it("Should be empty initially", function()
        {
            // tslint:disable-next-line:no-unused-expression
            expect(mon.moves).to.be.empty;
        });

        describe("revealMove", function()
        {
            it("Should reveal move", function()
            {
                mon.revealMove("splash");
                expect(mon.moves).to.have.lengthOf(1);
            });
        });

        describe("useMove", function()
        {
            it("Should use move", function()
            {
                mon.useMove("splash", 1);
                expect(mon.moves[0].pp).to.equal(63);
            });
        });

        describe("getMove", function()
        {
            it("Should not get move if not revealed", function()
            {
                // tslint:disable-next-line:no-unused-expression
                expect(mon.getMove("splash")).to.be.null;
            });

            it("Should get move if revealed", function()
            {
                mon.revealMove("splash");
                // tslint:disable-next-line:no-unused-expression
                expect(mon.getMove("splash")).to.not.be.null;
            });
        });

        // tslint:disable:no-unused-expression
        describe("canMove", function()
        {
            beforeEach("Initialize moveset", function()
            {
                mon.revealMove("splash");
            });

            it("Can't move if negative index", function()
            {
                expect(mon.canMove(-1)).to.be.false;
            });

            it("Can't move if index out of range", function()
            {
                expect(mon.canMove(5)).to.be.false;
            });

            it("Can't move if pp used up", function()
            {
                mon.useMove("splash", 64);
                expect(mon.canMove(0)).to.be.false;
            });

            it("Can't move if disabled", function()
            {
                mon.volatile.disableMove(0, true);
                expect(mon.canMove(0)).to.be.false;
            });

            it("Can move otherwise", function()
            {
                expect(mon.canMove(0)).to.be.true;
            });
        });
        // tslint:enable:no-unused-expression
    });

    describe("faint", function()
    {
        it("Should be fainted initially", function()
        {
            // tslint:disable-next-line:no-unused-expression
            expect(mon.fainted).to.be.true;
        });

        it("Should not be fainted after restoring hp", function()
        {
            mon.hp.set(100, 100);
            // tslint:disable-next-line:no-unused-expression
            expect(mon.fainted).to.be.false;
        });

        it("Should be fainted after fainting", function()
        {
            mon.faint();
            // tslint:disable-next-line:no-unused-expression
            expect(mon.fainted).to.be.true;
        });

        it("Should set hp to 0 after fainting", function()
        {
            mon.faint();
            expect(mon.hp.current).to.equal(0);
            expect(mon.hp.max).to.equal(0);
        });
    });

    describe("toArray", function()
    {
        it("Should be the same length as Pokemon.getArraySize()", function()
        {
            // set some stuff for coverage
            mon.species = "Magikarp";
            mon.baseAbility = "swiftswim";
            mon.majorStatus = "psn";
            mon.gender = "F";

            expect(mon.toArray()).to.have.lengthOf(
                Pokemon.getArraySize(/*active*/ false));
            mon.switchIn();
            expect(mon.toArray()).to.have.lengthOf(
                Pokemon.getArraySize(/*active*/ true));
        });
    });
});
