import { expect } from "chai";
import "mocha";
import { BattleState } from "../../../src/battle/state/BattleState";
import { Pokemon } from "../../../src/battle/state/Pokemon";

describe("Pokemon", function()
{
    describe("#active", function()
    {
        it("Should be inactive initially", function()
        {
            const mon = new Pokemon("Magikarp", /*hpPercent*/false);
            expect(mon.active).to.be.false;
        });

        it("Should be active if switched in", function()
        {
            const mon = new Pokemon("Magikarp", false);
            mon.switchIn();
            expect(mon.active).to.be.true;
        });

        it("Should be inactive if switched out", function()
        {
            const mon = new Pokemon("Magikarp", false);
            mon.switchIn();
            mon.switchOut();
            expect(mon.active).to.be.false;
        });

        it("Should clear volatile when switched out", function()
        {
            const mon = new Pokemon("Magikarp", false);
            mon.volatile.lockedMove.start();
            mon.switchOut();
            expect(mon.volatile.lockedMove.isActive).to.be.false;
        });
    });

    describe("#species/#setSpecies()", function()
    {
        it("Should initialize dex data", function()
        {
            const mon = new Pokemon("Magikarp", false);
            expect(mon.species.name).to.equal("Magikarp");
        });

        it("Should throw in ctor if invalid species", function()
        {
            expect(() => new Pokemon("not-a real species", false)).to.throw();
        });

        it("Should throw if invalid setSpecies", function()
        {
            const mon = new Pokemon("Magikarp", false);
            expect(() => mon.setSpecies("not a real_species")).to.throw();
        });

        it("Should change dex data", function()
        {
            const mon = new Pokemon("Magikarp", false);
            mon.setSpecies("Horsea");
            expect(mon.species.name).to.equal("Horsea");
        });
    });

    describe("#volatile#overrideSpecies", function()
    {
        it("Should initially be empty if inactive", function()
        {
            const mon = new Pokemon("Togepi", false);
            expect(mon.active).to.be.false;
            expect(mon.volatile.overrideSpecies).to.be.empty;
            expect(mon.volatile.overrideSpeciesId).to.be.null;
        });

        it("Should set volatile ability after switchin", function()
        {
            const mon = new Pokemon("Togepi", false);
            mon.switchIn();
            expect(mon.volatile.overrideSpecies).to.equal("Togepi");
            expect(mon.volatile.overrideSpeciesId).to.not.be.null;
        });

        it("Should set volatile species", function()
        {
            const mon = new Pokemon("Togepi", false);
            mon.switchIn();
            mon.volatile.overrideSpecies = "Togetic";
            expect(mon.volatile.overrideSpecies).to.equal("Togetic");
            expect(mon.volatile.overrideSpeciesId).to.not.be.null;
        });

        it("Should throw if invalid volatile species", function()
        {
            const mon = new Pokemon("Magikarp", false);
            mon.switchIn();
            expect(() => mon.setSpecies("not a real_species")).to.throw();
            expect(mon.volatile.overrideSpecies).to.equal("Magikarp");
            expect(mon.volatile.overrideSpeciesId).to.not.be.null;
        });
    });

    describe("#ability/#baseAbility", function()
    {
        it("Should be defined if species has one ability", function()
        {
            const mon = new Pokemon("Arceus", false);
            expect(mon.ability).to.equal("multitype");
            expect(mon.baseAbility.definiteValue).to.not.be.null;
            expect(mon.baseAbility.definiteValue!.name).to.equal("multitype");
        });

        it("Should not be defined if species has more than one ability",
        function()
        {
            const mon = new Pokemon("Togepi", false);
            expect(mon.baseAbility.definiteValue).to.be.null;
        });

        it("Should reject invalid base ability initialization", function()
        {
            const mon = new Pokemon("Togepi", false);
            expect(() => mon.ability = "swiftswim").to.throw();
            expect(mon.baseAbility.definiteValue).to.be.null;
        });

        it("Should set baseAbility", function()
        {
            const mon = new Pokemon("Togepi", false);
            mon.ability = "hustle";
            expect(mon.ability).to.equal("hustle");
            expect(mon.baseAbility.definiteValue).to.not.be.null;
            expect(mon.baseAbility.definiteValue!.name).to.equal("hustle");
        });

        it("Should re-set baseAbility if species is re-set", function()
        {
            const mon = new Pokemon("Togepi", false);
            mon.setSpecies("Magikarp");
            expect(mon.ability).to.equal("swiftswim");
            expect(mon.baseAbility.definiteValue).to.not.be.null;
            expect(mon.baseAbility.definiteValue!.name).to.equal("swiftswim");
        });

        it("Should set volatile ability", function()
        {
            const mon = new Pokemon("Togepi", false);
            mon.switchIn();
            expect(mon.volatile.overrideAbility).to.be.empty;
            mon.ability = "hustle";
            expect(mon.volatile.overrideAbility).to.equal("hustle");
            mon.ability = "swiftswim";
            expect(mon.baseAbility.definiteValue).to.not.be.null;
            expect(mon.baseAbility.definiteValue!.name).to.equal("hustle");
            expect(mon.volatile.overrideAbility).to.equal("swiftswim");
        });

        it("Should set volatile ability if known", function()
        {
            const mon = new Pokemon("Togepi", false);
            mon.ability = "hustle";
            mon.switchIn();
            expect(mon.volatile.overrideAbility).to.equal("hustle");
            mon.ability = "swiftswim";
            expect(mon.baseAbility.definiteValue).to.not.be.null;
            expect(mon.baseAbility.definiteValue!.name).to.equal("hustle");
            expect(mon.volatile.overrideAbility).to.equal("swiftswim");
        });

        it("Should re-set volatile ability if species is re-set", function()
        {
            const mon = new Pokemon("Togepi", false);
            mon.ability = "hustle";
            mon.switchIn();
            mon.setSpecies("Magikarp");
            expect(mon.volatile.overrideAbility).to.equal("swiftswim");
        });

        it("Should clear volatile ability if species is re-set and new base " +
            "ability is unknown", function()
        {
            const mon = new Pokemon("Togepi", false);
            mon.ability = "hustle";
            mon.switchIn();
            mon.setSpecies("Bronzong");
            expect(mon.volatile.overrideAbility).to.be.empty;
        });

        it("Should reject unknown ability", function()
        {
            const mon = new Pokemon("Togepi", false);
            expect(() => mon.ability = "not_a real-ability").to.throw();
            expect(mon.ability).to.be.empty;
        });

        describe("#volatile#suppressAbility() (baton passed)", function()
        {
            it("Should suppress new ability", function()
            {
                const mon1 = new Pokemon("Magikarp", false);
                const mon2 = new Pokemon("Togepi", false);
                mon1.volatile.suppressAbility();
                mon1.copyVolatile(mon2);
                mon1.switchOut();
                mon2.switchIn();

                expect(mon2.volatile.isAbilitySuppressed()).to.be.true;
                expect(mon2.ability).to.equal("<suppressed>");
            });

            it("Should not suppress if multitype", function()
            {
                const mon1 = new Pokemon("Magikarp", false);
                const mon2 = new Pokemon("Arceus", false);
                // arceus can only have this ability
                mon1.volatile.suppressAbility();
                mon1.copyVolatile(mon2);
                mon1.switchOut();
                mon2.switchIn();

                expect(mon2.volatile.isAbilitySuppressed()).to.be.false;
                expect(mon2.ability).to.equal("multitype");
            });
        });
    });

    describe("#types", function()
    {
        it("Should get types", function()
        {
            const mon = new Pokemon("Kingdra", false);
            expect(mon.types).to.have.members(["water", "dragon"]);
        });
    });

    describe("#level", function()
    {
        it("Should be 0 initially", function()
        {
            const mon = new Pokemon("Magikarp", false);
            expect(mon.level).to.equal(0);
        });

        it("Should be 1 if set to 0", function()
        {
            const mon = new Pokemon("Magikarp", false);
            mon.level = 0;
            expect(mon.level).to.equal(1);
        });

        it("Should be 1 if set to a negative number", function()
        {
            const mon = new Pokemon("Magikarp", false);
            mon.level = -1;
            expect(mon.level).to.equal(1);
        });

        it("Should be 100 if set to a larger number", function()
        {
            const mon = new Pokemon("Magikarp", false);
            mon.level = 101;
            expect(mon.level).to.equal(100);
        });

        it("Should set level if between 1 and 100", function()
        {
            const mon = new Pokemon("Magikarp", false);
            mon.level = 50;
            expect(mon.level).to.equal(50);
        });
    });

    describe("#moveset", function()
    {
        describe("#useMove()", function()
        {
            it("Should use move", function()
            {
                const mon = new Pokemon("Magikarp", false);
                mon.useMove("splash", [mon]);
                expect(mon.moveset.get("splash")!.pp).to.equal(63);
            });

            describe("pressure ability handling", function()
            {
                let target: Pokemon;

                beforeEach("Setup pressure mon", function()
                {
                    target = new Pokemon("Zapdos", /*hpPercent*/true);
                    target.ability = "pressure";
                });

                beforeEach("Reveal an attacking move", function()
                {
                    const mon = new Pokemon("Magikarp", false);
                    const move = mon.moveset.reveal("tackle");
                    expect(move.pp).to.equal(56);
                });

                it("Should use double pp if targeted", function()
                {
                    const mon = new Pokemon("Magikarp", false);
                    mon.useMove("tackle", [target]);
                    expect(mon.moveset.get("tackle")!.pp).to.equal(54);
                });

                it("Should not use double pp if not targeted", function()
                {
                    const mon = new Pokemon("Magikarp", false);
                    mon.useMove("tackle", [mon]);
                    expect(mon.moveset.get("tackle")!.pp).to.equal(55);
                });

                it("Should not use double pp if mold breaker", function()
                {
                    const mon = new Pokemon("Rampardos", false);
                    mon.ability = "moldbreaker";
                    mon.useMove("tackle", [target]);
                    expect(mon.moveset.get("tackle")!.pp).to.equal(55);
                });
            });
        });

        describe("#disableMove()", function()
        {
            it("Should disable move", function()
            {
                const mon = new Pokemon("Magikarp", false);
                mon.moveset.reveal("splash");
                expect(mon.volatile.disabledMoves[0].isActive).to.be.false;
                mon.disableMove("splash");
                expect(mon.volatile.disabledMoves[0].isActive).to.be.true;
            });

            // likely not actually possible but just in case
            it("Should reveal disabled move", function()
            {
                const mon = new Pokemon("Magikarp", false);
                expect(mon.moveset.get("splash")).to.be.null;
                mon.disableMove("splash");
                expect(mon.moveset.get("splash")).to.not.be.null;
                expect(mon.volatile.disabledMoves[0].isActive).to.be.true;
            });
        });
    });

    describe("#faint()", function()
    {
        it("Should be fainted initially", function()
        {
            const mon = new Pokemon("Magikarp", false);
            expect(mon.fainted).to.be.true;
        });

        it("Should not be fainted after restoring hp", function()
        {
            const mon = new Pokemon("Magikarp", false);
            mon.hp.set(100, 100);
            expect(mon.fainted).to.be.false;
        });

        it("Should be fainted after fainting", function()
        {
            const mon = new Pokemon("Magikarp", false);
            mon.faint();
            expect(mon.fainted).to.be.true;
        });

        it("Should set hp to 0 after fainting", function()
        {
            const mon = new Pokemon("Magikarp", false);
            mon.faint();
            expect(mon.hp.current).to.equal(0);
            expect(mon.hp.max).to.equal(0);
        });
    });

    describe("#isGrounded/#maybeGrounded", function()
    {
        it("Should not be grounded if flying type", function()
        {
            const mon = new Pokemon("Pidgey", false);
            // remove iron ball possibility
            mon.item.narrow("lifeorb");
            expect(mon.isGrounded).to.be.false;
            expect(mon.maybeGrounded).to.be.false;
        });

        it("Should be grounded if not flying type", function()
        {
            const mon = new Pokemon("Magikarp", false);
            // remove iron ball possibility
            mon.item.narrow("lifeorb");
            expect(mon.isGrounded).to.be.true;
            expect(mon.maybeGrounded).to.be.true;
        });

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
            const mon = new Pokemon("Pidgey", false);
            mon.volatile.ingrain = true;
            expect(mon.isGrounded).to.be.true;
            expect(mon.maybeGrounded).to.be.true;
        });

        it("Should be grounded if holding iron ball", function()
        {
            const mon = new Pokemon("Pidgey", false);
            mon.item.narrow("ironball");
            expect(mon.isGrounded).to.be.true;
            expect(mon.maybeGrounded).to.be.true;
        });

        it("Should ignore iron ball if Embargo", function()
        {
            const mon = new Pokemon("Pidgey", false);
            mon.item.narrow("ironball");
            mon.volatile.embargo.start();
            expect(mon.isGrounded).to.be.false;
            expect(mon.maybeGrounded).to.be.false;
        });

        it("Should not be grounded if Magnet Rise", function()
        {
            const mon = new Pokemon("Magikarp", false);
            // remove iron ball possibility
            mon.item.narrow("leftovers");
            mon.volatile.magnetRise.start();
            expect(mon.isGrounded).to.be.false;
            expect(mon.maybeGrounded).to.be.false;
        });

        it("Should not be grounded if Levitate ability", function()
        {
            const mon = new Pokemon("Bronzong", false);
            mon.ability = "levitate";
            // remove iron ball possibility
            mon.item.narrow("leftovers");
            expect(mon.isGrounded).to.be.false;
            expect(mon.maybeGrounded).to.be.false;
        });

        it("Should possibly be not grounded if able to have Levitate ability",
        function()
        {
            // can have levitate or heatproof
            const mon = new Pokemon("Bronzong", false);
            // remove iron ball possibility
            mon.item.narrow("leftovers");
            mon.switchIn();
            expect(mon.isGrounded).to.be.true;
            expect(mon.maybeGrounded).to.be.false;
        });
    });
});
