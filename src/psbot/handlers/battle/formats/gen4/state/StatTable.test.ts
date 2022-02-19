import {expect} from "chai";
import "mocha";
import * as dex from "../dex";
import {StatRange} from "./StatRange";
import {StatTable} from "./StatTable";

export const test = () =>
    describe("StatTable", function () {
        describe(".base()", function () {
            it("Should initialize StatRanges", function () {
                // All base 100 stats.
                const stats = StatTable.base(dex.pokemon["mew"], 100);
                for (const stat in dex.statNames) {
                    if (!Object.hasOwnProperty.call(dex.statNames, stat)) {
                        continue;
                    }

                    if (stat === "hp") {
                        expect(stats[stat].min).to.equal(310);
                        expect(stats[stat].max).to.equal(404);
                    } else {
                        expect(stats[stat as dex.StatExceptHp].min).to.equal(
                            184,
                        );
                        expect(stats[stat as dex.StatExceptHp].max).to.equal(
                            328,
                        );
                    }
                }
            });

            describe("#level", function () {
                it("Should be 1 if set to 0", function () {
                    const stats = StatTable.base(dex.pokemon["mew"], 0);
                    expect(stats.level).to.equal(1);
                });

                it("Should be 1 if set to a negative number", function () {
                    const stats = StatTable.base(dex.pokemon["mew"], -50);
                    expect(stats.level).to.equal(1);
                });

                it("Should be 100 if set to a larger number", function () {
                    const stats = StatTable.base(dex.pokemon["mew"], 105);
                    expect(stats.level).to.equal(100);
                });

                it("Should set normally if between 1 and 100", function () {
                    const stats = StatTable.base(dex.pokemon["mew"], 50);
                    expect(stats.level).to.equal(50);
                });
            });
        });

        describe("#transform()", function () {
            it("Should create partial shallow copy", function () {
                const stats = StatTable.base(dex.pokemon["mew"], 100);
                const overrideHp = new StatRange(50, 100, true /*hp*/);
                const stats2 = stats.transform(overrideHp);

                expect(stats.level).to.equal(stats2.level);
                expect(stats.hp).to.not.equal(stats2.hp);
                expect(stats2.hp).to.equal(overrideHp);
                expect(stats.atk).to.equal(stats2.atk);
                expect(stats.def).to.equal(stats2.def);
                expect(stats.spa).to.equal(stats2.spa);
                expect(stats.spd).to.equal(stats2.spd);
                expect(stats.spe).to.equal(stats2.spe);
                expect(stats.hpType).to.equal(stats2.hpType);
            });
        });
    });
