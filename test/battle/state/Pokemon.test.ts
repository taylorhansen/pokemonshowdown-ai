import { expect } from "chai";
import "mocha";
import { berries, dex } from "../../../src/battle/dex/dex";
import { rolloutMoves } from "../../../src/battle/dex/dex-util";
import { BattleState } from "../../../src/battle/state/BattleState";
import { Pokemon } from "../../../src/battle/state/Pokemon";
import { Team } from "../../../src/battle/state/Team";

describe("Pokemon", function()
{
    function switchOut(mon: Pokemon)
    {
        // create a dummy Pokemon that will replace the given one
        const other = new Pokemon("Magikarp", false);
        other.switchInto(mon);
    }

    describe("#active", function()
    {
        it("Should be inactive initially", function()
        {
            const mon = new Pokemon("Magikarp", /*hpPercent*/false);
            expect(mon.active).to.be.false;
        });
    });

    describe("#formChange()", function()
    {
        describe("perm = false", function()
        {
            it("Should set override species", function()
            {
                const mon = new Pokemon("Magikarp", false);
                mon.switchInto();
                mon.formChange("Charmander");
                expect(mon.species).to.equal("Charmander");
                expect(mon.volatile.overrideTraits.species.possibleValues)
                    .to.have.keys("Charmander");
                expect(mon.baseTraits.species.possibleValues)
                    .to.have.keys("Magikarp");
            });
        });

        describe("perm = true", function()
        {
            it("Should set override and base species", function()
            {
                const mon = new Pokemon("Magikarp", false);
                mon.switchInto();
                mon.formChange("Charmander", true);
                expect(mon.species).to.equal("Charmander");
                expect(mon.volatile.overrideTraits.species.possibleValues)
                    .to.have.keys("Charmander");
                expect(mon.baseTraits.species.possibleValues)
                    .to.have.keys("Charmander");
            });

            it("Should not set base species if transformed", function()
            {
                const mon = new Pokemon("Magikarp", false);
                mon.switchInto();
                mon.volatile.transformed = true;
                mon.formChange("Charmander", true);
                expect(mon.species).to.equal("Charmander");
                expect(mon.volatile.overrideTraits.species.possibleValues)
                    .to.have.keys("Charmander");
                expect(mon.baseTraits.species.possibleValues)
                    .to.have.keys("Magikarp");
            });
        });
    });

    describe("#ability", function()
    {
        it("Should be defined if species has one ability", function()
        {
            const mon = new Pokemon("Arceus", false);
            expect(mon.ability).to.equal("multitype");
        });

        it("Should not be defined if species has more than one ability",
        function()
        {
            const mon = new Pokemon("Togepi", false);
            expect(mon.ability).to.be.empty;
        });
    });

    describe("#types", function()
    {
        it("Should get types", function()
        {
            const mon = new Pokemon("Kingdra", false);
            expect(mon.types).to.have.members(["water", "dragon"]);
        });

        it("Should include VolatileStatus#addedType", function()
        {
            const mon = new Pokemon("Kingdra", false);
            mon.switchInto();
            mon.volatile.addedType = "grass";
            expect(mon.types).to.have.members(["water", "dragon", "grass"]);
        });
    });

    describe("#setItem()", function()
    {
        it("Should narrow item", function()
        {
            const mon = new Pokemon("Magikarp", true); // opponent
            expect(mon.item.definiteValue).to.be.null;

            mon.setItem("lifeorb");
            expect(mon.item.definiteValue).to.not.be.null;
            expect(mon.item.definiteValue!.name).to.equal("lifeorb");
        });

        it("Should re-narrow item if gained", function()
        {
            const mon = new Pokemon("Magikarp", true);
            const item = mon.item;
            item.narrow("leftovers");

            mon.setItem("lifeorb", /*gained*/true);
            // old item reference stays the same
            expect(item.definiteValue).to.not.be.null;
            expect(item.definiteValue!.name).to.equal("leftovers");
            // new item reference gets created
            expect(mon.item).to.not.equal(item);
            expect(mon.item.definiteValue).to.not.be.null;
            expect(mon.item.definiteValue!.name).to.equal("lifeorb");
        });

        describe("recycle", function()
        {
            it("Should move #lastItem ref to #item and reset #lastItem",
            function()
            {
                const mon = new Pokemon("Magikarp", true);

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
                expect(mon.item.definiteValue).to.not.be.null;
                expect(mon.item.definiteValue!.name).to.equal("sitrusberry");

                // original #item ref should become garbage
                expect(mon.item).to.not.equal(item,
                    "#item still has its original reference");
                expect(mon.lastItem).to.not.equal(item,
                    "#lastItem was set to the original #item reference");

                // original #lastItem ref should be replaced by a new obj
                expect(mon.lastItem).to.not.equal(lastItem,
                    "#lastItem was not reset");
                expect(mon.lastItem.definiteValue).to.not.be.null;
                expect(mon.lastItem.definiteValue!.name).to.equal("none");
            });

            it("Should throw if (unknown) recycled item mismatches", function()
            {
                const mon = new Pokemon("Magikarp", true);

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
                const mon = new Pokemon("Magikarp", true);
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
                const mon = new Pokemon("Magikarp", true);
                mon.setItem("lifeorb");

                mon.switchInto();
                expect(mon.volatile.unburden).to.be.false;
            });

            it("Should not set unburden if revealed to have no item", function()
            {
                const mon = new Pokemon("Magikarp", true);
                mon.setItem("none");

                mon.switchInto();
                expect(mon.volatile.unburden).to.be.false;
            });

            it("Should set unburden if item was just removed", function()
            {
                const mon = new Pokemon("Magikarp", true);
                mon.switchInto();

                mon.setItem("none", /*gained*/true);
                expect(mon.volatile.unburden).to.be.true;
            });
        });
    });

    describe("#removeItem()", function()
    {
        it("Should remove item", function()
        {
            const mon = new Pokemon("Magikarp", true);
            const item = mon.item;
            item.narrow("focussash");

            mon.removeItem(/*consumed*/false);
            // old item reference stays the same
            expect(item.definiteValue).to.not.be.null;
            expect(item.definiteValue!.name).to.equal("focussash");
            // new item reference gets created
            expect(mon.item).to.not.equal(item);
            expect(mon.item.definiteValue).to.not.be.null;
            expect(mon.item.definiteValue!.name).to.equal("none");
        });

        describe("#volatile.unburden", function()
        {
            it("Should set unburden if item was just removed", function()
            {
                const mon = new Pokemon("Magikarp", true);
                mon.switchInto();

                mon.removeItem(/*consumed*/false);
                expect(mon.volatile.unburden).to.be.true;
            });
        });

        describe("#lastItem", function()
        {
            it("Should not set lastItem if no consumed parameter", function()
            {
                const mon = new Pokemon("Magikarp", true);
                mon.switchInto();
                mon.setItem("leftovers");
                const item = mon.item;

                mon.removeItem(/*consumed*/false);
                // current item reference is gone
                expect(mon.item.definiteValue).to.not.be.null;
                expect(mon.item.definiteValue!.name).to.equal("none");

                // old item reference is not moved to lastItem
                expect(mon.lastItem).to.not.equal(item);
                expect(mon.lastItem.definiteValue).to.not.be.null;
                expect(mon.lastItem.definiteValue!.name).to.equal("none");
            });

            it("Should set lastItem if consumed parameter was provided",
            function()
            {
                const mon = new Pokemon("Magikarp", true);
                const item = mon.item;
                mon.switchInto();
                mon.setItem("leftovers");
                expect(mon.lastItem.definiteValue).to.not.be.null;
                expect(mon.lastItem.definiteValue!.name).to.equal("none");

                mon.removeItem("leftovers");
                // current held item possibility gets reassigned to lastItem
                expect(mon.lastItem).to.equal(item);
                expect(mon.lastItem.definiteValue).to.not.be.null;
                expect(mon.lastItem.definiteValue!.name).to.equal("leftovers");
            });
        });
    });

    describe("#moveset methods", function()
    {
        describe("#useMove()", function()
        {
            it("Should use and reveal move", function()
            {
                const mon = new Pokemon("Magikarp", false);
                mon.switchInto();
                expect(mon.moveset.get("splash")).to.be.null;
                mon.useMove({moveId: "splash", targets: [mon]});
                expect(mon.moveset.get("splash")!.pp).to.equal(63);
            });

            it("Should not reveal struggle as a move slot", function()
            {
                const mon = new Pokemon("Magikarp", false);
                mon.switchInto();
                mon.useMove({moveId: "struggle", targets: [mon]});
                expect(mon.moveset.get("struggle")).to.be.null;
            });

            describe("reveal = false", function()
            {
                it("Should not reveal move", function()
                {
                    const mon = new Pokemon("Magikarp", false);
                    mon.switchInto();
                    mon.useMove(
                        {moveId: "splash", targets: [mon], reveal: false});
                    expect(mon.moveset.get("splash")).to.be.null;
                });
            });

            describe("pressure ability handling", function()
            {
                let target: Pokemon;

                beforeEach("Setup pressure mon", function()
                {
                    target = new Pokemon("Zapdos", /*hpPercent*/true);
                    target.switchInto();
                    target.traits.setAbility("pressure");
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
                    mon.switchInto();
                    mon.useMove({moveId: "tackle", targets: [target]});
                    expect(mon.moveset.get("tackle")!.pp).to.equal(54);
                });

                it("Should not use double pp if not targeted", function()
                {
                    const mon = new Pokemon("Magikarp", false);
                    mon.switchInto();
                    mon.useMove({moveId: "tackle", targets: [mon]});
                    expect(mon.moveset.get("tackle")!.pp).to.equal(55);
                });

                it("Should not use double pp if mold breaker", function()
                {
                    const mon = new Pokemon("Rampardos", false);
                    mon.switchInto();
                    mon.traits.setAbility("moldbreaker");
                    mon.useMove({moveId: "tackle", targets: [target]});
                    expect(mon.moveset.get("tackle")!.pp).to.equal(55);
                });
            });

            describe("two-turn", function()
            {
                it("Should start two-turn if prepare=true", function()
                {
                    const mon = new Pokemon("Magikarp", false);
                    mon.switchInto();
                    mon.useMove({moveId: "bounce", targets: [], prepare: true});

                    expect(mon.volatile.twoTurn.isActive).to.be.true;
                    expect(mon.volatile.twoTurn.type).to.equal("bounce");
                });

                it("Should release two-turn move", function()
                {
                    const mon = new Pokemon("Magikarp", false);
                    mon.switchInto();
                    mon.useMove({moveId: "bounce", targets: [], prepare: true});
                    mon.postTurn();

                    mon.useMove(
                        {moveId: "bounce", targets: [], reveal: "nopp"});
                    expect(mon.volatile.twoTurn.isActive).to.be.false;
                });
            });

            describe("Natural Gift move", function()
            {
                it("Should infer berry if successful", function()
                {
                    const mon = new Pokemon("Magikarp", false);
                    mon.switchInto();
                    const item = mon.item;
                    mon.useMove({moveId: "naturalgift", targets: []});

                    expect(mon.lastItem).to.equal(item,
                        "Item was not consumed");
                    expect(mon.lastItem.possibleValues)
                        .to.have.keys(...Object.keys(berries));
                });

                it("Should infer no berry if failed", function()
                {
                    const mon = new Pokemon("Magikarp", false);
                    mon.switchInto();
                    const item = mon.item;
                    mon.useMove(
                    {
                        moveId: "naturalgift", targets: [],
                        unsuccessful: "failed"
                    });

                    expect(mon.item).to.equal(item, "Item was consumed");
                    expect(mon.item.possibleValues)
                        .to.not.have.any.keys(...Object.keys(berries));
                });
            });

            describe("rollout-like moves", function()
            {
                for (const moveId of
                    Object.keys(rolloutMoves) as (keyof typeof rolloutMoves)[])
                {
                    it(`Should set ${moveId} if successful`, function()
                    {
                        const mon = new Pokemon("Magikarp", false);
                        mon.switchInto();
                        expect(mon.volatile.rollout.isActive).to.be.false;
                        mon.useMove({moveId, targets: []});
                        expect(mon.volatile.rollout.isActive).to.be.true;
                        expect(mon.volatile.rollout.type).to.equal(moveId);
                    });

                    it(`Should not set ${moveId} if unsuccessful`, function()
                    {
                        const mon = new Pokemon("Magikarp", false);
                        mon.switchInto();
                        expect(mon.volatile.rollout.isActive).to.be.false;
                        mon.useMove(
                            {moveId, targets: [], unsuccessful: "evaded"});
                        expect(mon.volatile.rollout.isActive).to.be.false;
                    });
                }
            });

            describe("destinybond", function()
            {
                it("Should reset #volatile#destinyBond", function()
                {
                    const mon = new Pokemon("Magikarp", false);
                    mon.switchInto();
                    mon.volatile.destinyBond = true;

                    mon.useMove({moveId: "splash", targets: [mon]});
                    expect(mon.volatile.destinyBond).to.be.false;
                });
            });

            describe("defensecurl", function()
            {
                it("Should set #volatile#defenseCurl if successful", function()
                {
                    const mon = new Pokemon("Magikarp", false);
                    mon.switchInto();
                    expect(mon.volatile.defenseCurl).to.be.false;
                    mon.useMove({moveId: "defensecurl", targets: [mon]});
                    expect(mon.volatile.defenseCurl).to.be.true;
                });

                it("Should not set #volatile#defenseCurl if unsuccessful",
                function()
                {
                    const mon = new Pokemon("Magikarp", false);
                    mon.switchInto();
                    expect(mon.volatile.defenseCurl).to.be.false;
                    mon.useMove(
                    {
                        moveId: "defensecurl", targets: [mon],
                        unsuccessful: "failed"
                    });
                    expect(mon.volatile.defenseCurl).to.be.false;
                });
            });

            describe("lockedmove", function()
            {
                it("Should not initially be active", function()
                {
                    const mon = new Pokemon("Magikarp", false);
                    mon.switchInto();
                    expect(mon.volatile.lockedMove.isActive).to.be.false;
                });

                it("Should lock move", function()
                {
                    const mon = new Pokemon("Magikarp", false);
                    mon.switchInto();
                    mon.useMove({moveId: "petaldance", targets: [mon]});
                    expect(mon.volatile.lockedMove.isActive).to.be.true;
                });

                it("Should not lock move if failed", function()
                {
                    const mon = new Pokemon("Magikarp", false);
                    mon.switchInto();
                    mon.volatile.lockedMove.start("petaldance");
                    mon.useMove(
                    {
                        moveId: "petaldance", targets: [mon],
                        unsuccessful: "failed"
                    });
                    expect(mon.volatile.lockedMove.isActive).to.be.false;
                });

                it("Should not lock move if evaded", function()
                {
                    const mon = new Pokemon("Magikarp", false);
                    mon.switchInto();
                    mon.volatile.lockedMove.start("petaldance");
                    mon.useMove(
                    {
                        moveId: "petaldance", targets: [mon],
                        unsuccessful: "evaded"
                    });
                    expect(mon.volatile.lockedMove.isActive).to.be.false;
                });
            });

            describe("magiccoat", function()
            {
                it("Should activate Magic Coat", function()
                {
                    const mon = new Pokemon("Magikarp", false);
                    mon.switchInto();
                    expect(mon.volatile.magicCoat).to.be.false;

                    mon.useMove({moveId: "magiccoat", targets: [mon]});
                    expect(mon.volatile.magicCoat).to.be.true;
                });
            });

            describe("minimize", function()
            {
                it("Should activate Minimize if used successfully", function()
                {
                    const mon = new Pokemon("Magikarp", false);
                    mon.switchInto();
                    expect(mon.volatile.minimize).to.be.false;

                    mon.useMove({moveId: "minimize", targets: [mon]});
                    expect(mon.volatile.minimize).to.be.true;
                });

                it("Should not activate Minimize if move failed", function()
                {
                    const mon = new Pokemon("Magikarp", false);
                    mon.switchInto();
                    expect(mon.volatile.minimize).to.be.false;

                    mon.useMove(
                    {
                        moveId: "minimize", targets: [mon],
                        unsuccessful: "failed"
                    });
                    expect(mon.volatile.minimize).to.be.false;
                });
            });

            function testTeamStatus(name: string, moveId: string,
                pred: (team: Team) => boolean): void
            {
                describe(name, function()
                {
                    function setup(failed: boolean): Team
                    {
                        const team = new Team("us");
                        team.size = 1;
                        const mon = team.switchIn("Magikarp", 100, "M", 200,
                            200)!;
                        mon.useMove(
                        {
                            moveId, targets: [mon],
                            unsuccessful: failed ? "failed" : undefined
                        });
                        return team;
                    }

                    it(`Should set ${name}`, function()
                    {
                        expect(pred(setup(false))).to.be.true;
                    });

                    it(`Should not set ${name} if failed=true`, function()
                    {
                        expect(pred(setup(true))).to.be.false;
                    });
                });
            }

            testTeamStatus("wish", "wish", team => team.status.wish.isActive);
            testTeamStatus("selfSwitch", "uturn",
                team => !!team.status.selfSwitch);
        });

        describe("#disableMove()", function()
        {
            it("Should disable move", function()
            {
                const mon = new Pokemon("Magikarp", false);
                mon.switchInto();
                mon.moveset.reveal("splash");
                expect(mon.volatile.disabledMoves[0].isActive).to.be.false;
                mon.disableMove("splash");
                expect(mon.volatile.disabledMoves[0].isActive).to.be.true;
            });

            // likely not actually possible but just in case
            it("Should reveal disabled move", function()
            {
                const mon = new Pokemon("Magikarp", false);
                mon.switchInto();
                expect(mon.moveset.get("splash")).to.be.null;
                mon.disableMove("splash");
                expect(mon.moveset.get("splash")).to.not.be.null;
                expect(mon.volatile.disabledMoves[0].isActive).to.be.true;
            });
        });

        describe("#mimic()", function()
        {
            it("Should add override move with 5 pp", function()
            {
                const mon = new Pokemon("Magikarp", false);
                mon.switchInto();
                mon.moveset.reveal("mimic");

                mon.mimic("tackle");
                expect(mon.moveset.get("mimic")).to.be.null;
                expect(mon.moveset.get("tackle")).to.not.be.null;
                expect(mon.moveset.get("tackle")!.pp).to.equal(5);
            });

            it("Should clear on switch out", function()
            {
                const mon = new Pokemon("Magikarp", false);
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
                const mon = new Pokemon("Magikarp", false);
                mon.switchInto();
                mon.moveset.reveal("sketch");

                mon.sketch("tackle");
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
            const mon = new Pokemon("Magikarp", false);
            expect(mon).to.have.property("happiness", null);
        });

        it("Should cap at 255 max", function()
        {
            const mon = new Pokemon("Magikarp", false);
            mon.happiness = 500;
            expect(mon).to.have.property("happiness", 255);
        });

        it("Should cap at 0 min", function()
        {
            const mon = new Pokemon("Magikarp", false);
            mon.happiness = -500;
            expect(mon).to.have.property("happiness", 0);
        });

        // TODO: is this necessary?
        it("Should be resettable", function()
        {
            const mon = new Pokemon("Magikarp", false);
            mon.happiness = 255;
            expect(mon).to.have.property("happiness", 255);
            mon.happiness = null;
            expect(mon).to.have.property("happiness", null);
        });
    });

    describe("#isGrounded/#maybeGrounded", function()
    {
        /**
         * Checks the `isGrounded` and `maybeGrounded` properties of a Pokemon.
         */
        function checkGrounded(mon: Pokemon, isGrounded: boolean,
            maybeGrounded: boolean): void
        {
            expect(mon).to.have.property("isGrounded", isGrounded);
            expect(mon).to.have.property("maybeGrounded", maybeGrounded);
        }

        it("Should not be grounded if flying type", function()
        {
            const mon = new Pokemon("Pidgey", false);
            // remove iron ball possibility
            mon.item.narrow("lifeorb");
            checkGrounded(mon, false, false);
        });

        it("Should be grounded if not flying type", function()
        {
            const mon = new Pokemon("Magikarp", false);
            // remove iron ball possibility
            mon.item.narrow("lifeorb");
            checkGrounded(mon, true, true);
        });

        it("Should be grounded if Gravity is active", function()
        {
            const state = new BattleState();
            state.status.gravity.start();

            state.teams.us.size = 1;
            const mon = state.teams.us.switchIn("Pidgey", 1, "M", 11, 11)!;
            checkGrounded(mon, true, true);
        });

        it("Should be grounded if Ingrain", function()
        {
            const mon = new Pokemon("Pidgey", false);
            mon.switchInto();
            mon.volatile.ingrain = true;
            checkGrounded(mon, true, true);
        });

        it("Should be grounded if holding iron ball", function()
        {
            const mon = new Pokemon("Pidgey", false);
            mon.item.narrow("ironball");
            checkGrounded(mon, true, true);
        });

        it("Should ignore iron ball if Embargo", function()
        {
            const mon = new Pokemon("Pidgey", false);
            mon.switchInto();
            mon.item.narrow("ironball");
            mon.volatile.embargo.start();
            checkGrounded(mon, false, false);
        });

        it("Should ignore iron ball if klutz", function()
        {
            const mon = new Pokemon("Pidgey", false); // flying type
            mon.switchInto();
            mon.traits.setAbility("klutz");
            mon.item.narrow("ironball");
            checkGrounded(mon, false, false);
        });

        it("Should ignore klutz if gastro acid", function()
        {
            const mon = new Pokemon("Pidgey", false); // flying type
            mon.switchInto();
            mon.traits.setAbility("klutz");
            mon.item.narrow("ironball");
            mon.volatile.gastroAcid = true;
            checkGrounded(mon, true, true);
        });

        it("Should not be grounded if Magnet Rise", function()
        {
            const mon = new Pokemon("Magikarp", false);
            mon.switchInto();
            // remove iron ball possibility
            mon.item.narrow("leftovers");
            mon.volatile.magnetRise.start();
            checkGrounded(mon, false, false);
        });

        it("Should not be grounded if Levitate ability", function()
        {
            const mon = new Pokemon("Bronzong", false);
            mon.traits.setAbility("levitate");
            // remove iron ball possibility
            mon.item.narrow("leftovers");
            checkGrounded(mon, false, false);
        });

        it("Should possibly be not grounded if able to have Levitate ability",
        function()
        {
            // can have levitate or heatproof
            const mon = new Pokemon("Bronzong", false);
            // remove iron ball possibility
            mon.item.narrow("leftovers");
            mon.switchInto();
            checkGrounded(mon, true, false);
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
            const mon = new Pokemon("Magikarp", false);
            expect(() => mon.volatile).to.throw(Error,
                "This Pokemon is currently inactive.");
            mon.switchInto();
            expect(mon.active).to.be.true;
        });

        it("Should transfer VolatileStatus reference", function()
        {
            const mon = new Pokemon("Magikarp", false);
            mon.switchInto();
            const v = mon.volatile;

            const other = new Pokemon("Magikarp", false);
            other.switchInto(mon);
            expect(v).to.equal(other.volatile);
        });

        it("Should set VolatileStatus#overrideTraits", function()
        {
            const mon = new Pokemon("Magikarp", false);
            mon.switchInto();
            expect(mon.baseTraits.ability)
                .to.equal(mon.volatile.overrideTraits.ability);
            expect(mon.baseTraits.data)
                .to.equal(mon.volatile.overrideTraits.data);
            expect(mon.baseTraits.species)
                .to.equal(mon.volatile.overrideTraits.species);
            expect(mon.baseTraits.stats)
                .to.equal(mon.volatile.overrideTraits.stats);
            expect(mon.baseTraits.types)
                .to.equal(mon.volatile.overrideTraits.types);
        });

        it("Should become inactive if another switches into it", function()
        {
            const mon = new Pokemon("Magikarp", false);
            mon.switchInto();
            switchOut(mon);
            expect(mon.active).to.be.false;
        });

        it("Should clear toxic turns when switching out", function()
        {
            const mon = new Pokemon("Magikarp", false);
            mon.majorStatus.afflict("tox");
            mon.majorStatus.tick();
            expect(mon.majorStatus.turns).to.equal(2);
            switchOut(mon);
            expect(mon.majorStatus.turns).to.equal(1);
        });

        it("Should not clear other major status turns when switching out",
        function()
        {
            const mon = new Pokemon("Magikarp", false);
            mon.majorStatus.afflict("slp");
            mon.majorStatus.tick();
            expect(mon.majorStatus.turns).to.equal(2);
            switchOut(mon);
            expect(mon.majorStatus.turns).to.equal(2);
        });

        it("Should clear volatile when switching out and back in", function()
        {
            const mon = new Pokemon("Magikarp", false);
            mon.switchInto();
            mon.volatile.lockedMove.start("thrash");

            switchOut(mon);
            mon.switchInto();
            expect(mon.volatile.lockedMove.isActive).to.be.false;
        });

        describe("copy = true", function()
        {
            it("Should copy passable statuses", function()
            {
                const mon = new Pokemon("Magikarp", false);
                mon.switchInto();
                mon.volatile.boosts.atk = 1;

                const other = new Pokemon("Magikarp", false);
                other.switchInto(mon, /*copy*/true);
                expect(other.volatile.boosts.atk).to.equal(1);
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

    // TODO
    describe("#trapped()", function() {});

    describe("#transform()", function()
    {
        it("Should copy known details", function()
        {
            const mon1 = new Pokemon("Magikarp", false);
            mon1.switchInto();
            mon1.hpType.narrow("fire");
            expect(mon1.moveset.get("splash")).to.be.null;

            const mon2 = new Pokemon("Bulbasaur", true);
            mon2.switchInto();
            mon2.volatile.boosts.atk = 2;
            mon2.volatile.addedType = "bug";
            mon2.moveset.reveal("splash");
            mon2.hpType.narrow("ice");

            mon1.transform(mon2);

            expect(mon1.species).to.equal("Bulbasaur");
            expect(mon1.volatile.transformed).to.be.true;
            expect(mon1.volatile.boosts.atk).to.equal(2);
            expect(mon1.volatile.addedType).to.equal("bug");
            expect(mon1.ability).to.equal(mon2.ability);
            expect(mon1.volatile.overrideTraits.data)
                .to.equal(mon2.traits.data);
            expect(mon1.volatile.overrideTraits.stats)
                .to.equal(mon2.traits.stats);
            expect(mon1.types).to.have.members(mon2.types);
            expect(mon1.moveset.get("splash")).to.not.be.null;
            expect(mon1.hpType).to.equal(mon2.hpType);

            // should still keep base traits
            expect(mon1.baseTraits.species.possibleValues)
                .to.have.key("Magikarp");
            expect(mon1.baseTraits.data).to.equal(dex.pokemon.Magikarp);
            expect(mon1.baseTraits.ability.possibleValues)
                .to.have.keys(dex.pokemon.Magikarp.abilities);
            expect(mon1.baseTraits.stats.hpType.possibleValues)
                .to.have.keys("fire");
        });

        it("Should link move inference", function()
        {
            const mon1 = new Pokemon("Magikarp", false);
            mon1.switchInto();

            const mon2 = new Pokemon("Bulbasaur", true);
            mon2.switchInto();

            mon1.transform(mon2);
            mon1.moveset.reveal("splash");
            mon2.moveset.reveal("tackle");

            expect(mon1.moveset.get("tackle")).to.not.be.null;
            expect(mon2.moveset.get("splash")).to.not.be.null;
        });

        it("Should link ability inference but not change", function()
        {
            const mon1 = new Pokemon("Magikarp", false);
            mon1.switchInto();

            const mon2 = new Pokemon("Bronzong", true);
            mon2.switchInto();

            mon1.transform(mon2);
            mon2.traits.setAbility("heatproof");
            mon2.traits.setAbility("pressure");

            expect(mon1.ability).to.equal("heatproof");
        });

        it("Should link stat inference", function()
        {
            const mon1 = new Pokemon("Magikarp", false);
            mon1.switchInto();

            const mon2 = new Pokemon("Bronzong", true);
            mon2.traits.stats.level = 100;
            mon2.switchInto();

            mon1.transform(mon2);
            mon1.traits.stats.atk.set(200);
            mon2.traits.stats.spe.set(100);

            expect(mon1.traits.stats.spe.min).to.equal(100);
            expect(mon1.traits.stats.spe.max).to.equal(100);
            expect(mon2.traits.stats.atk.min).to.equal(200);
            expect(mon2.traits.stats.atk.max).to.equal(200);
        });
    });

    describe("transformPost()", function()
    {
        it("Should copy move and stat data", function()
        {
            const mon = new Pokemon("Horsea", false);
            mon.switchInto();

            const mon2 = new Pokemon("Magikarp", true);
            mon2.traits.stats.level = 100;
            mon2.switchInto();

            mon.transform(mon2);
            mon.transformPost([{id: "splash", pp: 5, maxpp: 64}],
                {atk: 100, def: 103, spa: 100, spd: 100, spe: 200});

            function check(m: Pokemon)
            {
                expect(m.moveset.get("splash")).to.not.be.null;
                expect(m.traits.stats.atk.min).to.equal(100);
                expect(m.traits.stats.atk.max).to.equal(100);
                expect(m.traits.stats.def.min).to.equal(103);
                expect(m.traits.stats.def.max).to.equal(103);
                expect(m.traits.stats.spa.min).to.equal(100);
                expect(m.traits.stats.spa.max).to.equal(100);
                expect(m.traits.stats.spd.min).to.equal(100);
                expect(m.traits.stats.spd.max).to.equal(100);
                expect(m.traits.stats.spe.min).to.equal(200);
                expect(m.traits.stats.spe.max).to.equal(200);
            }
            check(mon);
            check(mon2);
        });
    });
});
