import { expect } from "chai";
import "mocha";
import { Choice } from "../../src/battle/agent/Choice";
import { types, WeatherType } from "../../src/battle/dex/dex-util";
import { ItemTempStatus } from "../../src/battle/state/ItemTempStatus";
import { PossibilityClass } from "../../src/battle/state/PossibilityClass";
import { AnyBattleEvent, EndItemEvent, ItemEvent, MoveEvent, SetHPEvent } from
    "../../src/psbot/dispatcher/BattleEvent";
import { BattleInitMessage, RequestMessage } from
    "../../src/psbot/dispatcher/Message";
import { PokemonDetails, PokemonID, PokemonStatus } from
    "../../src/psbot/helpers";
import * as testArgs from "../helpers/battleTestArgs";
import { MockPSBattle } from "./MockPSBattle";

describe("Battle and EventProcessor", function()
{
    let responses: Choice[];
    let battle: MockPSBattle;

    beforeEach("Initialize Battle", function()
    {
        responses = [];
        battle = new MockPSBattle(testArgs.username[0],
            (...args: string[]) =>
                responses.push(...args.map(
                    // format: |/choose <choice>
                    arg => arg.substr(9)[1] as Choice)));
    });

    /**
     * Checks the `side` property of a RequestMessage object.
     * @param args Args object.
     */
    function checkRequestSide(args: RequestMessage): void
    {
        const team = battle.state.teams.us;
        expect(team.size).to.equal(args.side.pokemon.length);

        for (const data of args.side.pokemon)
        {
            const details: PokemonDetails = data.details;
            const status: PokemonStatus = data.condition;
            const mon = team.pokemon.find(
                p => !!p && p.species.name === details.species)!;

            expect(mon).to.exist;
            expect(mon.species.name).to.equal(details.species);
            expect(mon.level).to.equal(details.level);
            expect(mon.hp.current).to.equal(status.hp);
            expect(mon.hp.max).to.equal(status.hpMax);
            // TODO: handle case where there's no item? (have to change typings)
            expect(mon.item.definiteValue).to.not.be.null;
            expect(mon.item.definiteValue!.name).to.equal(data.item);
            expect(mon.baseAbility.definiteValue).to.not.be.null;
            expect(mon.baseAbility.definiteValue!.name)
                .to.equal(data.baseAbility);
            expect(mon.majorStatus.current).to.equal(status.condition);
            expect(mon.active).to.equal(data.active);

            for (let moveId of data.moves)
            {
                if (moveId.startsWith("hiddenpower"))
                {
                    const hpType = moveId.substr("hiddenpower".length)
                            .replace(/\d+/, "");
                    Object.keys(types).forEach(type =>
                        expect(mon.moveset.hpType.isSet(type))
                            .to.be[type === hpType ? "true" : "false"]);
                    moveId = "hiddenpower";
                }

                const move = mon.moveset.get(moveId)!;
                expect(move).to.not.be.null;
                expect(move.name).to.equal(moveId);
            }
        }
    }

    /**
     * Checks the `active` property of a RequestMessage object.
     * @param args Args object.
     */
    function checkRequestActive(args: RequestMessage): void
    {
        if (!args.active) return;
        for (let i = 0; i < args.active[0].moves.length; ++i)
        {
            expect(battle.state.teams.us.active.volatile.disabledMoves[i]
                .isActive).to.be.false;
        }
    }

    describe("#request()", function()
    {
        for (const args of testArgs.request)
        {
            it("Should handle request", async function()
            {
                await battle.request(args);
                checkRequestSide(args);
                checkRequestActive(args);
            });
        }
    });

    describe("#request()/#battleinit()", function()
    {
        function testBattleInit(args: BattleInitMessage): void
        {
            // testArgs: even/0 indexes are p1, odd are p2
            const i = args.id === "p1" ? 0 : 1;
            const req: RequestMessage =
            {
                side: {pokemon: [testArgs.request[i].side.pokemon[0]]}
            };

            it("Should initialize battle", async function()
            {
                // corresponding end |request| message is always sent before
                //  the events that lead up to this state
                await battle.request(req);
                checkRequestSide(req);
                await battle.init(args);

                // shouldn't modify current team data
                checkRequestSide(req);
                expect(battle.eventHandler.getSide("p1")).to.equal("us");
                expect(battle.eventHandler.getSide("p2")).to.equal("them");
                expect(battle.state.teams.them.size).to.equal(3);

                expect(responses).to.have.lengthOf(1);
            });
        }

        let a: BattleInitMessage =
        {
            id: "p1", username: testArgs.username[0], teamSizes: {p1: 3, p2: 3},
            gameType: "singles", gen: 4,
            events:
            [
                {
                    type: "switch", id: testArgs.pokemonId[0],
                    details: testArgs.pokemonDetails[0],
                    status: testArgs.pokemonStatus[0]
                },
                {
                    type: "switch", id: testArgs.pokemonId[1],
                    details: testArgs.pokemonDetails[1],
                    status: testArgs.pokemonStatus[1]
                }
            ]
        };
        testBattleInit(a);

        a = {...a, id: "p2", username: testArgs.username[1]};
        testBattleInit(a);

        it("Should disable moves", async function()
        {
            await battle.request(
            {
                active:
                [
                    {
                        moves:
                        [
                            {
                                move: "Psycho Cut", id: "psychocut", pp: 32,
                                maxpp: 32, target: "self", disabled: true
                            },
                            {
                                move: "Reflect", id: "reflect", pp: 32,
                                maxpp: 32, target: "self", disabled: false
                            }
                        ]
                    }
                ],
                side:
                {
                    pokemon:
                    [
                        {
                            ident: testArgs.pokemonId[0],
                            details: testArgs.pokemonDetails[0],
                            condition: testArgs.pokemonStatus[0],
                            active: true,
                            stats: {atk: 1, def: 1, spa: 1, spd: 1, spe: 1},
                            moves: ["psychocut", "reflect"],
                            baseAbility: "pressure", item: "expertbelt",
                            pokeball: "pokeball"
                        }
                    ]
                }
            });
            await battle.init(
            {
                id: "p1", username: testArgs.username[0],
                teamSizes: {p1: 1, p2: 1}, gameType: "singles", gen: 4,
                events:
                [
                    {
                        type: "switch", id: testArgs.pokemonId[0],
                        details: testArgs.pokemonDetails[0],
                        status: testArgs.pokemonStatus[0]
                    },
                    {
                        type: "switch", id: testArgs.pokemonId[1],
                        details: testArgs.pokemonDetails[1],
                        status: testArgs.pokemonStatus[1]
                    }
                ]
            });

            expect(battle.lastChoices).to.have.members(["move 2"]);
            expect(responses).to.have.lengthOf(1);
        });
    });

    describe("#battleprogress()", function()
    {
        // PokemonIDs of the setup teams
        const us1: Readonly<PokemonID> =
            {owner: "p1", position: "a", nickname: "Horsea"};
        const us2: Readonly<PokemonID> =
            {owner: "p1", position: "a", nickname: "Gyarados"};
        const them1: Readonly<PokemonID> =
            {owner: "p2", position: "a", nickname: "Seaking"};

        beforeEach("Setup state", async function()
        {
            // an initial request+battleinit is required to start tracking the
            //  state properly
            await battle.request(
            {
                active: [{moves: []}],
                side:
                {
                    pokemon:
                    [
                        {
                            ident: us1,
                            details:
                            {
                                species: "Horsea", level: 100, gender: "M",
                                shiny: false
                            },
                            condition: {hp: 10, hpMax: 10, condition: null},
                            active: true,
                            stats: {atk: 1, def: 1, spa: 1, spd: 1, spe: 1},
                            baseAbility: "swiftswim",
                            moves: [],
                            item: "choiceband",
                            pokeball: "pokeball"
                        },
                        {
                            ident: us2,
                            details:
                            {
                                species: "Gyarados", level: 100, gender: "M",
                                shiny: false
                            },
                            condition: {hp: 1000, hpMax: 1000, condition: null},
                            active: false,
                            stats: {atk: 1, def: 1, spa: 1, spd: 1, spe: 1},
                            baseAbility: "intimidate",
                            moves: [],
                            item: "lifeorb",
                            pokeball: "greatball"
                        }
                    ]
                }
            });
            await battle.init(
            {
                id: "p1", username: testArgs.username[0], gameType: "singles",
                gen: 4, teamSizes: {p1: 2, p2: 2}, events: []
            });

            // clear invalid response from battleinit handler
            responses = [];

            // setup our team
            battle.state.teams.us.active.switchIn();
            // setup opposing team
            expect(battle.state.teams.them.switchIn(
                    "Seaking", 100, "M", 10, 10)).to.not.be.null;
        });

        it("Should not choose action if requested to wait", async function()
        {
            await battle.request({side: {pokemon: []}, wait: true});
            await battle.progress({events: [{type: "upkeep"}]});
            expect(responses).to.be.empty;
        });

        it("Should not choose disabled moves", async function()
        {
            // moves that can't be used at this time are given by the request
            //  message
            await battle.request(
            {
                active:
                [
                    {
                        moves:
                        [
                            {move: "Splash", id: "splash", disabled: true},
                            {move: "Tackle", id: "tackle", disabled: false}
                        ]
                    }
                ],
                side: battle.lastRequest!.side
            });
            await battle.progress({events: []});

            expect(battle.lastChoices).to.have.members(["move 2", "switch 2"]);
            expect(responses).to.have.lengthOf(1);
        });

        it("Should struggle if no available moves", async function()
        {
            await battle.progress(
                {events: [{type: "upkeep"}, {type: "turn", num: 2}]});
            expect(battle.lastChoices).to.have.members(["move 1", "switch 2"]);
            expect(responses).to.have.lengthOf(1);
        });

        describe("#error()", function()
        {
            it("Should re-choose choices if trapped", async function()
            {
                // introduce a pokemon that can have a trapping ability
                const trapper = battle.state.teams.them.switchIn("Dugtrio",
                    100, "M", 100, 100)!;
                expect(trapper).to.not.be.null;

                // ask for a choice
                await battle.progress(
                    {events: [{type: "upkeep"}, {type: "turn", num: 2}]});
                expect(battle.lastChoices).to.have.members(
                    ["move 1", "switch 2"]);
                expect(responses).to.have.lengthOf(1);

                // (assuming ai chooses to switch) reject the choice, since the
                //  simulator "knows" the opponent has a trapping ability
                await battle.error({reason: "[Unavailable choice]"});
                await battle.request(
                {
                    active:
                    [
                        {
                            moves:
                            [
                                {move: "Splash", id: "splash", disabled: false}
                            ],
                            trapped: true
                        }
                    ],
                    side: battle.lastRequest!.side
                });
                // trapping ability should be revealed now
                expect(trapper.baseAbility.definiteValue).to.not.be.null;
                expect(trapper.baseAbility.definiteValue!.name)
                    .to.equal("arenatrap");

                // can only move
                expect(battle.lastChoices).to.have.members(["move 1"]);
                expect(responses).to.have.lengthOf(2);
            });

            it("Should choose next choice if invalid", async function()
            {
                await battle.progress(
                    {events: [{type: "upkeep"}, {type: "turn", num: 3}]});
                expect(battle.lastChoices).to.have.members(
                    ["move 1", "switch 2"]);
                expect(responses).to.have.lengthOf(1);

                // can't use last move choice
                // usually one can always use a move but this is just for
                //  testing purposes
                await battle.error({reason: "[Invalid choice]"});
                expect(battle.lastChoices).to.have.members(["switch 2"]);
                expect(responses).to.have.lengthOf(2);
            });
        });

        describe("event processing", function()
        {
            it("Should process events", async function()
            {
                // move hasn't been revealed yet
                expect(battle.state.teams.us.active.moveset.get("splash"))
                    .to.be.null;

                await battle.progress(
                {
                    events:
                    [
                        {
                            type: "move", id: us1, moveName: "Splash",
                            targetId: us1
                        },
                        {type: "upkeep"}, {type: "turn", num: 1}
                    ]
                });

                const move = battle.state.teams.us.active.moveset.get("splash");
                expect(move).to.not.be.null;
                expect(move!.pp).to.equal(63);

                expect(battle.lastChoices).to.have.members(
                    ["move 1", "switch 2"]);
                expect(responses).to.have.lengthOf(1);
            });
        });

        describe("selfSwitch", function()
        {
            it("Should process selfSwitch move", async function()
            {
                await battle.progress(
                {
                    events:
                    [
                        {
                            type: "move", id: us1, moveName: "U-Turn",
                            targetId: them1
                        }
                    ]
                });
                expect(battle.state.teams.us.status.selfSwitch).to.be.true;
            });

            it("Should process selfSwitch copyvolatile move", async function()
            {
                await battle.progress(
                {
                    events:
                    [
                        {
                            type: "move", id: us1, moveName: "Baton Pass",
                            targetId: them1
                        }
                    ]
                });
                expect(battle.state.teams.us.status.selfSwitch)
                    .to.equal("copyvolatile");
            });
        });

        describe("wish", function()
        {
            it("Should process wish", async function()
            {
                const status = battle.state.teams.us.status;
                expect(status.wish.isActive).to.be.false;

                await battle.progress(
                {
                    events:
                    [
                        {
                            type: "move", id: us1, moveName: "Wish",
                            targetId: us1
                        },
                        {type: "turn", num: 2}
                    ]
                });
                expect(status.wish.isActive).to.be.true;
                expect(status.wish.turns).to.equal(2);

                // using it again shouldn't reset the counter on the next turn
                await battle.progress(
                {
                    events:
                    [
                        {
                            type: "move", id: us1, moveName: "Wish",
                            targetId: us1
                        }
                    ]
                });
                expect(status.wish.isActive).to.be.true;
                expect(status.wish.turns).to.equal(2);

                // wish should be consumed next turn
                await battle.progress(
                    {events: [{type: "turn", num: 3}]});
                expect(status.wish.isActive).to.be.false;
                expect(status.wish.turns).to.equal(0);
            });
        });

        describe("switch (copyVolatile)", function()
        {
            // batonpass used by us
            const event1: MoveEvent =
            {
                type: "move", id: us1, moveName: "Baton Pass", targetId: them1
            };

            it("Should copy volatile", async function()
            {
                const us1Mon = battle.state.teams.us.active;
                const us2Mon = battle.state.teams.us.pokemon[1]!;

                us1Mon.volatile.boosts.atk = 2;
                await battle.progress(
                {
                    events:
                    [
                        event1,
                        {
                            type: "switch", id: us2,
                            details:
                            {
                                species: us2Mon.species.name,
                                gender: us2Mon.gender!, level: us2Mon.level,
                                shiny: false
                            },
                            status:
                            {
                                hp: us2Mon.hp.current, hpMax: us2Mon.hp.max,
                                condition: us2Mon.majorStatus.current
                            }
                        },
                        {type: "upkeep"}, {type: "turn", num: 2}
                    ]
                });
                expect(us2Mon.volatile.boosts.atk).to.equal(2);
            });

            // batonpass used by them
            const event2: MoveEvent =
            {
                type: "move", id: them1, moveName: "Baton Pass", targetId: us1
            };

            it("Should copy opponent volatile", async function()
            {
                const them1Mon = battle.state.teams.them.active;

                them1Mon.volatile.boosts.atk = 2;
                await battle.progress(
                {
                    events:
                    [
                        event2,
                        {
                            type: "switch",
                            id:
                            {
                                owner: "p2", position: "a", nickname: "Gyarados"
                            },
                            details:
                            {
                                species: "Gyarados", gender: "F", level: 100,
                                shiny: false
                            },
                            status: {hp: 100, hpMax: 100, condition: null}
                        },
                        {type: "upkeep"}, {type: "turn", num: 2}
                    ]
                });
                const them2Mon = battle.state.teams.them.active;
                expect(them1Mon).to.not.equal(them2Mon);
                expect(them2Mon.volatile.boosts.atk).to.equal(2);
            });
        });

        describe("ability", function()
        {
            it("Should set ability", async function()
            {
                expect(battle.state.teams.them.active.ability).to.equal("");
                await battle.progress(
                {
                    events:
                    [
                        {type: "-ability", id: them1, ability: "Swift Swim"}
                    ]
                });
                expect(battle.state.teams.them.active.ability)
                    .to.equal("swiftswim");
            });
        });

        describe("activate/end/start", function()
        {
            it("Should activate Charge", async function()
            {
                const volatile = battle.state.teams.us.active.volatile;
                expect(volatile.charge.isActive).to.be.false;

                await battle.progress(
                {
                    events:
                    [
                        {type: "-activate", id: us1, volatile: "move: Charge"}
                    ]
                });
                expect(volatile.charge.isActive).to.be.true;
            });

            it("Should activate/end/start confusion", async function()
            {
                const volatile = battle.state.teams.us.active.volatile;

                expect(volatile.confusion.isActive).to.be.false;
                await battle.progress(
                {
                    events:
                    [
                        {
                            type: "-start", id: us1, volatile: "confusion",
                            otherArgs: []
                        }
                    ]
                });
                expect(volatile.confusion.isActive).to.be.true;
                expect(volatile.confusion.turns).to.equal(1);

                await battle.progress(
                {
                    events:
                    [
                        {type: "-activate", id: us1, volatile: "confusion"}
                    ]
                });
                expect(volatile.confusion.isActive).to.be.true;
                expect(volatile.confusion.turns).to.equal(2);

                await battle.progress(
                    {events: [{type: "-end", id: us1, volatile: "confusion"}]});
                expect(volatile.confusion.isActive).to.be.false;
                expect(volatile.confusion.turns).to.equal(0);
            });

            it("Should start/end magnet rise", async function()
            {
                const volatile = battle.state.teams.us.active.volatile;

                expect(volatile.magnetRise.isActive).to.be.false;
                await battle.progress(
                {
                    events:
                    [
                        {
                            type: "-start", id: us1, volatile: "Magnet Rise",
                            otherArgs: []
                        }
                    ]
                });
                expect(volatile.magnetRise.isActive).to.be.true;

                await battle.progress(
                {
                    events: [{type: "-end", id: us1, volatile: "Magnet Rise"}]
                });
                expect(volatile.magnetRise.isActive).to.be.false;
            });

            it("Should start/end embargo", async function()
            {
                const volatile = battle.state.teams.us.active.volatile;

                expect(volatile.embargo.isActive).to.be.false;
                await battle.progress(
                {
                    events:
                    [
                        {
                            type: "-start", id: us1, volatile: "Embargo",
                            otherArgs: []
                        }
                    ]
                });
                expect(volatile.embargo.isActive).to.be.true;

                await battle.progress(
                {
                    events: [{type: "-end", id: us1, volatile: "Embargo"}]
                });
                expect(volatile.embargo.isActive).to.be.false;
            });

            it("Should start/end taunt", async function()
            {
                const volatile = battle.state.teams.us.active.volatile;

                expect(volatile.taunt.isActive).to.be.false;
                await battle.progress(
                {
                    events:
                    [
                        {
                            type: "-start", id: us1, volatile: "move: Taunt",
                            otherArgs: []
                        }
                    ]
                });
                expect(volatile.taunt.isActive).to.be.true;

                await battle.progress(
                {
                    events: [{type: "-end", id: us1, volatile: "move: Taunt"}]
                });
                expect(volatile.taunt.isActive).to.be.false;
            });

            it("Should start torment", async function()
            {
                const volatile = battle.state.teams.us.active.volatile;

                expect(volatile.torment).to.be.false;
                await battle.progress(
                {
                    events:
                    [
                        {
                            type: "-start", id: us1, volatile: "Torment",
                            otherArgs: []
                        }
                    ]
                });
                expect(volatile.torment).to.be.true;
            });

            it("Should start/end substitute", async function()
            {
                const volatile = battle.state.teams.us.active.volatile;

                expect(volatile.substitute).to.be.false;
                await battle.progress(
                {
                    events:
                    [
                        {
                            type: "-start", id: us1, volatile: "Substitute",
                            otherArgs: []
                        }
                    ]
                });
                expect(volatile.substitute).to.be.true;

                await battle.progress(
                {
                    events: [{type: "-end", id: us1, volatile: "Substitute"}]
                });
                expect(volatile.substitute).to.be.false;
            });

            it("Should disable/reenable move in BattleState", async function()
            {
                const mon = battle.state.teams.us.active;
                mon.moveset.reveal("splash");
                mon.moveset.reveal("tackle");
                expect(mon.volatile.disabledMoves[0].isActive).to.be.false;
                expect(mon.volatile.disabledMoves[1].isActive).to.be.false;

                // disable the move
                await battle.progress(
                {
                    events:
                    [
                        {
                            type: "-start", id: us1, volatile: "Disable",
                            otherArgs: ["Splash"]
                        },
                        {type: "upkeep"}, {type: "turn", num: 2}
                    ]
                });
                expect(mon.volatile.disabledMoves[0].isActive).to.be.true;
                expect(mon.volatile.disabledMoves[1].isActive).to.be.false;

                // reenable the move
                await battle.progress(
                {
                    events:
                    [
                        {type: "-end", id: us1, volatile: "move: Disable"},
                        {type: "upkeep"}, {type: "turn", num: 3}
                    ]
                });
                expect(mon.volatile.disabledMoves[0].isActive).to.be.false;
                expect(mon.volatile.disabledMoves[1].isActive).to.be.false;
            });

            it("Should start/end slowstart", async function()
            {
                const volatile = battle.state.teams.us.active.volatile;

                expect(volatile.slowStart.isActive).to.be.false;
                await battle.progress(
                {
                    events:
                    [
                        {
                            type: "-start", id: us1, volatile: "Slow Start",
                            otherArgs: []
                        }
                    ]
                });
                expect(volatile.slowStart.isActive).to.be.true;
                expect(volatile.slowStart.turns).to.equal(1);

                await battle.progress({events: [{type: "turn", num: 2}]});
                expect(volatile.slowStart.isActive).to.be.true;
                expect(volatile.slowStart.turns).to.equal(2);

                await battle.progress(
                {
                    events: [{type: "-end", id: us1, volatile: "Slow Start"}]
                });
                expect(volatile.slowStart.isActive).to.be.false;
                expect(volatile.slowStart.turns).to.equal(0);
            });

            it("Should start/end future move", async function()
            {
                await battle.progress(
                {
                    events:
                    [
                        {
                            type: "-start", id: us1, volatile: "Future Sight",
                            otherArgs: []
                        },
                        {type: "upkeep"}, {type: "turn", num: 2}
                    ]
                });

                const status = battle.state.teams.us.status;
                expect(status.futureMoves.futuresight.turns).to.equal(2);

                // run down future move counter
                await battle.progress({events: [{type: "turn", num: 3}]});
                expect(status.futureMoves.futuresight.turns).to.equal(3);

                // on this turn the future move activates
                await battle.progress(
                {
                    events:
                    [
                        {
                            type: "-end", id: us1, volatile: "Future Sight",
                            otherArgs: []
                        },
                        {type: "turn", num: 4}
                    ]
                });
                expect(status.futureMoves.futuresight.turns).to.equal(0);
            });

            describe("typeadd", function()
            {
                it("Should set third type", async function()
                {
                    const mon = battle.state.teams.us.active;
                    const volatile = mon.volatile;

                    expect(volatile.overrideTypes).to.have.members(
                        ["water", "???"]);
                    expect(volatile.addedType).to.equal("???");
                    expect(mon.types).to.have.members(["water"]);
                    await battle.progress(
                    {
                        events:
                        [
                            {
                                type: "-start", id: us1, volatile: "typeadd",
                                otherArgs: ["Fire"]
                            }
                        ]
                    });
                    expect(volatile.overrideTypes).to.have.members(
                        ["water", "???"]);
                    expect(volatile.addedType).to.equal("fire");
                    expect(mon.types).to.have.members(["water", "fire"]);
                });
            });

            describe("typechange", function()
            {
                it("Should set first type and reset rest", async function()
                {
                    const mon = battle.state.teams.us.active;
                    const volatile = mon.volatile;

                    volatile.overrideTypes = ["flying", "water"];
                    volatile.addedType = "poison";
                    expect(mon.types).to.have.members(
                        ["flying", "water", "poison"]);
                    await battle.progress(
                    {
                        events:
                        [
                            {
                                type: "-start", id: us1, volatile: "typechange",
                                otherArgs: ["Fire"]
                            }
                        ]
                    });
                    expect(volatile.overrideTypes).to.have.members(
                        ["fire", "???"]);
                    expect(volatile.addedType).to.equal("???");
                    expect(mon.types).to.have.members(["fire"]);
                });

                it("Should set types 1 and 2 and reset type 3", async function()
                {
                    const mon = battle.state.teams.us.active;
                    const volatile = mon.volatile;

                    volatile.overrideTypes = ["flying", "water"];
                    volatile.addedType = "poison";
                    expect(mon.types).to.have.members(
                        ["flying", "water", "poison"]);
                    await battle.progress(
                    {
                        events:
                        [
                            {
                                type: "-start", id: us1, volatile: "typechange",
                                otherArgs: ["Fire/Ground"]
                            }
                        ]
                    });
                    expect(volatile.overrideTypes).to.have.members(
                        ["fire", "ground"]);
                    expect(volatile.addedType).to.equal("???");
                    expect(mon.types).to.have.members(["fire", "ground"]);
                });

                it("Should truncate type list if too long", async function()
                {
                    const mon = battle.state.teams.us.active;
                    const volatile = mon.volatile;

                    await battle.progress(
                    {
                        events:
                        [
                            {
                                type: "-start", id: us1, volatile: "typechange",
                                otherArgs: ["Rock/Dragon/Water"]
                            }
                        ]
                    });
                    expect(volatile.overrideTypes).to.have.members(
                        ["rock", "dragon"]);
                });

                it("Should remove types if changed to nothing", async function()
                {
                    const mon = battle.state.teams.us.active;
                    const volatile = mon.volatile;

                    await battle.progress(
                    {
                        events:
                        [
                            {
                                type: "-start", id: us1, volatile: "typechange",
                                otherArgs: []
                            }
                        ]
                    });
                    expect(volatile.overrideTypes).to.have.members(
                        ["???", "???"]);
                    expect(mon.types).to.be.empty;
                });
            });
        });

        describe("boost messages", function()
        {
            describe("boost", function()
            {
                it("Should boost stat", async function()
                {
                    const boosts = battle.state.teams.us.active.volatile.boosts;
                    expect(boosts.def).to.equal(0);
                    await battle.progress(
                    {
                        events:
                        [
                            {type: "-boost", id: us1, stat: "def", amount: 1}
                        ]
                    });
                    expect(boosts.def).to.equal(1);
                });
            });

            describe("clearallboost", function()
            {
                it("Should clear all boosts", async function()
                {
                    const boost1 = battle.state.teams.us.active.volatile.boosts;
                    const boost2 =
                        battle.state.teams.them.active.volatile.boosts;
                    boost1.atk = 1;
                    boost1.accuracy = -4;
                    boost2.def = -1;
                    await battle.progress({events: [{type: "-clearallboost"}]});
                    expect(boost1.atk).to.equal(0);
                    expect(boost1.accuracy).to.equal(0);
                    expect(boost2.def).to.equal(0);
                });
            });

            describe("clearnegativeboost", function()
            {
                it("Should clear negative boosts", async function()
                {
                    const boosts = battle.state.teams.us.active.volatile.boosts;
                    boosts.atk = 1;
                    boosts.evasion = -3;
                    await battle.progress(
                        {events: [{type: "-clearnegativeboost", id: us1}]});
                    expect(boosts.atk).to.equal(1);
                    expect(boosts.evasion).to.equal(0);
                });
            });

            describe("clearpositiveboost", function()
            {
                it("Should clear positive boosts", async function()
                {
                    const boosts = battle.state.teams.us.active.volatile.boosts;
                    boosts.atk = 1;
                    boosts.evasion = -3;
                    await battle.progress(
                        {events: [{type: "-clearpositiveboost", id: us1}]});
                    expect(boosts.atk).to.equal(0);
                    expect(boosts.evasion).to.equal(-3);
                });
            });

            describe("copyboost", function()
            {
                it("Should copy and override boosts", async function()
                {
                    const boost1 = battle.state.teams.us.active.volatile.boosts;
                    const boost2 =
                        battle.state.teams.them.active.volatile.boosts;
                    boost1.atk = 1;
                    boost1.accuracy = -4;
                    boost2.def = -1;
                    await battle.progress(
                    {
                        events:
                        [
                            {type: "-copyboost", source: us1, target: them1}
                        ]
                    });
                    expect(boost1.atk).to.equal(0);
                    expect(boost1.def).to.equal(-1);
                    expect(boost1.accuracy).to.equal(0);
                    expect(boost2.def).to.equal(-1);
                });
            });

            describe("invertboost", function()
            {
                it("Should invert boosts", async function()
                {
                    const boosts = battle.state.teams.us.active.volatile.boosts;
                    boosts.spa = 4;
                    boosts.spe = -6;
                    await battle.progress(
                        {events: [{type: "-invertboost", id: us1}]});
                    expect(boosts.spa).to.equal(-4);
                    expect(boosts.spe).to.equal(6);
                });
            });

            describe("setboost", function()
            {
                it("Should set boost", async function()
                {
                    const boosts = battle.state.teams.us.active.volatile.boosts;
                    boosts.atk = 1;
                    await battle.progress(
                    {
                        events:
                        [
                            {type: "-setboost", id: us1, stat: "atk", amount: 5}
                        ]
                    });
                    expect(boosts.atk).to.equal(5);
                });
            });

            describe("swapboost", function()
            {
                it("Should swap boosts", async function()
                {
                    const boost1 = battle.state.teams.us.active.volatile.boosts;
                    const boost2 =
                        battle.state.teams.them.active.volatile.boosts;
                    boost1.atk = -1;
                    boost1.spd = 3;
                    boost2.evasion = -2;
                    await battle.progress(
                    {
                        events:
                        [
                            {
                                type: "-swapboost", source: us1, target: them1,
                                stats: ["atk", "evasion"]
                            }
                        ]
                    });

                    // mentioned stats should be swapped
                    expect(boost1.atk).to.equal(0);
                    expect(boost1.evasion).to.equal(-2);
                    expect(boost2.atk).to.equal(-1);
                    expect(boost2.evasion).to.equal(0);

                    // unmentioned should be kept the same
                    expect(boost1.spd).to.equal(3);
                    expect(boost2.spd).to.equal(0);
                });
            });

            describe("unboost", function()
            {
                it("Should unboost stat", async function()
                {
                    const boosts = battle.state.teams.us.active.volatile.boosts;
                    expect(boosts.spe).to.equal(0);
                    await battle.progress(
                    {
                        events:
                        [
                            {type: "-unboost", id: us1, stat: "spe", amount: 1}
                        ]
                    });
                    expect(boosts.spe).to.equal(-1);
                });
            });
        });

        describe("cant", function()
        {
            it("Should reveal ability", async function()
            {
                const mon = battle.state.teams.them.active;
                mon.ability = "swiftswim";
                await battle.progress(
                {
                    events: [{type: "cant", id: them1, reason: "ability: Damp"}]
                });
                expect(mon.ability).to.equal("damp");
                expect(mon.baseAbility.definiteValue).to.not.be.null;
                expect(mon.baseAbility.definiteValue!.name)
                    .to.equal("swiftswim");
            });

            it("Should properly handle Truant ability", async function()
            {
                const mon = battle.state.teams.us.active;
                mon.ability = "truant";
                mon.volatile.mustRecharge = true;
                expect(mon.volatile.willTruant).to.be.false;

                // completed a turn without truant activating
                await battle.progress(
                    {events: [{type: "turn", num: 3}]});
                expect(responses).to.have.lengthOf(1);
                expect(mon.volatile.willTruant).to.be.true;

                // next turn truant activates
                await battle.progress(
                {
                    events:
                    [
                        {type: "cant", id: us1, reason: "ability: Truant"}
                    ]
                });
                expect(responses).to.have.lengthOf(2);
                expect(mon.volatile.mustRecharge).to.be.false;
                expect(mon.volatile.willTruant).to.be.true;

                // complete this turn
                await battle.progress(
                    {events: [{type: "turn", num: 4}]});
                expect(responses).to.have.lengthOf(3);
                expect(mon.volatile.willTruant).to.be.false;
            });

            it("Should reveal failed move", async function()
            {
                const mon = battle.state.teams.them.active;
                expect(mon.moveset.get("thunderwave")).to.be.null;

                await battle.progress(
                {
                    events:
                    [
                        {
                            type: "cant", id: them1, reason: "taunt",
                            moveName: "Thunder Wave"
                        }
                    ]
                });
                expect(mon.moveset.get("thunderwave")).to.not.be.null;
            });

            it("Should tick sleep counter", async function()
            {
                const mon = battle.state.teams.us.active;
                mon.majorStatus.afflict("slp");

                await battle.progress(
                    {events: [{type: "cant", id: us1, reason: "slp"}]});

                expect(mon.majorStatus.turns).to.equal(2);
            });

            it("Should tick sleep counter twice if earlybird", async function()
            {
                const mon = battle.state.teams.us.active;
                mon.ability = "earlybird";
                mon.majorStatus.afflict("slp");

                await battle.progress(
                    {events: [{type: "cant", id: us1, reason: "slp"}]});

                expect(mon.majorStatus.turns).to.equal(3);
            });
        });

        describe("curestatus", function()
        {
            it("Should cure status", async function()
            {
                const mon = battle.state.teams.us.active;
                mon.majorStatus.afflict("slp");
                mon.majorStatus.tick();
                await battle.progress(
                {
                    events: [{type: "-curestatus", id: us1, majorStatus: "slp"}]
                });
                expect(mon.majorStatus.current).to.be.null;
            });

            it("Should infer early bird if awake in 0 turns", async function()
            {
                const mon = battle.state.teams.us.active;
                mon.majorStatus.afflict("slp");
                await battle.progress(
                {
                    events: [{type: "-curestatus", id: us1, majorStatus: "slp"}]
                });
                expect(mon.majorStatus.current).to.be.null;
                expect(mon.ability).to.equal("earlybird");
            });
        });

        describe("cureteam", function()
        {
            it("Should cure team", async function()
            {
                const mon1 = battle.state.teams.us.active;
                const mon2 = battle.state.teams.us.pokemon[1]!;
                mon1.majorStatus.afflict("slp");
                mon2.majorStatus.afflict("par");
                await battle.progress(
                    {events: [{type: "-cureteam", id: us1}]});
                expect(mon1.majorStatus.current).to.be.null;
                expect(mon2.majorStatus.current).to.be.null;
            });
        });

        describe("damage", function()
        {
            it("Should set hp", async function()
            {
                await battle.progress(
                {
                    events:
                    [
                        {
                            type: "-damage", id: us1,
                            status: {hp: 1, hpMax: 10, condition: null}
                        }
                    ]
                });
                const mon = battle.state.teams.us.active;
                expect(mon.hp.current).to.equal(1);
                expect(mon.hp.max).to.equal(10);
                expect(mon.majorStatus.current).to.be.null;
            });

            it("Should tick toxic counter if from poison", async function()
            {
                const mon = battle.state.teams.us.active;
                mon.majorStatus.afflict("tox");
                await battle.progress(
                {
                    events:
                    [
                        {
                            type: "-damage", id: us1,
                            status: {hp: 1, hpMax: 10, condition: "tox"},
                            from: {type: "psn"}
                        }
                    ]
                });
                expect(mon.majorStatus.turns).to.equal(2);
            });
        });

        describe("detailschange", function()
        {
            it("Should change details", async function()
            {
                const active = battle.state.teams.us.active;
                expect(active.species.name).to.equal("Horsea");
                await battle.progress(
                {
                    events:
                    [
                        {
                            type: "detailschange",
                            id: us1,
                            details:
                            {
                                species: "Kingdra", level: 100, shiny: false,
                                gender: "F"
                            },
                            status: {hp: 100, hpMax: 100, condition: null}
                        }
                    ]
                });
                expect(active.species.name).to.equal("Kingdra");
            });
        });

        describe("faint", function()
        {
            it("Should handle faint", async function()
            {
                expect(battle.state.teams.us.active.fainted).to.be.false;

                await battle.request(
                {
                    active:
                    [
                        {
                            moves:
                            [
                                {
                                    move: "Splash", id: "splash", pp: 64,
                                    maxpp: 64, disabled: false, target: "self"
                                }
                            ]
                        }
                    ],
                    side: battle.lastRequest!.side,
                    forceSwitch: [true], noCancel: true
                });
                await battle.progress(
                    {events: [{type: "faint", id: us1}, {type: "upkeep"}]});

                expect(battle.state.teams.us.active.fainted).to.be.true;

                expect(battle.lastChoices).to.have.members(["switch 2"]);
                expect(responses).to.have.lengthOf(1);
            });

            it("Should wait for opponent replacement", async function()
            {
                expect(battle.state.teams.them.active.fainted).to.be.false;

                await battle.request(
                {
                    active:
                    [
                        {
                            moves:
                            [
                                {
                                    move: "Splash", id: "splash", pp: 64,
                                    maxpp: 64, disabled: false, target: "self"
                                }
                            ]
                        }
                    ],
                    side: battle.lastRequest!.side,
                    wait: true
                });
                await battle.progress(
                    {events: [{type: "faint", id: them1}, {type: "upkeep"}]});

                expect(responses).to.be.empty;
            });
        });

        describe("formechange", function()
        {
            it("Should temporarily change form", async function()
            {
                const active = battle.state.teams.us.active;
                expect(active.species.name).to.equal("Horsea");
                expect(active.volatile.overrideSpecies).to.equal("Horsea");
                expect(active.volatile.overrideSpeciesId).to.not.be.null;
                await battle.progress(
                {
                    events:
                    [
                        {
                            type: "-formechange",
                            id: us1,
                            details:
                            {
                                species: "Kingdra", level: 100, shiny: false,
                                gender: "F"
                            },
                            status: {hp: 100, hpMax: 100, condition: null}
                        }
                    ]
                });
                expect(active.species.name).to.equal("Horsea");
                expect(active.volatile.overrideSpecies).to.equal("Kingdra");
                expect(active.volatile.overrideSpeciesId).to.not.be.null;
            });
        });

        describe("item messages", function()
        {
            describe("item", function()
            {
                /**
                 * Creates an `|-item|` message test.
                 * @param name Name of the test.
                 * @param precon Precondition for the pokemon's `item` field.
                 * Executes before the message is handled.
                 * @param move If provided, the item was transferred due to this
                 * move.
                 */
                function test(name: string,
                    precon: (item: PossibilityClass<number>) => any,
                    move?: string): void
                {
                    it(name, async function()
                    {
                        const mon = battle.state.teams.them.active;
                        precon(mon.item);

                        let ev: ItemEvent =
                                {type: "-item", id: them1, item: "Life Orb"};
                        if (move) ev = {...ev, from: {type: "move", move}};

                        const item = mon.item;

                        // pokemon gains some item
                        await battle.progress({events: [ev]});
                        // reference gets reassigned if the item was gained
                        if (move) expect(mon.item).to.not.equal(item);
                        // should set current item
                        expect(mon.item.definiteValue).to.not.be.null;
                        expect(mon.item.definiteValue!.name)
                            .to.equal("lifeorb");
                    });
                }

                test("Should reveal item",
                    item => expect(item.definiteValue).to.be.null);
                test("Should reset item if gained",
                    item => item.narrow("leftovers"), "Trick");
            });

            describe("enditem", function()
            {
                it("Should remove item", async function()
                {
                    const mon = battle.state.teams.them.active;
                    mon.item.narrow("lifeorb");
                    await battle.progress(
                    {
                        events:
                        [
                            {type: "-enditem", id: them1, item: "Life Orb"}
                        ]
                    });
                    expect(mon.item.definiteValue).to.not.be.null;
                    expect(mon.item.definiteValue!.name).to.equal("none");
                });

                describe("lastItem (Recycle)", function()
                {
                    /**
                     * Tests an `|-enditem|` message for setting
                     * `Pokemon#lastItem`.
                     * @param name Name of the test.
                     * @param setLastItem Whether `lastItem` should be set.
                     * @param suffix Optional message suffix.
                     */
                    function test(name: string, setLastItem: boolean,
                        suffix?: "eat" | "stealeat" | {move: string}): void
                    {
                        it(name, async function()
                        {
                            const mon = battle.state.teams.them.active;
                            const item = mon.item;

                            // consume/remove some item
                            let event: EndItemEvent =
                            {
                                type: "-enditem", id: them1, item: "Lum Berry"
                            };
                            if (suffix === "eat") event = {...event, eat: true};
                            else if (suffix === "stealeat")
                            {
                                event = {...event, from: {type: "stealeat"}};
                            }
                            else if (suffix && suffix.move)
                            {
                                event =
                                {
                                    ...event,
                                    from: {type: "move", move: suffix.move}
                                };
                            }
                            await battle.progress({events: [event]});

                            // make sure item gets removed
                            expect(mon.item.definiteValue).to.not.be.null;
                            expect(mon.item.definiteValue!.name)
                                .to.equal("none");

                            // test Pokemon#lastItem
                            if (setLastItem)
                            {
                                // item reference moved to lastItem slot
                                expect(mon.lastItem).to.equal(item);
                            }
                            // item reference was thrown away
                            else expect(mon.lastItem).to.not.equal(item);
                            expect(mon.lastItem.definiteValue).to.not.be.null;
                            expect(mon.lastItem.definiteValue!.name)
                                .to.equal(setLastItem ? "lumberry" : "none");
                        });
                    }

                    test("Should set lastItem normally", true);
                    test("Should set lastItem if eaten", true, "eat");
                    test("Should set lastItem if eaten by opponent", true,
                        "stealeat");
                    test("Should set lastItem if Flung", true, {move: "Fling"});
                    test("Should not set lastItem if Knocked Off", false,
                        {move: "Knock Off"});
                    test("Should not set lastItem if stolen by Thief", false,
                        {move: "Thief"});
                    test("Should not set lastItem if stolen by Covet", false,
                        {move: "Covet"});
                    test("Should not set lastItem if moved by Trick", false,
                        {move: "Trick"});
                    test("Should not set lastItem if moved by Switcheroo",
                        false, {move: "Switcheroo"});
                });

                describe("unburden", function()
                {
                    it("Should activate when item is removed", async function()
                    {
                        const v = battle.state.teams.them.active.volatile;
                        expect(v.unburden).to.be.false;
                        await battle.progress(
                        {
                            events:
                            [
                                {type: "-enditem", id: them1, item: "Mail"}
                            ]
                        });
                        expect(v.unburden).to.be.true;
                    });

                    it("Should not activate when a new item is gained",
                    async function()
                    {
                        const v = battle.state.teams.them.active.volatile;
                        expect(v.unburden).to.be.false;
                        // item message requires a cause to let us know the item
                        //  is being gained, not revealed
                        // having it revealed would cause it to overnarrow since
                        //  it would already know that the item is none
                        await battle.progress(
                        {
                            events:
                            [
                                {type: "-enditem", id: them1, item: "Mail"},
                                {
                                    type: "-item", id: them1, item: "Life Orb",
                                    from: {type: "move", move: "Covet"}
                                }
                            ]
                        });
                        expect(v.unburden).to.be.false;
                    });
                });
            });
        });

        describe("move", function()
        {

            it("Should reveal move", async function()
            {
                const mon = battle.state.teams.us.active;
                let move = mon.moveset.get("splash")!;
                expect(move).to.be.null;

                await battle.progress(
                {
                    events:
                    [
                        {
                            type: "move", id: us1, moveName: "Splash",
                            targetId: us1
                        }
                    ]
                });

                move = mon.moveset.get("splash")!;
                expect(move).to.not.be.null;
                expect(move.name).to.equal("splash");
                expect(move.pp).to.equal(63);
            });

            describe("unsuccessful", function()
            {
                function shouldCancelLockedMove(name: string,
                    event: AnyBattleEvent, miss?: boolean): void
                {
                    it(`Should cancel lockedmove if ${name}`, async function()
                    {
                        const mon = battle.state.teams.us.active;
                        expect(mon.volatile.lockedMove.isActive).to.be.false;

                        await battle.progress(
                        {
                            events:
                            [
                                {
                                    type: "move", id: us1,
                                    moveName: "Petal Dance", targetId: them1,
                                    miss
                                },
                                event
                            ]
                        });
                        expect(mon.volatile.lockedMove.isActive).to.be.false;
                    });
                }

                shouldCancelLockedMove("protected",
                    {type: "-activate", id: them1, volatile: "move: Protect"});
                shouldCancelLockedMove("immune", {type: "-immune", id: us1});
                shouldCancelLockedMove("missed",
                    {type: "-miss", id: us1, targetId: them1}, /*miss*/true);
                shouldCancelLockedMove("failed", {type: "-fail", id: us1});
            });

            describe("lockedmove", function()
            {
                it("Should activate lockedmove status and restrict choices",
                async function()
                {
                    expect(battle.state.teams.us.active.volatile.lockedMove
                        .isActive).to.be.false;
                    await battle.request(
                    {
                        active:
                        [
                            {
                                moves:
                                [
                                    {
                                        move: "Outrage", id: "outrage",
                                        disabled: false
                                    }
                                ],
                                trapped: true
                            }
                        ],
                        side: battle.lastRequest!.side
                    });
                    await battle.progress(
                    {
                        events:
                        [
                            {
                                type: "move", id: us1, moveName: "Outrage",
                                targetId: them1
                            },
                            {type: "upkeep"}, {type: "turn", num: 60}
                        ]
                    });
                    expect(battle.state.teams.us.active.volatile.lockedMove
                        .isActive).to.be.true;
                    expect(battle.lastChoices).to.have.members(["move 1"]);
                    expect(responses).to.have.lengthOf(1);
                });

                it("Should not consume pp", async function()
                {
                    let move =
                        battle.state.teams.us.active.moveset.get("splash");
                    expect(move).to.be.null;

                    await battle.progress(
                    {
                        events:
                        [
                            {
                                type: "move", id: us1, moveName: "Splash",
                                targetId: us1, from: {type: "lockedmove"}
                            }
                        ]
                    });

                    move = battle.state.teams.us.active.moveset.get("splash")!;
                    expect(move).to.not.be.null;
                    expect(move.pp).to.equal(64);
                });
            });
        });

        describe("mustrecharge", function()
        {
            it("Should recharge after recharge move", async function()
            {
                await battle.request(
                {
                    active:
                    [
                        {
                            moves:
                            [
                                {
                                    move: "Recharge", id: "recharge",
                                    disabled: false
                                }
                            ],
                            trapped: true
                        }
                    ],
                    side: battle.lastRequest!.side
                });
                await battle.progress(
                {
                    events:
                    [
                        {
                            type: "move", id: us1, moveName: "Hyper Beam",
                            targetId: them1
                        },
                        {type: "upkeep"}, {type: "turn", num: 4},
                        {type: "-mustrecharge", id: us1}
                    ]
                });
                expect(battle.lastChoices).to.have.members(["move 1"]);
                expect(responses).to.have.lengthOf(1);

                await battle.request(
                {
                    active:
                    [
                        {
                            moves:
                            [
                                {
                                    move: "Hyper Beam", id: "hyperbeam", pp: 7,
                                    maxpp: 8, disabled: false
                                }
                            ],
                            trapped: false
                        }
                    ],
                    side: battle.lastRequest!.side
                });
                await battle.progress(
                {
                    events:
                    [
                        {type: "cant", id: us1, reason: "recharge"},
                        {type: "upkeep"}, {type: "turn", num: 5}
                    ]
                });
                expect(battle.lastChoices).to.have.members(
                    ["move 1", "switch 2"]);
                expect(responses).to.have.lengthOf(2);
            });
        });

        describe("prepare", function()
        {
            it("Should prepare two-turn move", async function()
            {
                // make it so we have 2 moves to choose from
                const mon = battle.state.teams.us.active;
                mon.moveset.reveal("splash");

                let request: RequestMessage =
                {
                    active:
                    [
                        {
                            moves:
                            [
                                {
                                    move: "Solar Beam", id: "solarbeam",
                                    disabled: false
                                }
                            ],
                            trapped: true
                        }
                    ],
                    side: battle.lastRequest!.side,
                    wait: true
                };
                await battle.request(request);
                await battle.progress(
                {
                    events:
                    [
                        {
                            type: "move", id: us1, moveName: "Solar Beam",
                            targetId: them1
                            // note: server also sends |[still] term at eol,
                            //  which supresses animation and is technically
                            //  supposed to hide targetId (applies to doubles)
                        },
                        {
                            type: "-prepare", id: us1, moveName: "Solar Beam",
                            targetId: them1
                        },
                        {type: "upkeep"}
                    ]
                });
                expect(mon.volatile.twoTurn.type).to.equal("solarbeam");

                // simulate intermediate choice by sending turn after
                request = {...request, wait: false};
                await battle.request(request);
                await battle.progress({events: [{type: "turn", num: 2}]});
                expect(mon.volatile.twoTurn.type).to.equal("solarbeam");
                // the use of a two-turn move should restrict the client's
                //  choices to only the move being prepared, which temporarily
                //  takes the spot of the first move
                expect(battle.lastChoices).to.have.members(["move 1"]);
                expect(responses).to.have.lengthOf(1);

                // release the charged move, freeing the pokemon's choices
                request =
                {
                    ...request,
                    active: [{moves:
                    [
                        {
                            move: "Solar Beam", id: "solarbeam", pp: 15,
                            maxpp: 16, disabled: false, target: "any"
                        },
                        {
                            move: "Splash", id: "splash", pp: 64, maxpp: 64,
                            disabled: false, target: "self"
                        }
                    ]}],
                    wait: true
                };
                await battle.request(request);
                await battle.progress(
                {
                    events:
                    [
                        {
                            type: "move", id: us1, moveName: "Solar Beam",
                            targetId: them1, from: {type: "lockedmove"}
                        },
                        {type: "upkeep"}
                    ]
                });
                expect(mon.volatile.twoTurn.isActive).to.be.false;

                // simulate intermediate choice by sending turn after
                request = {...request, wait: false};
                await battle.request(request);
                await battle.progress({events: [{type: "turn", num: 3}]});
                // should now be able to choose other choices
                expect(battle.lastChoices).to.have.members(
                    ["move 1", "move 2", "switch 2"]);
                expect(responses).to.have.lengthOf(2);
                expect(mon.volatile.twoTurn.isActive).to.be.false;
            });

            it("Should interrupt two-turn move", async function()
            {
                // make it so we have 2 moves to choose from
                const mon = battle.state.teams.us.active;
                mon.moveset.reveal("splash");

                let request: RequestMessage =
                {
                    active:
                    [
                        {
                            moves:
                            [
                                {
                                    move: "Solar Beam", id: "solarbeam",
                                    disabled: false
                                }
                            ],
                            trapped: true
                        }
                    ],
                    side: battle.lastRequest!.side,
                    wait: true
                };
                await battle.request(request);
                await battle.progress(
                {
                    events:
                    [
                        {
                            type: "move", id: us1, moveName: "Solar Beam",
                            targetId: them1
                            // note: server also sends |[still] term at eol,
                            //  which supresses animation and is technically
                            //  supposed to hide targetId (applies to doubles)
                        },
                        {
                            type: "-prepare", id: us1, moveName: "Solar Beam",
                            targetId: them1
                        },
                        {type: "upkeep"}
                    ]
                });
                expect(mon.volatile.twoTurn.type).to.equal("solarbeam");

                // simulate intermediate choice by sending turn after
                request = {...request, wait: false};
                await battle.request(request);
                await battle.progress({events: [{type: "turn", num: 2}]});
                expect(mon.volatile.twoTurn.type).to.equal("solarbeam");
                // the use of a two-turn move should restrict the client's
                //  choices to only the move being prepared, which temporarily
                //  takes the spot of the first move
                expect(battle.lastChoices).to.have.members(["move 1"]);
                expect(responses).to.have.lengthOf(1);

                // interrupt the charged move somehow
                request =
                {
                    ...request,
                    active: [{moves:
                    [
                        {
                            move: "Solar Beam", id: "solarbeam", pp: 15,
                            maxpp: 16, disabled: false, target: "any"
                        },
                        {
                            move: "Splash", id: "splash", pp: 64, maxpp: 64,
                            disabled: false, target: "self"
                        }
                    ]}]
                };
                await battle.request(request);
                // absence of twoturn move indicates that the pokemon was
                //  prevented from completing the move
                await battle.progress({events: [{type: "turn", num: 3}]});
                // should now be able to choose other choices
                expect(battle.lastChoices).to.have.members(
                    ["move 1", "move 2", "switch 2"]);
                expect(responses).to.have.lengthOf(2);
                expect(mon.volatile.twoTurn.isActive).to.be.false;
            });

            // TODO: shorted two-turn move (e.g. solarbeam with sun/powerherb)
        });

        describe("sethp", function()
        {
            it("Should set hp", async function()
            {
                const hp1 = battle.state.teams.us.active.hp;
                const hp2 = battle.state.teams.them.active.hp;
                const event: SetHPEvent =
                {
                    type: "-sethp",
                    newHPs:
                    [
                        {id: us1, status: {hp: 1, hpMax: 10, condition: null}},
                        {id: them1, status: {hp: 2, hpMax: 20, condition: null}}
                    ]
                };
                await battle.progress({events: [event]});
                expect(hp1.current).to.equal(1);
                expect(hp1.max).to.equal(10);
                expect(hp2.current).to.equal(2);
                expect(hp2.max).to.equal(20);
            });
        });

        describe("sideend/sidestart", function()
        {
            function camelCase(s: string)
            {
                const words = s.split(" ");
                words[0] = words[0].toLowerCase();
                for (let i = 1; i < words.length; ++i)
                {
                    words[i] = words[i].charAt(0).toUpperCase() +
                        words[i].substr(1).toLowerCase();
                }
                return words.join("");
            }

            for (const condition of
                    ["Spikes", "move: Stealth Rock", "move: Toxic Spikes"])
            {
                // get VolatileStatus corresponding field name
                let field: "spikes" | "stealthRock" | "toxicSpikes";
                if (condition.startsWith("move: "))
                {
                    field = condition.substr("move: ".length) as any;
                }
                else field = condition as any;
                field = camelCase(field) as any;

                it(`Should start/end ${condition}`, async function()
                {
                    const ts = battle.state.teams.us.status;
                    expect(ts[field]).to.equal(0);

                    await battle.progress(
                        {events: [{type: "-sidestart", id: "p1", condition}]});
                    expect(ts[field]).to.equal(1);

                    await battle.progress(
                        {events: [{type: "-sidestart", id: "p1", condition}]});
                    expect(ts[field]).to.equal(2);

                    await battle.progress(
                        {events: [{type: "-sideend", id: "p1", condition}]});
                    expect(ts[field]).to.equal(0);
                });
            }

            for (const status of ["Reflect", "Light Screen"] as const)
            {
                const field: "reflect" | "lightScreen" =
                    camelCase(status) as any;

                it(`Should start/end ${field.toLowerCase()} and infer ` +
                    "lightclay item", async function()
                {
                    const ts = battle.state.teams.them.status;
                    expect(ts[field].type).to.equal("none");

                    // start the side condition due to move
                    await battle.progress(
                    {
                        events:
                        [
                            {
                                type: "move", id: them1, moveName: status,
                                targetId: them1
                            },
                            {
                                type: "-sidestart", id: them1.owner,
                                condition: status
                            }
                        ]
                    });

                    const mon = battle.state.teams.them.active;

                    expect(ts[field].type).to.equal(field.toLowerCase());
                    expect(ts[field].source).to.equal(mon.item);

                    for (let i = 0; i < 5; ++i)
                    {
                        expect(ts[field].turns).to.equal(i);
                        expect(ts[field].duration).to.equal(5);
                        expect(mon.item.definiteValue).to.be.null;
                        await battle.progress(
                            {events: [{type: "turn", num: i + 2}]});
                    }

                    // lasted >5 turns, infer item
                    expect(mon.item.definiteValue).to.not.be.null;
                    expect(mon.item.definiteValue!.name).to.equal("lightclay");

                    // run down the duration
                    for (let i = 0; i < 2; ++i)
                    {
                        expect(ts[field].duration).to.equal(8);
                        await battle.progress(
                            {events: [{type: "turn", num: i + 7}]});
                    }

                    // end the side condition due to timeout
                    await battle.progress(
                    {
                        events:
                        [
                            {
                                type: "-sideend", id: them1.owner,
                                condition: status
                            },
                            {type: "turn", num: 9}
                        ]
                    });
                    expect(ts[field].type).to.equal("none");
                    expect(ts[field].source).to.be.null;
                    expect(ts[field].turns).to.equal(0);
                    expect(ts[field].duration).to.be.null;
                });
            }
        });

        describe("singleturn", function()
        {
            describe("stall", function()
            {
                it("Should increment/reset stallTurns", async function()
                {
                    const volatile = battle.state.teams.us.active.volatile;
                    expect(volatile.stallTurns).to.equal(0);

                    await battle.progress(
                    {
                        events:
                        [
                            {type: "-singleturn", id: us1, status: "Protect"},
                            {type: "turn", num: 2}
                        ]
                    });
                    expect(volatile.stallTurns).to.equal(1);

                    // uses protect again
                    await battle.progress(
                    {
                        events:
                        [
                            {type: "-singleturn", id: us1, status: "Protect"},
                            {type: "turn", num: 3}
                        ]
                    });
                    expect(volatile.stallTurns).to.equal(2);

                    // doesn't successfully protect this turn
                    await battle.progress(
                        {events: [{type: "turn", num: 4}]});
                    // accept Battle's response
                    await battle.progress({events: []});
                    expect(volatile.stallTurns).to.equal(0);
                });

                it("Should stop locked moves on the first move",
                async function()
                {
                    await battle.progress(
                    {
                        events:
                        [
                            // it's implied that protect is used, but the
                            //  presence of the activate message should dictate
                            //  whether it works
                            {
                                type: "move", id: us1, moveName: "Outrage",
                                targetId: them1
                            },
                            {type: "-activate", id: them1, volatile: "Protect"}
                        ]
                    });
                    expect(battle.state.teams.us.active.volatile.lockedMove
                        .isActive).to.be.false;
                });

                it("Should interrupt locked moves", async function()
                {
                    await battle.progress(
                    {
                        events:
                        [
                            {
                                type: "move", id: us1, moveName: "Outrage",
                                targetId: them1
                            }
                        ]
                    });
                    expect(battle.state.teams.us.active.volatile.lockedMove
                        .isActive).to.be.true;

                    await battle.progress(
                    {
                        events:
                        [
                            {
                                type: "move", id: us1, moveName: "Outrage",
                                targetId: them1
                            },
                            {type: "-activate", id: them1, volatile: "Protect"}
                        ]
                    });
                    expect(battle.state.teams.us.active.volatile.lockedMove
                        .isActive).to.be.false;
                });
            });
        });

        describe("status", function()
        {
            it("Should afflict with status", async function()
            {
                const mon = battle.state.teams.us.active;
                expect(mon.majorStatus.current).to.be.null;
                await battle.progress(
                    {events: [{type: "-status", id: us1, majorStatus: "frz"}]});
                expect(mon.majorStatus.current).to.equal("frz");
            });
        });

        describe("weather", function()
        {
            let weather: ItemTempStatus<WeatherType>;

            beforeEach("Initialize Weather reference", function()
            {
                weather = battle.state.status.weather;
            });

            it("Should reset weather", async function()
            {
                await battle.progress(
                {
                    events:
                    [
                        {type: "-weather", weatherType: "none", upkeep: false}
                    ]
                });
                expect(weather.type).to.equal("none");
                expect(weather.source).to.be.null;
                expect(weather.duration).to.be.null;
                expect(weather.turns).to.equal(0);
            });

            it("Should handle weather change due to ability", async function()
            {
                await battle.progress(
                {
                    events:
                    [
                        {
                            type: "-weather", weatherType: "RainDance",
                            upkeep: false,
                            from: {type: "ability", ability: "Drizzle"}, of: us1
                        }
                    ]
                });
                const mon = battle.eventHandler.getActive(us1.owner);
                expect(mon.ability).to.equal("drizzle");
                expect(weather.type).to.equal("RainDance");
                // no need to track source item
                expect(weather.source).to.be.null;
                expect(weather.duration).to.be.null;
                expect(weather.turns).to.equal(0);
            });

            it("Should handle weather change due to move", async function()
            {
                await battle.progress(
                {
                    events:
                    [
                        {
                            type: "move", id: them1, moveName: "Sunny Day",
                            targetId: them1
                        },
                        {
                            type: "-weather", weatherType: "SunnyDay",
                            upkeep: false
                        }
                    ]
                });
                const mon = battle.eventHandler.getActive(them1.owner);
                expect(weather.type).to.equal("SunnyDay");
                // don't know opponent's item, so source reference is stored
                expect(weather.source).to.equal(mon.item);
                expect(weather.duration).to.equal(5);
                expect(weather.turns).to.equal(0);
            });

            it("Should upkeep weather", async function()
            {
                const mon = battle.eventHandler.getActive(us1.owner);
                weather.start(mon, "Hail");
                expect(weather.turns).to.equal(0);
                await battle.progress(
                {
                    events:
                    [
                        {type: "-weather", weatherType: "Hail", upkeep: true}
                    ]
                });
                expect(weather.turns).to.equal(1);
            });
        });

        describe("tie/win", function()
        {
            it("Should not choose action after winning", async function()
            {
                await battle.progress(
                    {events: [{type: "win", winner: testArgs.username[0]}]});
                expect(responses).to.be.empty;
            });

            it("Should not choose action after losing", async function()
            {
                await battle.progress(
                    {events: [{type: "win", winner: testArgs.username[1]}]});
                expect(responses).to.be.empty;
            });

            it("Should not choose action after tie", async function()
            {
                await battle.progress(
                    {events: [{type: "tie"}]});
                expect(responses).to.be.empty;
            });
        });

        describe("suffixes", function()
        {
            it("Should reject suffix with no associated PokemonID",
            async function()
            {
                let thrown = false;
                try
                {
                    await battle.progress(
                        {events: [{type: "tie", fatigue: true}]});
                }
                catch (e) { thrown = true; }
                expect(thrown).to.be.true;
            });

            describe("from ability", function()
            {
                it("Should reveal ability", async function()
                {
                    const mon = battle.state.teams.them.switchIn("Arcanine",
                        100, "M", 1000, 1000)!;
                    const them2: PokemonID =
                        {owner: "p2", position: "a", nickname: "Arcanine"};

                    expect(mon.ability).to.be.empty;
                    await battle.progress(
                    {
                        events:
                        [
                            {
                                type: "-boost", id: us1, stat: "atk",
                                amount: -1,
                                from: {type: "ability", ability: "Intimidate"},
                                of: them2
                            }
                        ]
                    });
                    expect(mon.ability).to.equal("intimidate");
                });

                it("Should handle Trace correctly", async function()
                {
                    // reset team so we can switchin something else and fully
                    //  validate ability reavealing mechanics
                    battle.state.teams.us.size = 1;
                    const mon1 = battle.state.teams.us.switchIn("Gardevoir",
                        100, "F", 100, 100)!;
                    const mon2 = battle.state.teams.them.active;

                    expect(mon1.ability).to.be.empty;
                    expect(mon2.ability).to.be.empty;
                    await battle.progress(
                    {
                        events:
                        [
                            {
                                type: "-ability", ability: "Swift Swim",
                                id:
                                {
                                    owner: "p1", position: "a",
                                    nickname: "Gardevoir"
                                },
                                from: {type: "ability", ability: "Trace"},
                                of: them1
                            }
                        ]
                    });
                    expect(mon1.ability).to.equal("swiftswim");
                    expect(mon1.volatile.overrideAbility)
                        .to.equal("swiftswim");
                    expect(mon1.baseAbility.definiteValue).to.not.be.null;
                    expect(mon1.baseAbility.definiteValue!.name)
                        .to.equal("trace");
                    expect(mon2.ability).to.equal("swiftswim");
                });
            });

            describe("from item", function()
            {
                it("Should reveal item", async function()
                {
                    // reset team and introduce a pokemon with an unknown item
                    battle.state.teams.us.size = 1;
                    const mon = battle.state.teams.us.switchIn("Pikachu", 100,
                        "M", 90, 100)!;
                    expect(mon).to.not.be.null;
                    expect(mon.item.definiteValue).to.be.null;

                    await battle.progress(
                    {
                        events:
                        [
                            {
                                type: "-damage", id: us1,
                                status: {hp: 100, hpMax: 100, condition: null},
                                from: {type: "item", item: "Leftovers"}
                            }
                        ]
                    });
                    expect(mon.item.definiteValue).to.not.be.null;
                    expect(mon.item.definiteValue!.name).to.equal("leftovers");
                });
            });

            describe("fatigue", function()
            {
                it("Should end lockedmove status", async function()
                {
                    battle.state.teams.us.active.volatile.lockedMove
                        .start("thrash");
                    await battle.progress(
                    {
                        events:
                        [
                            {
                                type: "-start", id: us1, volatile: "confusion",
                                otherArgs: [], fatigue: true
                            }
                        ]
                    });
                    expect(battle.state.teams.us.active.volatile.lockedMove
                        .isActive).to.be.false;
                });
            });
        });
    });
});
