import { expect } from "chai";
import "mocha";
import { itemRemovalMoves } from "../../src/battle/dex/dex-util";
import { AnyDriverEvent, CountableStatusType, DriverInitPokemon,
    SideConditionType, StatusEffectType} from
    "../../src/battle/driver/DriverEvent";
import { Logger } from "../../src/Logger";
import { PokemonID } from "../../src/psbot/helpers";
import { AnyBattleEvent, BattleEventType } from
    "../../src/psbot/parser/BattleEvent";
import { BattleInitMessage, RequestMessage } from
    "../../src/psbot/parser/Message";
import { PSEventHandler } from "../../src/psbot/PSEventHandler";

/** Base username for testing. */
const username = "username";

/** Base RequestMessage for testing. */
const request: RequestMessage =
{
    type: "request",
    active:
    [
        {
            moves:
            [
                {
                    move: "Splash", id: "splash", pp: 64, maxpp: 64,
                    target: "self", disabled: false
                }
            ]
        }
    ],
    side:
    {
        pokemon:
        [
            {
                owner: "p2", nickname: "nou", species: "Magikarp", shiny: false,
                gender: "M", level: 50, hp: 100, hpMax: 100, condition: null,
                active: true,
                stats: {atk: 30, def: 75, spa: 35, spd: 40, spe: 100},
                moves: ["splash"], baseAbility: "swiftswim", item: "lifeorb",
                pokeball: "pokeball"
            }
        ]
    }
};

/** Base BattleInitMessage for testing. */
const battleInit: BattleInitMessage =
{
    type: "battleinit", id: "p1", username,
    teamSizes: {p1: 1, p2: 2}, gameType: "singles", gen: 4,
    events: []
};

/** Base PokemonID for testing. */
const us: PokemonID = {owner: "p1", position: "a", nickname: "nou"};

/** Base PokemonID for testing. */
const them: PokemonID = {owner: "p2", position: "a", nickname: "x"};

describe("PSEventHandler", function()
{
    let handler: PSEventHandler;

    beforeEach("Initialize PSEventHandler", function()
    {
        handler = new PSEventHandler(username, Logger.null);
    });

    describe("#handleRequest()", function()
    {
        it("Should emit nothing if already initializeed", function()
        {
            // request message is assumed to go before this event but not needed
            //  here
            handler.initBattle(battleInit);

            const driverEvents = handler.handleRequest(request);
            expect(driverEvents).to.be.empty;
        });

        it("Should emit initTeam", function()
        {
            expect(handler.handleRequest(request)).to.have.deep.members(
                [{type: "initTeam", team: request.side.pokemon}]);
        });

        /**
         * Tests move preprocessing so that the BattleDriver can handle it.
         * @param name Name of the feature that should be inferred.
         * @param move Move name as it appears in a RequestMessage.
         * @param newMove Processed move name.
         * @param features Features that were stripped from the move.
         */
        function shouldInferFromMove(name: string, move: string,
            newMove: string, features: Partial<DriverInitPokemon>): void
        {
            it(`Should emit initTeam with ${name}`, function()
            {
                const msg: RequestMessage =
                {
                    ...request,
                    side:
                    {
                        ...request.side,
                        pokemon:
                        [
                            {
                                ...request.side.pokemon[0],
                                moves: [move]
                            }
                        ]
                    }
                };

                const driverEvents = handler.handleRequest(msg);

                expect(driverEvents).to.have.deep.members(
                [
                    {
                        type: "initTeam",
                        team:
                        [
                            {
                                ...request.side.pokemon[0],
                                moves: [newMove], ...features
                            }
                        ]
                    }
                ]);
            });
        }

        shouldInferFromMove("hidden power type", "hiddenpowerfire",
            "hiddenpower", {hpType: "fire"});
        shouldInferFromMove("return move happiness", "return102", "return",
            {happiness: 255});
        shouldInferFromMove("frustration move happiness", "frustration102",
            "frustration", {happiness: 0});
    });

    describe("#initBattle()", function()
    {
        it("Should initialize and emit initOtherTeamSize with p2 size",
        function()
        {
            expect(handler.battling).to.be.false;

            // request message is assumed to go before this event but not needed
            //  here
            const driverEvents = handler.initBattle(battleInit);

            expect(driverEvents).to.have.deep.members(
                [{type: "initOtherTeamSize", size: 2}]);
            expect(handler.battling).to.be.true;
        });

        it("Should emit initOtherTeamSize with p1 size", function()
        {
            expect(handler.battling).to.be.false;

            // request message is assumed to go before this event but not needed
            //  here
            const driverEvents = handler.initBattle(
                {...battleInit, username: username + "1"});

            expect(driverEvents).to.have.deep.members(
                [{type: "initOtherTeamSize", size: 1}]);
            expect(handler.battling).to.be.true;
        });
    });

    describe("#handleEvents()", function()
    {
        beforeEach("Initialize teams", function()
        {
            handler.handleRequest(request);
            handler.initBattle(battleInit);
        });

        /**
         * Tests the PSEventHandler's translation of PS BattleEvents to
         * DriverEvents.
         * @param name Name of the test.
         * @param psEvents PS BattleEvents.
         * @param driverEvents DriverEvents that should be emitted.
         * Order-sensitive.
         * @param post Any extra tests that should be done afterward.
         */
        function test(name: string, psEvents: AnyBattleEvent[],
            driverEvents: AnyDriverEvent[], post?: () => void): void
        {
            it(name, function()
            {
                expect(handler.handleEvents(psEvents))
                    .to.deep.equal(driverEvents);
                if (post) post();
            });
        }

        test("Should emit nothing if no events", [], []);

        describe("\\n", function()
        {
            test("Should emit nothing", [{type: "\n"}], []);
        });

        describe("-ability", function()
        {
            test("Should emit activateAbility",
                [{type: "-ability", id: us, ability: "Blaze"}],
                [{type: "activateAbility", monRef: "us", ability: "blaze"}]);

            test("Should emit activateAbility with Trace",
            [{
                type: "-ability", id: us, ability: "Blaze",
                from: "ability: Trace", of: them
            }],
            [
                {type: "activateAbility", monRef: "us", ability: "trace"},
                {type: "activateAbility", monRef: "us", ability: "blaze"},
                {type: "activateAbility", monRef: "them", ability: "blaze"}
            ]);

            test("Should handle traced ability activating before Trace",
            [
                {type: "-ability", id: us, ability: "Intimidate"},
                {type: "-unboost", id: them, stat: "atk", amount: 1},
                {
                    type: "-ability", id: us, ability: "Intimidate",
                    from: "ability: Trace", of: them
                }
            ],
            [
                {type: "activateAbility", monRef: "us", ability: "trace"},
                {type: "activateAbility", monRef: "us", ability: "intimidate"},
                {
                    type: "activateAbility", monRef: "them",
                    ability: "intimidate"
                },
                {type: "activateAbility", monRef: "us", ability: "intimidate"},
                {type: "unboost", monRef: "them", stat: "atk", amount: 1}
            ]);
        });

        describe("-endability", function()
        {
            test("Should emit gastroAcid",
                [{type: "-endability", id: us, ability: "Swift Swim"}],
                [{type: "gastroAcid", monRef: "us", ability: "swiftswim"}]);

            test("Should not emit if caused by Transform",
            [{
                type: "-endability", id: us, ability: "Limber",
                from: "move: Transform"
            }],
                []);
        });

        describe("-start", function()
        {
            describe("typeadd", function()
            {
                test("Should emit setThirdType",
                [{
                    type: "-start", id: us, volatile: "typeadd",
                    otherArgs: ["fire"]
                }],
                    [{type: "setThirdType", monRef: "us", thirdType: "fire"}]);
            });

            describe("typechange", function()
            {
                test("Should emit changeType with 0 types",
                [{
                    type: "-start", id: us, volatile: "typechange",
                    otherArgs: []
                }],
                [{
                    type: "changeType", monRef: "us", newTypes: ["???", "???"]
                }]);

                test("Should emit changeType with 1 type",
                [{
                    type: "-start", id: us, volatile: "typechange",
                    otherArgs: ["Grass"]
                }],
                [{
                    type: "changeType", monRef: "us", newTypes: ["grass", "???"]
                }]);

                test("Should emit changeType with 2 types",
                [{
                    type: "-start", id: us, volatile: "typechange",
                    otherArgs: ["Ghost/Dragon"]
                }],
                [{
                    type: "changeType", monRef: "us",
                    newTypes: ["ghost", "dragon"]
                }]);

                test("Should truncate if more than 2 types",
                [{
                    type: "-start", id: us, volatile: "typechange",
                    otherArgs: ["Ghost/Dragon/Bug"]
                }],
                [{
                    type: "changeType", monRef: "us",
                    newTypes: ["ghost", "dragon"]
                }]);
            });

            function testCountableStatus(status: CountableStatusType)
            {
                describe(status, function()
                {
                    test("Should emit countStatusEffect",
                    [{
                        type: "-start", id: us, volatile: status + "1",
                        otherArgs: []
                    }],
                    [{
                        type: "countStatusEffect", monRef: "us", status,
                        turns: 1
                    }]);
                });
            }

            testCountableStatus("perish");
            testCountableStatus("stockpile");
        });

        describe("-end", function()
        {
            describe("Stockpile", function()
            {
                test("Should emit countStatusEffect",
                    [{type: "-end", id: us, volatile: "Stockpile"}],
                [{
                    type: "countStatusEffect", monRef: "us",
                    status: "stockpile",
                    turns: 0
                }]);
            });
        });

        describe("-start/-end trivial statuses", function()
        {
            for (const type of ["-start", "-end"] as const)
            {
                test(`Should not emit if invalid status on ${type}`,
                [{
                    type, id: us, volatile: "something invalid", otherArgs: []
                }],
                    []);
            }

            function testTrivialStatus(name: string, status: StatusEffectType,
                start: boolean): void
            {
                const type: BattleEventType = start ? "-start" : "-end";

                test(`Should emit activateStatusEffect on ${type}`,
                    [{type, id: us, volatile: name, otherArgs: []}],
                [{
                    type: "activateStatusEffect", monRef: "us", status, start
                }]);
            }

            function describeTrivialStatus(name: string,
                status: StatusEffectType): void
            {
                describe(name, function()
                {
                    testTrivialStatus(name, status, /*start*/true);
                    testTrivialStatus(name, status, /*start*/false);
                });
            }

            describeTrivialStatus("Aqua Ring", "aquaRing");
            describeTrivialStatus("Attract", "attract");
            describeTrivialStatus("Bide", "bide");

            describe("confusion", function()
            {
                testTrivialStatus("confusion", "confusion", /*start*/true);
                testTrivialStatus("confusion", "confusion", /*start*/false);

                test("Should also emit fatigue if mentioned",
                [{
                    type: "-start", id: us, volatile: "confusion",
                    otherArgs: [], fatigue: true
                }],
                [
                    {type: "fatigue", monRef: "us"},
                    {
                        type: "activateStatusEffect", monRef: "us",
                        status: "confusion", start: true
                    }
                ]);
            });

            describeTrivialStatus("Curse", "curse");

            describe("Disable", function()
            {
                test("Should emit disableMove on -start",
                [{
                    type: "-start", id: us, volatile: "Disable",
                    otherArgs: ["Tackle"]
                }],
                    [{type: "disableMove", monRef: "us", move: "tackle"}]);

                test("Should emit reenableMoves on -end",
                    [{type: "-end", id: us, volatile: "Disable"}],
                    [{type: "reenableMoves", monRef: "us"}]);
            });

            describeTrivialStatus("Embargo", "embargo");
            describeTrivialStatus("Encore", "encore");
            describeTrivialStatus("Focus Energy", "focusEnergy");
            describeTrivialStatus("Foresight", "foresight");
            describeTrivialStatus("move: Heal Block", "healBlock");
            describeTrivialStatus("move: Imprison", "imprison");
            describeTrivialStatus("Ingrain", "ingrain");
            describeTrivialStatus("Leech Seed", "leechSeed");
            describeTrivialStatus("Magnet Rise", "magnetRise");
            describeTrivialStatus("Miracle Eye", "miracleEye");
            describeTrivialStatus("move: Mud Sport", "mudSport");
            describeTrivialStatus("Nightmare", "nightmare");
            describeTrivialStatus("Power Trick", "powerTrick");
            describeTrivialStatus("Slow Start", "slowStart");
            describeTrivialStatus("Substitute", "substitute");
            describeTrivialStatus("Taunt", "taunt");
            describeTrivialStatus("Torment", "torment");

            describe("Uproar", function()
            {
                testTrivialStatus("Uproar", "uproar", /*start*/true);
                testTrivialStatus("Uproar", "uproar", /*start*/false);

                test("Should emit updateStatusEffect on start if upkeep suffix",
                [{
                    type: "-start", id: us, volatile: "Uproar",
                    otherArgs: ["[upkeep]"]
                }],
                [{
                    type: "updateStatusEffect", monRef: "us", status: "uproar"
                }]);
            });

            describeTrivialStatus("move: Water Sport", "waterSport");
            describeTrivialStatus("move: Yawn", "yawn");

            describe("future move", function()
            {
                for (const start of [true, false])
                {
                    const type = start ? "-start" : "-end";
                    test(`Should emit activateFutureMove on ${type}`,
                    [{
                        type, id: us, volatile: "Future Sight", otherArgs: []
                    }],
                    [{
                        type: "activateFutureMove", monRef: "us",
                        move: "futuresight", start
                    }]);

                }
            });
        });

        describe("-activate", function()
        {
            test("Should not emit if invalid",
                [{type: "-activate", id: us, volatile: "x", otherArgs: []}],
                []);

            describe("Bide", function()
            {
                test("Should emit updateStatusEffect",
                [{
                    type: "-activate", id: us, volatile: "move: Bide",
                    otherArgs: []
                }],
                [{
                    type: "updateStatusEffect", monRef: "us", status: "bide"
                }]);
            });

            describe("Charge", function()
            {
                test("Should emit activateStatusEffect",
                [{
                    type: "-activate", id: us, volatile: "move: Charge",
                    otherArgs: []
                }],
                [{
                    type: "activateStatusEffect", monRef: "us",
                    status: "charge", start: true
                }]);
            });

            describe("confusion", function()
            {
                test("Should emit updateStatusEffect",
                [{
                    type: "-activate", id: us, volatile: "confusion",
                    otherArgs: []
                }],
                [{
                    type: "updateStatusEffect", monRef: "us",
                    status: "confusion"
                }]);
            });

            describe("Feint", function()
            {
                test("Should emit feint",
                [{
                    type: "-activate", id: us, volatile: "move: Feint",
                    otherArgs: []
                }],
                    [{type: "feint", monRef: "us"}]);
            });

            describe("Grudge", function()
            {
                test("Should emit ModifyPP",
                [{
                    type: "-activate", id: us, volatile: "move: Grudge",
                    otherArgs: ["Tackle"]
                }],
                [{
                    type: "modifyPP", monRef: "us", move: "tackle",
                    amount: "deplete"
                }]);
            });

            describe("Lock-On/Mind Reader", function()
            {
                test("Should emit lockOn",
                [{
                    type: "-activate", id: us, volatile: "move: Lock-On",
                    otherArgs: [], of: them
                }],
                    [{type: "lockOn", monRef: "us", target: "them"}]);

                test("Should emit lockOn for Mind Reader as well",
                [{
                    type: "-activate", id: them, volatile: "move: Mind Reader",
                    otherArgs: [], of: us
                }],
                    [{type: "lockOn", monRef: "them", target: "us"}]);
            });

            describe("Mimic", function()
            {
                for (const type of ["sketch", "mimic"] as const)
                {
                    // capitalize
                    const moveName = type[0].toUpperCase() + type.substr(1);

                    test(`Should emit ${type}`,
                    [
                        {type: "move", id: us, moveName},
                        {
                            type: "-activate", id: us,
                            volatile: "move: Mimic", otherArgs: ["Splash"]
                        }
                    ],
                    [
                        {type: "useMove", monRef: "us", move: type},
                        {type, monRef: "us", move: "splash"}
                    ]);
                }

                it("Should throw if no previous MoveEvent", function()
                {
                    expect(() => handler.handleEvents(
                    [{
                        type: "-activate", id: us, volatile: "move: Mimic",
                        otherArgs: ["Tackle"]
                    }])).to.throw(Error, "Don't know how Mimic was caused");
                });

                it("Should throw if previous MoveEvent is not Sketch or Mimic",
                function()
                {
                    expect(() => handler.handleEvents(
                    [
                        {type: "move", id: us, moveName: "Tackle"},
                        {
                            type: "-activate", id: us, volatile: "move: Mimic",
                            otherArgs: ["Quick Attack"]
                        }
                    ])).to.throw(Error, "Unknown Mimic-like move 'Tackle'");
                });
            });

            describe("Spite", function()
            {
                test("Should emit ModifyPP",
                [{
                    type: "-activate", id: us, volatile: "move: Spite",
                    otherArgs: ["Splash", "4"]
                }],
                [{
                    type: "modifyPP", monRef: "us", move: "splash",
                    amount: -4
                }]);
            });

            describe("stall", function()
            {
                function testStall(volatile: string, endure = false): void
                {
                    test(`Should emit stall ${endure ? "with endure " : ""}` +
                            `from '${volatile}'`,
                        [{type: "-activate", id: us, volatile, otherArgs: []}],
                    [{
                        type: "stall", monRef: "us", ...(endure && {endure})
                    }]);
                }

                testStall("Protect");
                testStall("move: Protect");
                testStall("Endure", /*endure*/true);
                testStall("move: Endure", /*endure*/true);
            });

            describe("trapped", function()
            {
                test("Should emit trap",
                [{
                    type: "-activate", id: us, volatile: "trapped",
                    otherArgs: []
                }],
                    [{type: "trap", target: "us", by: "them"}]);
            });
        });

        describe("-boost", function()
        {
            test("Should emit boost",
                [{type: "-boost", id: us, stat: "atk", amount: 1}],
                [{type: "boost", monRef: "us", stat: "atk", amount: 1}]);
        });

        describe("cant", function()
        {
            test("Should emit inactive",
                [{type: "cant", id: us, reason: "some reason"}],
                [{type: "inactive", monRef: "us"}]);

            test("Should emit inactive from imprison",
                [{type: "cant", id: us, reason: "imprison"}],
                [{type: "inactive", monRef: "us", reason: "imprison"}]);

            test("Should emit inactive from recharge",
                [{type: "cant", id: us, reason: "recharge"}],
                [{type: "inactive", monRef: "us", reason: "recharge"}]);

            test("Should emit inactive from slp",
                [{type: "cant", id: us, reason: "slp"}],
                [{type: "inactive", monRef: "us", reason: "slp"}]);

            test("Should emit inactive and activateAbility from ability",
                [{type: "cant", id: us, reason: "ability: Swift Swim"}],
            [
                {type: "inactive", monRef: "us"},
                {type: "activateAbility", monRef: "us", ability: "swiftswim"}
            ]);

            test("Should emit inactive and activateAbility from truant ability",
                [{type: "cant", id: us, reason: "ability: Truant"}],
            [
                {type: "inactive", monRef: "us", reason: "truant"},
                {type: "activateAbility", monRef: "us", ability: "truant"}
            ]);

            test("Should emit inactive with move if provided",
                [{type: "cant", id: us, moveName: "Splash", reason: "Taunt"}],
                [{type: "inactive", monRef: "us", move: "splash"}]);
        });

        describe("-clearallboost", function()
        {
            test("Should emit clearAllBoosts", [{type: "-clearallboost"}],
                [{type: "clearAllBoosts"}]);
        });

        describe("-clearnegativeboost", function()
        {
            test("Should emit clearNegativeBoosts",
                [{type: "-clearnegativeboost", id: us}],
                [{type: "clearNegativeBoosts", monRef: "us"}]);
        });

        describe("-clearpositiveboost", function()
        {
            test("Should emit clearPositiveBoosts",
                [{type: "-clearpositiveboost", id: us}],
                [{type: "clearPositiveBoosts", monRef: "us"}]);
        });

        describe("-copyboost", function()
        {
            test("Should emit copyBoosts",
                [{type: "-copyboost", target: us, source: them}],
                [{type: "copyBoosts", from: "us", to: "them"}]);
        });

        describe("-crit", function()
        {
            test("Should emit crit",
                [{type: "-crit", id: them}], [{type: "crit", monRef: "them"}]);
        });

        describe("-curestatus", function()
        {
            test("Should emit cureStatus",
                [{type: "-curestatus", id: us, majorStatus: "psn"}],
                [{type: "cureStatus", monRef: "us", status: "psn"}]);
        });

        describe("-cureteam", function()
        {
            test("Should emit cureTeam", [{type: "-cureteam", id: us}],
                [{type: "cureTeam", teamRef: "us"}]);
        });

        for (const type of ["-damage", "-heal", "-sethp"] as const)
        {
            describe(type, function()
            {
                test("Should emit takeDamage",
                [{
                    type, id: us, status: {hp: 1, hpMax: 100, condition: null}
                }],
                [{
                    type: "takeDamage", monRef: "us", newHP: [1, 100],
                    tox: false
                }]);

                test("Should emit takeDamage from psn/tox",
                [{
                    type, id: us, status: {hp: 1, hpMax: 100, condition: null},
                    from: "psn"
                }],
                [{
                    type: "takeDamage", monRef: "us", newHP: [1, 100],
                    tox: true
                }]);

                test("Should emit takeDamage and activateSideCondition from " +
                    "Healing Wish",
                [{
                    type, id: us,
                    status: {hp: 100, hpMax: 100, condition: null},
                    from: "move: Healing Wish"
                }],
                [
                    {
                        type: "activateSideCondition", teamRef: "us",
                        condition: "healingWish", start: false
                    },
                    {
                        type: "takeDamage", monRef: "us", newHP: [100, 100],
                        tox: false
                    }
                ]);

                test("Should emit takeDamage, restoreMoves and " +
                    "activateSideCondition from Lunar Dance",
                [{
                    type, id: us,
                    status: {hp: 100, hpMax: 100, condition: null},
                    from: "move: Lunar Dance"
                }],
                [
                    {
                        type: "activateSideCondition", teamRef: "us",
                        condition: "lunarDance", start: false
                    },
                    {
                        type: "takeDamage", monRef: "us", newHP: [100, 100],
                        tox: false
                    },
                    {type: "restoreMoves", monRef: "us"}
                ]);
            });
        }

        describe("detailschange", function()
        {
            test("Should emit formChange with perm=true",
            [{
                type: "detailschange", id: us, species: "Magikarp", level: 100,
                gender: "F", hp: 100, hpMax: 100, condition: "brn", shiny: true
            }],
            [{
                type: "formChange", monRef: "us", species: "Magikarp",
                level: 100, gender: "F", hp: 100, hpMax: 100, perm: true
            }]);
        });

        for (const type of ["drag", "switch"] as const)
        {
            describe(type, function()
            {
                test("Should emit switchIn with consequences",
                [
                    {
                        type, id: us, species: "Magikarp", level: 100,
                        gender: "F", hp: 100, hpMax: 100, condition: "brn",
                        shiny: true
                    },
                    {type: "-ability", id: us, ability: "Pressure"}
                ],
                [
                    {
                        type: "switchIn", monRef: "us", species: "Magikarp",
                        level: 100, gender: "F", hp: 100, hpMax: 100
                    },
                    {
                        type: "activateAbility", monRef: "us",
                        ability: "pressure"
                    }
                ]);
            });
        }

        describe("faint", function()
        {
            test("Should emit faint", [{type: "faint", id: us}],
                [{type: "faint", monRef: "us"}]);
        });

        for (const type of ["-fieldend", "-fieldstart"] as const)
        {
            describe(type, function()
            {
                test("Should emit nothing if invalid effect name",
                    [{type, effect: "something invalid"}], []);

                const testCases =
                [
                    {effect: "move: Gravity", condition: "gravity"},
                    {effect: "move: Trick Room", condition: "trickRoom"}
                ] as const;

                for (const {effect, condition} of testCases)
                {
                    test(`Should emit activateFieldCondition from ${effect}`,
                        [{type, effect}],
                    [{
                        type: "activateFieldCondition", condition,
                        start: type === "-fieldstart"
                    }]);
                }
            });
        }

        describe("-formechange", function()
        {
            test("Should emit formChange with perm=false",
            [{
                type: "-formechange", id: us, species: "Magikarp", level: 100,
                gender: "F", hp: 100, hpMax: 100, condition: "brn", shiny: true
            }],
            [{
                type: "formChange", monRef: "us", species: "Magikarp",
                level: 100, gender: "F", hp: 100, hpMax: 100, perm: false
            }]);
        });

        describe("-hitcount", function()
        {
            test("Should emit hitCount",
                [{type: "-hitcount", id: them, count: 5}],
                [{type: "hitCount", monRef: "them", count: 5}]);
        });

        describe("-invertboost", function()
        {
            test("Should emit invertBoosts", [{type: "-invertboost", id: us}],
                [{type: "invertBoosts", monRef: "us"}]);
        });

        describe("-item", function()
        {
            test("Should emit revealItem",
                [{type: "-item", id: us, item: "lifeorb"}],
            [{
                type: "revealItem", monRef: "us", item: "lifeorb", gained: false
            }]);

            test("Should emit revealItem with gained=true if gained via " +
                "item-transfer move",
                [{type: "-item", id: us, item: "lifeorb", from: "move: Trick"}],
            [{
                type: "revealItem", monRef: "us", item: "lifeorb", gained: true
            }]);

            test("Should emit revealItem with gained=recycle if gained via " +
                "Recycle move",
            [{
                type: "-item", id: us, item: "lifeorb", from: "move: Recycle"
            }],
            [{
                type: "revealItem", monRef: "us", item: "lifeorb",
                gained: "recycle"
            }]);
        });

        describe("-enditem", function()
        {
            test("Should emit removeItem with consumed item name",
                [{type: "-enditem", id: us, item: "lifeorb"}],
                [{type: "removeItem", monRef: "us", consumed: "lifeorb"}]);

            test("Should emit removeItem with consumed=false if stealeat",
                [{type: "-enditem", id: us, item: "lifeorb", from: "stealeat"}],
                [{type: "removeItem", monRef: "us", consumed: false}]);

            for (const move of itemRemovalMoves)
            {
                test("Should emit removeItem with consumed=false if removed " +
                    `via ${move}`,
                [{
                    type: "-enditem", id: us, item: "lifeorb",
                    from: `move: ${move}`
                }],
                    [{type: "removeItem", monRef: "us", consumed: false}]);
            }
        });

        describe("move", function()
        {
            test("Should emit useMove",
                [{type: "move", id: us, moveName: "Splash"}],
                [{type: "useMove", monRef: "us", move: "splash"}]);
        });

        describe("-miss", function()
        {
            test("Should emit miss", [{type: "-miss", id: us, targetId: them}],
                [{type: "miss", monRef: "them"}]);
        });

        describe("-mustrecharge", function()
        {
            test("Should emit mustRecharge", [{type: "-mustrecharge", id: us}],
                [{type: "mustRecharge", monRef: "us"}]);
        });

        describe("-prepare", function()
        {
            test("Should emit prepareMove",
                [{type: "-prepare", id: us, moveName: "Fly"}],
                [{type: "prepareMove", monRef: "us", move: "fly"}]);

            it("Should throw if not a two-turn move", function()
            {
                expect(() => handler.handleEvents(
                        [{type: "-prepare", id: us, moveName: "Tackle"}]))
                    .to.throw(Error, "'tackle' is not a two-turn move");
            });
        });

        describe("-resisted", function()
        {
            test("Should emit resisted",
                [{type: "-resisted", id: them}],
                [{type: "resisted", monRef: "them"}]);
        });

        describe("-setboost", function()
        {
            test("Should emit setBoost",
                [{type: "-setboost", id: us, stat: "atk", amount: 1}],
                [{type: "setBoost", monRef: "us", stat: "atk", amount: 1}]);
        });

        for (const type of ["-sideend", "-sidestart"] as const)
        {
            describe(type, function()
            {
                test("Should emit nothing if invalid effect name",
                    [{type, id: us.owner, condition: "something invalid"}], []);

                const screensCases =
                [
                    {name: "Reflect", condition: "reflect"},
                    {name: "Light Screen", condition: "lightScreen"}
                ] as const;

                const testCases: readonly
                {
                    readonly name: string, readonly condition: SideConditionType
                }[] =
                [
                    {name: "move: Lucky Chant", condition: "luckyChant"},
                    {name: "Mist", condition: "mist"},
                    {name: "Safeguard", condition: "safeguard"},
                    {name: "Spikes", condition: "spikes"},
                    {name: "Stealth Rock", condition: "stealthRock"},
                    {name: "move: Tailwind", condition: "tailwind"},
                    {name: "Toxic Spikes", condition: "toxicSpikes"},
                    ...screensCases
                ];

                for (const {name, condition} of testCases)
                {
                    // skip reflect/lightScreen for -sidestart events since
                    //  these need to know who caused it,
                    if (screensCases.find(c => c.condition === condition) &&
                        type === "-sidestart")
                    {
                        continue;
                    }

                    test(`Should emit activateSideCondition from ${name}`,
                        [{type, id: us.owner, condition: name}],
                    [{
                        type: "activateSideCondition", teamRef: "us", condition,
                        start: type === "-sidestart"
                    }]);
                }

                // following test cases are only for -sidestart
                if (type === "-sideend") return;
            });
        }

        describe("-singlemove", function()
        {
            test("Should emit nothing if invalid status",
                [{type: "-singlemove", id: us, move: "something"}], []);

            const testCases =
            [
                {move: "Destiny Bond", status: "destinyBond"},
                {move: "Grudge", status: "grudge"},
                {move: "Rage", status: "rage"}
            ] as const;

            for (const {move, status} of testCases)
            {
                test(`Should emit setSingleMoveStatus for ${move}`,
                    [{type: "-singlemove", id: us, move}],
                    [{type: "setSingleMoveStatus", monRef: "us", status}]);
            }
        });

        describe("-singleturn", function()
        {
            test("Should emit nothing if invalid status",
                [{type: "-singleturn", id: us, status: "something"}], []);

            const testCases =
            [
                {name: "Endure", status: "endure"},
                {name: "move: Endure", status: "endure"},
                {name: "Magic Coat", status: "magicCoat"},
                {name: "move: Magic Coat", status: "magicCoat"},
                {name: "Protect", status: "protect"},
                {name: "move: Protect", status: "protect"},
                {name: "Roost", status: "roost"},
                {name: "move: Roost", status: "roost"},
                {name: "Snatch", status: "snatch"},
                {name: "move: Snatch", status: "snatch"}
            ] as const;

            for (const {name, status} of testCases)
            {
                test(`Should emit setSingleTurnStatus '${status}' for ` +
                        `'${name}'`,
                    [{type: "-singleturn", id: us, status: name}],
                    [{type: "setSingleTurnStatus", monRef: "us", status}]);
            }
        });

        describe("-status", function()
        {
            test("Should emit afflictStatus",
                [{type: "-status", id: us, majorStatus: "brn"}],
                [{type: "afflictStatus", monRef: "us", status: "brn"}]);
        });

        describe("-supereffective", function()
        {
            test("Should emit superEffective",
                [{type: "-supereffective", id: them}],
                [{type: "superEffective", monRef: "them"}]);
        });

        describe("-swapboost", function()
        {
            test("Should emit swapBoosts",
            [{
                type: "-swapboost", source: us, target: them, stats: ["atk"]
            }],
            [{
                type: "swapBoosts", monRef1: "us", monRef2: "them",
                stats: ["atk"]
            }]);
        });

        describe("tie", function()
        {
            afterEach("Should set #battling to false", function()
            {
                expect(handler.battling).to.be.false;
            });

            test("Should emit gameOver with no winner",
                [{type: "tie"}], [{type: "gameOver"}]);
        });

        describe("-transform", function()
        {
            test("Should emit transform and transformPost",
                [{type: "-transform", source: us, target: them}],
            [
                {type: "transform", source: "us", target: "them"},
                {
                    type: "transformPost", monRef: "us",
                    moves: request.active![0].moves
                }
            ]);

            it("Should emit transform and transformPost even if last request " +
                "message indicates forceSwitch", function()
            {
                handler.handleRequest({...request, forceSwitch: [true]});

                expect(handler.handleEvents(
                        [{type: "-transform", source: us, target: them}]))
                    .to.deep.equal(
                    [
                        {type: "transform", source: "us", target: "them"},
                        {
                            type: "transformPost", monRef: "us",
                            moves: request.active![0].moves
                        }
                    ]);
            });

            it("Should emit transform but not transformPost if last request " +
                "message indicates fainting", function()
            {
                handler.handleRequest(
                {
                    ...request, forceSwitch: [true],
                    side: {pokemon: [{...request.side.pokemon[0], hp: 0}]}
                });

                expect(handler.handleEvents(
                        [{type: "-transform", source: us, target: them}]))
                    .to.deep.equal(
                        [{type: "transform", source: "us", target: "them"}]);
            });
        });

        describe("turn", function()
        {
            it("Should emit preTurn if previous events contained a TurnEvent",
            function()
            {
                handler.handleEvents([{type: "turn", num: 1}]);
                expect(handler.handleEvents([]))
                    .to.deep.equal([{type: "preTurn"}]);
            });

            test("Should emit postTurn if events contained a TurnEvent",
                [{type: "turn", num: 2}], [{type: "postTurn"}]);
        });

        describe("-unboost", function()
        {
            test("Should emit unboost",
                [{type: "-unboost", id: us, stat: "def", amount: 2}],
                [{type: "unboost", monRef: "us", stat: "def", amount: 2}]);
        });

        describe("upkeep", function()
        {
            test("Should emit clearSelfSwitch",
                [{type: "upkeep"}], [{type: "clearSelfSwitch"}]);
        });

        describe("-weather", function()
        {
            test("Should emit resetWeather if weatherType=none",
                [{type: "-weather", weatherType: "none", upkeep: false}],
                [{type: "resetWeather"}]);

            test("Should emit tickWeather if upkeep=true",
                [{type: "-weather", weatherType: "RainDance", upkeep: true}],
                [{type: "tickWeather", weatherType: "RainDance"}]);

            test("Should emit setWeather if weatherType!=none",
            [{
                type: "-weather", weatherType: "Hail", upkeep: false,
                from: "ability: Snow Warning", of: us
            }],
            [
                {type: "activateAbility", monRef: "us", ability: "snowwarning"},
                {type: "setWeather", weatherType: "Hail"}
            ]);
        });

        describe("win", function()
        {
            afterEach("Should set #battling to false", function()
            {
                expect(handler.battling).to.be.false;
            });

            test("Should emit gameOver with winner=us if we won",
                [{type: "win", winner: username}],
                [{type: "gameOver", winner: "us"}]);

            test("Should emit gameOver with winner=them if they won",
                [{type: "win", winner: username + "1"}],
                [{type: "gameOver", winner: "them"}]);
        });

        describe("BattleEvent suffixes", function()
        {
            it("Should throw if no PokemonID mentioned", function()
            {
                expect(() => handler.handleEvents(
                        [{type: "upkeep", from: "x"}]))
                    .to.throw(Error, "No PokemonID given to handle suffixes " +
                        "with");
            });

            describe("ability", function()
            {
                test("Should emit activateAbility",
                [{
                    type: "-immune", id: us, from: "ability: Wonder Guard",
                    of: them
                }],
                [
                    {
                        type: "activateAbility", monRef: "them",
                        ability: "wonderguard"
                    },
                    {type: "immune", monRef: "us"}
                ]);
            });

            describe("item", function()
            {
                test("Should emit revealItem",
                [{
                    type: "-immune", id: us, from: "item: Leftovers", of: them
                }],
                [
                    {
                        type: "revealItem", monRef: "them", item: "leftovers",
                        gained: false
                    },
                    {type: "immune", monRef: "us"}
                ]);

                test("Should not emit revealItem if berry",
                [{
                    type: "-heal", id: us, from: "item: Sitrus Berry",
                    status: {hp: 50, hpMax: 100, condition: null}
                }],
                [{
                    type: "takeDamage", monRef: "us", newHP: [50, 100],
                    tox: false
                }]);
            });
        });
    });
});
