import { expect } from "chai";
import "mocha";
import * as dex from "../../../../src/battle/dex/dex";
import * as dexutil from "../../../../src/battle/dex/dex-util";
import { UseMove } from "../../../../src/battle/driver/BattleEvent";
import { AbilityContext } from
    "../../../../src/battle/driver/context/AbilityContext";
import { MoveContext } from "../../../../src/battle/driver/context/MoveContext";
import { SwitchContext } from
    "../../../../src/battle/driver/context/SwitchContext";
import { BattleState } from "../../../../src/battle/state/BattleState";
import { Pokemon, ReadonlyPokemon } from "../../../../src/battle/state/Pokemon";
import { otherSide, Side } from "../../../../src/battle/state/Side";
import { ReadonlyTeam } from "../../../../src/battle/state/Team";
import { ReadonlyVariableTempStatus } from
    "../../../../src/battle/state/VariableTempStatus";
import { Logger } from "../../../../src/Logger";
import { ditto, smeargle } from "../helpers";

describe("MoveContext", function()
{
    let state: BattleState;

    beforeEach("Initialize BattleState", function()
    {
        state = new BattleState();
    });

    function initActive(monRef: Side, options = smeargle,
        teamSize = 1): Pokemon
    {
        state.teams[monRef].size = teamSize;
        return state.teams[monRef].switchIn(options)!;
    }

    function initCtx(event: UseMove, called?: boolean): MoveContext
    {
        return new MoveContext(state, event, Logger.null, called);
    }

    describe("constructor", function()
    {
        it("Should throw if unsupported move", function()
        {
            expect(() => initCtx({type: "useMove", monRef: "us", move: "_no_"}))
                .to.throw(Error, "Unsupported move '_no_'");
        });

        describe("called = false", function()
        {
            it("Should reset single-move statuses", function()
            {
                const {volatile: v} = initActive("us");
                v.destinyBond = true;
                initCtx({type: "useMove", monRef: "us", move: "tackle"});
                expect(v.destinyBond).to.be.false;
            });

            it("Should reveal move and deduct pp", function()
            {
                const {moveset} = initActive("us");
                expect(moveset.get("tackle")).to.be.null;
                initCtx({type: "useMove", monRef: "us", move: "tackle"});

                expect(moveset.get("tackle")).to.not.be.null;
                expect(moveset.get("tackle")).to.have.property("pp", 55);
            });

            it("Should not deduct pp if releasing two-turn move", function()
            {
                const mon = initActive("us");
                // assume pp was already deducted by preparing the move
                mon.volatile.twoTurn.start("fly");

                // start a new turn
                state.postTurn();
                state.preTurn();

                // indicate that the two-turn move is being released
                initCtx({type: "useMove", monRef: "us", move: "fly"});
                expect(mon.volatile.twoTurn.isActive).to.be.false;
                // should not deduct pp
                expect(mon.moveset.get("fly")).to.not.be.null;
                expect(mon.moveset.get("fly")).to.have.property("pp", 24);
            });

            it("Should still deduct pp if starting a different two-turn move",
            function()
            {
                const mon = initActive("us");
                // in the middle of preparing a two-turn move
                mon.volatile.twoTurn.start("dig");

                // start a new turn
                state.postTurn();
                state.preTurn();

                // indicate that a different two-turn move is being started
                initCtx({type: "useMove", monRef: "us", move: "razorwind"});
                expect(mon.volatile.twoTurn.isActive).to.be.true;
                // should deduct pp
                expect(mon.moveset.get("razorwind")).to.not.be.null;
                expect(mon.moveset.get("razorwind")).to.have.property("pp", 15);
            });

            it("Should not deduct pp if continuing locked move", function()
            {
                const mon = initActive("us");
                // assume pp was already deducted by starting the move
                mon.volatile.lockedMove.start("thrash");
                // indicate that the locked move is continuing
                initCtx({type: "useMove", monRef: "us", move: "thrash"});
                expect(mon.volatile.lockedMove.isActive).to.be.true;
                // should not deduct pp
                expect(mon.moveset.get("thrash")).to.not.be.null;
                expect(mon.moveset.get("thrash")).to.have.property("pp", 32);
            });

            it("Should still deduct pp if starting a different locked move",
            function()
            {
                const mon = initActive("us");
                // in the middle of a locked move
                mon.volatile.lockedMove.start("petaldance");
                // indicate that a different locked move is being used
                initCtx({type: "useMove", monRef: "us", move: "outrage"});
                expect(mon.volatile.lockedMove.isActive).to.be.true;
                // should deduct pp
                expect(mon.moveset.get("outrage")).to.not.be.null;
                expect(mon.moveset.get("outrage")).to.have.property("pp", 23);
            });

            it("Should not deduct pp if continuing rollout move", function()
            {
                const mon = initActive("us");
                // assume pp was already deducted by starting the move
                mon.volatile.rollout.start("iceball");
                // indicate that the rollout move is continuing
                initCtx({type: "useMove", monRef: "us", move: "iceball"});
                expect(mon.volatile.rollout.isActive).to.be.true;
                // should not deduct pp
                expect(mon.moveset.get("iceball")).to.not.be.null;
                expect(mon.moveset.get("iceball")).to.have.property("pp", 32);
            });

            it("Should still deduct pp if starting a different rollout move",
            function()
            {
                const mon = initActive("us");
                // in the middle of a locked move
                mon.volatile.rollout.start("iceball");
                // indicate that a different locked move is being used
                initCtx({type: "useMove", monRef: "us", move: "rollout"});
                expect(mon.volatile.rollout.isActive).to.be.true;
                // should deduct pp
                expect(mon.moveset.get("rollout")).to.not.be.null;
                expect(mon.moveset.get("rollout")).to.have.property("pp", 31);
            });

            it("Should not reveal move if struggle", function()
            {
                const {moveset} = initActive("us");
                initCtx({type: "useMove", monRef: "us", move: "struggle"});
                expect(moveset.get("struggle")).to.be.null;
            });
        });

        describe("called = true", function()
        {
            it("Should not reset single-move statuses", function()
            {
                const {volatile: v} = initActive("us");
                v.destinyBond = true;
                initCtx({type: "useMove", monRef: "us", move: "tackle"},
                    /*called*/true);
                expect(v.destinyBond).to.be.true;
            });

            it("Shoud not reveal move", function()
            {
                const mon = initActive("us");
                initCtx({type: "useMove", monRef: "us", move: "tackle"},
                    /*called*/true);
                expect(mon.moveset.get("tackle")).to.be.null;
            });
        });
    });

    describe("#handle()", function()
    {
        it("Should pass if no handler", function()
        {
            initActive("us");
            const ctx = initCtx(
                {type: "useMove", monRef: "us", move: "tackle"});
            // TODO: should erroneous events cause a throw/expire?
            expect(ctx.handle({type: "initOtherTeamSize", size: 1}))
                .to.equal("base");
        });

        describe("activateAbility", function()
        {
            it("Should return AbilityContext", function()
            {
                initActive("us");
                initActive("them");
                const ctx = initCtx(
                    {type: "useMove", monRef: "us", move: "watergun"});
                expect(ctx.handle(
                    {
                        type: "activateAbility", monRef: "them",
                        ability: "waterabsorb"
                    }))
                    .to.be.an.instanceOf(AbilityContext);
            });
        });

        describe("activateFieldEffect", function()
        {
            it("Should pass if expected", function()
            {
                initActive("us");
                const ctx = initCtx(
                    {type: "useMove", monRef: "us", move: "trickroom"});
                expect(ctx.handle(
                    {
                        type: "activateFieldEffect", effect: "trickRoom",
                        start: true
                    }))
                    .to.equal("base");
            });

            it("Should expire if not expected", function()
            {
                initActive("us");
                const ctx = initCtx(
                    {type: "useMove", monRef: "us", move: "tackle"});
                expect(ctx.handle(
                    {
                        type: "activateFieldEffect", effect: "gravity",
                        start: true
                    }))
                    .to.equal("expire");
            });

            describe("weather", function()
            {
                it("Should infer source via move", function()
                {
                    const {item} = initActive("them");
                    const ctx = initCtx(
                        {type: "useMove", monRef: "them", move: "raindance"});
                    expect(ctx.handle(
                        {
                            type: "activateFieldEffect", effect: "RainDance",
                            start: true
                        }))
                        .to.equal("stop");

                    const weather = state.status.weather;
                    expect(weather.type).to.equal("RainDance");
                    expect(weather.duration).to.not.be.null;
                    expect(weather.source).to.equal(item);

                    // tick 5 times to infer item
                    expect(item.definiteValue).to.be.null;
                    for (let i = 0; i < 5; ++i) weather.tick();
                    expect(item.definiteValue).to.equal("damprock");
                });

                it("Should expire if mismatch", function()
                {
                    initActive("them");
                    const ctx = initCtx(
                        {type: "useMove", monRef: "them", move: "raindance"});
                    expect(ctx.handle(
                        {
                            type: "activateFieldEffect", effect: "Hail",
                            start: true
                        }))
                        .to.equal("expire");
                    // once the BaseContext handles the event, this will be set
                    //  appropriately
                    expect(state.status.weather.type).to.equal("none");
                    expect(state.status.weather.duration).to.be.null;
                    expect(state.status.weather.source).to.be.null;
                });
            });
        });

        describe("activateStatusEffect", function()
        {
            function testNonRemovable(name: string,
                effect: dexutil.StatusEffect, move: string, target: Side): void
            {
                // adjust perspective
                target = otherSide(target);

                describe(name, function()
                {
                    beforeEach("Initialize active", function()
                    {
                        initActive("them");
                        if (target !== "them") initActive("us");
                    });

                    it("Should pass if expected", function()
                    {
                        initActive("them");
                        const ctx = initCtx(
                            {type: "useMove", monRef: "them", move});
                        expect(ctx.handle(
                            {
                                type: "activateStatusEffect", monRef: target,
                                effect, start: true
                            }))
                            .to.equal("base");
                    });

                    it("Should expire if start=false", function()
                    {
                        initActive("them");
                        const ctx = initCtx(
                            {type: "useMove", monRef: "them", move});
                        expect(ctx.handle(
                            {
                                type: "activateStatusEffect", monRef: target,
                                effect, start: false
                            }))
                            .to.equal("expire");
                    });

                    it("Should expire if mismatched flags", function()
                    {
                        initActive("them");
                        const ctx = initCtx(
                            {type: "useMove", monRef: "them", move: "tackle"});
                        expect(ctx.handle(
                            {
                                type: "activateStatusEffect", monRef: target,
                                effect, start: true
                            }))
                            .to.equal("expire");
                    });
                });
            }

            testNonRemovable("Aqua Ring", "aquaRing", "aquaring", "us");
            testNonRemovable("Attract", "attract", "attract", "them");
            testNonRemovable("Bide", "bide", "bide", "us");
            testNonRemovable("Charge", "charge", "charge", "us");
            // handled specially by another test case
            // testNonRemovable("Curse", "curse", "curse", "them");
            testNonRemovable("Embargo", "embargo", "embargo", "them");
            testNonRemovable("Encore", "encore", "encore", "them");
            testNonRemovable("Focus Energy", "focusEnergy", "focusenergy",
                "us");
            testNonRemovable("Foresight", "foresight", "foresight", "them");
            testNonRemovable("Heal Block", "healBlock", "healblock", "them");
            testNonRemovable("Ingrain", "ingrain", "ingrain", "us");
            testNonRemovable("Magnet Rise", "magnetRise", "magnetrise", "us");
            testNonRemovable("Miracle Eye", "miracleEye", "miracleeye", "them");
            testNonRemovable("Mud Sport", "mudSport", "mudsport", "us");
            testNonRemovable("Nightmare", "nightmare", "nightmare", "them");
            testNonRemovable("Power Trick", "powerTrick", "powertrick", "us");
            testNonRemovable("Suppress ability", "suppressAbility",
                "gastroacid", "them");
            testNonRemovable("Taunt", "taunt", "taunt", "them");
            testNonRemovable("Torment", "torment", "torment", "them");
            testNonRemovable("Water Sport", "waterSport", "watersport", "us");
            testNonRemovable("Yawn", "yawn", "yawn", "them");

            // singlemove
            testNonRemovable("Destiny Bond", "destinyBond", "destinybond",
                "us");
            testNonRemovable("Grudge", "grudge", "grudge", "us");
            testNonRemovable("Rage", "rage", "rage", "us");

            // singleturn
            testNonRemovable("Endure", "endure", "endure", "us");
            testNonRemovable("Magic Coat", "magicCoat", "magiccoat", "us");
            testNonRemovable("Protect", "protect", "protect", "us");
            testNonRemovable("Roost", "roost", "roost", "us");
            testNonRemovable("Snatch", "snatch", "snatch", "us");

            function testRemovable(name: string, effect: dexutil.StatusEffect,
                move: string, target: Side): void
            {
                // adjust perspective
                target = otherSide(target);

                describe(name, function()
                {
                    beforeEach("Initialize active", function()
                    {
                        initActive("them");
                        if (target !== "them") initActive("us");
                    });

                    it("Should pass if expected", function()
                    {
                        const ctx = initCtx(
                            {type: "useMove", monRef: "them", move});
                        expect(ctx.handle(
                            {
                                type: "activateStatusEffect", monRef: target,
                                effect, start: true
                            }))
                            .to.equal("base");
                    });

                    it("Should still pass if start=false", function()
                    {
                        const ctx = initCtx(
                            {type: "useMove", monRef: "them", move});
                        // TODO: track moves that can do this
                        expect(ctx.handle(
                            {
                                type: "activateStatusEffect", monRef: target,
                                effect, start: false
                            }))
                            .to.equal("base");
                    });

                    it("Should expire if mismatched flags", function()
                    {
                        const ctx = initCtx(
                            {type: "useMove", monRef: "them", move: "tackle"});
                        expect(ctx.handle(
                            {
                                type: "activateStatusEffect", monRef: target,
                                effect, start: true
                            }))
                            .to.equal("expire");
                    });
                });
            }

            testRemovable("Confusion", "confusion", "confuseray", "them");
            testRemovable("Leech Seed", "leechSeed", "leechseed", "them");
            testRemovable("Substitute", "substitute", "substitute", "us");

            // secondary effect
            testRemovable("Secondary confusion", "confusion", "confusion",
                "them");
            testRemovable("Sleep", "slp", "spore", "them");

            describe("Slow Start", function()
            {
                it("Should expire", function()
                {
                    initActive("them");
                    const ctx = initCtx(
                        {type: "useMove", monRef: "them", move: "tackle"});
                    expect(ctx.handle(
                        {
                            type: "activateStatusEffect", monRef: "them",
                            effect: "slowStart", start: true
                        }))
                        .to.equal("expire");
                });
            });

            testNonRemovable("Uproar", "uproar", "uproar", "us");
        });

        describe("activateTeamEffect", function()
        {
            // can only be explicitly ended by a separate event, not a move
            const faintMoves =
            [
                ["Healing Wish", "healingWish", "healingwish"],
                ["Lunar Dnace", "lunarDance", "lunardance"]
            ] as const;
            for (const [name, effect, move] of faintMoves)
            {
                describe(name, function()
                {
                    it("Should expire", function()
                    {
                        initActive("them");
                        const ctx = initCtx(
                            {type: "useMove", monRef: "them", move});
                        expect(ctx.handle(
                            {
                                type: "activateTeamEffect", teamRef: "them",
                                effect, start: true
                            }))
                            .to.equal("expire");
                    });
                });
            }

            const otherMoves =
            [
                ["Lucky Chant", "luckyChant", "luckychant"],
                ["Mist", "mist", "mist"],
                ["Safeguard", "safeguard", "safeguard"],
                ["Tailwind", "tailwind", "tailwind"]
            ] as const;
            for (const [name, effect, move] of otherMoves)
            {
                describe(name, function()
                {
                    it("Should pass if expected", function()
                    {
                        initActive("them");
                        const ctx = initCtx(
                            {type: "useMove", monRef: "them", move});
                        expect(ctx.handle(
                            {
                                type: "activateTeamEffect", teamRef: "them",
                                effect, start: true
                            }))
                            .to.equal("base");
                    });

                    it("Should expire if start=false", function()
                    {
                        initActive("them");
                        const ctx = initCtx(
                            {type: "useMove", monRef: "them", move});
                        expect(ctx.handle(
                            {
                                type: "activateTeamEffect", teamRef: "them",
                                effect, start: false
                            }))
                            .to.equal("expire");
                    });

                    it("Should expire if mismatched flags", function()
                    {
                        initActive("them");
                        const ctx = initCtx(
                            {type: "useMove", monRef: "them", move: "tackle"});
                        expect(ctx.handle(
                            {
                                type: "activateTeamEffect", teamRef: "them",
                                effect, start: true
                            }))
                            .to.equal("expire");
                    });
                });
            }

            const hazardMoves =
            [
                ["Spikes", "spikes", "spikes"],
                ["Stealth Rock", "stealthRock", "stealthrock"],
                ["Toxic Spikes", "toxicSpikes", "toxicspikes"]
            ] as const;
            for (const [name, effect, move] of hazardMoves)
            {
                describe(name, function()
                {
                    it("Should pass if expected", function()
                    {
                        initActive("them");
                        const ctx = initCtx(
                            {type: "useMove", monRef: "them", move});
                        expect(ctx.handle(
                            {
                                type: "activateTeamEffect", teamRef: "them",
                                effect, start: true
                            }))
                            .to.equal("base");
                    });

                    it("Should still pass if start=false", function()
                    {
                        initActive("them");
                        const ctx = initCtx(
                            {type: "useMove", monRef: "them", move});
                        // TODO: track moves that can do this
                        expect(ctx.handle(
                            {
                                type: "activateTeamEffect", teamRef: "them",
                                effect, start: false
                            }))
                            .to.equal("base");
                    });

                    it("Should expire if mismatched flags", function()
                    {
                        initActive("them");
                        const ctx = initCtx(
                            {type: "useMove", monRef: "them", move: "tackle"});
                        expect(ctx.handle(
                            {
                                type: "activateTeamEffect", teamRef: "them",
                                effect, start: true
                            }))
                            .to.equal("expire");
                    });
                });
            }

            const screenMoves =
            [
                ["Light Screen", "lightScreen", "lightscreen"],
                ["Reflect", "reflect", "reflect"]
            ] as const;
            for (const [name, effect, move] of screenMoves)
            {
                describe(name, function()
                {
                    it("Should infer source via move", function()
                    {
                        const team = state.teams.them;
                        const {item} = initActive("them");
                        const ctx = initCtx(
                            {type: "useMove", monRef: "them", move});
                        expect(ctx.handle(
                            {
                                type: "activateTeamEffect", teamRef: "them",
                                effect, start: true
                            }))
                            .to.equal("stop");
                        expect(team.status[effect].isActive).to.be.true;
                        expect(team.status[effect].source).to.equal(item);
                    });

                    it("Should expire if mismatch", function()
                    {
                        const {status: ts} = state.teams.them;
                        initActive("them");
                        const ctx = initCtx(
                        {
                            type: "useMove", monRef: "them",
                            move: effect.toLowerCase()
                        });
                        const otherEffect = effect === "reflect" ?
                            "lightScreen" : "reflect";
                        expect(ctx.handle(
                            {
                                type: "activateTeamEffect", teamRef: "them",
                                effect: otherEffect, start: true
                            }))
                            .to.equal("expire");
                        expect(ts.reflect.isActive).to.be.false;
                        expect(ts.reflect.source).to.be.null;
                        // BaseContext should handle this
                        expect(ts.lightScreen.isActive).to.be.false;
                        expect(ts.lightScreen.source).to.be.null;
                    });
                });
            }
        });

        describe("boost", function()
        {
            it("Should handle boost", function()
            {
                initActive("us");
                initActive("them");
                const ctx = initCtx(
                    {type: "useMove", monRef: "us", move: "leafstorm"});

                expect(ctx.handle(
                        {type: "boost", monRef: "us", stat: "spa", amount: -2}))
                    .to.equal("base");
                ctx.expire(); // shouldn't throw
            });

            it("Should allow partial boost if maxing out", function()
            {
                const mon = initActive("us");
                mon.volatile.boosts.spa = 4;
                const ctx = initCtx(
                    {type: "useMove", monRef: "us", move: "tailglow"});

                expect(ctx.handle(
                        {type: "boost", monRef: "us", stat: "spa", amount: 2}))
                    .to.equal("base");
                ctx.expire(); // shouldn't throw
            });

            it("Should allow no boost if maxed out", function()
            {
                const mon = initActive("us");
                initActive("them");
                mon.volatile.boosts.spa = -6;
                const ctx = initCtx(
                    {type: "useMove", monRef: "us", move: "dracometeor"});
                ctx.expire(); // shouldn't throw
            });
        });

        describe("changeType", function()
        {
            it("Should infer move if conversion", function()
            {
                const mon = initActive("them");
                const ctx = initCtx(
                    {type: "useMove", monRef: "them", move: "conversion"});

                // changes into a water type, meaning the pokemon must have a
                //  water type move
                expect(ctx.handle(
                    {
                        type: "changeType", monRef: "them",
                        newTypes: ["water", "???"]
                    }))
                    .to.equal("base");

                // one move slot left to infer after conversion
                mon.moveset.reveal("tackle");
                mon.moveset.reveal("takedown");

                // one of the moves can be either fire or water type
                expect(mon.moveset.get("ember")).to.be.null;
                expect(mon.moveset.get("watergun")).to.be.null;
                mon.moveset.addMoveSlotConstraint(["ember", "watergun"]);
                // should have now consumed the move slot constraint
                expect(mon.moveset.moveSlotConstraints).to.be.empty;
                expect(mon.moveset.get("ember")).to.be.null;
                expect(mon.moveset.get("watergun")).to.not.be.null;
            });
        });

        describe("faint", function()
        {
            it("Should cancel effects of target", function()
            {
                initActive("us");
                initActive("them");
                // 100% confuse rate
                const ctx = initCtx(
                    {type: "useMove", monRef: "them", move: "dynamicpunch"});

                expect(ctx.handle({type: "faint", monRef: "us"}))
                    .to.equal("base");
                ctx.expire(); // shouldn't throw
            });
        });

        describe("futureMove", function()
        {
            it("Should handle future move", function()
            {
                initActive("them");
                const ctx = initCtx(
                    {type: "useMove", monRef: "them", move: "futuresight"});

                expect(ctx.handle(
                    {
                        type: "futureMove", monRef: "them",
                        move: "futuresight", start: true
                    }))
                    .to.equal("base");
                expect(ctx.handle(
                    {
                        type: "futureMove", monRef: "them",
                        move: "doomdesire", start: true
                    }))
                    .to.equal("expire");
                expect(ctx.handle(
                    {
                        type: "futureMove", monRef: "them",
                        move: "futuresight", start: false
                    }))
                    .to.equal("expire");
            });
        });

        describe("prepareMove", function()
        {
            it("Should handle two-turn move", function()
            {
                // prepare
                const mon = initActive("them");
                initActive("us");
                const ctx = initCtx(
                    {type: "useMove", monRef: "them", move: "fly"});

                expect(ctx.handle(
                        {type: "prepareMove", monRef: "them", move: "fly"}))
                    .to.equal("base");
                expect(ctx.handle(
                        {type: "prepareMove", monRef: "them", move: "bounce"}))
                    .to.equal("expire");
                ctx.expire();

                // release
                mon.volatile.twoTurn.start("fly");
                initCtx({type: "useMove", monRef: "them", move: "fly"})
                    .expire();
                expect(mon.volatile.twoTurn.isActive).to.be.false;
            });
        });

        describe("swapBoosts", function()
        {
            it("Should handle swap boost move", function()
            {
                initActive("us");
                initActive("them");
                const ctx = initCtx(
                    {type: "useMove", monRef: "them", move: "guardswap"});

                expect(ctx.handle(
                    {
                        type: "swapBoosts", monRef1: "us", monRef2: "them",
                        stats: ["def", "spd", "spe"]
                    }))
                    .to.equal("expire");
                expect(ctx.handle(
                    {
                        type: "swapBoosts", monRef1: "us", monRef2: "them",
                        stats: ["def", "spd"]
                    }))
                    .to.equal("base");
                // effect should be consumed after accepting the 2nd swapBoosts
                expect(ctx.handle(
                    {
                        type: "swapBoosts", monRef1: "us", monRef2: "them",
                        stats: ["def", "spd"]
                    }))
                    .to.equal("expire");
                ctx.expire();
            });
        });

        describe("switchIn", function()
        {
            it("Should return SwitchContext if self-switch expected",
            function()
            {
                initActive("them");
                const ctx = initCtx(
                    {type: "useMove", monRef: "them", move: "batonpass"});
                expect(ctx.handle(
                        {type: "switchIn", monRef: "them", ...ditto}))
                    .to.be.an.instanceOf(SwitchContext);
            });

            it("Should expire if no self-switch expected", function()
            {
                initActive("them");
                const ctx = initCtx(
                    {type: "useMove", monRef: "them", move: "pursuit"});
                expect(ctx.handle(
                        {type: "switchIn", monRef: "them", ...smeargle}))
                    .to.equal("expire");
            });

            it("Should expire if self-switch expected but opponent switched",
            function()
            {
                initActive("them");
                const ctx = initCtx(
                    {type: "useMove", monRef: "them", move: "pursuit"});
                expect(ctx.handle(
                        {type: "switchIn", monRef: "us", ...smeargle}))
                    .to.equal("expire");
            });
        });

        describe("transform", function()
        {
            it("Should pass if user and source match", function()
            {
                initActive("us");
                initActive("them");
                const ctx = initCtx(
                    {type: "useMove", monRef: "them", move: "transform"});
                expect(ctx.handle(
                        {type: "transform", source: "them", target: "us"}))
                    .to.equal("base");
            });

            it("Should expire if user/source mismatch", function()
            {
                initActive("them");
                const ctx = initCtx(
                    {type: "useMove", monRef: "them", move: "transform"});
                expect(ctx.handle(
                        {type: "transform", source: "us", target: "them"}))
                    .to.equal("expire");
            });
        });

        describe("useMove", function()
        {
            it("Should expire if no call effect expected", function()
            {
                initActive("them");
                const ctx = initCtx(
                {
                    type: "useMove", monRef: "them",
                    move: "tackle"
                });

                expect(ctx.handle(
                        {type: "useMove", monRef: "them", move: "tackle"}))
                    .to.equal("expire");
            });

            // extract self+target move-callers
            const selfMoveCallers: string[] = [];
            const targetMoveCallers: string[] = [];
            for (const move of Object.keys(dex.moveCallers))
            {
                const effect = dex.moveCallers[move];
                if (effect === "self") selfMoveCallers.push(move);
                else if (effect === "target") targetMoveCallers.push(move);
            }

            describe("Self move-callers", function()
            {
                for (const caller of selfMoveCallers)
                {
                    it(`Should infer user's move when using ${caller}`,
                    function()
                    {
                        const them = initActive("them");

                        // use the move-caller
                        const ctx = initCtx(
                            {type: "useMove", monRef: "them", move: caller});

                        // call the move
                        expect(ctx.handle(
                            {
                                type: "useMove", monRef: "them", move: "tackle"
                            }))
                            .to.be.an.instanceOf(MoveContext);
                        expect(them.moveset.get("tackle")).to.not.be.null;
                        // shouldn't consume pp for the called move
                        expect(them.moveset.get("tackle")!.pp).to.equal(56);
                    });
                }

                it("Should expire if the call effect was ignored", function()
                {
                    const them = initActive("them");

                    const ctx = initCtx(
                    {
                        type: "useMove", monRef: "them",
                        move: selfMoveCallers[0]
                    });

                    expect(ctx.handle(
                            {type: "useMove", monRef: "us", move: "tackle"}))
                        .to.equal("expire");
                    expect(them.moveset.get("tackle")).to.be.null;
                });
            });

            describe("Target move-callers", function()
            {
                for (const caller of targetMoveCallers)
                {
                    it(`Should infer target's move when using ${caller}`,
                    function()
                    {
                        // switch in a pokemon that has the move-caller
                        const us = initActive("us");
                        const them = initActive("them");

                        // use the move-caller
                        const ctx = initCtx(
                            {type: "useMove", monRef: "us", move: caller});

                        // call the move
                        expect(ctx.handle(
                            {
                                type: "useMove", monRef: "us", move: "tackle"
                            }))
                            .to.be.an.instanceOf(MoveContext);
                        expect(us.moveset.get("tackle")).to.be.null;
                        expect(them.moveset.get("tackle")).to.not.be.null;
                        // shouldn't consume pp for the called move
                        expect(them.moveset.get("tackle")!.pp).to.equal(56);
                    });
                }

                it("Should expire if the call effect was ignored", function()
                {
                    initActive("us");
                    const them = initActive("them");

                    const ctx = initCtx(
                    {
                        type: "useMove", monRef: "them",
                        move: targetMoveCallers[0]
                    });

                    expect(ctx.handle(
                            {type: "useMove", monRef: "us", move: "tackle"}))
                        .to.equal("expire");
                    expect(them.moveset.get("tackle")).to.be.null;
                });
            });
        });
    });

    describe("#halt()", function()
    {
        // TODO
    });

    describe("#expire()", function()
    {
        // TODO
    });

    describe("Curse move", function()
    {
        it("Should pass if ghost type", function()
        {
            initActive("us");
            initActive("them", smeargle).volatile.addedType = "ghost";
            const ctx = initCtx(
                {type: "useMove", monRef: "them", move: "curse"});
            expect(ctx.handle(
                {
                    type: "activateStatusEffect", monRef: "us", effect: "curse",
                    start: true
                }))
                .to.equal("base");
            ctx.expire();
        });

        it("Should expire if non-ghost type", function()
        {
            initActive("them", smeargle);
            const ctx = initCtx(
                {type: "useMove", monRef: "them", move: "curse"});
            expect(ctx.handle(
                {
                    type: "activateStatusEffect", monRef: "us", effect: "curse",
                    start: true
                }))
                .to.equal("expire");
            ctx.expire();
        });

        it("Should expire if start=false", function()
        {
            initActive("them").volatile.addedType = "ghost";
            const ctx = initCtx(
                {type: "useMove", monRef: "them", move: "curse"});
            expect(ctx.handle(
                {
                    type: "activateStatusEffect", monRef: "us",
                    effect: "curse", start: false
                }))
                .to.equal("expire");
        });

        it("Should expire if mismatched flags", function()
        {
            initActive("them");
            const ctx = initCtx(
                {type: "useMove", monRef: "them", move: "tackle"});
            expect(ctx.handle(
                {
                    type: "activateStatusEffect", monRef: "us",
                    effect: "curse", start: true
                }))
                .to.equal("expire");
        });
    });

    describe("Imprison move", function()
    {
        let us: Pokemon;
        let them: Pokemon;

        function setup(imprisonUser: Side, sameOpponent = true): void
        {
            us = initActive("us",
                {species: "vulpix", level: 5, gender: "F", hp: 20, hpMax: 20});
            us.moveset.reveal(imprisonUser === "us" ? "imprison" : "protect");
            us.moveset.reveal("ember");
            us.moveset.reveal("tailwhip");
            us.moveset.reveal("disable");

            // switch in a similar pokemon
            them = initActive("them",
            {
                species: sameOpponent ? "vulpix" : "bulbasaur", level: 10,
                gender: "M", hp: 100, hpMax: 100
            });

            if (sameOpponent)
            {
                // opponent should be able to have our moveset
                expect(them.moveset.constraint)
                    .to.include.all.keys([...us.moveset.moves.keys()]);
            }
            else
            {
                // opponent should not be able to have our moveset
                expect(them.moveset.constraint)
                    .to.not.include.any.keys([...us.moveset.moves.keys()]);
            }
        }

        describe("Failed", function()
        {
            for (const id of ["us", "them"] as const)
            {
                it(`Should infer no common moves if ${id} failed`,
                function()
                {
                    setup(id);

                    // if imprison fails, then the opponent shouldn't be
                    //  able to have any of our moves
                    const ctx = initCtx(
                        {type: "useMove", monRef: id, move: "imprison"});
                    expect(ctx.handle({type: "fail", monRef: id}))
                        .to.equal("base");
                    expect(them.moveset.constraint)
                        .to.not.include.any.keys([...us.moveset.moves.keys()]);
                });
            }

            it("Should throw if shared moves", function()
            {
                setup("us");

                const ctx = initCtx(
                {
                    type: "useMove", monRef: "them", move: "imprison"
                });

                expect(() =>
                        ctx.handle({type: "fail", monRef: "them"}))
                    .to.throw(Error,
                        "Imprison failed but both Pokemon have " +
                            "common moves: imprison");
            });
        });

        describe("Succeeded", function()
        {
            for (const id of ["us", "them"] as const)
            {
                it(`Should infer a common move if ${id} succeeded`,
                function()
                {
                    setup(id);

                    // if imprison succeeds, then the opponent
                    //  should be able to have one of our moves
                    const ctx = initCtx(
                        {type: "useMove", monRef: id, move: "imprison"});
                    expect(ctx.handle(
                        {
                            type: "activateStatusEffect", monRef: id,
                            effect: "imprison", start: true
                        }))
                        .to.equal("base");
                    expect(them.moveset.moveSlotConstraints)
                        .to.have.lengthOf(1);
                    expect(them.moveset.moveSlotConstraints[0])
                        .to.have.keys([...us.moveset.moves.keys()]);
                });
            }

            it("Should throw if no shared moves", function()
            {
                setup("us", /*sameOpponent*/false);
                const ctx = initCtx(
                {
                    type: "useMove", monRef: "us", move: "imprison"
                });

                // if imprison succeeds, then the opponent
                //  should be able to have one of our moves
                expect(() =>
                    ctx.handle(
                    {
                        type: "activateStatusEffect", monRef: "us",
                        effect: "imprison", start: true
                    }))
                    .to.throw(Error, "Imprison succeeded but both " +
                        "Pokemon cannot share any moves");
            });
        });
    });

    describe("Natural Gift move", function()
    {
        it("Should infer berry if successful", function()
        {
            initActive("us"); // to appease pressure check
            const mon = initActive("them");
            const item = mon.item;
            const ctx = initCtx(
                {type: "useMove", monRef: "them", move: "naturalgift"});
            ctx.halt();

            expect(mon.lastItem).to.equal(item,
                "Item was not consumed");
            expect(mon.lastItem.possibleValues)
                .to.have.keys(...Object.keys(dex.berries));
        });

        it("Should infer no berry if failed", function()
        {
            initActive("us"); // to appease pressure check
            const mon = initActive("them");
            const item = mon.item;
            const ctx = initCtx(
                {type: "useMove", monRef: "them", move: "naturalgift"});
            expect(ctx.handle({type: "fail", monRef: "them"})).to.equal("base");

            expect(mon.item).to.equal(item, "Item was consumed");
            expect(mon.item.possibleValues)
                .to.not.have.any.keys(...Object.keys(dex.berries));
        });
    });

    describe("Ally moves", function()
    {
        it("Should throw if not failed in a single battle", function()
        {
            // TODO: support ally moves (e.g. helpinghand)
        });
    });

    describe("Stalling moves", function()
    {
        it("Should count stall turns then reset if failed", function()
        {
            const v = initActive("them").volatile;
            expect(v.stalling).to.be.false;
            for (let i = 1; i <= 2; ++i)
            {
                state.preTurn();
                const innerCtx = initCtx(
                    {type: "useMove", monRef: "them", move: "protect"});

                expect(innerCtx.handle(
                    {
                        type: "activateStatusEffect", monRef: "them",
                        effect: "protect", start: true
                    }))
                    .to.equal("base");
                v.stall(true); // mock BaseContext behavior
                expect(v.stalling).to.be.true;
                expect(v.stallTurns).to.equal(i);

                state.postTurn();
                expect(v.stalling).to.be.false;
                expect(v.stallTurns).to.equal(i);
            }

            state.preTurn();
            const ctx = initCtx(
                {type: "useMove", monRef: "them", move: "protect"});
            expect(ctx.handle({type: "fail", monRef: "them"}))
                .to.equal("base");
            expect(v.stalling).to.be.false;
            expect(v.stallTurns).to.equal(0);
        });

        it("Should reset stall count if using another move", function()
        {
            const mon = initActive("them");
            let ctx = initCtx(
                {type: "useMove", monRef: "them", move: "protect"});

            // stall effect is put in place
            expect(ctx.handle(
                {
                    type: "activateStatusEffect", monRef: "them",
                    effect: "protect", start: true
                }))
                .to.equal("base");
            mon.volatile.stall(true); // mock BaseContext behavior
            expect(mon.volatile.stalling).to.be.true;
            expect(mon.volatile.stallTurns).to.equal(1);
            ctx.expire();
            state.postTurn();
            expect(mon.volatile.stalling).to.be.false;
            expect(mon.volatile.stallTurns).to.equal(1);

            // some other move is used
            state.preTurn();
            ctx = initCtx(
                {type: "useMove", monRef: "them", move: "splash"});
            ctx.halt();
            expect(mon.volatile.stalling).to.be.false;
            expect(mon.volatile.stallTurns).to.equal(0);
        });

        it("Should not reset counter if called", function()
        {
            const mon = initActive("them");
            let ctx = initCtx(
                {type: "useMove", monRef: "them", move: "endure"});

            // stall effect is put in place
            expect(ctx.handle(
                {
                    type: "activateStatusEffect", monRef: "them",
                    effect: "endure", start: true
                }))
                .to.equal("base");
            mon.volatile.stall(true); // mock BaseContext behavior

            // some move gets called via some effect (e.g. metronome)
            ctx.expire();
            ctx = initCtx(
                {type: "useMove", monRef: "them", move: "metronome"});
            const innerCtx = ctx.handle(
                {type: "useMove", monRef: "them", move: "endure"});
            expect(innerCtx).to.be.an.instanceOf(MoveContext)
            expect((innerCtx as MoveContext).handle(
                    {type: "fail", monRef: "them"}))
                .to.equal("base");
            expect(mon.volatile.stalling).to.be.true;
            expect(mon.volatile.stallTurns).to.equal(1);
        });
    });

    describe("Pressure ability handling", function()
    {
        let us: Pokemon;

        beforeEach("Setup pressure mon", function()
        {
            us = initActive("us");
            us.traits.setAbility("pressure");
        });

        it("Should use extra pp if targeted", function()
        {
            const {moveset} = initActive("them");
            // since "us" wasn't mentioned, it will be inferred due to the
            //  targeting behavior of the move being used
            initCtx({type: "useMove", monRef: "them", move: "tackle"}).expire();
            expect(moveset.get("tackle")!.pp).to.equal(54);
        });

        it("Should not use extra pp if not targeted", function()
        {
            const {moveset} = initActive("them");
            initCtx({type: "useMove", monRef: "them", move: "splash"}).expire();
            expect(moveset.get("splash")!.pp).to.equal(63);
        });

        it("Should not use double pp if self target", function()
        {
            const mon = initActive("them");
            mon.traits.setAbility("pressure");
            initCtx({type: "useMove", monRef: "them", move: "splash"}).expire();
            expect(mon.moveset.get("splash")!.pp).to.equal(63);
        });

        it("Should not use double pp if mold breaker", function()
        {
            const mon = initActive("them");
            mon.traits.setAbility("moldbreaker");
            initCtx({type: "useMove", monRef: "them", move: "tackle"}).expire();
            expect(mon.moveset.get("tackle")!.pp).to.equal(55);
        });
    });

    describe("Implicit effects", function()
    {
        function testTeamEffect(name: string, move: string,
            assertion: (team: ReadonlyTeam, shouldSet: boolean) => void): void
        {
            describe(name, function()
            {
                it(`Should set if using ${move}`, function()
                {
                    initActive("us");
                    initActive("them");
                    const team = state.teams.them;
                    const ctx = initCtx(
                        {type: "useMove", monRef: "them", move});
                    ctx.halt();
                    assertion(team, /*shouldSet*/true);
                });

                it(`Should not set if ${move} failed`, function()
                {
                    initActive("us");
                    initActive("them");
                    const team = state.teams.them;
                    const ctx = initCtx(
                        {type: "useMove", monRef: "them", move});
                    expect(ctx.handle({type: "fail", monRef: "them"}))
                        .to.equal("base");
                    assertion(team, /*shouldSet*/false);
                });
            });
        }

        testTeamEffect("Wish", "wish",
            (team, shouldSet) =>
                expect(team.status.wish.isActive)
                    .to.be[shouldSet ? "true" : "false"]);

        testTeamEffect("Self-switch", "uturn",
            (team, shouldSet) =>
                expect(team.status.selfSwitch)
                    .to.be[shouldSet ? "true" : "null"]);
        testTeamEffect("Baton Pass", "batonpass",
            (team, shouldSet) =>
                expect(team.status.selfSwitch)
                    .to.equal(shouldSet ? "copyvolatile" : null));

        function testEffect(name: string, move: string,
            assertion: (mon: ReadonlyPokemon, shouldSet: boolean) => void):
            void
        {
            testTeamEffect(name, move,
                (team, shouldSet) => assertion(team.active, shouldSet));
        }

        testEffect("Minimize", "minimize",
            (mon, shouldSet) =>
                expect(mon.volatile.minimize)
                    .to.be[shouldSet ? "true" : "false"]);

        testEffect("Defense Curl", "defensecurl",
            (mon, shouldSet) =>
                expect(mon.volatile.defenseCurl)
                    .to.be[shouldSet ? "true" : "false"]);

        for (const [name, effect] of
            [["Healing Wish", "healingWish"], ["Lunar Dance", "lunarDance"]] as
            const)
        {
            const move = effect.toLowerCase();
            describe(name, function()
            {
                it(`Should set if using ${move}`, function()
                {
                    initActive("us");
                    initActive("them");
                    const team = state.teams.them;

                    // use wishing move to faint user
                    const ctx = initCtx(
                        {type: "useMove", monRef: "them", move});
                    expect(ctx.handle({type: "faint", monRef: "them"}))
                        .to.equal("base");
                    ctx.halt();
                    expect(team.status[effect]).to.be.true;

                    // replacement is sent
                    expect(ctx.handle(
                            {type: "switchIn", monRef: "them", ...ditto}))
                        .to.be.an.instanceOf(SwitchContext);
                    // implicit: handle switch events, then expire at the
                    //  healingwish event allowing the MoveContext to handle it
                    expect(ctx.handle(
                        {
                            type: "activateTeamEffect", teamRef: "them", effect,
                            start: false
                        }))
                        .to.equal("base");
                    ctx.expire();
                });

                it(`Should not set if ${move} failed`, function()
                {
                    initActive("us");
                    initActive("them");
                    const team = state.teams.them;
                    const ctx = initCtx(
                        {type: "useMove", monRef: "them", move});
                    expect(ctx.handle({type: "fail", monRef: "them"}))
                        .to.equal("base");
                    expect(team.status[effect]).to.be.false;
                });
            });
        }
    });

    function testLockingMoves<T extends string>(keys: readonly T[],
        getter: (mon: ReadonlyPokemon) => ReadonlyVariableTempStatus<T>): void
    {
        for (const move of keys)
        {
            describe(move, function()
            {
                function init(): ReadonlyVariableTempStatus<T>
                {
                    initActive("us"); // to appease pressure targeting
                    const vts = getter(initActive("them"));
                    expect(vts.isActive).to.be.false;
                    const ctx = initCtx(
                        {type: "useMove", monRef: "them", move});
                    ctx.expire();
                    state.postTurn();
                    expect(vts.isActive).to.be.true;
                    expect(vts.type).to.equal(move);
                    return vts;
                }

                it("Should set if successful", init);

                it("Should reset if missed", function()
                {
                    const vts = init();
                    const ctx = initCtx(
                        {type: "useMove", monRef: "them", move});
                    expect(vts.isActive).to.be.true;

                    expect(ctx.handle({type: "miss", monRef: "us"}))
                        .to.equal("base");
                    expect(vts.isActive).to.be.false;
                });

                it("Should reset if opponent protected", function()
                {
                    const vts = init();
                    const ctx = initCtx(
                        {type: "useMove", monRef: "them", move});
                    expect(vts.isActive).to.be.true;

                    expect(ctx.handle({type: "stall", monRef: "us"}))
                        .to.equal("base");
                    expect(vts.isActive).to.be.false;
                });

                it("Should not reset if opponent endured",
                function()
                {
                    const vts = init();
                    const ctx = initCtx(
                        {type: "useMove", monRef: "them", move});
                    expect(vts.isActive).to.be.true;

                    expect(ctx.handle(
                            {type: "stall", monRef: "us", endure: true}))
                        .to.equal("base");
                    expect(vts.isActive).to.be.true;
                });

                it("Should not consume pp if used consecutively", function()
                {
                    const vts = init();
                    expect(vts.isActive).to.be.true;
                    expect(vts.turns).to.equal(0);

                    const ctx = initCtx(
                        {type: "useMove", monRef: "them", move});
                    expect(vts.isActive).to.be.true;
                    expect(vts.turns).to.equal(0);

                    ctx.halt();
                    expect(vts.isActive).to.be.true;
                    expect(vts.turns).to.equal(1);

                    const m = state.teams.them.active.moveset.get(move)!;
                    expect(m).to.not.be.null;
                    expect(m.pp).to.equal(m.maxpp - 1);
                });
            });
        }
    }

    describe("Rollout-like moves", function()
    {
        testLockingMoves(
            Object.keys(dexutil.rolloutMoves) as dexutil.RolloutMove[],
            mon => mon.volatile.rollout);
    });

    describe("Locked moves", function()
    {
        testLockingMoves(Object.keys(dex.lockedMoves) as
                dex.LockedMove[],
            mon => mon.volatile.lockedMove);
    });
});
