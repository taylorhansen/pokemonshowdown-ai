import { expect } from "chai";
import "mocha";
import { dex } from "../../../src/battle/dex/dex";
import { PokemonTraits } from "../../../src/battle/state/PokemonTraits";
import { PossibilityClass } from "../../../src/battle/state/PossibilityClass";
import { StatTable } from "../../../src/battle/state/StatTable";

describe("PokemonTraits", function()
{
    let traits: PokemonTraits;

    function checkField(name: string, ctor: any): void
    {
        expect(traits).to.have.property(name).and.to.be.an.instanceOf(ctor);
    }

    beforeEach("Initialize PokemonTraits", function()
    {
        traits = new PokemonTraits();
    });

    describe("#ability methods", function()
    {
        it("Should not have ability initially", function()
        {
            expect(traits.hasAbility).to.be.false;
            expect(() => traits.ability).to.throw(Error,
                "Ability not initialized");
        });

        describe("#setAbility()", function()
        {
            it("Should narrow ability if not already", function()
            {
                traits.init();
                const ability = traits.ability;

                traits.setAbility("swiftswim");
                expect(ability).to.equal(traits.ability); // should not reassign
                expect(traits.ability.definiteValue).to.not.be.null;
                expect(traits.ability.definiteValue!.name)
                    .to.equal("swiftswim");
            });

            it("Should reset ability", function()
            {
                traits.init();
                const ability = traits.ability;
                traits.ability.remove("swiftswim");

                traits.setAbility("swiftswim");
                expect(ability).to.not.equal(traits.ability); // should reassign
                expect(traits.ability.definiteValue).to.not.be.null;
                expect(traits.ability.definiteValue!.name)
                    .to.equal("swiftswim");
            });
        });
    });

    describe("#species methods", function()
    {
        it("Should not have species initially", function()
        {
            expect(() => traits.data).to.throw(Error,
                "Species not initialized or narrowed");
            expect(() => traits.species).to.throw(Error,
                "Species not initialized");
        });

        describe("#setSpecies()", function()
        {
            it("Should narrow species if not already", function()
            {
                traits.init();
                const species = traits.species;

                traits.setSpecies("Magikarp");
                expect(species).to.equal(traits.species); // should not reassign
                expect(traits.species.definiteValue).to.not.be.null;
                expect(traits.species.definiteValue!.name).to.equal("Magikarp");
            });

            it("Should reset species", function()
            {
                traits.init();
                const species = traits.species;
                traits.species.remove("Magikarp");

                traits.setSpecies("Magikarp");
                expect(species).to.not.equal(traits.species); // should reassign
                expect(traits.species.definiteValue).to.not.be.null;
                expect(traits.species.definiteValue!.name).to.equal("Magikarp");
            });
        });

        describe("narrow handler", function()
        {
            it("Should initialize dex data/types/stats and narrow ability",
            function()
            {
                traits.init();
                traits.setSpecies("Magikarp");
                expect(traits.data).to.equal(dex.pokemon.Magikarp);
                expect(traits.stats.data).to.equal(dex.pokemon.Magikarp);
                expect(traits.ability.possibleValues)
                    .to.have.all.keys(...dex.pokemon.Magikarp.abilities);
                expect(traits.types)
                    .to.have.members(dex.pokemon.Magikarp.types);
            });

            it("Should overwrite current fields", function()
            {
                traits.init();
                traits.setSpecies("Togepi");
                traits.setAbility("naturalcure");
                traits.types = ["grass", "water"];

                traits.setSpecies("Magikarp");
                expect(traits.data).to.equal(dex.pokemon.Magikarp);
                expect(traits.stats.data).to.equal(dex.pokemon.Magikarp);
                expect(traits.ability.possibleValues)
                    .to.have.all.keys(...dex.pokemon.Magikarp.abilities);
                expect(traits.types)
                    .to.have.members(dex.pokemon.Magikarp.types);
            });

            it("Should not do anything if old PossibilityClass is narrowed",
            function()
            {
                traits.init();
                const species = traits.species;
                traits.init(); // re-init

                expect(traits.species).to.not.equal(species);

                species.narrow("Magikarp");
                // should still not be initialized
                expect(() => traits.data).to.throw();

                traits.species.narrow("Magikarp");
                // now this should be initialized
                expect(() => traits.data).to.not.throw();
            });
        });
    });

    describe("#reset()", function()
    {
        it("Should reset all fields", function()
        {
            traits.init();
            traits.setSpecies("Magikarp");
            traits.reset();
            expect(traits.hasAbility).to.be.false;
            expect(() => traits.ability).to.throw(Error,
                "Ability not initialized");
            expect(() => traits.data).to.throw(Error,
                "Species not initialized or narrowed");
            expect(() => traits.species).to.throw(Error,
                "Species not initialized");
            expect(() => traits.stats).to.throw(Error,
                "Stat table not initialized");
            expect(() => traits.types).to.throw(Error,
                "Types not initialized");
        });
    });

    describe("#copy()", function()
    {
        it("Should copy fields", function()
        {
            const other = new PokemonTraits();
            other.init();
            other.setSpecies("Magikarp");

            traits.copy(other);
            expect(traits.ability).to.equal(other.ability);
            expect(traits.data).to.equal(other.data);
            expect(traits.species).to.equal(other.species);
            expect(traits.stats).to.equal(other.stats);
            expect(traits.types).to.equal(other.types);
        });

        it("Should recopy once species is narrowed", function()
        {
            const other = new PokemonTraits();
            other.init();
            traits.copy(other);

            // some fields are reset so make sure they still match after
            other.setSpecies("Magikarp");
            expect(traits.ability).to.equal(other.ability);
            expect(traits.data).to.equal(other.data);
            expect(traits.species).to.equal(other.species);
            expect(traits.stats).to.equal(other.stats);
            expect(traits.types).to.equal(other.types);
        });
    });

    describe("#init()", function()
    {

        it("Should initialize most members", function()
        {
            traits.init();
            checkField("ability", PossibilityClass);
            checkField("species", PossibilityClass);
            checkField("stats", StatTable);
            checkField("types", Array);
        });
    });
});
