import { expect } from "chai";
import "mocha";
import { BattleState } from "../../../src/battle/state/BattleState";
import { Pokemon } from "./../../../src/battle/state/Pokemon";

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

        it("Should require species before switching", function()
        {
            expect(() => mon.switchIn()).to.throw();
        });

        it("Should be active if switched in", function()
        {
            mon.species = "Magikarp";
            mon.switchIn();
            expect(mon.active).to.equal(true);
        });

        it("Should be inactive if switched out", function()
        {
            mon.species = "Magikarp";
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

    describe("ability", function()
    {
        it("Should be empty initially", function()
        {
            expect(mon.baseAbility).to.equal("");
        });

        it("Should not set baseAbility without first setting species",
        function()
        {
            expect(() => mon.ability = "swiftswim").to.throw();
            expect(mon.baseAbility).to.equal("");
        });

        it("Should be defined if species has one ability", function()
        {
            mon.species = "Arceus";
            expect(mon.baseAbility).to.equal("multitype");
        });

        it("Should not be defined if species has more than one ability",
        function()
        {
            mon.species = "Togepi";
            // tslint:disable-next-line:no-unused-expression
            expect(mon.baseAbility).to.be.empty;
        });

        it("Should reject invalid base ability initialization", function()
        {
            mon.species = "Togepi";
            expect(() => mon.ability = "swiftswim").to.throw();
            expect(mon.baseAbility).to.equal("");
        });

        it("Should set baseAbility after setting species", function()
        {
            mon.species = "Togepi";
            mon.ability = "hustle";
            expect(mon.ability).to.equal("hustle");
        });

        it("Should allow display name", function()
        {
            mon.species = "Togepi";
            mon.ability = "Serene Grace";
            expect(mon.baseAbility).to.equal("serenegrace");

        });

        it("Should set volatile ability", function()
        {
            mon.species = "Togepi";
            mon.switchIn();
            // tslint:disable-next-line:no-unused-expression
            expect(mon.volatile.overrideAbility).to.be.empty;
            mon.ability = "hustle";
            expect(mon.volatile.overrideAbility).to.equal("hustle");
            mon.ability = "swiftswim";
            expect(mon.baseAbility).to.equal("hustle");
            expect(mon.volatile.overrideAbility).to.equal("swiftswim");
        });

        it("Should set volatile ability if known", function()
        {
            mon.species = "Togepi";
            mon.ability = "hustle";
            mon.switchIn();
            expect(mon.volatile.overrideAbility).to.equal("hustle");
            mon.ability = "swiftswim";
            expect(mon.baseAbility).to.equal("hustle");
            expect(mon.volatile.overrideAbility).to.equal("swiftswim");
        });

        it("Should reject unknown ability", function()
        {
            mon.species = "Togepi";
            expect(() => mon.ability = "not_a real-ability").to.throw();
            // tslint:disable-next-line:no-unused-expression
            expect(mon.ability).to.be.empty;
        });

        describe("suppressAbility (baton passed)", function()
        {
            it("Should suppress new ability", function()
            {
                const newMon = new Pokemon(/*hpPercent*/ false);
                newMon.species = "Magikarp";
                mon.volatile.suppressAbility();
                mon.copyVolatile(newMon);
                mon.switchOut();
                newMon.switchIn();

                // tslint:disable-next-line:no-unused-expression
                expect(newMon.volatile.isAbilitySuppressed()).to.be.true;
                expect(newMon.ability).to.equal("<suppressed>");
            });

            it("Should not suppress if multitype", function()
            {
                const newMon = new Pokemon(/*hpPercent*/ false);
                // arceus can only have this ability
                newMon.species = "Arceus";
                mon.volatile.suppressAbility();
                mon.copyVolatile(newMon);
                mon.switchOut();
                newMon.switchIn();

                // tslint:disable-next-line:no-unused-expression
                expect(newMon.volatile.isAbilitySuppressed()).to.be.false;
                expect(newMon.ability).to.equal("multitype");
            });
        });
    });

    describe("types", function()
    {
        it("Should return empty array if species is not set", function()
        {
            // tslint:disable-next-line:no-unused-expression
            expect(mon.types).to.be.empty;
        });

        it("Should get types if species is set", function()
        {
            mon.species = "Kingdra";
            expect(mon.types).to.have.members(["water", "dragon"]);
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

    describe("hpType", function()
    {
        it("Should reveal hidden power move and type", function()
        {
            mon.revealMove("hiddenpowerfire10");
            // tslint:disable-next-line:no-unused-expression
            expect(mon.getMove("hiddenpower")).to.not.be.null;
            // tslint:disable-next-line:no-unused-expression
            expect(mon.hpType.isSet("fire")).to.be.true;
            // tslint:disable-next-line:no-unused-expression
            expect(mon.hpType.definiteValue).to.not.be.null;
            expect(mon.hpType.definiteValue!.name).to.equal("fire");
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

    // tslint:disable:no-unused-expression
    describe("moves", function()
    {
        it("Should be empty initially", function()
        {
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
                mon.useMove("splash", mon);
                expect(mon.moves[0].pp).to.equal(63);
            });
        });

        describe("getMove", function()
        {
            it("Should not get move if not revealed", function()
            {
                expect(mon.getMove("splash")).to.be.null;
            });

            it("Should get move if revealed", function()
            {
                mon.revealMove("splash");
                expect(mon.getMove("splash")).to.not.be.null;
            });
        });

        describe("disableMove", function()
        {
            it("Should disable move", function()
            {
                mon.revealMove("splash");
                expect(mon.volatile.isDisabled(0)).to.be.false;
                mon.disableMove("splash");
                expect(mon.volatile.isDisabled(0)).to.be.true;
            });

            // likely not actually possible but just in case
            it("Should reveal disabled move", function()
            {
                expect(mon.getMove("splash")).to.be.null;
                mon.disableMove("splash");
                expect(mon.getMove("splash")).to.not.be.null;
                expect(mon.volatile.isDisabled(0)).to.be.true;
            });
        });
    });
    // tslint:enable:no-unused-expression

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

    // tslint:disable:no-unused-expression
    describe("grounded", function()
    {
        it("Should be grounded if Gravity is active", function()
        {
            const state = new BattleState();
            state.status.gravity = true;

            state.teams.us.size = 1;
            // tslint:disable-next-line:no-shadowed-variable
            const mon = state.teams.us.switchIn("Pidgey", 1, "M", 1, 1)!;
            expect(mon.isGrounded).to.be.true;
            expect(mon.maybeGrounded).to.be.true;
        });

        it("Should be grounded if Ingrain", function()
        {
            mon.volatile.ingrain = true;
            expect(mon.isGrounded).to.be.true;
            expect(mon.maybeGrounded).to.be.true;
        });

        it("Should be grounded if holding iron ball", function()
        {
            mon.species = "Pidgey";
            mon.item = "ironball";
            expect(mon.isGrounded).to.be.true;
            expect(mon.maybeGrounded).to.be.true;
        });

        it("Should ignore iron ball if Embargo", function()
        {
            mon.species = "Pidgey";
            mon.item = "ironball";
            mon.volatile.embargo = true;
            expect(mon.isGrounded).to.be.false;
            expect(mon.maybeGrounded).to.be.false;
        });

        it("Should not be grounded if Magnet Rise", function()
        {
            mon.volatile.magnetRise = true;
            expect(mon.isGrounded).to.be.false;
            expect(mon.maybeGrounded).to.be.false;
        });

        it("Should not be grounded if Levitate ability", function()
        {
            mon.species = "Bronzong";
            mon.ability = "levitate";
            // remove iron ball possibility
            mon.item = "leftovers";
            expect(mon.isGrounded).to.be.false;
            expect(mon.maybeGrounded).to.be.false;
        });

        it("Should possibly be not grounded if able to have Levitate ability",
        function()
        {
            mon.species = "Bronzong"; // can have levitate or heatproof
            // remove iron ball possibility
            mon.item = "leftovers";
            mon.switchIn();
            expect(mon.isGrounded).to.be.true;
            expect(mon.maybeGrounded).to.be.false;
        });

        it("Should not be grounded if flying type", function()
        {
            mon.species = "Pidgey";
            // remove iron ball possibility
            mon.item = "lifeorb";
            expect(mon.isGrounded).to.be.false;
            expect(mon.maybeGrounded).to.be.false;
        });
    });
    // tslint:enable:no-unused-expression

    describe("toArray", function()
    {
        it("Should be the same length as Pokemon.getArraySize()", function()
        {
            // set some stuff for coverage
            mon.species = "Magikarp";
            mon.ability = "swiftswim";
            mon.hpType.set("fire");
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
