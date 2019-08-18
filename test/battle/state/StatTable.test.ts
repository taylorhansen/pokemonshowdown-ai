import { expect } from "chai";
import "mocha";
import { dex } from "../../../src/battle/dex/dex";
import { Pokemon } from "../../../src/battle/state/Pokemon";
import { StatTable } from "../../../src/battle/state/StatTable";

describe("StatTable", function()
{
    let stats: StatTable;

    beforeEach("Initialize StatTable", function()
    {
        stats = new StatTable();
    });

    describe("#level", function()
    {
        it("Should be null initially", function()
        {
            expect(stats.level).to.be.null;
        });

        it("Should be 1 if set to 0", function()
        {
            stats.level = 0;
            expect(stats.level).to.equal(1);
        });

        it("Should be 1 if set to a negative number", function()
        {
            stats.level = -1;
            expect(stats.level).to.equal(1);
        });

        it("Should be 100 if set to a larger number", function()
        {
            stats.level = 101;
            expect(stats.level).to.equal(100);
        });

        it("Should set normally if between 1 and 100", function()
        {
            stats.level = 50;
            expect(stats.level).to.equal(50);
        });
    });

    describe("#linked", function()
    {
        it("Should set #linked and #data", function()
        {
            const mon = new Pokemon("Magikarp", false);
            stats.linked = mon;
            expect(stats.linked).to.equal(mon);
            expect(stats.data).to.equal(mon.species);
            expect(stats.level).to.be.null;
        });

        it("Should do nothing if set to null", function()
        {
            stats.linked = null;
            expect(stats.linked).to.be.null;
            expect(stats.data).to.be.null;
            expect(stats.level).to.be.null;
        });
    });

    describe("#data", function()
    {
        it("Should set #data", function()
        {
            stats.data = dex.pokemon.Magikarp;
            expect(stats.data).to.equal(dex.pokemon.Magikarp);
        });

        it("Should set #data and calc stats if #level is also set", function()
        {
            stats.data = dex.pokemon.Magikarp;
            stats.level = 100;
            expect(stats.hp.base).to.not.be.null;
        });
    });
});
