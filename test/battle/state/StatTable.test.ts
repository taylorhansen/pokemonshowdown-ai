import { expect } from "chai";
import "mocha";
import * as dex from "../../../src/battle/dex/dex";
import { StatExceptHP, statNames } from "../../../src/battle/dex/dex-util";
import { StatTable } from "../../../src/battle/state/StatTable";

describe("StatTable", function()
{
    let stats: StatTable;

    beforeEach("Initialize StatTable", function()
    {
        stats = new StatTable();
    });

    it("Should initialize StatRanges when species and level are initialized",
    function()
    {
        stats.data = dex.pokemon.Mew; // all base 100 stats
        stats.level = 100;
        for (const stat in statNames)
        {
            if (!statNames.hasOwnProperty(stat)) continue;

            if (stat === "hp")
            {
                expect(stats[stat].min).to.equal(310);
                expect(stats[stat].max).to.equal(404);
            }
            else
            {
                expect(stats[stat as StatExceptHP].min).to.equal(184);
                expect(stats[stat as StatExceptHP].max).to.equal(328);
            }
        }
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
