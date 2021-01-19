import { expect } from "chai";
import "mocha";
import * as dex from "../../../src/battle/dex/dex";
import { PokemonTraits } from "../../../src/battle/state/PokemonTraits";

describe("PokemonTraits", function()
{
    describe(".base()", function()
    {
        it("Should initialize PokemonTraits", function()
        {
            const traits = PokemonTraits.base(dex.pokemon.magikarp, 100);
            expect(traits.species).to.equal(dex.pokemon.magikarp);
            expect(traits.ability.possibleValues)
                .to.have.keys(dex.pokemon.magikarp.abilities)
            expect(traits.stats.level).to.equal(100);
            expect(traits.types).to.equal(dex.pokemon.magikarp.types);
        });
    });

    describe("#volatile()", function()
    {
        it("Should create shallow copy", function()
        {
            const traits = PokemonTraits.base(dex.pokemon.magikarp, 100);
            const vtraits = traits.volatile();
            expect(traits).to.not.equal(vtraits);
            expect(traits.species).to.equal(vtraits.species);
            expect(traits.ability).to.equal(vtraits.ability);
            expect(traits.stats).to.equal(vtraits.stats);
            expect(traits.types).to.equal(vtraits.types);
        });
    });

    describe("#transform()", function()
    {
        it("Should create partial shallow copy", function()
        {
            const source = PokemonTraits.base(dex.pokemon.mew, 100);
            const traits = PokemonTraits.base(dex.pokemon.magikarp, 100);
            const ttraits = traits.transform(source);
            expect(traits).to.not.equal(ttraits);
            expect(traits.species).to.equal(ttraits.species);
            expect(traits.ability).to.equal(ttraits.ability);
            expect(traits.stats).to.not.equal(ttraits.stats);
            expect(traits.stats.hp).to.not.equal(ttraits.stats.hp);
            expect(ttraits.stats.hp).to.equal(source.stats.hp);
            expect(traits.stats.atk).to.equal(ttraits.stats.atk);
            expect(traits.stats.def).to.equal(ttraits.stats.def);
            expect(traits.stats.spa).to.equal(ttraits.stats.spa);
            expect(traits.stats.spd).to.equal(ttraits.stats.spd);
            expect(traits.stats.spe).to.equal(ttraits.stats.spe);
            expect(traits.stats.hpType).to.equal(ttraits.stats.hpType);
            expect(traits.types).to.equal(ttraits.types);
        });
    });

    describe("#divergeAbility()", function()
    {
        it("Should create partial shallow copy", function()
        {
            const traits = PokemonTraits.base(dex.pokemon.magikarp, 100);
            const dtraits = traits.divergeAbility("illuminate", "technician");
            expect(traits).to.not.equal(dtraits);
            expect(traits.species).to.equal(dtraits.species);
            expect(traits.ability).to.not.equal(dtraits.ability);
            expect(traits.ability.possibleValues)
                .to.have.keys(dex.pokemon.magikarp.abilities)
            expect(dtraits.ability.possibleValues)
                .to.have.keys("illuminate", "technician");
            expect(traits.stats).to.equal(dtraits.stats);
            expect(traits.types).to.equal(dtraits.types);
        });
    });

    describe("#divergeTypes()", function()
    {
        it("Should create partial shallow copy", function()
        {
            const traits = PokemonTraits.base(dex.pokemon.magikarp, 100);
            const dtraits = traits.divergeTypes(["fire", "ice"]);
            expect(traits).to.not.equal(dtraits);
            expect(traits.species).to.equal(dtraits.species);
            expect(traits.ability).to.equal(dtraits.ability);
            expect(traits.stats).to.equal(dtraits.stats);
            expect(traits.types).to.not.equal(dtraits.types);
            expect(traits.types).to.equal(dex.pokemon.magikarp.types);
            expect(dtraits.types).to.have.members(["fire", "ice"]);
        });
    });
});
