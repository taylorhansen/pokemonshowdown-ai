import { expect } from "chai";
import "mocha";
import * as dexutil from "../../../../src/battle/dex/dex-util";
import * as effects from "../../../../src/battle/dex/effects";
import * as events from "../../../../src/battle/driver/BattleEvent";
import { AbilityContext, DriverContext, Gen4Context, MoveContext,
    SwitchContext } from "../../../../src/battle/driver/context/context";
import { BattleState } from "../../../../src/battle/state/BattleState";
import { Pokemon } from "../../../../src/battle/state/Pokemon";
import { Side } from "../../../../src/battle/state/Side";
import { ReadonlyTeam } from "../../../../src/battle/state/Team";
import { ReadonlyTeamStatus } from "../../../../src/battle/state/TeamStatus";
import { ReadonlyVolatileStatus } from
    "../../../../src/battle/state/VolatileStatus";
import { Logger } from "../../../../src/Logger";
import { ditto, smeargle } from "../helpers";

describe("Gen4Context", function()
{
    let state: BattleState;
    let ctx: Gen4Context;

    beforeEach("Initialize BattleState", function()
    {
        state = new BattleState();
    });

    beforeEach("Initialize Gen4Context", function()
    {
        ctx = new Gen4Context(state, Logger.null);
    });

    function initTeam(teamRef: Side,
        options: readonly events.DriverSwitchOptions[]): Pokemon[]
    {
        const team = state.teams[teamRef];
        team.size = options.length;
        return options.map(op => team.switchIn(op)!);
    }

    function initActive(monRef: Side, options = smeargle): Pokemon
    {
        return initTeam(monRef, [options])[0];
    }

    function handle(event: events.Any,
        instance?: new(...args: any[]) => DriverContext): void
    {
        if (instance) expect(ctx.handle(event)).to.be.an.instanceOf(instance);
        else expect(ctx.handle(event)).to.not.be.an.instanceOf(DriverContext);
    }

    describe("#handle()", function()
    {
        describe("activateAbility", function()
        {
            it("Should return AbilityContext", function()
            {
                const mon = initActive("them");
                expect(mon.ability).to.be.empty;
                handle(
                {
                    type: "activateAbility", monRef: "them",
                    ability: "swiftswim"
                },
                    AbilityContext);
                expect(mon.ability).to.equal("swiftswim");
            });
        });

        describe("activateFieldEffect", function()
        {
            function test(name: string, effect: effects.FieldType)
            {
                if (dexutil.isWeatherType(effect))
                {
                    throw new Error("Weather not supported here");
                }

                it(`Should activate ${name}`, function()
                {
                    expect(state.status[effect].isActive).to.be.false;

                    // start the effect
                    handle({type: "activateFieldEffect", effect, start: true});
                    expect(state.status[effect].isActive).to.be.true;

                    // end the effect
                    handle({type: "activateFieldEffect", effect, start: false});
                    expect(state.status[effect].isActive).to.be.false;
                });
            }

            test("Gravity", "gravity");
            test("Trick Room", "trickRoom");

            describe("weather", function()
            {
                it("Should set weather", function()
                {
                    handle(
                    {
                        type: "activateFieldEffect", effect: "Sandstorm",
                        start: true
                    });

                    expect(state.status.weather.type).to.equal("Sandstorm");
                    expect(state.status.weather.duration).to.not.be.null;
                    expect(state.status.weather.source).to.be.null;
                });
            });
        });

        describe("activateItem", function()
        {
            it("Should reveal item", function()
            {
                const {item} = initActive("them");
                expect(item.definiteValue).to.be.null;
                handle({type: "activateItem", monRef: "them", item: "lifeorb"});
                expect(item.definiteValue).to.equal("lifeorb");
            });
        });

        describe("activateStatusEffect", function()
        {
            function test(name: string, effect: effects.StatusType,
                getter: (v: ReadonlyVolatileStatus) => boolean)
            {
                it(`Should activate ${name}`, function()
                {
                    const v = initActive("us").volatile;
                    expect(getter(v)).to.be.false;

                    // start the status
                    handle(
                    {
                        type: "activateStatusEffect", monRef: "us", effect,
                        start: true
                    });
                    expect(getter(v)).to.be.true;

                    // end the status
                    handle(
                    {
                        type: "activateStatusEffect", monRef: "us", effect,
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
            // separate test case for encore
            it("Should activate Encore", function()
            {
                const v = initActive("us").volatile;
                expect(v.encore.move).to.be.null;
                expect(v.encore.ts.isActive).to.be.false;

                // have to set lastMove first
                expect(() => ctx.handle(
                    {
                        type: "activateStatusEffect", monRef: "us",
                        effect: "encore", start: true
                    }))
                    .to.throw(Error, "Can't Encore if lastMove is null");

                // set lastMove
                handle({type: "useMove", monRef: "us", move: "splash"},
                    MoveContext);
                expect(v.lastMove).to.equal("splash");

                // start the status
                handle(
                {
                    type: "activateStatusEffect", monRef: "us",
                    effect: "encore", start: true
                });
                expect(v.encore.move).to.equal("splash");
                expect(v.encore.ts.isActive).to.be.true;

                // end the status
                handle(
                {
                    type: "activateStatusEffect", monRef: "us",
                    effect: "encore", start: false
                });
                expect(v.encore.move).to.be.null;
                expect(v.encore.ts.isActive).to.be.false;
            });
            test("Flash Fire", "flashFire", v => v.flashFire);
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
            test("suppress ability", "suppressAbility", v => v.suppressAbility);
            test("Slow Start", "slowStart", v => v.slowStart.isActive);
            test("Taunt", "taunt", v => v.taunt.isActive);
            test("Torment", "torment", v => v.torment);
            test("Uproar", "uproar", v => v.uproar.isActive);
            test("Water Sport", "waterSport", v => v.waterSport);
            test("Yawn", "yawn", v => v.yawn.isActive);

            // singlemove
            test("Destiny Bond", "destinyBond", v => v.destinyBond);
            test("Grudge", "grudge", v => v.grudge);
            test("Rage", "rage", v => v.rage);

            // singleturn
            test("Endure", "endure", v => v.stallTurns > 0);
            test("Magic Coat", "magicCoat", v => v.magicCoat);
            test("Protect", "protect", v => v.stallTurns > 0);
            test("Roost", "roost", v => v.roost);
            test("Snatch", "snatch", v => v.snatch);

            it("Should throw if invalid status", function()
            {
                // the type system should guarantee that StateDriver handles
                //  all StatusEffectTypes, so we need to pass in an invalid one
                //  through an any assertion
                expect(function()
                {
                    handle(
                    {
                        type: "activateStatusEffect", monRef: "us",
                        effect: "invalid" as any, start: true
                    });
                })
                    .to.throw(Error, "Invalid status effect 'invalid'");
            });

            describe("major status", function()
            {
                it("Should afflict major status", function()
                {
                    const mon = initActive("us");
                    mon.majorStatus.afflict("brn"); // should make no difference

                    // start the status
                    handle(
                    {
                        type: "activateStatusEffect", monRef: "us",
                        effect: "slp", start: true
                    });
                    expect(mon.majorStatus.current).to.equal("slp");

                    // end the status
                    handle(
                    {
                        type: "activateStatusEffect", monRef: "us",
                        effect: "slp", start: false
                    });
                    expect(mon.majorStatus.current).to.be.null;
                });

                it("Should throw if curing but mentioned an unrelated status",
                function()
                {
                    const mon = initActive("us");
                    mon.majorStatus.afflict("frz");

                    expect(() =>
                        ctx.handle(
                        {
                            type: "activateStatusEffect", monRef: "us",
                            effect: "brn", start: false
                        }))
                        .to.throw(Error,
                            "MajorStatus 'frz' was expected to be 'brn'");
                    expect(mon.majorStatus.current).to.equal("frz");
                });
            });
        });

        describe("activateTeamEffect", function()
        {
            function testItemEffect(name: string,
                effect: "lightScreen" | "reflect")
            {
                it(`Should activate ${name}`, function()
                {
                    const team = state.teams.them;
                    expect(team.status[effect].isActive).to.be.false;

                    // start the effect
                    handle(
                    {
                        type: "activateTeamEffect", teamRef: "them",
                        effect, start: true
                    });
                    expect(team.status[effect].isActive).to.be.true;
                    expect(team.status[effect].source).to.be.null;

                    // end the effect
                    handle(
                    {
                        type: "activateTeamEffect", teamRef: "them",
                        effect, start: false
                    });
                    expect(team.status[effect].isActive).to.be.false;
                });
            }

            testItemEffect("Light Screen", "lightScreen");
            testItemEffect("Reflect", "reflect");

            function testHazard(name: string,
                effect: "spikes" | "stealthRock" | "toxicSpikes")
            {
                it(`Should activate ${name}`, function()
                {
                    const team = state.teams.us;
                    expect(team.status[effect]).to.equal(0);

                    // start the effect
                    handle(
                    {
                        type: "activateTeamEffect", teamRef: "us", effect,
                        start: true
                    });
                    expect(team.status[effect]).to.equal(1);

                    // end the effect
                    handle(
                    {
                        type: "activateTeamEffect", teamRef: "us", effect,
                        start: false
                    });
                    expect(team.status[effect]).to.equal(0);
                });
            }

            testHazard("Spikes", "spikes");
            testHazard("Stealth Rock", "stealthRock");
            testHazard("Toxic Spikes", "toxicSpikes");

            function testEffect(name: string, effect: effects.TeamType,
                getter: (ts: ReadonlyTeamStatus) => boolean)
            {
                it(`Should activate ${name}`, function()
                {
                    const ts = state.teams.us.status;
                    expect(getter(ts)).to.be.false;

                    // start the effect
                    handle(
                    {
                        type: "activateTeamEffect", teamRef: "us", effect,
                        start: true
                    });
                    expect(getter(ts)).to.be.true;

                    // end the effect
                    handle(
                    {
                        type: "activateTeamEffect", teamRef: "us", effect,
                        start: false
                    });
                    expect(getter(ts)).to.be.false;
                });
            }

            testEffect("Healing Wish", "healingWish", ts => ts.healingWish);
            testEffect("Lucky Chant", "luckyChant",
                ts => ts.luckyChant.isActive);
            testEffect("Mist", "mist", ts => ts.mist.isActive);
            testEffect("Safeguard", "safeguard", ts => ts.safeguard.isActive);
            testEffect("Tailwind", "tailwind", ts => ts.tailwind.isActive);
        });

        describe("block", function()
        {
            it("Should do nothing", function()
            {
                handle({type: "block", monRef: "us", effect: "protect"});
            });
        });

        describe("boost", function()
        {
            it("Should add boost", function()
            {
                const {boosts} = initActive("us").volatile;
                boosts.atk = 1;
                handle({type: "boost", monRef: "us", stat: "atk", amount: 2});
                expect(boosts.atk).to.equal(3);
            });

            it("Should subtract boost", function()
            {
                const {boosts} = initActive("us").volatile;
                boosts.spe = 6;
                handle({type: "boost", monRef: "us", stat: "spe", amount: -2});
                expect(boosts.spe).to.equal(4);
            });

            it("Should set boost", function()
            {
                const {boosts} = initActive("us").volatile;
                boosts.evasion = -2;
                handle(
                {
                    type: "boost", monRef: "us", stat: "evasion", amount: 4,
                    set: true
                });
                expect(boosts.evasion).to.equal(4);
            });
        });

        describe("changeType", function()
        {
            it("Should change types", function()
            {
                const mon = initActive("us");
                const newTypes: [dexutil.Type, dexutil.Type] =
                    ["bug", "dragon"];
                handle({type: "changeType", monRef: "us", newTypes});
                expect(mon.types).to.deep.equal(newTypes);
            });

            it("Should also reset third type", function()
            {
                const mon = initActive("us");
                mon.volatile.addedType = "ghost";

                handle(
                {
                    type: "changeType", monRef: "us", newTypes: ["fire", "???"]
                });
                expect(mon.volatile.addedType).to.equal("???");
            });
        });

        describe("clearAllBoosts", function()
        {
            it("Should clear all boosts from both sides", function()
            {
                const us = initActive("us").volatile.boosts;
                const them = initActive("them").volatile.boosts;
                us.accuracy = 2;
                them.spe = -2;

                handle({type: "clearAllBoosts"});
                expect(us.accuracy).to.equal(0);
                expect(them.spe).to.equal(0);
            });
        });

        describe("clearNegativeBoosts", function()
        {
            it("Should clear negative boosts", function()
            {
                const {boosts} = initActive("us").volatile;
                boosts.evasion = 2;
                boosts.spa = -3;

                handle({type: "clearNegativeBoosts", monRef: "us"});
                expect(boosts.evasion).to.equal(2);
                expect(boosts.spa).to.equal(0);
            });
        });

        describe("clearPositiveBoosts", function()
        {
            it("Should clear negative boosts", function()
            {
                const {boosts} = initActive("us").volatile;
                boosts.spd = 3;
                boosts.def = -1;

                handle({type: "clearPositiveBoosts", monRef: "us"});

                expect(boosts.spd).to.equal(0);
                expect(boosts.def).to.equal(-1);
            });
        });

        describe("copyBoosts", function()
        {
            it("Should copy boosts", function()
            {
                const us = initActive("us").volatile.boosts;
                const them = initActive("them").volatile.boosts;
                us.atk = 2;
                them.atk = -2;

                handle({type: "copyBoosts", from: "us", to: "them"});
                expect(us.atk).to.equal(2);
                expect(them.atk).to.equal(2);
            });
        });

        describe("countStatusEffect", function()
        {
            function test(name: string,
                effect: effects.CountableStatusType): void
            {
                it(`Should update ${name} count`, function()
                {
                    const v = initActive("us").volatile;
                    v[effect] = 1;
                    handle(
                    {
                        type: "countStatusEffect", monRef: "us", effect,
                        amount: 2
                    });
                    expect(v[effect]).to.equal(2);
                });
            }

            test("Perish Song", "perish");
            test("Stockpile", "stockpile");
        });

        describe("crit", function()
        {
            it("Should do nothing", function()
            {
                handle({type: "crit", monRef: "us"});
            });
        });

        describe("cureTeam", function()
        {
            it("Should cure team", function()
            {
                state.teams.them.size = 2;
                const [mon1, mon2] = initTeam("them", [smeargle, ditto]);
                mon1.majorStatus.afflict("slp");
                mon2.majorStatus.afflict("frz");

                expect(mon1.majorStatus.current).to.equal("slp");
                expect(mon2.majorStatus.current).to.equal("frz");
                handle({type: "cureTeam", teamRef: "them"});
                expect(mon1.majorStatus.current).to.be.null;
                expect(mon2.majorStatus.current).to.be.null;
            });
        });

        describe("disableMove", function()
        {
            it("Should disable move", function()
            {
                const mon = initActive("them");
                handle({type: "disableMove", monRef: "them", move: "tackle"});
                expect(mon.volatile.disabled.move).to.equal("tackle");
                expect(mon.volatile.disabled.ts.isActive).to.be.true;
            });
        });

        describe("fail", function()
        {
            it("Should do nothing", function()
            {
                handle({type: "fail", monRef: "us"});
            });
        });

        describe("faint", function()
        {
            it("Should faint pokemon", function()
            {
                const mon = initActive("us");
                handle({type: "faint", monRef: "us"});
                expect(mon.fainted).to.be.true;
            });
        });

        describe("fatigue", function()
        {
            it("Should reset lockedMove status", function()
            {
                const v = initActive("them").volatile;
                v.lockedMove.start("outrage");
                handle({type: "fatigue", monRef: "them"});
                expect(v.lockedMove.isActive).to.be.false;
            });
        });

        describe("feint", function()
        {
            it("Should break stall", function()
            {
                const v = initActive("them").volatile;
                v.stall(true);
                expect(v.stalling).to.be.true;
                expect(v.stallTurns).to.equal(1);

                // assume "us" uses Feint
                handle({type: "feint", monRef: "them"});
                expect(v.stalling).to.be.false;
                // should not reset stall turns
                expect(v.stallTurns).to.equal(1);
            });
        });

        describe("formChange", function()
        {
            it("Should change form", function()
            {
                const mon = initActive("us", smeargle);
                expect(mon.species).to.equal("smeargle");

                handle(
                {
                    type: "formChange", monRef: "us", species: "gyarados",
                    // TODO: (how) would hp/level change?
                    gender: "M", level: 100, hp: 300, hpMax: 300, perm: false
                });

                expect(mon.species).to.equal("gyarados");
            });
        });

        describe("futureMove", function()
        {
            it("Should prepare and release future move", function()
            {
                const ts = state.teams.us.status;
                // prepare the move, mentioning the user
                handle(
                {
                    type: "futureMove", monRef: "us", move: "doomdesire",
                    start: true
                });
                expect(ts.futureMoves.doomdesire.isActive).to.be.true;

                // release the move, mentioning the target
                handle(
                {
                    type: "futureMove", monRef: "them", move: "doomdesire",
                    start: false
                });
                expect(ts.futureMoves.futuresight.isActive).to.be.false;
            });
        });

        describe("gameOver", function()
        {
            it("Should do nothing", function()
            {
                handle({type: "gameOver"});
            });
        });

        describe("hitCount", function()
        {
            it("Should do nothing", function()
            {
                handle({type: "hitCount", monRef: "us", count: 4});
            });
        });

        describe("immune", function()
        {
            it("Should do nothing", function()
            {
                handle({type: "immune", monRef: "them"});
            });
        });

        describe("inactive", function()
        {
            it("Should reset single-move statuses as if a move was attempted",
            function()
            {
                const v = initActive("us").volatile;
                v.destinyBond = true;

                handle({type: "inactive", monRef: "us"});
                expect(v.destinyBond).to.be.false;
            });

            it("Should reveal move if provided", function()
            {
                const moveset = initActive("them").moveset;
                expect(moveset.get("splash")).to.be.null;

                handle({type: "inactive", monRef: "them", move: "splash"});
                expect(moveset.get("splash")).to.not.be.null;
            });

            it("Should reveal move for both sides if imprison", function()
            {
                const us = initActive("us").moveset;
                const them = initActive("them").moveset;
                expect(us.get("splash")).to.be.null;
                expect(them.get("splash")).to.be.null;

                handle(
                {
                    type: "inactive", monRef: "them", reason: "imprison",
                    move: "splash"
                });
                expect(us.get("splash")).to.not.be.null;
                expect(them.get("splash")).to.not.be.null;
            });

            it("Should consume recharge turn", function()
            {
                const v = initActive("us").volatile;
                v.mustRecharge = true;

                handle({type: "inactive", monRef: "us", reason: "recharge"});
                expect(v.mustRecharge).to.be.false;
            });

            it("Should tick sleep counter", function()
            {
                const ms = initActive("us").majorStatus;
                ms.afflict("slp");
                expect(ms.current).to.equal("slp");
                expect(ms.turns).to.equal(1);

                handle({type: "inactive", monRef: "us", reason: "slp"});
                expect(ms.turns).to.equal(2);
            });

            describe("Truant ability", function()
            {
                it("Should flip Truant state", function()
                {
                    // first make sure the pokemon has truant
                    const mon = initActive("us");
                    mon.traits.setAbility("truant");
                    expect(mon.volatile.willTruant).to.be.false;

                    // also flipped back on postTurn to sync with this event
                    handle({type: "inactive", monRef: "us", reason: "truant"});
                    expect(mon.volatile.willTruant).to.be.true;
                });

                it("Should overlap truant turn with recharge turn", function()
                {
                    // first make sure the pokemon has truant
                    const mon = initActive("us");
                    mon.traits.setAbility("truant");
                    expect(mon.volatile.willTruant).to.be.false;

                    // indicate that the next turn is a recharge turn
                    mon.volatile.mustRecharge = true;

                    handle({type: "inactive", monRef: "us", reason: "truant"});
                    expect(mon.volatile.willTruant).to.be.true;
                    expect(mon.volatile.mustRecharge).to.be.false;
                });
            });

            describe("initOtherTeamSize", function()
            {
                it("Should init other team's size", function()
                {
                    handle({type: "initOtherTeamSize", size: 2});
                    expect(state.teams.them.size).to.equal(2);
                });
            });

            describe("initTeam", function()
            {
                /** Base InitTeam event for testing. */
                const initTeamEvent: events.InitTeam =
                {
                    type: "initTeam",
                    team:
                    [
                        {
                            species: "smeargle", level: 50, gender: "F",
                            hp: 115, hpMax: 115,
                            stats:
                            {
                                atk: 25, def: 40, spa: 25, spd: 50, spe: 80
                            },
                            moves: ["splash", "tackle"],
                            baseAbility: "technician", item: "lifeorb"
                        }
                    ]
                };
                function checkInitTeam(team: ReadonlyTeam,
                    event: events.InitTeam): void
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
                        for (const stat of Object.keys(dexutil.statsExceptHP) as
                            dexutil.StatExceptHP[])
                        {
                            expect(table[stat].hp).to.be.false;
                            expect(table[stat].min).to.equal(data.stats[stat]);
                            expect(table[stat].max).to.equal(data.stats[stat]);
                        }

                        // check moves
                        expect(mon.moveset.moves)
                            .to.have.lengthOf(data.moves.length);
                        for (const name of data.moves)
                        {
                            const move = mon.moveset.get(name);
                            expect(move).to.not.be.null;
                            expect(move!.name).to.equal(name);
                        }

                        // check optional data

                        if (data.hpType)
                        {
                            expect(mon.hpType.definiteValue)
                                .to.equal(data.hpType);
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
                    handle(initTeamEvent);
                    checkInitTeam(state.teams.us, initTeamEvent);
                });

                it("Should init our team with hp type and happiness", function()
                {
                    const event: events.InitTeam =
                    {
                        ...initTeamEvent,
                        team:
                        [
                            {
                                ...initTeamEvent.team[0], hpType: "fire",
                                happiness: 255
                            },
                            ...initTeamEvent.team.slice(1)
                        ]
                    };
                    handle(event);
                    checkInitTeam(state.teams.us, event);
                });
            });
        });

        describe("invertBoosts", function()
        {
            it("Should invert boosts", function()
            {
                const {boosts} = initActive("us").volatile;
                boosts.spe = 1;
                boosts.atk = -1;

                handle({type: "invertBoosts", monRef: "us"});
                expect(boosts.spe).to.equal(-1);
                expect(boosts.atk).to.equal(1);
            });
        });

        describe("lockOn", function()
        {
            it("Should set Lock-On status", function()
            {
                const us = initActive("us").volatile;
                const them = initActive("them").volatile;
                expect(us.lockedOnBy).to.be.null;
                expect(us.lockOnTarget).to.be.null;
                expect(us.lockOnTurns.isActive).to.be.false;
                expect(them.lockedOnBy).to.be.null;
                expect(them.lockOnTarget).to.be.null;
                expect(them.lockOnTurns.isActive).to.be.false;

                handle({type: "lockOn", monRef: "us", target: "them"});
                expect(us.lockedOnBy).to.be.null;
                expect(us.lockOnTarget).to.equal(them);
                expect(us.lockOnTurns.isActive).to.be.true;
                expect(them.lockedOnBy).to.equal(us);
                expect(them.lockOnTarget).to.be.null;
                expect(them.lockOnTurns.isActive).to.be.false;
            });
        });

        describe("mimic", function()
        {
            it("Should Mimic move", function()
            {
                const mon = initActive("them");
                mon.moveset.reveal("mimic");

                handle({type: "mimic", monRef: "them", move: "splash"});
                expect(mon.moveset.get("splash")).to.not.be.null;
                expect(mon.moveset.get("mimic")).to.be.null;
                expect(mon.baseMoveset.get("splash")).to.be.null;
                expect(mon.baseMoveset.get("mimic")).to.not.be.null;
            });
        });

        describe("miss", function()
        {
            it("Should do nothing", function()
            {
                handle({type: "miss", monRef: "them"});
            });
        });

        describe("modifyPP", function()
        {
            it("Should modify pp amount of move", function()
            {
                const {moveset} = initActive("them");

                handle(
                {
                    type: "modifyPP", monRef: "them", move: "splash", amount: -4
                });
                const move = moveset.get("splash");
                expect(move).to.not.be.null;
                expect(move!.pp).to.equal(60);
                expect(move!.maxpp).to.equal(64);

                handle(
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
                    const {moveset} = initActive("them");
                    handle(
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

        describe("mustRecharge", function()
        {
            it("Should indicate recharge", function()
            {
                const v = initActive("us").volatile;
                expect(v.mustRecharge).to.be.false;
                handle({type: "mustRecharge", monRef: "us"});
                expect(v.mustRecharge).to.be.true;
            });
        });

        describe("noTarget", function()
        {
            it("Should do nothing", function()
            {
                handle({type: "noTarget", monRef: "them"});
            });
        });

        describe("preTurn", function()
        {
            it("TODO", function()
            {
                handle({type: "preTurn"});
            });
        });

        describe("prepareMove", function()
        {
            it("Should prepare two-turn move", function()
            {
                const vts = initActive("them").volatile.twoTurn;
                handle({type: "prepareMove", monRef: "them",move: "dive"});

                expect(vts.isActive).to.be.true;
                expect(vts.type).to.equal("dive");
            });
        });

        describe("postTurn", function()
        {
            it("TODO", function()
            {
                handle({type: "postTurn"});
            });
        });

        describe("reenableMoves", function()
        {
            it("Should re-enable disabled moves", function()
            {
                const v = initActive("them").volatile;
                v.disableMove("tackle");
                expect(v.disabled.move).to.equal("tackle");
                expect(v.disabled.ts.isActive).to.be.true;

                handle({type: "reenableMoves", monRef: "them"});
                expect(v.disabled.move).to.be.null;
                expect(v.disabled.ts.isActive).to.be.false;
            });
        });

        describe("rejectSwitchTrapped", function()
        {
            it("Should infer trapping ability if kept from switching",
            function()
            {
                // bring in a pokemon that can have a trapping ability
                const mon = initActive("them",
                {
                    species: "dugtrio", level: 100, gender: "M", hp: 100,
                    hpMax: 100
                });
                expect(mon.ability).to.be.empty;
                expect(mon.traits.ability.possibleValues).to.have.all.keys(
                    "arenatrap", "sandveil");

                // bring in a pokemon that can be trapped
                initActive("us");

                handle({type: "rejectSwitchTrapped", monRef: "us", by: "them"});
                expect(mon.ability).to.equal("arenatrap");
            });
        });

        describe("removeItem", function()
        {
            it("Should remove item", function()
            {
                const mon = initActive("them");
                const oldItem = mon.item;
                expect(mon.item.definiteValue).to.be.null;

                handle({type: "removeItem", monRef: "them", consumed: false});
                expect(mon.item).to.not.equal(oldItem);
                expect(mon.item.definiteValue).to.equal("none");
            });
        });

        describe("resetWeather", function()
        {
            it("Should reset weather back to normal", function()
            {
                // modify the weather
                state.status.weather.start(null, "Hail");
                expect(state.status.weather.type).to.equal("Hail");

                // set it back to normal
                handle({type: "resetWeather"});
                expect(state.status.weather.type).to.equal("none");
            });
        });

        describe("resisted", function()
        {
            it("Should do nothing", function()
            {
                handle({type: "resisted", monRef: "them"});
            });
        });

        describe("restoreMoves", function()
        {
            it("Should restore all move's PP", function()
            {
                const {moveset} = initActive("them");
                moveset.reveal("splash").pp -= 4;
                moveset.reveal("tackle").pp = 0;

                handle({type: "restoreMoves", monRef: "them"});

                const splash = moveset.get("splash");
                expect(splash).to.not.be.null;
                expect(splash!.pp).to.equal(splash!.maxpp);

                const tackle = moveset.get("tackle");
                expect(tackle).to.not.be.null;
                expect(tackle!.pp).to.equal(tackle!.maxpp);
            });
        });

        describe("revealItem", function()
        {
            it("Should reveal item", function()
            {
                const {item} = initActive("them");
                expect(item.definiteValue).to.be.null;

                handle(
                {
                    type: "revealItem", monRef: "them", item: "leftovers",
                    gained: false
                });
                expect(item.definiteValue).to.equal("leftovers");
            });
        });

        describe("revealMove", function()
        {
            it("Should reveal move", function()
            {
                const {moveset} = initActive("them");
                expect(moveset.get("tackle")).to.be.null;

                handle({type: "revealMove", monRef: "them", move: "tackle"});
                expect(moveset.get("tackle")).to.not.be.null;
            });
        });

        describe("setThirdType", function()
        {
            it("Should set third type", function()
            {
                const v = initActive("us").volatile;
                handle({type: "setThirdType", monRef: "us", thirdType: "bug"});
                expect(v.addedType).to.equal("bug");
            });
        });

        describe("sketch", function()
        {
            it("Should Sketch move", function()
            {
                const mon = initActive("them");
                mon.moveset.reveal("sketch");

                handle({type: "sketch", monRef: "them", move: "tackle"});
                expect(mon.moveset.get("tackle")).to.not.be.null;
                expect(mon.moveset.get("sketch")).to.be.null;
                expect(mon.baseMoveset.get("tackle")).to.not.be.null;
                expect(mon.baseMoveset.get("sketch")).to.be.null;
            });
        });

        describe("superEffective", function()
        {
            it("Should do nothing", function()
            {
                handle({type: "superEffective", monRef: "us"});
            });
        });

        describe("swapBoosts", function()
        {
            it("Should swap stat boosts", function()
            {
                const us = initActive("us").volatile.boosts;
                const them = initActive("them").volatile.boosts;
                us.accuracy = 4;
                them.spd = -1;

                handle(
                {
                    type: "swapBoosts", monRef1: "us", monRef2: "them",
                    stats: ["accuracy", "spd"]
                });
                expect(us.accuracy).to.equal(0);
                expect(us.spd).to.equal(-1);
                expect(them.accuracy).to.equal(4);
                expect(them.spd).to.equal(0);
            });
        });

        describe("switchIn", function()
        {
            it("Should return SwitchContext", function()
            {
                handle({type: "switchIn", monRef: "us", ...smeargle},
                    SwitchContext);
            });
        });

        describe("takeDamage", function()
        {
            it("Should change hp", function()
            {
                const mon = initActive("us", smeargle);
                expect(mon.hp.current).to.equal(smeargle.hp);

                handle({type: "takeDamage", monRef: "us", newHP: [50, 100]});
                expect(mon.hp.current).to.equal(50);
            });
        });

        describe("transform", function()
        {
            it("Should transform pokemon", function()
            {
                const us = initActive("us", smeargle);
                const them = initActive("them", ditto);

                handle({type: "transform", source: "them", target: "us"});
                expect(them.volatile.transformed).to.be.true;
                expect(them.species).to.equal(us.species);
            });
        });

        describe("trap", function()
        {
            it("Should trap pokemon", function()
            {
                const us = initActive("us").volatile;
                const them = initActive("them").volatile;

                handle({type: "trap", target: "us", by: "them"});
                expect(us.trapped).to.equal(them);
                expect(us.trapping).to.be.null;
                expect(them.trapped).to.be.null;
                expect(them.trapping).to.equal(us);
            });
        });

        describe("updateFieldEffect", function()
        {
            it("Should tick weather", function()
            {
                // first set the weather
                handle(
                {
                    type: "activateFieldEffect", effect: "Sandstorm",
                    start: true
                });
                expect(state.status.weather.turns).to.equal(0);

                handle({type: "updateFieldEffect", effect: "Sandstorm"});
                expect(state.status.weather.turns).to.equal(1);
            });

            it("Should throw if a different weather is mentioned", function()
            {
                // first set the weather
                handle(
                {
                    type: "activateFieldEffect", effect: "RainDance",
                    start: true
                });
                expect(state.status.weather.turns).to.equal(0);

                expect(() =>
                        ctx.handle(
                            {type: "updateFieldEffect", effect: "Sandstorm"}))
                    .to.throw(Error,
                        "Weather is 'RainDance' but ticked weather is " +
                        "'Sandstorm'");
                expect(state.status.weather.type).to.equal("RainDance");
                expect(state.status.weather.turns).to.equal(0);
            });
        });

        describe("updateMoves", function()
        {
            it("Should update moves", function()
            {
                const mon = initActive("us");
                const tackle = mon.moveset.reveal("tackle");
                handle(
                {
                    type: "updateMoves", monRef: "us",
                    moves:
                    [
                        {id: "tackle", pp: 2},
                        {id: "watergun", pp: 5, maxpp: 20}
                    ]
                });
                expect(tackle.pp).to.equal(2);
                const watergun = mon.moveset.get("watergun")!;
                expect(watergun).to.not.be.null;
                expect(watergun.pp).to.equal(5);
                expect(watergun.maxpp).to.equal(20);
            });
        });

        describe("updateStatusEffect", function()
        {
            function test(name: string, effect: effects.UpdatableStatusType)
            {
                it(`Should update ${name}`, function()
                {
                    const v = initActive("us").volatile;
                    expect(v[effect].isActive).to.be.false;

                    // first start the effect
                    v[effect].start();
                    expect(v[effect].isActive).to.be.true;
                    expect(v[effect].turns).to.equal(1);

                    // then update it
                    handle({type: "updateStatusEffect", monRef: "us", effect});
                    expect(v[effect].isActive).to.be.true;
                    expect(v[effect].turns).to.equal(2);
                });
            }

            test("Bide", "bide");
            test("confusion", "confusion");
            test("Uproar", "uproar");
        });

        describe("useMove", function()
        {
            it("Should return MoveContext", function()
            {
                const {moveset} = initActive("them");
                expect(moveset.get("tackle")).to.be.null;

                handle({type: "useMove", monRef: "them", move: "tackle"},
                    MoveContext);
                const move = moveset.get("tackle");
                expect(move).to.not.be.null;
                expect(move!.pp).to.equal(55);
            });
        });
    });
});
