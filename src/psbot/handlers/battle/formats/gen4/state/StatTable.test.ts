import { expect } from "chai";
import "mocha";
import * as dex from "../dex";
import { StatRange } from "./StatRange";
import { StatTable } from "./StatTable";

export const test = () => describe("StatTable", function()
{
    describe(".base()", function()
    {
        it("Should initialize StatRanges", function()
        {
            // all base 100 stats
            const stats = StatTable.base(dex.pokemon["mew"], 100);
            for (const stat in dex.statNames)
            {
                if (!dex.statNames.hasOwnProperty(stat)) continue;

                if (stat === "hp")
                {
                    expect(stats[stat].min).to.equal(310);
                    expect(stats[stat].max).to.equal(404);
                }
                else
                {
                    expect(stats[stat as dex.StatExceptHP].min).to.equal(184);
                    expect(stats[stat as dex.StatExceptHP].max).to.equal(328);
                }
            }
        });

        describe("#level", function()
        {
            it("Should be 1 if set to 0", function()
            {
                const stats = StatTable.base(dex.pokemon["mew"], 0);
                expect(stats.level).to.equal(1);
            });

            it("Should be 1 if set to a negative number", function()
            {
                const stats = StatTable.base(dex.pokemon["mew"], -50);
                expect(stats.level).to.equal(1);
            });

            it("Should be 100 if set to a larger number", function()
            {
                const stats = StatTable.base(dex.pokemon["mew"], 105);
                expect(stats.level).to.equal(100);
            });

            it("Should set normally if between 1 and 100", function()
            {
                const stats = StatTable.base(dex.pokemon["mew"], 50);
                expect(stats.level).to.equal(50);
            });
        });
    });

    describe("#divergeHP()", function()
    {
        it("Should create partial shallow copy", function()
        {
            const stats = StatTable.base(dex.pokemon["mew"], 100);
            const overrideHP = new StatRange(50, 100, /*hp*/ true);
            const dstats = stats.transform(overrideHP);

            expect(stats.level).to.equal(dstats.level);
            expect(stats.hp).to.not.equal(dstats.hp);
            expect(dstats.hp).to.equal(overrideHP);
            expect(stats.atk).to.equal(dstats.atk);
            expect(stats.def).to.equal(dstats.def);
            expect(stats.spa).to.equal(dstats.spa);
            expect(stats.spd).to.equal(dstats.spd);
            expect(stats.spe).to.equal(dstats.spe);
            expect(stats.hpType).to.equal(dstats.hpType);
        });
    });
});
