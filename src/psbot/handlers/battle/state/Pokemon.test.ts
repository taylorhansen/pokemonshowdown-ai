import {expect} from "chai";
import "mocha";
import * as dex from "../dex";
import {Pokemon} from "./Pokemon";

export const test = () =>
    describe("Pokemon", function () {
        function switchOut(mon: Pokemon) {
            // Create a different Pokemon that will replace the given one.
            const other = new Pokemon("smeargle");
            other.switchInto(mon);
        }

        describe("#active", function () {
            it("Should be inactive initially", function () {
                const mon = new Pokemon("smeargle");
                expect(mon.active).to.be.false;
            });
        });

        describe("#types/#baseTypes", function () {
            it("Should get types", function () {
                const mon = new Pokemon("kingdra");
                expect(mon.types).to.have.members(["water", "dragon"]);
                expect(mon.baseTypes).to.have.members(["water", "dragon"]);
            });

            it("Should get overridden types from volatile", function () {
                const mon = new Pokemon("kingdra");
                mon.switchInto();
                mon.volatile.types = ["fire", "flying"];
                expect(mon.types).to.have.members(["fire", "flying"]);
                expect(mon.baseTypes).to.have.members(["water", "dragon"]);
            });

            it("Should remove flying type if roost but leave base types as-is", function () {
                const mon = new Pokemon("pidgey");
                mon.switchInto();
                expect(mon.types).to.have.members(["normal", "flying"]);
                expect(mon.baseTypes).to.have.members(["normal", "flying"]);
                mon.volatile.roost = true;
                expect(mon.types).to.have.members(["normal", "???"]);
                expect(mon.baseTypes).to.have.members(["normal", "flying"]);
            });
        });

        describe("#ability/#baseAbility", function () {
            it("Should be defined if species has only one possible ability", function () {
                const mon = new Pokemon("arceus");
                expect(mon.ability).to.equal("multitype");
                expect(mon.baseAbility).to.equal("multitype");
            });

            it("Should not be defined if species has more than one possible ability", function () {
                const mon = new Pokemon("togepi");
                expect(mon.ability).to.be.empty;
                expect(mon.baseAbility).to.be.empty;
            });

            it("Should get overridden ability from volatile but preserve base ability", function () {
                const mon = new Pokemon("togepi");
                mon.switchInto();
                mon.setAbility("multitype");
                expect(mon.ability).to.equal("multitype");
                expect(mon.baseAbility).to.be.empty;
            });
        });

        describe("#setAbility()", function () {
            it("Should set base ability", function () {
                const mon = new Pokemon("togepi");
                mon.setAbility("multitype");
                expect(mon.ability).to.equal("multitype");
                expect(mon.baseAbility).to.equal("multitype");
            });

            it("Should set override ability if active", function () {
                const mon = new Pokemon("togepi");
                mon.switchInto();
                mon.setAbility("multitype");
                expect(mon.ability).to.equal("multitype");
                expect(mon.baseAbility).to.be.empty;
            });
        });

        describe("#revealAbility()", function () {
            it("Should set base ability if inactive", function () {
                const mon = new Pokemon("togepi");
                mon.revealAbility("hustle");
                expect(mon.ability).to.equal("hustle");
                expect(mon.baseAbility).to.equal("hustle");
            });

            it("Should set both base and override ability if active", function () {
                const mon = new Pokemon("togepi");
                mon.switchInto();
                mon.revealAbility("hustle");
                expect(mon.ability).to.equal("hustle");
                expect(mon.baseAbility).to.equal("hustle");
            });

            it("Should not set base ability if transformed", function () {
                const mon = new Pokemon("togepi");
                mon.switchInto();
                const other = new Pokemon("arceus");
                other.switchInto();
                mon.transform(other);
                mon.revealAbility("illuminate");
                expect(mon.ability).to.equal("illuminate");
                expect(mon.baseAbility).to.be.empty;
            });

            it("Should not set base ability if temporary form change", function () {
                const mon = new Pokemon("togepi");
                mon.switchInto();
                mon.formChange("arceus", 100);
                mon.revealAbility("illuminate");
                expect(mon.ability).to.equal("illuminate");
                expect(mon.baseAbility).to.be.empty;
            });

            it("Should not set base ability if ability was overridden before", function () {
                const mon = new Pokemon("togepi");
                mon.switchInto();
                mon.setAbility("illuminate");
                mon.revealAbility("hustle");
                expect(mon.ability).to.equal("hustle");
                expect(mon.baseAbility).to.be.empty;
            });
        });

        describe("#formChange()", function () {
            describe("perm = false", function () {
                it("Should set override species/traits but leave base traits as-is", function () {
                    const mon = new Pokemon("magikarp");
                    mon.switchInto();

                    mon.formChange("charmander", 100);
                    expect(mon.species).to.equal("charmander");
                    expect(mon.baseSpecies).to.equal("magikarp");
                    expect(mon.types).to.have.members(["fire", "???"]);
                    expect(mon.baseTypes).to.have.members(["water", "???"]);
                    expect(mon.stats).to.not.equal(mon.baseStats);
                    expect(mon.ability).to.equal("blaze");
                    expect(mon.baseAbility).to.equal("swiftswim");
                });
            });

            describe("perm = true", function () {
                it("Should set override and base species/traits", function () {
                    const mon = new Pokemon("magikarp");
                    mon.switchInto();
                    const oldStats = mon.stats;

                    mon.formChange("charmander", 100, true /*perm*/);
                    expect(mon.species).to.equal("charmander");
                    expect(mon.baseSpecies).to.equal("charmander");
                    expect(mon.types).to.have.members(["fire", "???"]);
                    expect(mon.baseTypes).to.have.members(["fire", "???"]);
                    expect(mon.stats).to.equal(mon.baseStats);
                    expect(mon.stats).to.not.equal(oldStats);
                    expect(mon.ability).to.equal("blaze");
                    expect(mon.baseAbility).to.equal("blaze");
                });

                it("Should not set base species/traits if transformed", function () {
                    const mon = new Pokemon("magikarp");
                    mon.switchInto();
                    mon.volatile.transformed = true;

                    mon.formChange("charmander", 100, true /*perm*/);
                    expect(mon.species).to.equal("charmander");
                    expect(mon.baseSpecies).to.equal("magikarp");
                    expect(mon.types).to.have.members(["fire", "???"]);
                    expect(mon.baseTypes).to.have.members(["water", "???"]);
                    expect(mon.stats).to.not.equal(mon.baseStats);
                    expect(mon.ability).to.equal("blaze");
                    expect(mon.baseAbility).to.equal("swiftswim");
                });
            });
        });

        describe("#setItem()", function () {
            it("Should set item", function () {
                const mon = new Pokemon("magikarp");
                expect(mon.item).to.be.empty;
                expect(mon.lastItem).to.equal("none");
                mon.setItem("lifeorb");
                expect(mon.item).to.equal("lifeorb");
                expect(mon.lastItem).to.equal("none");
            });
        });

        describe("#removeItem()", function () {
            describe("consumed = <falsy>", function () {
                it("Should remove item", function () {
                    const mon = new Pokemon("magikarp");
                    expect(mon.item).to.be.empty;
                    expect(mon.lastItem).to.equal("none");
                    mon.removeItem();
                    expect(mon.item).to.equal("none");
                    expect(mon.lastItem).to.equal("none");
                });
            });

            describe("consumed = true", function () {
                it("Should consume unknown item", function () {
                    const mon = new Pokemon("magikarp");
                    expect(mon.item).to.be.empty;
                    expect(mon.lastItem).to.equal("none");
                    mon.removeItem(true /*consumed*/);
                    expect(mon.item).to.equal("none");
                    expect(mon.lastItem).to.be.empty;
                });

                it("Should consume known item", function () {
                    const mon = new Pokemon("magikarp");
                    mon.setItem("apicotberry");
                    expect(mon.item).to.equal("apicotberry");
                    expect(mon.lastItem).to.equal("none");
                    mon.removeItem(true /*consumed*/);
                    expect(mon.item).to.equal("none");
                    expect(mon.lastItem).to.equal("apicotberry");
                });
            });

            describe("consumed = <item>", function () {
                it("Should consume item", function () {
                    const mon = new Pokemon("magikarp");
                    expect(mon.item).to.be.empty;
                    expect(mon.lastItem).to.equal("none");
                    mon.removeItem("sitrusberry" /*consumed*/);
                    expect(mon.item).to.equal("none");
                    expect(mon.lastItem).to.equal("sitrusberry");
                });

                it("Should allow item mismatch", function () {
                    const mon = new Pokemon("magikarp");
                    mon.setItem("apicotberry");
                    expect(mon.item).to.equal("apicotberry");
                    expect(mon.lastItem).to.equal("none");
                    mon.removeItem("sitrusberry" /*consumed*/);
                    expect(mon.item).to.equal("none");
                    expect(mon.lastItem).to.equal("sitrusberry");
                });
            });
        });

        describe("#recycle()", function () {
            it("Should recover consumed item", function () {
                const mon = new Pokemon("magikarp");
                mon.removeItem("sitrusberry");
                mon.recycle("sitrusberry");
                expect(mon.item).to.equal("sitrusberry");
                expect(mon.lastItem).to.equal("none");
            });

            it("Should throw if consumed item is different", function () {
                const mon = new Pokemon("magikarp");
                mon.removeItem("salacberry");
                expect(() => mon.recycle("sitrusberry")).to.throw(
                    Error,
                    "Pokemon gained 'sitrusberry' via Recycle but last " +
                        "consumed item was 'salacberry'",
                );
            });
        });

        describe("#swapItems()", function () {
            it("Should swap items", function () {
                const mon1 = new Pokemon("magikarp");
                const item1 = mon1.item;
                const mon2 = new Pokemon("magikarp");
                const item2 = mon2.item;

                mon1.swapItems(mon2);
                expect(mon1.item).to.equal(item2);
                expect(mon2.item).to.equal(item1);
            });
        });

        describe("#moveset", function () {
            it("Should override movepool in constructor", function () {
                // Note: If the moves argument wasn't provided, the moves
                // would've been inserted in the default movepool's order.
                const moves = [...dex.pokemon["magikarp"].movepool].reverse();
                expect(moves).to.have.lengthOf(4);
                const mon = new Pokemon("magikarp", 100, moves);
                expect(
                    [...mon.moveset.moves].map(m => m[0]),
                ).to.have.ordered.members(moves);
            });
        });

        describe("#mimic()", function () {
            it("Should add override move with 5 pp", function () {
                const mon = new Pokemon("smeargle");
                mon.switchInto();
                mon.moveset.reveal("mimic");

                mon.mimic("tackle");
                expect(mon.moveset.get("mimic")).to.be.null;
                const move = mon.moveset.get("tackle");
                expect(move).to.not.be.null;
                expect(move).to.have.property("pp", 5);
                expect(move).to.have.property("maxpp", 56);
                expect(mon.baseMoveset.get("tackle")).to.be.null;
            });

            it("Should clear on switch-out", function () {
                const mon = new Pokemon("smeargle");
                mon.switchInto();
                mon.moveset.reveal("mimic");

                mon.mimic("tackle");
                switchOut(mon);
                expect(mon.moveset.get("tackle")).to.be.null;
                expect(mon.moveset.get("mimic")).to.not.be.null;
            });
        });

        describe("#sketch()", function () {
            it("Should add replacement move with minimum maxpp", function () {
                const mon = new Pokemon("smeargle");
                mon.switchInto();
                mon.moveset.reveal("sketch");

                mon.sketch("tackle");
                // Switch-out should not matter
                switchOut(mon);
                expect(mon.moveset.get("sketch")).to.be.null;
                const move = mon.moveset.get("tackle");
                expect(move).to.not.be.null;
                expect(move).to.have.property("pp", 35);
                expect(move).to.have.property("maxpp", 35);
                expect(mon.baseMoveset.get("tackle")).to.equal(move);
            });
        });

        describe("#happiness", function () {
            it("Should be null initially", function () {
                const mon = new Pokemon("magikarp");
                expect(mon).to.have.property("happiness", null);
            });

            it("Should cap at 255 max", function () {
                const mon = new Pokemon("magikarp");
                mon.happiness = 500;
                expect(mon).to.have.property("happiness", 255);
            });

            it("Should cap at 0 min", function () {
                const mon = new Pokemon("magikarp");
                mon.happiness = -500;
                expect(mon).to.have.property("happiness", 0);
            });

            it("Should be resettable", function () {
                const mon = new Pokemon("magikarp");
                mon.happiness = 255;
                expect(mon).to.have.property("happiness", 255);
                mon.happiness = null;
                expect(mon).to.have.property("happiness", null);
            });
        });

        // Note: Not testing #inactive(), #preTurn(), or #postTurn() since they
        // all defer to the same methods of contained objects.

        describe("#switchInto()", function () {
            it("Should become active", function () {
                const mon = new Pokemon("magikarp");
                expect(mon.active).to.be.false;
                expect(() => mon.volatile).to.throw(
                    Error,
                    "Pokemon is currently inactive",
                );
                mon.switchInto();
                expect(mon.active).to.be.true;
            });

            it("Should transfer VolatileStatus reference", function () {
                const mon = new Pokemon("magikarp");
                mon.switchInto();
                const v = mon.volatile;

                const other = new Pokemon("magikarp");
                other.switchInto(mon);
                expect(v).to.equal(other.volatile);
            });

            it("Should set volatile traits", function () {
                const mon = new Pokemon("magikarp");
                mon.switchInto();
                expect(mon.volatile.species).to.equal(mon.baseSpecies);
                expect(mon.volatile.types).to.equal(mon.baseTypes);
                expect(mon.volatile.stats).to.equal(mon.baseStats);
                expect(mon.volatile.ability).to.equal(mon.baseAbility);
                expect(mon.volatile.moveset.isIsolated()).to.be.false;
                // Note: Moveset object is reused and maintains its own separate
                // instances.
                expect(mon.volatile.moveset).to.not.equal(mon.baseMoveset);
            });

            it("Should become inactive if another switches into it", function () {
                const mon = new Pokemon("magikarp");
                mon.switchInto();
                switchOut(mon);
                expect(mon.active).to.be.false;
            });

            it("Should clear toxic turns when switching out", function () {
                const mon = new Pokemon("magikarp");
                mon.majorStatus.afflict("tox");
                mon.majorStatus.tick();
                expect(mon.majorStatus.turns).to.equal(2);
                switchOut(mon);
                expect(mon.majorStatus.turns).to.equal(1);
            });

            it("Should not clear other major status turns when switching out", function () {
                const mon = new Pokemon("magikarp");
                mon.majorStatus.afflict("slp");
                mon.majorStatus.tick();
                expect(mon.majorStatus.turns).to.equal(2);
                switchOut(mon);
                expect(mon.majorStatus.turns).to.equal(2);
            });

            it("Should clear volatile when switching out and back in", function () {
                const mon = new Pokemon("magikarp");
                mon.switchInto();
                mon.volatile.rampage.start("thrash");

                switchOut(mon);
                mon.switchInto();
                expect(mon.volatile.rampage.isActive).to.be.false;
            });

            describe("selfSwitch = true", function () {
                it("Should copy lastMove", function () {
                    const mon = new Pokemon("magikarp");
                    mon.switchInto();
                    mon.volatile.lastMove = "tackle";

                    const mon2 = new Pokemon("smeargle");
                    mon2.switchInto(mon, true /*selfSwitch*/);
                    expect(mon2.volatile.lastMove).to.equal("tackle");
                });

                it("Should not copy lastMove if switch-in can't have the move", function () {
                    const mon = new Pokemon("magikarp");
                    mon.switchInto();
                    mon.volatile.lastMove = "tackle";

                    const mon2 = new Pokemon("smeargle");
                    mon2.moveset.inferDoesntHave(["tackle"]);
                    mon2.switchInto(mon, true /*selfSwitch*/);
                    expect(mon2.volatile.lastMove).to.be.null;
                });
            });

            describe("selfSwitch = copyvolatile", function () {
                it("Should copy passable statuses", function () {
                    const mon = new Pokemon("magikarp");
                    mon.switchInto();
                    mon.volatile.boosts.atk = 1;

                    const other = new Pokemon("magikarp");
                    other.switchInto(mon, "copyvolatile");
                    expect(other.volatile.boosts.atk).to.equal(1);
                });

                it("Should restart lockon", function () {
                    const mon = new Pokemon("magikarp");
                    mon.switchInto();
                    const target = new Pokemon("gyarados");
                    target.switchInto();
                    mon.volatile.lockOn(target.volatile);
                    mon.postTurn();
                    expect(mon.volatile.lockOnTurns.isActive).to.be.true;
                    expect(mon.volatile.lockOnTurns.turns).to.equal(1);

                    const bench = new Pokemon("seaking");
                    bench.switchInto(mon, "copyvolatile");
                    expect(bench.volatile.lockOnTurns.isActive).to.be.true;
                    expect(bench.volatile.lockOnTurns.turns).to.equal(0);
                });

                it("Should reset nightmare if recipient is not asleep", function () {
                    const mon = new Pokemon("magikarp");
                    mon.switchInto();
                    mon.majorStatus.afflict("slp");
                    mon.volatile.nightmare = true;

                    const other = new Pokemon("magikarp");
                    other.switchInto(mon, "copyvolatile");
                    expect(other.volatile.nightmare).to.be.false;
                });

                it("Should copy nightmare if recipient is asleep", function () {
                    const mon = new Pokemon("magikarp");
                    mon.switchInto();
                    mon.majorStatus.afflict("slp");
                    mon.volatile.nightmare = true;

                    const other = new Pokemon("magikarp");
                    other.majorStatus.afflict("slp");
                    other.switchInto(mon, "copyvolatile");
                    expect(other.volatile.nightmare).to.be.true;
                });
            });
        });

        describe("#transform()", function () {
            it("Should copy known traits", function () {
                const mon1 = new Pokemon("smeargle");
                mon1.switchInto();
                mon1.stats.hpType = "fire";
                expect(mon1.moveset.get("splash")).to.be.null;

                const mon2 = new Pokemon("bulbasaur");
                mon2.switchInto();
                mon2.volatile.boosts.atk = 2;
                mon2.moveset.reveal("splash");
                mon2.stats.hpType = "ice";

                mon1.transform(mon2);

                expect(mon1.volatile.transformed).to.be.true;
                expect(mon1.volatile.boosts.atk).to.equal(2);
                expect(mon1.species).to.equal(mon2.species);
                expect(mon1.baseSpecies).to.not.equal(mon2.species);
                expect(mon1.types).to.equal(mon2.types);
                expect(mon1.stats).to.not.equal(mon2.stats);
                expect(mon1.stats.level).to.equal(mon2.stats.level);
                expect(mon1.stats.hp).to.not.equal(mon2.stats.hp);
                expect(mon1.stats.atk).to.equal(mon2.stats.atk);
                expect(mon1.stats.def).to.equal(mon2.stats.def);
                expect(mon1.stats.spa).to.equal(mon2.stats.spa);
                expect(mon1.stats.spd).to.equal(mon2.stats.spd);
                expect(mon1.stats.spe).to.equal(mon2.stats.spe);
                expect(mon1.stats.hpType).to.equal(mon2.stats.hpType);
                expect(mon1.hpType).to.equal(mon2.hpType);
                expect(mon1.ability).to.equal(mon2.ability);
                expect(mon1.moveset.isIsolated()).to.be.false;
                expect(mon1.moveset.get("splash")).to.not.be.null;

                // Should still keep base traits.
                expect(mon1.baseSpecies).to.equal("smeargle");
                expect(mon1.baseTypes).to.have.members(["normal", "???"]);
                expect(mon1.baseStats).to.not.equal(mon1.stats);
                expect(mon1.baseStats.hpType).to.equal("fire");
                expect(mon1.baseAbility).to.be.empty;
            });

            it("Should link move inference", function () {
                const mon1 = new Pokemon("smeargle");
                mon1.switchInto();

                const mon2 = new Pokemon("bulbasaur");
                mon2.switchInto();

                mon1.transform(mon2);
                mon1.moveset.reveal("splash");
                mon2.moveset.reveal("tackle");

                expect(mon1.moveset.get("tackle")).to.not.be.null;
                expect(mon2.moveset.get("splash")).to.not.be.null;
            });

            it("Should link stat inference except hp", function () {
                const mon1 = new Pokemon("magikarp");
                mon1.switchInto();

                const mon2 = new Pokemon("bronzong");
                mon2.switchInto();
                expect(mon2.stats.hp.min).to.equal(244);
                expect(mon2.stats.hp.max).to.equal(338);

                mon1.transform(mon2);
                mon1.stats.hp.set(200);
                mon1.stats.atk.set(200);
                mon2.stats.spe.set(100);

                expect(mon2.stats.hp.min).to.equal(244);
                expect(mon2.stats.hp.max).to.equal(338);
                expect(mon2.stats.atk.min).to.equal(200);
                expect(mon2.stats.atk.max).to.equal(200);
                expect(mon1.stats.spe.min).to.equal(100);
                expect(mon1.stats.spe.max).to.equal(100);
            });

            it("Should allow inference for benched transform target even if it switches back in", function () {
                const mon1 = new Pokemon("ditto");
                mon1.switchInto();
                mon1.moveset.reveal("transform");

                const mon2 = new Pokemon("smeargle");
                mon2.switchInto();
                mon2.moveset.reveal("splash");

                mon1.transform(mon2);

                // Transform target switches out then back in.
                const mon3 = new Pokemon("magikarp");
                mon3.switchInto(mon2);
                mon2.switchInto(mon3);

                mon1.moveset.reveal("splash");
                mon1.moveset.reveal("tackle");
                mon1.moveset.reveal("takedown");
                mon1.moveset.reveal("doubleedge");

                expect(mon2.moveset.get("splash")).to.not.be.null;
                expect(mon2.moveset.get("tackle")).to.not.be.null;
                expect(mon2.moveset.get("takedown")).to.not.be.null;
                expect(mon2.moveset.get("doubleedge")).to.not.be.null;
            });
        });
    });
