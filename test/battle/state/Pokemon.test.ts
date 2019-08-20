import { expect } from "chai";
import "mocha";
import { berries, dex } from "../../../src/battle/dex/dex";
import { StatExceptHP, statNames } from "../../../src/battle/dex/dex-util";
import { BattleState } from "../../../src/battle/state/BattleState";
import { Move } from "../../../src/battle/state/Move";
import { Pokemon } from "../../../src/battle/state/Pokemon";
import { Team } from "../../../src/battle/state/Team";

describe("Pokemon", function()
{
    describe("#active", function()
    {
        it("Should be inactive initially", function()
        {
            const mon = new Pokemon("Magikarp", /*hpPercent*/false);
            expect(mon.active).to.be.false;
        });
    });

    describe("#switchIn()", function()
    {
        it("Should become active", function()
        {
            const mon = new Pokemon("Magikarp", false);
            mon.switchIn();
            expect(mon.active).to.be.true;
        });

        it("Should set VolatileStatus overrides", function()
        {
            const mon = new Pokemon("Magikarp", false);
            mon.ability = "swiftswim";
            mon.stats.level = 100;
            mon.switchIn();
            expect(mon.volatile.overrideAbility.definiteValue).to.not.be.null;
            expect(mon.volatile.overrideAbility.definiteValue!.name)
                .to.equal("swiftswim");
            expect(mon.volatile.overrideSpecies).to.not.be.null;
            expect(mon.volatile.overrideSpecies!.name).to.equal("Magikarp");
            expect(mon.volatile.overrideTypes)
                .to.have.members(["water", "???"]);
        });
    });

    describe("#switchOut()", function()
    {
        it("Should become inactive", function()
        {
            const mon = new Pokemon("Magikarp", false);
            mon.switchIn();
            mon.switchOut();
            expect(mon.active).to.be.false;
        });

        it("Should clear toxic turns", function()
        {
            const mon = new Pokemon("Magikarp", false);
            mon.majorStatus.afflict("tox");
            mon.majorStatus.tick();
            expect(mon.majorStatus.turns).to.equal(2);
            mon.switchOut();
            expect(mon.majorStatus.turns).to.equal(1);
        });

        it("Should not clear other major status turns",
        function()
        {
            const mon = new Pokemon("Magikarp", false);
            mon.majorStatus.afflict("slp");
            mon.majorStatus.tick();
            expect(mon.majorStatus.turns).to.equal(2);
            mon.switchOut();
            expect(mon.majorStatus.turns).to.equal(2);
        });

        it("Should clear volatile", function()
        {
            const mon = new Pokemon("Magikarp", false);
            mon.volatile.lockedMove.start("thrash");
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

    describe("#stats", function()
    {
        it("Should initialize when species and level are initialized",
        function()
        {
            const mon = new Pokemon("Mew", false); // has all base 100 stats
            mon.stats.level = 100;
            for (const stat in statNames)
            {
                if (!mon.stats.hasOwnProperty(stat)) continue;

                if (stat === "hp")
                {
                    expect(mon.stats[stat].min).to.equal(310);
                    expect(mon.stats[stat].max).to.equal(404);
                }
                else
                {
                    expect(mon.stats[stat as StatExceptHP].min).to.equal(184);
                    expect(mon.stats[stat as StatExceptHP].max).to.equal(328);
                }
            }
        });
    });

    describe("#volatile#overrideSpecies", function()
    {
        it("Should initially be empty if inactive", function()
        {
            const mon = new Pokemon("Togepi", false);
            expect(mon.active).to.be.false;
            expect(mon.volatile.overrideSpecies).to.be.null;
        });

        it("Should set override ability after switchin", function()
        {
            const mon = new Pokemon("Togepi", false);
            mon.switchIn();
            expect(mon.volatile.overrideSpecies).to.not.be.null;
            expect(mon.volatile.overrideSpecies!.name).to.equal("Togepi");
        });

        it("Should throw if invalid volatile species", function()
        {
            const mon = new Pokemon("Magikarp", false);
            mon.switchIn();
            expect(() => mon.setSpecies("not a real_species")).to.throw();
            expect(mon.volatile.overrideSpecies).to.not.be.null;
            expect(mon.volatile.overrideSpecies!.name).to.equal("Magikarp");
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

        it("Should set override ability", function()
        {
            const mon = new Pokemon("Togepi", false);
            mon.switchIn();
            expect(mon.volatile.overrideAbility.definiteValue).to.be.null;

            // first call to ability setter will narrow base ability
            mon.ability = "hustle";
            expect(mon.volatile.overrideAbility.definiteValue).to.not.be.null;
            expect(mon.volatile.overrideAbility.definiteValue!.name)
                .to.equal("hustle");
            expect(mon.baseAbility.definiteValue).to.not.be.null;
            expect(mon.baseAbility.definiteValue!.name).to.equal("hustle");

            // subsequent calls only modify override ability
            mon.ability = "swiftswim";
            expect(mon.volatile.overrideAbility.definiteValue).to.not.be.null;
            expect(mon.volatile.overrideAbility.definiteValue!.name)
                .to.equal("swiftswim");
            expect(mon.baseAbility.definiteValue).to.not.be.null;
            expect(mon.baseAbility.definiteValue!.name).to.equal("hustle");
        });

        it("Should set override ability on switchin", function()
        {
            const mon = new Pokemon("Togepi", false);
            mon.ability = "hustle";
            mon.switchIn();

            expect(mon.volatile.overrideAbility.definiteValue).to.not.be.null;
            expect(mon.volatile.overrideAbility.definiteValue!.name)
                .to.equal("hustle");
            expect(mon.baseAbility.definiteValue).to.not.be.null;
            expect(mon.baseAbility.definiteValue!.name).to.equal("hustle");

            mon.ability = "swiftswim";
            expect(mon.volatile.overrideAbility.definiteValue).to.not.be.null;
            expect(mon.volatile.overrideAbility.definiteValue!.name)
                .to.equal("swiftswim");
            expect(mon.baseAbility.definiteValue).to.not.be.null;
            expect(mon.baseAbility.definiteValue!.name).to.equal("hustle");
        });

        it("Should re-set volatile ability if species is re-set", function()
        {
            const mon = new Pokemon("Togepi", false);
            mon.ability = "hustle";
            mon.switchIn();
            mon.setSpecies("Magikarp");
            expect(mon.volatile.overrideAbility.definiteValue).to.not.be.null;
            expect(mon.volatile.overrideAbility.definiteValue!.name)
                .to.equal("swiftswim");
        });

        it("Should re-set volatile ability if species is re-set and new base " +
            "ability is unknown", function()
        {
            const mon = new Pokemon("Togepi", false);
            mon.ability = "hustle";
            mon.switchIn();
            // usually a form change
            mon.setSpecies("Bronzong");
            expect(mon.volatile.overrideAbility.possibleValues)
                .to.have.all.keys(...dex.pokemon.Bronzong.abilities);
        });

        it("Should reject unknown ability", function()
        {
            const mon = new Pokemon("Togepi", false);
            expect(() => mon.ability = "not_a real-ability").to.throw(Error,
                "Unknown ability 'not_a real-ability'");
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

        describe("#volatile.unburden", function()
        {
            it("Should not set unburden normally", function()
            {
                const mon = new Pokemon("Magikarp", true);
                mon.setItem("lifeorb");

                mon.switchIn();
                expect(mon.volatile.unburden).to.be.false;
            });

            it("Should not set unburden if revealed to have no item", function()
            {
                const mon = new Pokemon("Magikarp", true);
                mon.setItem("none");

                mon.switchIn();
                expect(mon.volatile.unburden).to.be.false;
            });

            it("Should set unburden if item was just removed", function()
            {
                const mon = new Pokemon("Magikarp", true);
                mon.switchIn();

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

            mon.removeItem();
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
                mon.switchIn();

                mon.removeItem();
                expect(mon.volatile.unburden).to.be.true;
            });
        });

        describe("#lastItem", function()
        {
            it("Should not set lastItem if no consumed parameter", function()
            {
                const mon = new Pokemon("Magikarp", true);
                mon.switchIn();
                mon.setItem("leftovers");

                mon.removeItem();
                expect(mon.item.definiteValue).to.not.be.null;
                expect(mon.item.definiteValue!.name).to.equal("none");
            });

            it("Should set lastItem if consumed parameter was provided",
            function()
            {
                const mon = new Pokemon("Magikarp", true);
                const item = mon.item;
                mon.switchIn();
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
                expect(mon.moveset.get("splash")).to.be.null;
                mon.useMove({moveId: "splash", targets: [mon]});
                expect(mon.moveset.get("splash")!.pp).to.equal(63);
            });

            it("Should not reveal struggle as a move slot", function()
            {
                const mon = new Pokemon("Magikarp", false);
                mon.useMove({moveId: "struggle", targets: [mon]});
                expect(mon.moveset.get("struggle")).to.be.null;
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
                    mon.useMove({moveId: "tackle", targets: [target]});
                    expect(mon.moveset.get("tackle")!.pp).to.equal(54);
                });

                it("Should not use double pp if not targeted", function()
                {
                    const mon = new Pokemon("Magikarp", false);
                    mon.useMove({moveId: "tackle", targets: [mon]});
                    expect(mon.moveset.get("tackle")!.pp).to.equal(55);
                });

                it("Should not use double pp if mold breaker", function()
                {
                    const mon = new Pokemon("Rampardos", false);
                    mon.ability = "moldbreaker";
                    mon.useMove({moveId: "tackle", targets: [target]});
                    expect(mon.moveset.get("tackle")!.pp).to.equal(55);
                });
            });

            describe("#volatile#lastUsed", function()
            {
                it("Should set last used", function()
                {
                    const mon = new Pokemon("Magikarp", false);
                    mon.useMove({moveId: "splash", targets: [mon]});
                    expect(mon.volatile.lastUsed).to.equal(0);
                });

                it("Should set last used again", function()
                {
                    const mon = new Pokemon("Magikarp", false);
                    mon.useMove({moveId: "splash", targets: [mon]});
                    mon.useMove({moveId: "tackle", targets: []});
                    expect(mon.volatile.lastUsed).to.equal(1);
                });
            });

            describe("two-turn", function()
            {
                it("Should reset two-turn status", function()
                {
                    const mon = new Pokemon("Magikarp", false);
                    mon.useMove({moveId: "bounce", targets: []});
                    mon.volatile.twoTurn.start("bounce");
                    mon.postTurn();

                    mon.useMove({moveId: "bounce", targets: [], nopp: true});
                    expect(mon.volatile.twoTurn.isActive).to.be.false;
                });
            });

            describe("Natural Gift move", function()
            {
                it("Should infer berry if successful", function()
                {
                    const mon = new Pokemon("Magikarp", false);
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

            describe("lockedmove", function()
            {
                it("Should lock move", function()
                {
                    const mon = new Pokemon("Magikarp", false);
                    mon.useMove({moveId: "petaldance", targets: [mon]});
                    expect(mon.volatile.lockedMove.isActive).to.be.true;
                });

                it("Should not lock move if failed", function()
                {
                    const mon = new Pokemon("Magikarp", false);
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
                    mon.volatile.lockedMove.start("petaldance");
                    mon.useMove(
                    {
                        moveId: "petaldance", targets: [mon],
                        unsuccessful: "evaded"
                    });
                    expect(mon.volatile.lockedMove.isActive).to.be.false;
                });
            });

            describe("minimize", function()
            {
                it("Should activate Minimize if used successfully", function()
                {
                    const mon = new Pokemon("Magikarp", false);
                    expect(mon.volatile.minimize).to.be.false;

                    mon.useMove({moveId: "minimize", targets: [mon]});
                    expect(mon.volatile.minimize).to.be.true;
                });

                it("Should not activate Minimize if move failed", function()
                {
                    const mon = new Pokemon("Magikarp", false);
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

        describe("#overrideMove()", function()
        {
            it("Should add override move with 5 pp", function()
            {
                const mon = new Pokemon("Magikarp", false);
                mon.moveset.reveal("splash");
                mon.overrideMove("splash", "tackle");

                expect(mon.moveset.get("splash")).to.be.null;
                expect(mon.moveset.get("tackle")).to.not.be.null;
                expect(mon.moveset.get("tackle")!.pp).to.equal(5);
            });

            it("Should clear on #switchOut()", function()
            {
                const mon = new Pokemon("Magikarp", false);
                mon.moveset.reveal("splash");
                const move = new Move();
                move.init("tackle");
                mon.moveset.override("splash", move);
                mon.switchOut();
                expect(mon.moveset.get("tackle")).to.be.null;
                expect(mon.moveset.get("splash")).to.not.be.null;
            });
        });

        describe("#replaceMove()", function()
        {
            it("Should add replacement Move with minimum maxpp", function()
            {
                const mon = new Pokemon("Magikarp", false);
                mon.moveset.reveal("splash");
                mon.replaceMove("splash", "tackle");

                expect(mon.moveset.get("splash")).to.be.null;
                expect(mon.moveset.get("tackle")).to.not.be.null;
                expect(mon.moveset.get("tackle")!.pp).to.equal(35);
            });
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
            mon.item.narrow("ironball");
            mon.volatile.embargo.start();
            checkGrounded(mon, false, false);
        });

        it("Should ignore iron ball if klutz", function()
        {
            const mon = new Pokemon("Pidgey", false); // flying type
            mon.switchIn();
            mon.ability = "keeneye"; // init base ability
            mon.ability = "klutz"; // set override ability
            mon.item.narrow("ironball");
            checkGrounded(mon, false, false);
        });

        it("Should ignore klutz if gastro acid", function()
        {
            const mon = new Pokemon("Pidgey", false); // flying type
            mon.switchIn();
            mon.ability = "keeneye"; // init base ability
            mon.ability = "klutz"; // set override ability
            mon.item.narrow("ironball");
            mon.volatile.gastroAcid = true;
            checkGrounded(mon, true, true);
        });

        it("Should not be grounded if Magnet Rise", function()
        {
            const mon = new Pokemon("Magikarp", false);
            // remove iron ball possibility
            mon.item.narrow("leftovers");
            mon.volatile.magnetRise.start();
            checkGrounded(mon, false, false);
        });

        it("Should not be grounded if Levitate ability", function()
        {
            const mon = new Pokemon("Bronzong", false);
            mon.ability = "levitate";
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
            mon.switchIn();
            checkGrounded(mon, true, false);
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
});
