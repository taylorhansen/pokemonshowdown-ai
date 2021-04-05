import { expect } from "chai";
import "mocha";
import * as dex from "../../../src/battle/dex/dex";
import { BattleState } from "../../../src/battle/state/BattleState";
import { Pokemon } from "../../../src/battle/state/Pokemon";
import { smeargle } from "../../helpers/switchOptions";

describe("Pokemon", function()
{
    function switchOut(mon: Pokemon)
    {
        // create a dummy Pokemon that will replace the given one
        const other = new Pokemon("smeargle", false);
        other.switchInto(mon);
    }

    describe("#active", function()
    {
        it("Should be inactive initially", function()
        {
            const mon = new Pokemon("smeargle", /*hpPercent*/false);
            expect(mon.active).to.be.false;
        });
    });

    describe("#formChange()", function()
    {
        describe("perm = false", function()
        {
            it("Should set override species", function()
            {
                const mon = new Pokemon("magikarp", false);
                mon.switchInto();

                mon.formChange("charmander", 100);
                expect(mon.species).to.equal("charmander");
                expect(mon.volatile.overrideTraits!.species.name)
                    .to.equal("charmander");
                expect(mon.baseTraits.species.name).to.equal("magikarp");
            });
        });

        describe("perm = true", function()
        {
            it("Should set override and base species", function()
            {
                const mon = new Pokemon("magikarp", false);
                mon.switchInto();

                mon.formChange("charmander", 100, true);
                expect(mon.species).to.equal("charmander");
                expect(mon.volatile.overrideTraits!.species.name)
                    .to.equal("charmander");
                expect(mon.baseTraits.species.name).to.equal("charmander");
            });

            it("Should not set base species if transformed", function()
            {
                const mon = new Pokemon("magikarp", false);
                mon.switchInto();
                mon.volatile.transformed = true;

                mon.formChange("charmander", 100, true);
                expect(mon.species).to.equal("charmander");
                expect(mon.volatile.overrideTraits!.species.name)
                    .to.equal("charmander");
                expect(mon.baseTraits.species.name).to.equal("magikarp");
            });
        });
    });

    describe("#ability methods", function()
    {
        it("Should be defined if species has one ability", function()
        {
            const mon = new Pokemon("arceus", false);
            expect(mon.ability).to.equal("multitype");
        });

        it("Should not be defined if species has more than one ability",
        function()
        {
            const mon = new Pokemon("togepi", false);
            expect(mon.ability).to.be.empty;
        });

        describe("#setAbility()", function()
        {
            it("Should narrow ability if not already", function()
            {
                const mon = new Pokemon("magikarp", false);
                const ability = mon.traits.ability;

                mon.setAbility("swiftswim");
                expect(ability).to.equal(mon.traits.ability);
                expect(mon.traits.ability.definiteValue).to.equal("swiftswim");
            });

            it("Should override ability", function()
            {
                const mon = new Pokemon("smeargle", false);
                mon.switchInto();
                const ability = mon.traits.ability;
                ability.remove("technician");

                mon.setAbility("technician");
                expect(ability).to.not.equal(mon.traits.ability);
                expect(mon.traits.ability.definiteValue).to.equal("technician");
            });
        });
    });

    describe("#types", function()
    {
        it("Should get types", function()
        {
            const mon = new Pokemon("kingdra", false);
            expect(mon.types).to.have.members(["water", "dragon"]);
        });

        it("Should include VolatileStatus#addedType", function()
        {
            const mon = new Pokemon("kingdra", false);
            mon.switchInto();
            mon.volatile.addedType = "grass";
            expect(mon.types).to.have.members(["water", "dragon", "grass"]);
        });

        it("Should remove flying type if roost", function()
        {
            const mon = new Pokemon("pidgey", false);
            mon.switchInto();
            expect(mon.types).to.have.members(["normal", "flying"]);
            mon.volatile.roost = true;
            expect(mon.types).to.have.members(["normal"]);
        });
    });

    describe("#setItem()", function()
    {
        it("Should narrow item", function()
        {
            const mon = new Pokemon("magikarp", true); // opponent
            expect(mon.item.definiteValue).to.be.null;

            mon.setItem("lifeorb");
            expect(mon.item.definiteValue).to.equal("lifeorb");
        });

        it("Should re-narrow item if gained", function()
        {
            const mon = new Pokemon("magikarp", true);
            const item = mon.item;
            item.narrow("leftovers");

            mon.setItem("lifeorb", /*gained*/true);
            // old item reference stays the same
            expect(item.definiteValue).to.equal("leftovers");
            // new item reference gets created
            expect(mon.item).to.not.equal(item);
            expect(mon.item.definiteValue).to.equal("lifeorb");
        });

        describe("recycle", function()
        {
            it("Should move #lastItem ref to #item and reset #lastItem",
            function()
            {
                const mon = new Pokemon("magikarp", true);

                // indicate that an item was consumed
                mon.removeItem(/*consumed*/true);
                const item = mon.item;
                const lastItem = mon.lastItem;

                // old item being brought back via recycle
                mon.setItem("sitrusberry", /*gained*/"recycle");

                // original #lastItem ref should be moved to #item
                expect(mon.item).to.equal(lastItem,
                    "#lastItem reference was not moved to #item");

                // new #item ref should also be narrowed to the parameter
                expect(mon.item.definiteValue).to.equal("sitrusberry");

                // original #item ref should become garbage
                expect(mon.item).to.not.equal(item,
                    "#item still has its original reference");
                expect(mon.lastItem).to.not.equal(item,
                    "#lastItem was set to the original #item reference");

                // original #lastItem ref should be replaced by a new obj
                expect(mon.lastItem).to.not.equal(lastItem,
                    "#lastItem was not reset");
                expect(mon.lastItem.definiteValue).to.equal("none");
            });

            it("Should throw if (unknown) recycled item mismatches", function()
            {
                const mon = new Pokemon("magikarp", true);

                // consumed item is unknown but is definitely not lifeorb
                mon.item.remove("lifeorb");
                mon.removeItem(/*consumed*/true);

                expect(() => mon.setItem("lifeorb", /*gained*/"recycle"))
                    .to.throw(Error,
                        "Pokemon gained 'lifeorb' via Recycle but last item " +
                        "was '<unknown>'");
            });

            it("Should throw if recycled item mismatches", function()
            {
                const mon = new Pokemon("magikarp", true);
                // indicate that an item was consumed
                mon.setItem("sitrusberry");
                mon.removeItem("sitrusberry");
                expect(() => mon.setItem("lifeorb", /*gained*/"recycle"))
                    .to.throw(Error,
                        "Pokemon gained 'lifeorb' via Recycle but last item " +
                        "was 'sitrusberry'");
            });
        });

        describe("#volatile.unburden", function()
        {
            it("Should not set unburden normally", function()
            {
                const mon = new Pokemon("magikarp", true);
                mon.setItem("lifeorb");

                mon.switchInto();
                expect(mon.volatile.unburden).to.be.false;
            });

            it("Should not set unburden if revealed to have no item", function()
            {
                const mon = new Pokemon("magikarp", true);
                mon.setItem("none");

                mon.switchInto();
                expect(mon.volatile.unburden).to.be.false;
            });

            it("Should set unburden if item was just removed", function()
            {
                const mon = new Pokemon("magikarp", true);
                mon.switchInto();

                mon.setItem("none", /*gained*/true);
                expect(mon.volatile.unburden).to.be.true;
            });
        });

        describe("#volatile.choiceLock", function()
        {
            it("Should reset choiceLock if revealed non-choice item", function()
            {
                const mon = new Pokemon("magikarp", true);
                mon.switchInto();
                mon.volatile.choiceLock = "test";

                mon.setItem("lifeorb");
                expect(mon.volatile.choiceLock).to.be.null;
            });

            it("Should not reset choiceLock if revealed choice item", function()
            {
                const mon = new Pokemon("magikarp", true);
                mon.switchInto();
                mon.volatile.choiceLock = "test";

                mon.setItem("choiceband");
                expect(mon.volatile.choiceLock).to.equal("test");
            });
        });
    });

    describe("#removeItem()", function()
    {
        it("Should remove item", function()
        {
            const mon = new Pokemon("magikarp", true);
            const item = mon.item;
            item.narrow("focussash");

            mon.removeItem(/*consumed*/false);
            // old item reference stays the same
            expect(item.definiteValue).to.equal("focussash");
            // new item reference gets created
            expect(mon.item).to.not.equal(item);
            expect(mon.item.definiteValue).to.equal("none");
        });

        describe("#volatile.unburden", function()
        {
            it("Should set unburden if item was just removed", function()
            {
                const mon = new Pokemon("magikarp", true);
                mon.switchInto();

                mon.removeItem(/*consumed*/false);
                expect(mon.volatile.unburden).to.be.true;
            });
        });

        describe("#lastItem", function()
        {
            it("Should not set lastItem if no consumed parameter", function()
            {
                const mon = new Pokemon("magikarp", true);
                mon.switchInto();
                mon.setItem("leftovers");
                const item = mon.item;

                mon.removeItem(/*consumed*/false);
                // current item reference is gone
                expect(mon.item.definiteValue).to.equal("none");

                // old item reference is not moved to lastItem
                expect(mon.lastItem).to.not.equal(item);
                expect(mon.lastItem.definiteValue).to.equal("none");
            });

            it("Should set lastItem if consumed parameter was provided",
            function()
            {
                const mon = new Pokemon("magikarp", true);
                const item = mon.item;
                mon.switchInto();
                mon.setItem("leftovers");
                expect(mon.lastItem.definiteValue).to.equal("none");

                mon.removeItem("leftovers");
                // current held item possibility gets reassigned to lastItem
                expect(mon.lastItem).to.equal(item);
                expect(mon.lastItem.definiteValue).to.equal("leftovers");
            });
        });
    });

    describe("#moveset methods", function()
    {
        describe("constructor", function()
        {
            it("Should override movepool", function()
            {
                // if the moves argument wasn't provided, the moves would've
                //  been inserted in the default movepool's order
                const moves = [...dex.pokemon.magikarp.movepool].reverse();
                expect(moves).to.have.lengthOf(4);
                const mon = new Pokemon("magikarp", false, 100, moves);
                expect([...mon.moveset.moves].map(m => m[0]))
                    .to.have.ordered.members(moves)
            });
        });

        describe("#mimic()", function()
        {
            it("Should add override move with 5 pp", function()
            {
                const mon = new Pokemon("smeargle", false);
                mon.switchInto();
                mon.moveset.reveal("mimic");
                mon.volatile.choiceLock = "test"; // also test choice lock

                mon.mimic("tackle");
                expect(mon.moveset.get("mimic")).to.be.null;
                expect(mon.moveset.get("tackle")).to.not.be.null;
                expect(mon.moveset.get("tackle")!.pp).to.equal(5);
                expect(mon.volatile.choiceLock).to.be.null;
            });

            it("Should clear on switch out", function()
            {
                const mon = new Pokemon("smeargle", false);
                mon.switchInto();
                mon.moveset.reveal("mimic");

                mon.mimic("tackle");
                // switch-out should revert
                switchOut(mon);
                expect(mon.moveset.get("tackle")).to.be.null;
                expect(mon.moveset.get("mimic")).to.not.be.null;
            });
        });

        describe("#sketch()", function()
        {
            it("Should add replacement Move with minimum maxpp", function()
            {
                const mon = new Pokemon("smeargle", false);
                mon.switchInto();
                mon.moveset.reveal("sketch");
                mon.volatile.choiceLock = "test"; // also test choice lock

                mon.sketch("tackle");
                expect(mon.volatile.choiceLock).to.be.null;
                // switch-out should not matter
                switchOut(mon);
                expect(mon.moveset.get("sketch")).to.be.null;
                expect(mon.moveset.get("tackle")).to.not.be.null;
                expect(mon.moveset.get("tackle")!.pp).to.equal(35);
            });
        });
    });

    describe("#happiness", function()
    {
        it("Should be null initially", function()
        {
            const mon = new Pokemon("magikarp", false);
            expect(mon).to.have.property("happiness", null);
        });

        it("Should cap at 255 max", function()
        {
            const mon = new Pokemon("magikarp", false);
            mon.happiness = 500;
            expect(mon).to.have.property("happiness", 255);
        });

        it("Should cap at 0 min", function()
        {
            const mon = new Pokemon("magikarp", false);
            mon.happiness = -500;
            expect(mon).to.have.property("happiness", 0);
        });

        // TODO: is this necessary?
        it("Should be resettable", function()
        {
            const mon = new Pokemon("magikarp", false);
            mon.happiness = 255;
            expect(mon).to.have.property("happiness", 255);
            mon.happiness = null;
            expect(mon).to.have.property("happiness", null);
        });
    });

    describe("#majorStatus", function()
    {
        it("Should cure nightmare if woken up", function()
        {
            const mon = new Pokemon("magikarp", false);
            mon.switchInto();
            mon.majorStatus.afflict("slp");
            mon.volatile.nightmare = true;
            mon.majorStatus.cure();
            expect(mon.volatile.nightmare).to.be.false;
        });
    });

    describe("#isGrounded/#maybeGrounded", function()
    {
        it("Should not be grounded if flying type", function()
        {
            const mon = new Pokemon("pidgey", false);
            // remove iron ball possibility
            mon.item.narrow("lifeorb");
            expect(mon.grounded).to.be.false;
        });

        it("Should be grounded if not flying type", function()
        {
            const mon = new Pokemon("magikarp", false);
            expect(mon.grounded).to.be.true;
        });

        it("Should be grounded if gravity is active", function()
        {
            const state = new BattleState();
            state.status.gravity.start();

            state.teams.us.size = 1;
            const mon = state.teams.us.switchIn(
                {species: "pidgey", level: 1, gender: "M", hp: 11, hpMax: 11})!;
            expect(mon.grounded).to.be.true;
        });

        it("Should be grounded if ingrain", function()
        {
            const mon = new Pokemon("pidgey", false);
            mon.switchInto();
            mon.volatile.ingrain = true;
            expect(mon.grounded).to.be.true;
        });

        it("Should be grounded if holding ironball", function()
        {
            const mon = new Pokemon("pidgey", false);
            mon.item.narrow("ironball");
            expect(mon.grounded).to.be.true;
        });

        it("Should possibly be grounded if able to hold ironball", function()
        {
            const mon = new Pokemon("pidgey", false);
            expect(mon.grounded).to.be.null;
        });

        it("Should ignore ironball if Embargo", function()
        {
            const mon = new Pokemon("pidgey", false);
            mon.switchInto();
            mon.item.narrow("ironball");
            mon.volatile.embargo.start();
            expect(mon.grounded).to.be.false;
        });

        it("Should ignore ironball if klutz", function()
        {
            const mon = new Pokemon("pidgey", false); // flying type
            mon.switchInto();
            mon.setAbility("klutz");
            mon.item.narrow("ironball");
            expect(mon.grounded).to.be.false;
        });

        it("Should ignore klutz if ability suppressed", function()
        {
            const mon = new Pokemon("pidgey", false); // flying type
            mon.switchInto();
            mon.setAbility("klutz");
            mon.item.narrow("ironball");
            mon.volatile.suppressAbility = true;
            expect(mon.grounded).to.be.true;
        });

        it("Should not be grounded if magnetrise", function()
        {
            const mon = new Pokemon("magikarp", false);
            mon.switchInto();
            // remove iron ball possibility
            mon.item.narrow("leftovers");
            mon.volatile.magnetRise.start();
            expect(mon.grounded).to.be.false;
        });

        it("Should still consider ironball if magnetrise", function()
        {
            const mon = new Pokemon("magikarp", false);
            mon.switchInto();
            mon.volatile.magnetRise.start();
            expect(mon.grounded).to.be.null;
        });

        it("Should not be grounded if levitate ability", function()
        {
            const mon = new Pokemon("bronzong", false);
            mon.switchInto();
            mon.setAbility("levitate");
            // remove iron ball possibility
            mon.item.narrow("leftovers");
            expect(mon.grounded).to.be.false;
        });

        it("Should possibly be grounded if able to not have levitate ability",
        function()
        {
            // can have levitate or heatproof
            const mon = new Pokemon("bronzong", false);
            // remove iron ball possibility
            mon.item.narrow("leftovers");
            mon.switchInto();
            expect(mon.grounded).to.be.null;
        });
    });

    // TODO
    describe("#inactive()", function() {});
    describe("#preTurn()", function() {});
    describe("#postTurn()", function() {});

    describe("#switchInto()", function()
    {
        it("Should become active", function()
        {
            const mon = new Pokemon("magikarp", false);
            expect(() => mon.volatile).to.throw(Error,
                "Pokemon is currently inactive");
            mon.switchInto();
            expect(mon.active).to.be.true;
        });

        it("Should transfer VolatileStatus reference", function()
        {
            const mon = new Pokemon("magikarp", false);
            mon.switchInto();
            const v = mon.volatile;

            const other = new Pokemon("magikarp", false);
            other.switchInto(mon);
            expect(v).to.equal(other.volatile);
        });

        it("Should set VolatileStatus#overrideTraits", function()
        {
            const mon = new Pokemon("magikarp", false);
            mon.switchInto();
            expect(mon.baseTraits).to.not.equal(mon.volatile.overrideTraits);
            expect(mon.baseTraits.species)
                .to.equal(mon.volatile.overrideTraits!.species);
            expect(mon.baseTraits.ability)
                .to.equal(mon.volatile.overrideTraits!.ability);
            expect(mon.baseTraits.stats)
                .to.equal(mon.volatile.overrideTraits!.stats);
            expect(mon.baseTraits.types)
                .to.equal(mon.volatile.overrideTraits!.types);
        });

        it("Should become inactive if another switches into it", function()
        {
            const mon = new Pokemon("magikarp", false);
            mon.switchInto();
            switchOut(mon);
            expect(mon.active).to.be.false;
        });

        it("Should clear toxic turns when switching out", function()
        {
            const mon = new Pokemon("magikarp", false);
            mon.majorStatus.afflict("tox");
            mon.majorStatus.tick();
            expect(mon.majorStatus.turns).to.equal(2);
            switchOut(mon);
            expect(mon.majorStatus.turns).to.equal(1);
        });

        it("Should not clear other major status turns when switching out",
        function()
        {
            const mon = new Pokemon("magikarp", false);
            mon.majorStatus.afflict("slp");
            mon.majorStatus.tick();
            expect(mon.majorStatus.turns).to.equal(2);
            switchOut(mon);
            expect(mon.majorStatus.turns).to.equal(2);
        });

        it("Should reset mirror move", function()
        {
            const state = new BattleState();
            state.teams.us.size = 1;
            const opp = state.teams.us.switchIn(smeargle)!;
            state.teams.them.size = 1;
            const mon = state.teams.them.switchIn(smeargle)!;

            opp.volatile.mirrorMove = "tackle";
            switchOut(mon);
            expect(opp.volatile.mirrorMove).to.be.null;
        });

        it("Should clear volatile when switching out and back in", function()
        {
            const mon = new Pokemon("magikarp", false);
            mon.switchInto();
            mon.volatile.lockedMove.start("thrash");

            switchOut(mon);
            mon.switchInto();
            expect(mon.volatile.lockedMove.isActive).to.be.false;
        });

        describe("selfSwitch = true", function()
        {
            it("Should copy lastMove", function()
            {
                const mon = new Pokemon("magikarp", false);
                mon.switchInto();
                mon.volatile.lastMove = "tackle";

                const mon2 = new Pokemon("smeargle", false);
                mon2.switchInto(mon, /*selfSwitch*/ true);
                expect(mon2.volatile.lastMove).to.equal("tackle");
            });

            it("Should not copy lastMove if switch-in can't have the move",
            function()
            {
                const mon = new Pokemon("magikarp", false);
                mon.switchInto();
                mon.volatile.lastMove = "tackle";

                const mon2 = new Pokemon("smeargle", false);
                mon2.moveset.inferDoesntHave(["tackle"]);
                mon2.switchInto(mon, /*selfSwitch*/ true);
                expect(mon2.volatile.lastMove).to.be.null;
            });
        });

        describe("selfSwitch = copyvolatile", function()
        {
            it("Should copy passable statuses", function()
            {
                const mon = new Pokemon("magikarp", false);
                mon.switchInto();
                mon.volatile.boosts.atk = 1;

                const other = new Pokemon("magikarp", false);
                other.switchInto(mon, "copyvolatile");
                expect(other.volatile.boosts.atk).to.equal(1);
            });

            it("Should restart lockon", function()
            {
                const mon = new Pokemon("magikarp", false);
                mon.switchInto();
                const target = new Pokemon("gyarados", true);
                target.switchInto();
                mon.volatile.lockOn(target.volatile);
                mon.postTurn();
                expect(mon.volatile.lockOnTurns.isActive).to.be.true;
                expect(mon.volatile.lockOnTurns.turns).to.equal(1);

                const bench = new Pokemon("seaking", false);
                bench.switchInto(mon, "copyvolatile");
                expect(bench.volatile.lockOnTurns.isActive).to.be.true;
                expect(bench.volatile.lockOnTurns.turns).to.equal(0);
            });

            it("Should reset nightmare if recipient is not asleep", function()
            {
                const mon = new Pokemon("magikarp", false);
                mon.switchInto();
                mon.majorStatus.afflict("slp");
                mon.volatile.nightmare = true;

                const other = new Pokemon("magikarp", false);
                other.switchInto(mon, "copyvolatile");
                expect(other.volatile.nightmare).to.be.false;
            });

            it("Should copy nightmare if recipient is asleep", function()
            {
                const mon = new Pokemon("magikarp", false);
                mon.switchInto();
                mon.majorStatus.afflict("slp");
                mon.volatile.nightmare = true;

                const other = new Pokemon("magikarp", false);
                other.majorStatus.afflict("slp");
                other.switchInto(mon, "copyvolatile");
                expect(other.volatile.nightmare).to.be.true;
            });
        });
    });

    describe("#faint()", function()
    {
        it("Should be fainted initially", function()
        {
            const mon = new Pokemon("magikarp", false);
            expect(mon.fainted).to.be.true;
        });

        it("Should not be fainted after restoring hp", function()
        {
            const mon = new Pokemon("magikarp", false);
            mon.hp.set(100, 100);
            expect(mon.fainted).to.be.false;
        });

        it("Should be fainted after fainting", function()
        {
            const mon = new Pokemon("magikarp", false);
            mon.faint();
            expect(mon.fainted).to.be.true;
        });

        it("Should set hp to 0 after fainting", function()
        {
            const mon = new Pokemon("magikarp", false);
            mon.faint();
            expect(mon.hp.current).to.equal(0);
            expect(mon.hp.max).to.equal(0);
        });
    });

    // TODO
    describe("#trapped()", function() { it("TODO"); });

    describe("#transform()", function()
    {
        it("Should copy known details and reset choice lock", function()
        {
            const mon1 = new Pokemon("smeargle", false);
            mon1.switchInto();
            mon1.volatile.choiceLock = "splash";
            mon1.hpType.narrow("fire");
            expect(mon1.moveset.get("splash")).to.be.null;

            const mon2 = new Pokemon("bulbasaur", true);
            mon2.switchInto();
            mon2.volatile.boosts.atk = 2;
            mon2.volatile.addedType = "bug";
            mon2.moveset.reveal("splash");
            mon2.hpType.narrow("ice");

            mon1.transform(mon2);

            expect(mon1.volatile.transformed).to.be.true;
            expect(mon1.species).to.equal("bulbasaur");
            expect(mon1.ability).to.equal(mon2.ability);
            expect(mon1.volatile.addedType).to.equal("bug");
            expect(mon1.volatile.boosts.atk).to.equal(2);
            expect(mon1.volatile.choiceLock).to.be.null;
            expect(mon1.volatile.overrideTraits!.species)
                .to.equal(mon2.traits.species);
            expect(mon1.volatile.overrideTraits!.stats)
                .to.not.equal(mon2.traits.stats);
            expect(mon1.traits.stats.level).to.equal(mon2.traits.stats.level);
            expect(mon1.traits.stats.hp).to.not.equal(mon2.traits.stats.hp);
            expect(mon1.traits.stats.atk).to.equal(mon2.traits.stats.atk);
            expect(mon1.traits.stats.def).to.equal(mon2.traits.stats.def);
            expect(mon1.traits.stats.spa).to.equal(mon2.traits.stats.spa);
            expect(mon1.traits.stats.spd).to.equal(mon2.traits.stats.spd);
            expect(mon1.traits.stats.spe).to.equal(mon2.traits.stats.spe);
            expect(mon1.traits.stats.hpType).to.equal(mon2.traits.stats.hpType);
            expect(mon1.types).to.have.members(mon2.types);
            expect(mon1.moveset.get("splash")).to.not.be.null;
            expect(mon1.hpType).to.equal(mon2.hpType);

            // should still keep base traits
            expect(mon1.baseTraits.species).to.equal(dex.pokemon.smeargle);
            expect(mon1.baseTraits.ability.possibleValues)
                .to.have.keys(dex.pokemon.smeargle.abilities);
            expect(mon1.baseTraits.stats.hpType.possibleValues)
                .to.have.keys("fire");
        });

        it("Should link move inference", function()
        {
            const mon1 = new Pokemon("smeargle", false);
            mon1.switchInto();

            const mon2 = new Pokemon("bulbasaur", true);
            mon2.switchInto();

            mon1.transform(mon2);
            mon1.moveset.reveal("splash");
            mon2.moveset.reveal("tackle");

            expect(mon1.moveset.get("tackle")).to.not.be.null;
            expect(mon2.moveset.get("splash")).to.not.be.null;
        });

        it("Should link ability inference but not change", function()
        {
            const mon1 = new Pokemon("smeargle", false);
            mon1.switchInto();

            const mon2 = new Pokemon("bronzong", true);
            mon2.switchInto();

            mon1.transform(mon2);
            mon2.setAbility("heatproof");
            mon2.setAbility("pressure");

            expect(mon1.ability).to.equal("heatproof");
        });

        it("Should link stat inference except hp", function()
        {
            const mon1 = new Pokemon("magikarp", false);
            mon1.switchInto();

            const mon2 = new Pokemon("bronzong", true);
            mon2.switchInto();
            expect(mon2.traits.stats.hp.min).to.equal(244);
            expect(mon2.traits.stats.hp.max).to.equal(338);

            mon1.transform(mon2);
            mon1.traits.stats.hp.set(200); // shouldn't transfer
            mon1.traits.stats.atk.set(200);
            mon2.traits.stats.spe.set(100);

            expect(mon2.traits.stats.hp.min).to.equal(244);
            expect(mon2.traits.stats.hp.max).to.equal(338);
            expect(mon2.traits.stats.atk.min).to.equal(200);
            expect(mon2.traits.stats.atk.max).to.equal(200);
            expect(mon1.traits.stats.spe.min).to.equal(100);
            expect(mon1.traits.stats.spe.max).to.equal(100);
        });
    });
});
