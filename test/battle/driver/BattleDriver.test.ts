import { expect } from "chai";
import "mocha";
import { StatExceptHP, statsExceptHP, Type } from
    "../../../src/battle/dex/dex-util";
import { BattleDriver } from "../../../src/battle/driver/BattleDriver";
import { CountableStatusType, FieldConditionType, InitOtherTeamSize, InitTeam,
    SideConditionType, SingleMoveStatus, SingleTurnStatus, StatusEffectType,
    SwitchIn, UpdatableStatusEffectType } from
    "../../../src/battle/driver/DriverEvent";
import { ReadonlyTeam } from "../../../src/battle/state/Team";
import { ReadonlyTeamStatus } from "../../../src/battle/state/TeamStatus";
import { ReadonlyVolatileStatus } from
    "../../../src/battle/state/VolatileStatus";

/** Base InitTeam event for testing. */
const initTeam: InitTeam =
{
    type: "initTeam",
    team:
    [
        {
            species: "Smeargle", level: 50, gender: "F", hp: 115, hpMax: 115,
            stats: {atk: 25, def: 40, spa: 25, spd: 50, spe: 80},
            moves: ["splash", "tackle"], baseAbility: "technician",
            item: "lifeorb"
        }
    ]
};

/** Base InitOtherTeamSize event for testing. */
const initOtherTeamSize: InitOtherTeamSize =
    {type: "initOtherTeamSize", size: 2};

/** Base SwitchIn events for testing. */
const switchIns: readonly SwitchIn[] =
[
    {type: "switchIn", monRef: "us", ...initTeam.team[0]},
    {
        type: "switchIn", monRef: "them",
        species: "Seaking", level: 100, gender: "M", hp: 100, hpMax: 100
    }
];

describe("BattleDriver", function()
{
    let driver: BattleDriver;

    beforeEach("Initialize BattleDriver", function()
    {
        driver = new BattleDriver();
    });

    describe("#initTeam()", function()
    {
        /** Checks a Team object against the data from an InitTeam event. */
        function checkInitTeam(team: ReadonlyTeam, event: InitTeam): void
        {
            expect(team.size).to.equal(event.team.length);

            for (const data of event.team)
            {
                const mon = team.pokemon.find(
                    p => !!p && p.species === data.species)!;
                expect(mon).to.exist;

                expect(mon.species).to.equal(data.species);
                expect(mon.traits.stats.level).to.equal(data.level);
                expect(mon.item.definiteValue).to.equal(data.item);
                expect(mon.traits.ability.definiteValue)
                    .to.equal(data.baseAbility);

                // check stats
                // first check hp
                const table = mon.traits.stats;
                expect(table.hp.hp).to.be.true;
                expect(table.hp.min).to.equal(data.hpMax);
                expect(table.hp.max).to.equal(data.hpMax);
                expect(mon.hp.current).to.equal(data.hp);
                expect(mon.hp.max).to.equal(data.hpMax);
                // then check other stats
                for (const stat of Object.keys(statsExceptHP) as StatExceptHP[])
                {
                    expect(table[stat].hp).to.be.false;
                    expect(table[stat].min).to.equal(data.stats[stat]);
                    expect(table[stat].max).to.equal(data.stats[stat]);
                }

                // check moves
                expect(mon.moveset.moves).to.have.lengthOf(data.moves.length);
                for (const name of data.moves)
                {
                    const move = mon.moveset.get(name);
                    expect(move).to.not.be.null;
                    expect(move!.name).to.equal(name);
                }

                // check optional data

                if (data.hpType)
                {
                    expect(mon.hpType.definiteValue).to.equal(data.hpType);
                }
                else expect(mon.hpType.definiteValue).to.be.null;

                if (data.happiness)
                {
                    expect(mon.happiness).to.equal(data.happiness);
                }
                else expect(mon.happiness).to.be.null;
            }
        }

        it("Should init our team", function()
        {
            driver.initTeam(initTeam);
            checkInitTeam(driver.state.teams.us, initTeam);
        });

        it("Should init our team with hp type and happiness", function()
        {
            const event: InitTeam =
            {
                ...initTeam,
                team:
                [
                    {
                        ...initTeam.team[0], hpType: "fire", happiness: 255
                    },
                    ...initTeam.team.slice(1)
                ]
            };
            driver.initTeam(event);
            checkInitTeam(driver.state.teams.us, event);
        });
    });

    describe("#initOtherTeamSize()", function()
    {
        it("Should init other team's size", function()
        {
            driver.initOtherTeamSize(initOtherTeamSize);
            expect(driver.state.teams.them.size)
                .to.equal(initOtherTeamSize.size);
        });
    });

    describe("Team initialized", function()
    {
        beforeEach("Init battle state", function()
        {
            driver.handleEvents([initTeam, initOtherTeamSize]);
        });

        describe("#switchIn()", function()
        {
            it("Should switch in pokemon", function()
            {
                driver.handleEvents(switchIns);
                expect(driver.state.teams.us.active.active).to.be.true;
                expect(driver.state.teams.them.active.active).to.be.true;
            });
        });
    });

    describe("Fully initialized", function()
    {
        beforeEach("Init battle state", function()
        {
            driver.handleEvents([initTeam, initOtherTeamSize, ...switchIns]);
            expect(driver.state.teams.us.active.active).to.be.true;
            expect(driver.state.teams.them.active.active).to.be.true;
        });

        describe("#preTurn()", function() {}); // TODO

        describe("#postTurn()", function() {}); // TODO

        describe("#activateAbility()", function()
        {
            it("Should reveal ability", function()
            {
                expect(driver.state.teams.them.active.ability).to.equal("");
                driver.activateAbility(
                {
                    type: "activateAbility", monRef: "them",
                    ability: "swiftswim"
                });
            });
        });

        describe("#gastroAcid()", function()
        {
            it("Should reveal and suppress ability", function()
            {
                driver.gastroAcid(
                {
                    type: "gastroAcid", monRef: "them", ability: "voltabsorb"
                });

                const mon = driver.state.teams.them.active;
                expect(mon.ability).to.equal("voltabsorb");
                expect(mon.volatile.gastroAcid).to.be.true;
            });
        });

        describe("#activateStatusEffect()", function()
        {
            function test(name: string, status: StatusEffectType,
                getter: (v: ReadonlyVolatileStatus) => boolean)
            {
                it(`Should activate ${name}`, function()
                {
                    const v = driver.state.teams.us.active.volatile;
                    expect(getter(v)).to.be.false;

                    // start the status
                    driver.activateStatusEffect(
                    {
                        type: "activateStatusEffect", monRef: "us", status,
                        start: true
                    });
                    expect(getter(v)).to.be.true;

                    // end the status
                    driver.activateStatusEffect(
                    {
                        type: "activateStatusEffect", monRef: "us", status,
                        start: false
                    });
                    expect(getter(v)).to.be.false;
                });
            }

            test("Aqua Ring", "aquaRing", v => v.aquaRing);
            test("Attract", "attract", v => v.attract);
            test("Bide", "bide", v => v.bide.isActive);
            test("confusion", "confusion", v => v.confusion.isActive);
            test("Charge", "charge", v => v.charge.isActive);
            test("Curse", "curse", v => v.curse);
            test("Embargo", "embargo", v => v.embargo.isActive);
            test("Encore", "encore", v => v.encore.isActive);
            test("Focus Energy", "focusEnergy", v => v.focusEnergy);
            test("Foresight", "foresight", v => v.identified === "foresight");
            test("Heal Block", "healBlock", v => v.healBlock.isActive);
            test("Imprison", "imprison", v => v.imprison);
            test("Ingrain", "ingrain", v => v.ingrain);
            test("Leech Seed", "leechSeed", v => v.leechSeed);
            test("Magnete Rise", "magnetRise", v => v.magnetRise.isActive);
            test("Miracle Eye", "miracleEye",
                v => v.identified === "miracleEye");
            test("Mud Sport", "mudSport", v => v.mudSport);
            test("Nightmare", "nightmare", v => v.nightmare);
            test("Power Trick", "powerTrick", v => v.powerTrick);
            test("Substitute", "substitute", v => v.substitute);
            test("Slow Start", "slowStart", v => v.slowStart.isActive);
            test("Taunt", "taunt", v => v.taunt.isActive);
            test("Torment", "torment", v => v.torment);
            test("Uproar", "uproar", v => v.uproar.isActive);
            test("Water Sport", "waterSport", v => v.waterSport);
            test("Yawn", "yawn", v => v.yawn.isActive);

            it("Should throw if invalid status", function()
            {
                // the type system should guarantee that BattleDriver handles
                //  all StatusEffectTypes, so we need to pass in an invalid one
                //  through an any assertion
                expect(function()
                {
                    driver.activateStatusEffect(
                    {
                        type: "activateStatusEffect", monRef: "us",
                        status: "invalid" as any, start: true
                    });
                })
                    .to.throw(Error, "Invalid status effect 'invalid'");
            });
        });

        describe("#countStatusEffect()", function()
        {
            function test(name: string, status: CountableStatusType): void
            {
                it(`Should update ${name} count`, function()
                {
                    const v = driver.state.teams.us.active.volatile;
                    expect(v[status]).to.equal(0);
                    driver.countStatusEffect(
                    {
                        type: "countStatusEffect", monRef: "us", status,
                        turns: 2
                    });
                    expect(v[status]).to.equal(2);
                });
            }

            test("Perish Song", "perish");
            test("Stockpile", "stockpile");
        });

        describe("#disableMove()", function()
        {
            it("Should disable move", function()
            {
                driver.disableMove(
                    {type: "disableMove", monRef: "them", move: "tackle"});

                const mon = driver.state.teams.them.active;
                expect(mon.volatile.disabled).to.not.be.null;
                expect(mon.volatile.disabled!.name).to.equal("tackle");
                expect(mon.volatile.disabled!.ts.isActive).to.be.true;
            });
        });

        describe("#reenableMoves()", function()
        {
            it("Should re-enable disabled moves", function()
            {
                driver.disableMove(
                    {type: "disableMove", monRef: "them", move: "tackle"});
                driver.reenableMoves({type: "reenableMoves", monRef: "them"});

                const mon = driver.state.teams.them.active;
                expect(mon.volatile.disabled).to.be.null;
            });
        });

        describe("#activateFutureMove()", function()
        {
            it("Should prepare future move", function()
            {
                driver.activateFutureMove(
                {
                    type: "activateFutureMove", monRef: "us",
                    move: "doomdesire", start: true
                });
                const ts = driver.state.teams.us.status;
                expect(ts.futureMoves.doomdesire.isActive).to.be.true;
            });

            it("Should release future move", function()
            {
                // first start to prepare the move
                driver.activateFutureMove(
                {
                    type: "activateFutureMove", monRef: "us",
                    move: "futuresight", start: true
                });

                // release the move
                driver.activateFutureMove(
                {
                    type: "activateFutureMove", monRef: "us",
                    move: "futuresight", start: false
                });
                const ts = driver.state.teams.us.status;
                expect(ts.futureMoves.futuresight.isActive).to.be.false;
            });
        });

        describe("#feint()", function()
        {
            it("Should break stall", function()
            {
                const v = driver.state.teams.them.active.volatile;
                expect(v.stalling).to.be.false;
                expect(v.stallTurns).to.equal(0);

                driver.useMove(
                {
                    type: "useMove", monRef: "them", moveId: "protect",
                    targets: ["them"]
                });
                expect(v.stalling).to.be.true;
                expect(v.stallTurns).to.equal(1);

                // assume our side uses Feint
                driver.feint({type: "feint", monRef: "them"});
                expect(v.stalling).to.be.false;
                expect(v.stallTurns).to.equal(1);
            });
        });

        describe("#updateStatusEffect()", function()
        {
            function test(name: string, status: UpdatableStatusEffectType)
            {
                it(`Should update ${name}`, function()
                {
                    const v = driver.state.teams.us.active.volatile;
                    expect(v[status].isActive).to.be.false;

                    // first start the status
                    driver.activateStatusEffect(
                    {
                        type: "activateStatusEffect", monRef: "us", status,
                        start: true
                    });
                    expect(v[status].isActive).to.be.true;
                    expect(v[status].turns).to.equal(1);

                    // then update it
                    driver.updateStatusEffect(
                        {type: "updateStatusEffect", monRef: "us", status});
                    expect(v[status].isActive).to.be.true;
                    expect(v[status].turns).to.equal(2);
                });
            }
            test("Bide", "bide");
            test("confusion", "confusion");
            test("Uproar", "uproar");
        });

        describe("#fatigue()", function()
        {
            it("Should reset lockedMove status", function()
            {
                const v = driver.state.teams.them.active.volatile;
                expect(v.lockedMove.isActive).to.be.false;

                // first start it
                driver.useMove(
                {
                    type: "useMove", monRef: "them", moveId: "outrage",
                    targets: ["us"]
                });
                expect(v.lockedMove.isActive).to.be.true;

                // then end it due to fatigue
                driver.fatigue({type: "fatigue", monRef: "them"});
                expect(v.lockedMove.isActive).to.be.false;
            });
        });

        describe("#setThirdType()", function()
        {
            it("Should set third type", function()
            {
                driver.setThirdType(
                    {type: "setThirdType", monRef: "us", thirdType: "bug"});
                expect(driver.state.teams.us.active.volatile.addedType)
                    .to.equal("bug");
            });
        });

        describe("#changeType()", function()
        {
            it("Should change types", function()
            {
                const newTypes: [Type, Type] = ["bug", "dragon"];
                driver.changeType({type: "changeType", monRef: "us", newTypes});
                expect(driver.state.teams.us.active.types)
                    .to.deep.equal(newTypes);
            });

            it("Should also reset third type", function()
            {
                driver.setThirdType(
                    {type: "setThirdType", monRef: "us", thirdType: "ghost"});

                driver.changeType(
                {
                    type: "changeType", monRef: "us", newTypes: ["fire", "???"]
                });

                expect(driver.state.teams.us.active.volatile.addedType)
                    .to.equal("???");
            });
        });

        describe("#lockOn()", function()
        {
            it("Should set Lock-On status", function()
            {
                const us = driver.state.teams.us.active.volatile;
                const them = driver.state.teams.them.active.volatile;
                expect(us.lockedOnBy).to.be.null;
                expect(us.lockOnTarget).to.be.null;
                expect(us.lockOnTurns.isActive).to.be.false;
                expect(them.lockedOnBy).to.be.null;
                expect(them.lockOnTarget).to.be.null;
                expect(them.lockOnTurns.isActive).to.be.false;

                driver.lockOn({type: "lockOn", monRef: "us", target: "them"});
                expect(us.lockedOnBy).to.be.null;
                expect(us.lockOnTarget).to.equal(them);
                expect(us.lockOnTurns.isActive).to.be.true;
                expect(them.lockedOnBy).to.equal(us);
                expect(them.lockOnTarget).to.be.null;
                expect(them.lockOnTurns.isActive).to.be.false;
            });
        });

        describe("#mimic()", function()
        {
            it("Should Mimic move", function()
            {
                driver.useMove(
                {
                    type: "useMove", monRef: "them", moveId: "mimic",
                    targets: ["us"]
                });
                driver.mimic({type: "mimic", monRef: "them", move: "splash"});

                const mon = driver.state.teams.them.active;
                expect(mon.moveset.get("splash")).to.not.be.null;
                expect(mon.moveset.get("mimic")).to.be.null;
                expect(mon.baseMoveset.get("splash")).to.be.null;
                expect(mon.baseMoveset.get("mimic")).to.not.be.null;
            });
        });

        describe("#sketch()", function()
        {
            it("Should Sketch move", function()
            {
                driver.useMove(
                {
                    type: "useMove", monRef: "them", moveId: "sketch",
                    targets: ["us"]
                });
                driver.sketch({type: "sketch", monRef: "them", move: "tackle"});

                const mon = driver.state.teams.us.active;
                expect(mon.moveset.get("tackle")).to.not.be.null;
                expect(mon.moveset.get("sketch")).to.be.null;
                expect(mon.baseMoveset.get("tackle")).to.not.be.null;
                expect(mon.baseMoveset.get("sketch")).to.be.null;
            });
        });

        describe("#trap()", function()
        {
            it("Should trap pokemon", function()
            {
                driver.trap({type: "trap", target: "us", by: "them"});

                const us = driver.state.teams.us.active.volatile;
                const them = driver.state.teams.them.active.volatile;
                expect(us.trapped).to.equal(them);
                expect(us.trapping).to.be.null;
                expect(them.trapped).to.be.null;
                expect(them.trapping).to.equal(us);
            });
        });

        describe("#boost()", function()
        {
            it("Should add stat boost", function()
            {
                driver.boost(
                    {type: "boost", monRef: "us", stat: "atk", amount: 2});
                expect(driver.state.teams.us.active.volatile.boosts.atk)
                    .to.equal(2);
            });

            it("Should accumulate stat boost", function()
            {
                driver.boost(
                    {type: "boost", monRef: "us", stat: "atk", amount: 2});
                driver.boost(
                    {type: "boost", monRef: "us", stat: "atk", amount: 3});
                expect(driver.state.teams.us.active.volatile.boosts.atk)
                    .to.equal(5);
            });
        });

        describe("#unboost()", function()
        {
            it("Should subtract stat boost", function()
            {
                driver.unboost(
                    {type: "unboost", monRef: "us", stat: "atk", amount: 2});
                expect(driver.state.teams.us.active.volatile.boosts.atk)
                    .to.equal(-2);
            });
        });

        describe("#clearAllBoosts()", function()
        {
            it("Should clear all boosts from both sides", function()
            {
                driver.boost(
                    {type: "boost", monRef: "us", stat: "accuracy", amount: 2});
                driver.unboost(
                    {type: "unboost", monRef: "them", stat: "spe", amount: 2});

                driver.clearAllBoosts({type: "clearAllBoosts"});

                expect(driver.state.teams.us.active.volatile.boosts.accuracy)
                    .to.equal(0);
                expect(driver.state.teams.them.active.volatile.boosts.spe)
                    .to.equal(0);
            });
        });

        describe("#clearNegativeBoosts()", function()
        {
            it("Should clear negative boosts", function()
            {
                driver.boost(
                    {type: "boost", monRef: "us", stat: "evasion", amount: 2});
                driver.unboost(
                    {type: "unboost", monRef: "us", stat: "spa", amount: 3});

                driver.clearNegativeBoosts(
                    {type: "clearNegativeBoosts", monRef: "us"});

                const mon = driver.state.teams.us.active;
                expect(mon.volatile.boosts.evasion).to.equal(2);
                expect(mon.volatile.boosts.spa).to.equal(0);
            });
        });

        describe("#clearPositiveBoosts()", function()
        {
            it("Should clear negative boosts", function()
            {
                driver.boost(
                    {type: "boost", monRef: "us", stat: "spd", amount: 3});
                driver.unboost(
                    {type: "unboost", monRef: "us", stat: "def", amount: 1});

                driver.clearPositiveBoosts(
                    {type: "clearPositiveBoosts", monRef: "us"});

                const mon = driver.state.teams.us.active;
                expect(mon.volatile.boosts.spd).to.equal(0);
                expect(mon.volatile.boosts.def).to.equal(-1);
            });
        });

        describe("#copyBoosts()", function()
        {
            it("Should copy boosts", function()
            {
                driver.boost(
                    {type: "boost", monRef: "us", stat: "atk", amount: 2});
                driver.unboost(
                    {type: "unboost", monRef: "them", stat: "atk", amount: 2});

                driver.copyBoosts({type: "copyBoosts", from: "us", to: "them"});

                expect(driver.state.teams.us.active.volatile.boosts.atk)
                    .to.equal(2);
                expect(driver.state.teams.them.active.volatile.boosts.atk)
                    .to.equal(2);
            });
        });

        describe("#invertBoosts()", function()
        {
            it("Should invert boosts", function()
            {
                driver.boost(
                    {type: "boost", monRef: "us", stat: "spe", amount: 1});
                driver.unboost(
                    {type: "unboost", monRef: "us", stat: "atk", amount: 1});

                driver.invertBoosts({type: "invertBoosts", monRef: "us"});

                const mon = driver.state.teams.us.active;
                expect(mon.volatile.boosts.spe).to.equal(-1);
                expect(mon.volatile.boosts.atk).to.equal(1);
            });
        });

        describe("#setBoost()", function()
        {
            it("Should set boost", function()
            {
                driver.setBoost(
                    {type: "setBoost", monRef: "us", stat: "def", amount: 6});

                const mon = driver.state.teams.us.active;
                expect(mon.volatile.boosts.def).to.equal(6);
            });
        });

        describe("#swapBoosts()", function()
        {
            it("Should swap stat boosts", function()
            {
                driver.boost(
                    {type: "boost", monRef: "us", stat: "accuracy", amount: 4});
                driver.unboost(
                    {type: "unboost", monRef: "them", stat: "spd", amount: 1});

                driver.swapBoosts(
                {
                    type: "swapBoosts", monRef1: "us", monRef2: "them",
                    stats: ["accuracy", "spd"]
                });

                const mon1 = driver.state.teams.us.active;
                expect(mon1.volatile.boosts.accuracy).to.equal(0);
                expect(mon1.volatile.boosts.spd).to.equal(-1);

                const mon2 = driver.state.teams.them.active;
                expect(mon2.volatile.boosts.accuracy).to.equal(4);
                expect(mon2.volatile.boosts.spd).to.equal(0);
            });
        });

        describe("#inactive()", function()
        {
            it("Should reset single-move statuses as if a move was attempted",
            function()
            {
                const mon = driver.state.teams.us.active;

                // first make sure we have a single-move status
                driver.setSingleMoveStatus(
                {
                    type: "setSingleMoveStatus", monRef: "us",
                    status: "destinyBond"
                });

                // reason shouldn't matter
                driver.inactive({type: "inactive", monRef: "us"});
                expect(mon.volatile.destinyBond).to.be.false;
            });

            it("Should reveal move if provided", function()
            {
                const mon = driver.state.teams.them.active;
                expect(mon.moveset.get("splash")).to.be.null;
                driver.inactive(
                    {type: "inactive", monRef: "them", move: "splash"});
                expect(mon.moveset.get("splash")).to.not.be.null;
            });

            it("Should reveal move for both sides if imprison", function()
            {
                const us = driver.state.teams.us.active;
                const them = driver.state.teams.them.active;
                expect(them.moveset.get("splash")).to.be.null;

                driver.inactive(
                {
                    type: "inactive", monRef: "them", reason: "imprison",
                    move: "splash"
                });

                expect(us.moveset.get("splash")).to.not.be.null;
                expect(them.moveset.get("splash")).to.not.be.null;
            });

            it("Should consume recharge turn", function()
            {
                const mon = driver.state.teams.us.active;

                // indicate that the next turn is a recharge turn
                driver.mustRecharge({type: "mustRecharge", monRef: "us"});

                driver.inactive(
                    {type: "inactive", monRef: "us", reason: "recharge"});
                expect(mon.volatile.mustRecharge).to.be.false;
            });

            it("Should tick sleep counter", function()
            {
                const mon = driver.state.teams.us.active;

                // first put the pokemon to sleep
                driver.afflictStatus(
                    {type: "afflictStatus", monRef: "us", status: "slp"});
                expect(mon.majorStatus.current).to.equal("slp");
                expect(mon.majorStatus.turns).to.equal(1);

                driver.inactive(
                    {type: "inactive", monRef: "us", reason: "slp"});
                expect(mon.majorStatus.turns).to.equal(2);
            });

            describe("Truant ability", function()
            {
                it("Should flip Truant state", function()
                {
                    const mon = driver.state.teams.us.active;

                    // first make sure the pokemon has truant
                    driver.activateAbility(
                    {
                        type: "activateAbility", monRef: "us", ability: "truant"
                    });
                    expect(mon.volatile.willTruant).to.be.false;

                    driver.inactive(
                        {type: "inactive", monRef: "us", reason: "truant"});
                    expect(mon.volatile.willTruant).to.be.true;
                });

                it("Should overlap truant turn with recharge turn", function()
                {
                    const mon = driver.state.teams.us.active;

                    // first make sure the pokemon has truant
                    driver.activateAbility(
                    {
                        type: "activateAbility", monRef: "us", ability: "truant"
                    });
                    expect(mon.volatile.willTruant).to.be.false;

                    // indicate that the next turn is a recharge turn
                    driver.mustRecharge({type: "mustRecharge", monRef: "us"});

                    driver.inactive(
                        {type: "inactive", monRef: "us", reason: "truant"});
                    expect(mon.volatile.willTruant).to.be.true;
                    expect(mon.volatile.mustRecharge).to.be.false;
                });
            });
        });

        describe("#afflictStatus()", function()
        {
            it("Should afflict status", function()
            {
                const mon = driver.state.teams.us.active;
                expect(mon.majorStatus.current).to.be.null;

                driver.afflictStatus(
                    {type: "afflictStatus", monRef: "us", status: "brn"});
                expect(mon.majorStatus.current).to.equal("brn");
            });
        });

        describe("#cureStatus()", function()
        {
            it("Should cure status", function()
            {
                const mon = driver.state.teams.us.active;

                driver.afflictStatus(
                    {type: "afflictStatus", monRef: "us", status: "par"});

                driver.cureStatus(
                    {type: "cureStatus", monRef: "us", status: "par"});
                expect(mon.majorStatus.current).to.be.null;
            });

            it("Should throw if a different status was mentioned", function()
            {
                const mon = driver.state.teams.us.active;

                driver.afflictStatus(
                    {type: "afflictStatus", monRef: "us", status: "tox"});

                expect(() =>
                    driver.cureStatus(
                        {type: "cureStatus", monRef: "us", status: "psn"}))
                    .to.throw(Error,
                        "MajorStatus 'tox' was expected to be 'psn'");
                expect(mon.majorStatus.current).to.equal("tox");
            });
        });

        describe("#cureTeam()", function()
        {
            it("Should cure team", function()
            {
                const mon1 = driver.state.teams.them.active;

                // afflict active
                driver.afflictStatus(
                    {type: "afflictStatus", monRef: "them", status: "slp"});

                // switch out and afflict another pokemon
                driver.switchIn(
                {
                    type: "switchIn", monRef: "them", species: "Gyarados",
                    gender: "M", level: 100, hp: 100, hpMax: 100
                });
                driver.afflictStatus(
                    {type: "afflictStatus", monRef: "them", status: "frz"});

                const mon2 = driver.state.teams.them.active;

                expect(mon1.majorStatus.current).to.equal("slp");
                expect(mon2.majorStatus.current).to.equal("frz");

                driver.cureTeam({type: "cureTeam", teamRef: "them"});

                expect(mon1.majorStatus.current).to.be.null;
                expect(mon2.majorStatus.current).to.be.null;
            });
        });

        describe("#formChange()", function()
        {
            it("Should change form", function()
            {
                const mon = driver.state.teams.us.active;
                expect(mon.species).to.equal("Smeargle");

                driver.formChange(
                {
                    type: "formChange", monRef: "us", species: "Gyarados",
                    // TODO: (how) would hp/level change?
                    gender: "M", level: 100, hp: 300, hpMax: 300, perm: false
                });

                expect(mon.species).to.equal("Gyarados");
            });
        });

        describe("#transform()", function()
        {
            it("Should transform pokemon", function()
            {
                driver.transform(
                    {type: "transform", source: "us", target: "them"});

                const us = driver.state.teams.us.active;
                const them = driver.state.teams.them.active;
                expect(us.volatile.transformed).to.be.true;
                expect(us.species).to.equal(them.species);
            });
        });

        describe("#transformPost()", function() {}); // TODO

        describe("#faint()", function()
        {
            it("Should faint pokemon", function()
            {
                driver.faint({type: "faint", monRef: "us"});
                expect(driver.state.teams.us.active.fainted).to.be.true;
            });
        });

        describe("#revealItem()", function()
        {
            it("Should reveal item", function()
            {
                const mon = driver.state.teams.them.active;
                expect(mon.item.definiteValue).to.be.null;

                driver.revealItem(
                {
                    type: "revealItem", monRef: "them", item: "leftovers",
                    gained: false
                });

                expect(mon.item.definiteValue).to.equal("leftovers");
            });
        });

        describe("#removeItem()", function()
        {
            it("Should remove item", function()
            {
                const mon = driver.state.teams.them.active;
                expect(mon.item.definiteValue).to.be.null;

                driver.removeItem(
                    {type: "removeItem", monRef: "them", consumed: false});

                expect(mon.item.definiteValue).to.equal("none");
            });
        });

        describe("#useMove()", function()
        {
            it("Should use move", function()
            {
                const mon = driver.state.teams.them.active;
                expect(mon.moveset.get("tackle")).to.be.null;

                driver.useMove(
                {
                    type: "useMove", monRef: "them", moveId: "tackle",
                    targets: ["them"]
                });

                expect(mon.moveset.get("tackle")).to.not.be.null;
            });
        });

        describe("#revealMove()", function()
        {
            it("Should reveal move", function()
            {
                const mon = driver.state.teams.them.active;
                expect(mon.moveset.get("tackle")).to.be.null;

                driver.revealMove(
                    {type: "revealMove", monRef: "them", move: "tackle"});

                expect(mon.moveset.get("tackle")).to.not.be.null;
            });
        });

        describe("#modifyPP()", function()
        {
            it("Should modify pp amount of move", function()
            {
                const moveset = driver.state.teams.them.active.moveset;
                driver.modifyPP(
                {
                    type: "modifyPP", monRef: "them", move: "splash", amount: -4
                });

                const move = moveset.get("splash");
                expect(move).to.not.be.null;

                expect(move!.pp).to.equal(60);
                expect(move!.maxpp).to.equal(64);

                driver.modifyPP(
                {
                    type: "modifyPP", monRef: "them", move: "splash", amount: 3
                });
                expect(move!.pp).to.equal(63);
                expect(move!.maxpp).to.equal(64);
            });

            describe("amount=deplete", function()
            {
                it("Should fully deplete pp", function()
                {
                    const moveset = driver.state.teams.them.active.moveset;
                    driver.modifyPP(
                    {
                        type: "modifyPP", monRef: "them", move: "splash",
                        amount: "deplete"
                    });

                    const move = moveset.get("splash");
                    expect(move).to.not.be.null;
                    expect(move!.pp).to.equal(0);
                    expect(move!.maxpp).to.equal(64);
                });
            });
        });

        describe("#restoreMoves()", function()
        {
            it("Should restore all move's PP", function()
            {
                const moveset = driver.state.teams.them.active.moveset;
                driver.handleEvents(
                [
                    {
                        type: "modifyPP", monRef: "them", move: "splash",
                        amount: -4
                    },
                    {
                        type: "modifyPP", monRef: "them", move: "tackle",
                        amount: "deplete"
                    }
                ]);

                driver.restoreMoves({type: "restoreMoves", monRef: "them"});

                const splash = moveset.get("splash");
                expect(splash).to.not.be.null;
                expect(splash!.pp).to.equal(splash!.maxpp);

                const tackle = moveset.get("tackle");
                expect(tackle).to.not.be.null;
                expect(tackle!.pp).to.equal(tackle!.maxpp);
            });
        });

        describe("#setSingleMoveStatus()", function()
        {
            function test(name: string, status: SingleMoveStatus)
            {
                it(`Should set ${name}`, function()
                {
                    const mon = driver.state.teams.us.active;
                    expect(mon.volatile[status]).to.be.false;

                    driver.setSingleMoveStatus(
                        {type: "setSingleMoveStatus", monRef: "us", status});

                    expect(mon.volatile[status]).to.be.true;
                });
            }

            test("Destiny Bond", "destinyBond");
            test("Grudge", "grudge");
            test("Rage", "rage");
        });

        describe("#setSingleTurnStatus()", function()
        {
            function test(name: string, status: SingleTurnStatus)
            {
                it(`Should set ${name}`, function()
                {
                    const mon = driver.state.teams.us.active;
                    expect(mon.volatile[status]).to.be.false;

                    driver.setSingleTurnStatus(
                        {type: "setSingleTurnStatus", monRef: "us", status});

                    expect(mon.volatile[status]).to.be.true;
                });
            }

            test("Magic Coat", "magicCoat");
            test("Roost", "roost");
            test("Snatch", "snatch");
        });

        describe("#takeDamage()", function()
        {
            it("Should change hp", function()
            {
                const mon = driver.state.teams.us.active;
                expect(mon.hp.current).to.equal(115);

                driver.takeDamage(
                {
                    type: "takeDamage", monRef: "us", newHP: [50, 115],
                    tox: false
                });

                expect(mon.hp.current).to.equal(50);
            });
        });

        describe("#activateSideCondition()", function()
        {
            function testItemCondition(name: string,
                condition: "lightScreen" | "reflect")
            {
                it(`Should activate ${name}`, function()
                {
                    const team = driver.state.teams.them;
                    expect(team.status[condition].isActive).to.be.false;

                    // start the condition
                    driver.activateSideCondition(
                    {
                        type: "activateSideCondition", teamRef: "them",
                        condition, start: true
                    });

                    expect(team.status[condition].isActive).to.be.true;

                    // end the condition
                    driver.activateSideCondition(
                    {
                        type: "activateSideCondition", teamRef: "them",
                        condition, start: false
                    });

                    expect(team.status[condition].isActive).to.be.false;
                });

                it(`Should activate ${name} with source pokemon`, function()
                {
                    const team = driver.state.teams.them;
                    const mon = team.active;
                    expect(team.status[condition].isActive).to.be.false;

                    // start the condition
                    driver.activateSideCondition(
                    {
                        type: "activateSideCondition", teamRef: "them",
                        condition, start: true, monRef: "them"
                    });

                    expect(team.status[condition].isActive).to.be.true;
                    expect(team.status[condition].source).to.equal(mon.item);

                    // end the condition
                    driver.activateSideCondition(
                    {
                        type: "activateSideCondition", teamRef: "them",
                        condition, start: false
                    });

                    expect(team.status[condition].isActive).to.be.false;
                });
            }

            testItemCondition("Light Screen", "lightScreen");
            testItemCondition("Reflect", "reflect");

            function testHazard(name: string,
                condition: "spikes" | "stealthRock" | "toxicSpikes")
            {
                it(`Should activate ${name}`, function()
                {
                    const team = driver.state.teams.us;
                    expect(team.status[condition]).to.equal(0);

                    // start the condition
                    driver.activateSideCondition(
                    {
                        type: "activateSideCondition", teamRef: "us", condition,
                        start: true
                    });

                    expect(team.status[condition]).to.equal(1);

                    // end the condition
                    driver.activateSideCondition(
                    {
                        type: "activateSideCondition", teamRef: "us", condition,
                        start: false
                    });

                    expect(team.status[condition]).to.equal(0);
                });
            }

            testHazard("Spikes", "spikes");
            testHazard("Stealth Rock", "stealthRock");
            testHazard("Toxic Spikes", "toxicSpikes");

            function testStatus(name: string, condition: SideConditionType,
                getter: (ts: ReadonlyTeamStatus) => boolean)
            {
                it(`Should activate ${name}`, function()
                {
                    const ts = driver.state.teams.us.status;
                    expect(getter(ts)).to.be.false;

                    // start the condition
                    driver.activateSideCondition(
                    {
                        type: "activateSideCondition", teamRef: "us", condition,
                        start: true
                    });

                    expect(getter(ts)).to.be.true;

                    // end the condition
                    driver.activateSideCondition(
                    {
                        type: "activateSideCondition", teamRef: "us", condition,
                        start: false
                    });

                    expect(getter(ts)).to.be.false;
                });
            }

            testStatus("Healing Wish", "healingWish", ts => ts.healingWish);
            testStatus("Lucky Chant", "luckyChant",
                ts => ts.luckyChant.isActive);
            testStatus("Mist", "mist", ts => ts.mist.isActive);
            testStatus("Tailwind", "tailwind", ts => ts.tailwind.isActive);
        });

        describe("#activateFieldCondition()", function()
        {
            function test(name: string, condition: FieldConditionType)
            {
                it(`Should activate ${name}`, function()
                {
                    expect(driver.state.status[condition].isActive).to.be.false;

                    // start the condition
                    driver.activateFieldCondition(
                    {
                        type: "activateFieldCondition", condition, start: true
                    });

                    expect(driver.state.status[condition].isActive).to.be.true;

                    // end the condition
                    driver.activateFieldCondition(
                    {
                        type: "activateFieldCondition", condition, start: false
                    });

                    expect(driver.state.status[condition].isActive).to.be.false;
                });
            }

            test("Gravity", "gravity");
            test("Trick Room", "trickRoom");
        });

        describe("#rejectSwitchTrapped()", function()
        {
            it("Should infer trapping ability if kept from switching",
            function()
            {
                // bring in a pokemon that can have a trapping ability
                driver.switchIn(
                {
                    type: "switchIn", monRef: "them", species: "Dugtrio",
                    level: 100, gender: "M", hp: 100, hpMax: 100
                });

                const mon = driver.state.teams.them.active;
                expect(mon.ability).to.be.empty;
                expect(mon.traits.ability.possibleValues).to.have.all.keys(
                    "arenatrap", "sandveil");

                driver.rejectSwitchTrapped(
                    {type: "rejectSwitchTrapped", monRef: "us", by: "them"});

                expect(mon.ability).to.equal("arenatrap");
            });
        });

        describe("#clearSelfSwitch()", function()
        {
            it("Should clear self-switch flags", function()
            {
                // use a move that sets self-switch flag
                driver.useMove(
                {
                    type: "useMove", monRef: "them", moveId: "batonpass",
                    targets: ["them"]
                });
                expect(driver.state.teams.them.status.selfSwitch)
                    .to.equal("copyvolatile");

                driver.clearSelfSwitch({type: "clearSelfSwitch"});
                expect(driver.state.teams.them.status.selfSwitch).to.be.false;
            });
        });

        describe("#resetWeather()", function()
        {
            it("Should reset weather back to normal", function()
            {
                // modify the weather
                driver.setWeather(
                {
                    type: "setWeather", monRef: "us", weatherType: "Hail",
                    cause: "move"
                });

                driver.resetWeather({type: "resetWeather"});

                expect(driver.state.status.weather.type).to.equal("none");
            });
        });

        describe("#setWeather()", function()
        {
            it("Should set weather by move", function()
            {
                driver.setWeather(
                {
                    type: "setWeather", monRef: "us", weatherType: "Hail",
                    cause: "move"
                });

                expect(driver.state.status.weather.type).to.equal("Hail");
                expect(driver.state.status.weather.duration).to.not.be.null;
            });

            it("Should set weather by ability", function()
            {
                driver.setWeather(
                {
                    type: "setWeather", monRef: "us", weatherType: "SunnyDay",
                    cause: "ability"
                });

                expect(driver.state.status.weather.type).to.equal("SunnyDay");
                expect(driver.state.status.weather.turns).to.equal(0);
                expect(driver.state.status.weather.duration).to.be.null;
            });
        });

        describe("#tickWeather()", function()
        {
            it("Should tick weather", function()
            {
                // first set the weather
                driver.setWeather(
                {
                    type: "setWeather", monRef: "us", weatherType: "Sandstorm",
                    cause: "move"
                });
                expect(driver.state.status.weather.turns).to.equal(0);

                driver.tickWeather(
                    {type: "tickWeather", weatherType: "Sandstorm"});
                expect(driver.state.status.weather.turns).to.equal(1);
            });

            it("Should throw if a different weather is mentioned", function()
            {
                // first set the weather
                driver.setWeather(
                {
                    type: "setWeather", monRef: "us", weatherType: "RainDance",
                    cause: "move"
                });
                expect(driver.state.status.weather.turns).to.equal(0);

                expect(function()
                {
                    driver.tickWeather(
                        {type: "tickWeather", weatherType: "Sandstorm"});
                })
                    .to.throw(Error,
                        "Weather is 'RainDance' but upkept weather is " +
                        "'Sandstorm'");

                expect(driver.state.status.weather.type).to.equal("RainDance");
                expect(driver.state.status.weather.turns).to.equal(0);
            });
        });
    });
});
