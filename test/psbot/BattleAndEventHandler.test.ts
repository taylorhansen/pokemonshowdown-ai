import { expect } from "chai";
import "mocha";
import { Choice } from "../../src/battle/agent/Choice";
import { types, WeatherType } from "../../src/battle/dex/dex-util";
import { ItemTempStatus } from "../../src/battle/state/ItemTempStatus";
import { Pokemon } from "../../src/battle/state/Pokemon";
import { PossibilityClass } from "../../src/battle/state/PossibilityClass";
import { RoomStatus } from "../../src/battle/state/RoomStatus";
import { TempStatus } from "../../src/battle/state/TempStatus";
import { VolatileStatus } from "../../src/battle/state/VolatileStatus";
import { AnyBattleEvent, EndItemEvent, ItemEvent, MoveEvent } from
    "../../src/psbot/dispatcher/BattleEvent";
import { BattleInitMessage, RequestMessage } from
    "../../src/psbot/dispatcher/Message";
import { PokemonDetails, PokemonID, PokemonStatus } from
    "../../src/psbot/helpers";
import * as testArgs from "../helpers/battleTestArgs";
import { MockPSBattle } from "./MockPSBattle";
import { Side, otherSide } from "../../src/battle/state/Side";
import { Moveset } from "../../src/battle/state/Moveset";

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
                p => !!p && p.species === details.species)!;

            expect(mon).to.exist;
            expect(mon.species).to.equal(details.species);
            expect(mon.traits.stats.level).to.equal(details.level);
            expect(mon.hp.current).to.equal(status.hp);
            expect(mon.hp.max).to.equal(status.hpMax);
            // TODO: handle case where there's no item? (have to change typings)
            expect(mon.item.definiteValue).to.not.be.null;
            expect(mon.item.definiteValue!.name).to.equal(data.item);
            expect(mon.traits.hasAbility).to.be.true;
            expect(mon.traits.ability.definiteValue).to.not.be.null;
            expect(mon.traits.ability.definiteValue!.name)
                .to.equal(data.baseAbility);
            expect(mon.majorStatus.current).to.equal(status.condition);
            // explicit SwitchEvents are better at handling this
            // expect(mon.active).to.equal(data.active);

            for (let moveId of data.moves)
            {
                if (moveId.startsWith("hiddenpower"))
                {
                    const hpType = moveId.substr("hiddenpower".length)
                            .replace(/\d+/, "");
                    Object.keys(types).forEach(type =>
                        expect(mon.hpType.isSet(type))
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
                // explicit events are better at telling who's active, so
                //  request msgs aren't required to tell that
                battle.state.teams.us.active.switchInto();
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
                            stats:
                            {
                                atk: 256, def: 216, spa: 344, spd: 216, spe: 296
                            },
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
                            condition: {hp: 201, hpMax: 201, condition: null},
                            active: true,
                            stats:
                            {
                                atk: 116, def: 176, spa: 176, spd: 86, spe: 156
                            },
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
                            condition: {hp: 331, hpMax: 331, condition: null},
                            active: false,
                            stats:
                            {
                                atk: 286, def: 194, spa: 156, spd: 236, spe: 198
                            },
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
            battle.state.teams.us.active.switchInto();
            // setup opposing team
            expect(battle.state.teams.them.switchIn(
                    "Seaking", 100, "M", 100, 100)).to.not.be.null;
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
                expect(trapper.traits.ability.definiteValue).to.not.be.null;
                expect(trapper.traits.ability.definiteValue!.name)
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
                                species: us2Mon.species, gender: us2Mon.gender!,
                                level: us2Mon.traits.stats.level!, shiny: false
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

        describe("endability", function()
        {
            it("Should infer ability and set Gastro Acid", async function()
            {
                const mon = battle.state.teams.them.active;
                expect(mon.ability).to.equal("");
                await battle.progress(
                {
                    events:
                    [
                        {type: "-endability", id: them1, ability: "Swift Swim"}
                    ]
                });
                expect(mon.ability).to.equal("swiftswim");
                expect(mon.volatile.gastroAcid).to.be.true;
            });
        });

        describe("activate/end/start", function()
        {
            interface EventTypeBase
            {
                /** Optional BattleEvents to run just before this event. */
                preEvents?: AnyBattleEvent[];
                /** Type of event to execute. */
                type: "-start" | "-activate" | "-end";
                /**
                 * Postcondition for the VolatileStatus or its parent Pokemon.
                 */
                post: (v: VolatileStatus, p: Pokemon) => void;
            }

            interface EventTypeEnd extends EventTypeBase
            {
                type: "-end";
            }

            interface EventTypeOther extends EventTypeBase
            {
                type: "-activate" | "-start";
                otherArgs: string[];
            }

            /** Used in below `test()` function. */
            type EventType = EventTypeEnd | EventTypeOther;

            /**
             * Creates a test case for a VolatileStatus field related to
             * -start/-activate/-end events.
             * @param display Display name of the status.
             * @param status Name of the status as it appears in the event.
             * @param pre Precondition/setup for the VolatileStatus and/or its
             * parent Pokemon. Uses the `us` Side.
             * @param eventTypes List of event types that will be executed in
             * order with their respective postconditions.
             */
            function test(display: string, status: string,
                pre: (v: VolatileStatus, p: Pokemon) => void,
                eventTypes: EventType[]): void
            {
                const s = eventTypes.map(eventType => eventType.type.substr(1))
                    .join("/");

                it(`Should ${s} ${display}`, async function()
                {
                    const mon = battle.state.teams.us.active;
                    pre(mon.volatile, mon);

                    for (const eventType of eventTypes)
                    {
                        let event: AnyBattleEvent;
                        if (eventType.type === "-end")
                        {
                            event = {type: "-end", id: us1, volatile: status};
                        }
                        else
                        {
                            event =
                            {
                                type: eventType.type, id: us1, volatile: status,
                                otherArgs: eventType.otherArgs
                            };
                        }

                        const preEvents = eventType.preEvents || [];
                        await battle.progress({events: [...preEvents, event]});
                        eventType.post(mon.volatile, mon);
                    }
                });
            }

            test("Charge", "move: Charge",
                v => expect(v.charge.isActive).to.be.false,
            [
                {
                    type: "-activate",
                    otherArgs: [],
                    post: v => expect(v.charge.isActive).to.be.true
                }
            ]);

            test("confusion", "confusion",
                v => expect(v.confusion.isActive).to.be.false,
            [
                {
                    type: "-start",
                    otherArgs: [],
                    post(v)
                    {
                        expect(v.confusion.isActive).to.be.true;
                        expect(v.confusion.turns).to.equal(1);
                    }
                },
                {
                    type: "-activate",
                    otherArgs: [],
                    post(v)
                    {
                        expect(v.confusion.isActive).to.be.true;
                        // turns incremented explicitly, not during post-turn
                        expect(v.confusion.turns).to.equal(2);
                    }
                },
                {
                    type: "-end",
                    post(v)
                    {
                        expect(v.confusion.isActive).to.be.false;
                        expect(v.confusion.turns).to.equal(0);
                    }
                }
            ]);

            test("Mimic", "move: Mimic", (_, p) =>
            {
                p.moveset.reveal("mimic");
                expect(p.moveset.get("mimic")).to.not.be.null;
                expect(p.moveset.get("tackle")).to.be.null;
            },
            [
                {
                    preEvents:
                    [
                        {
                            type: "move", id: us1, moveName: "Mimic",
                            targetId: them1
                        }
                    ],
                    type: "-activate",
                    otherArgs: ["Tackle"],
                    post(_, p)
                    {
                        expect(p.moveset.get("mimic")).to.be.null;
                        expect(p.moveset.get("tackle")).to.not.be.null;
                        expect(p.moveset.get("tackle")!.pp).to.equal(5);
                    }
                }
            ]);

            test("Sketch", "move: Mimic", (_, p) =>
            {
                p.moveset.reveal("sketch");
                expect(p.moveset.get("sketch")).to.not.be.null;
                expect(p.moveset.get("tackle")).to.be.null;
            },
            [
                {
                    preEvents:
                    [
                        {
                            type: "move", id: us1, moveName: "Sketch",
                            targetId: them1
                        }
                    ],
                    type: "-activate",
                    otherArgs: ["Tackle"],
                    post(_, p)
                    {
                        expect(p.moveset.get("sketch")).to.be.null;
                        expect(p.moveset.get("tackle")).to.not.be.null;
                        expect(p.moveset.get("tackle")!.pp).to.equal(35);
                    }
                }
            ]);

            test("trapped", "trapped", v =>
            {
                const v2 = battle.state.teams.them.active.volatile;
                expect(v.trapped).to.be.null;
                expect(v.trapping).to.be.null;
                expect(v2.trapped).to.be.null;
                expect(v2.trapping).to.be.null;
            },
            [
                {
                    type: "-activate",
                    otherArgs: ["trapped"],
                    post(v)
                    {
                        const v2 = battle.state.teams.them.active.volatile;
                        expect(v.trapped).to.equal(v2);
                        expect(v.trapping).to.be.null;
                        expect(v2.trapped).to.be.null;
                        expect(v2.trapping).to.equal(v);
                    }
                }
            ]);

            test("Uproar", "Uproar", v => expect(v.uproar.isActive).to.be.false,
            [
                {
                    type: "-start",
                    otherArgs: [],
                    post: v => expect(v.uproar.isActive).to.be.true
                },
                {
                    type: "-start",
                    otherArgs: ["[upkeep]"],
                    post(v)
                    {
                        expect(v.uproar.isActive).to.be.true;
                        expect(v.uproar.turns).to.equal(2);
                    }
                },
                {
                    type: "-end",
                    post: v => expect(v.uproar.isActive).to.be.false
                }
            ]);

            /**
             * Tests a start/end event combo concerning a VolatileStatus field.
             * @param display Display name of the event.
             * @param status Name of the status as it appears in the event.
             * @param get Getter for the corresponding VolatileStatus field.
             * Should return a boolean, which will be tested for true or false
             * depending on whether a -start or -end message is tested.
             * @param eventTypes Order of events to execute. Default -start then
             * -end.
             */
            function testBoolean(display: string, status: string,
                get: (v: VolatileStatus) => boolean,
                eventTypes: ("-start" | "-end")[] = ["-start", "-end"]): void
            {
                test(display, status, v => expect(get(v)).to.be.false,
                    eventTypes.map(type =>
                    ({
                        type,
                        otherArgs: [],
                        post: v => expect(get(v))
                            .to.be[type === "-start" ? "true" : "false"]
                    })));
            }

            testBoolean("Aqua Ring", "Aqua Ring", v => v.aquaRing, ["-start"]);
            testBoolean("Attract", "Attract", v => v.attracted);
            testBoolean("Bide", "Bide", v => v.bide.isActive);
            testBoolean("Embargo", "Embargo", v => v.embargo.isActive);
            testBoolean("Encore", "Encore", v => v.encore.isActive);
            testBoolean("Focus Energy", "move: Focus Energy",
                v => v.focusEnergy, ["-start"]);
            testBoolean("Foresight", "Foresight",
                v => v.identified === "foresight", ["-start"]);
            testBoolean("Ingrain", "Ingrain", v => v.ingrain, ["-start"]);
            testBoolean("Leech Seed", "move: Leech Seed",
                v => v.leechSeed, ["-start"]);
            testBoolean("Magnet Rise", "Magnet Rise",
                v => v.magnetRise.isActive);
            testBoolean("Miracle Eye", "Miracle Eye",
                v => v.identified === "miracleeye", ["-start"]);
            testBoolean("Substitute", "Substitute", v => v.substitute);
            testBoolean("Slow Start", "Slow Start", v => v.slowStart.isActive);
            testBoolean("Taunt", "move: Taunt", v => v.taunt.isActive);
            testBoolean("Torment", "Torment", v => v.torment, ["-start"]);

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

            describe("typeadd", function()
            {
                it("Should set third type", async function()
                {
                    const mon = battle.state.teams.us.active;
                    const volatile = mon.volatile;
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
                    mon.traits.types = ["flying", "water"];
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
                    expect(mon.traits.types).to.have.members(
                        ["fire", "???"]);
                    expect(volatile.addedType).to.equal("???");
                    expect(mon.types).to.have.members(["fire"]);
                });

                it("Should set types 1 and 2 and reset type 3", async function()
                {
                    const mon = battle.state.teams.us.active;
                    const volatile = mon.volatile;
                    mon.traits.types = ["flying", "water"];
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
                    expect(mon.traits.types).to.have.members(
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
                    expect(mon.traits.types).to.have.members(
                        ["rock", "dragon"]);
                    expect(volatile.addedType).to.equal("???");
                    expect(mon.types).to.have.members(["rock", "dragon"]);
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
                    expect(mon.traits.types).to.have.members(
                        ["???", "???"]);
                    expect(volatile.addedType).to.equal("???");
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

                await battle.progress(
                {
                    events: [{type: "cant", id: them1, reason: "ability: Damp"}]
                });
                expect(mon.ability).to.equal("damp");
            });

            it("Should properly handle Truant ability", async function()
            {
                const mon = battle.state.teams.us.active;
                mon.traits.setAbility("truant");
                mon.volatile.mustRecharge = true;
                expect(mon.volatile.willTruant).to.be.false;

                // completed a turn without truant activating
                await battle.progress({events: [{type: "turn", num: 3}]});
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
                mon.traits.setAbility("earlybird");
                mon.majorStatus.afflict("slp");

                await battle.progress(
                    {events: [{type: "cant", id: us1, reason: "slp"}]});

                expect(mon.majorStatus.turns).to.equal(3);
            });

            it("Should reset single-move statuses", async function()
            {
                const mon = battle.state.teams.us.active;
                mon.volatile.destinyBond = true;

                await battle.progress(
                    {events: [{type: "cant", id: us1, reason: "par"}]});

                expect(mon.volatile.destinyBond).to.be.false;
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
                            from: "psn"
                        }
                    ]
                });
                expect(mon.majorStatus.turns).to.equal(2);
            });
        });

        describe("detailschange", function()
        {
            it("Should change base and override traits", async function()
            {
                const active = battle.state.teams.us.active;
                expect(active.species).to.equal("Horsea");

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
                expect(active.species).to.equal("Kingdra");
                expect(active.baseTraits.species)
                    .to.equal(active.volatile.overrideTraits.species);
                expect(active.baseTraits.species.definiteValue).to.not.be.null;
                expect(active.baseTraits.species.definiteValue!.name)
                    .to.equal("Kingdra");
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

        describe("fieldend/fieldstart", function()
        {
            function testTempStatus(name: string,
                fn: (rs: RoomStatus) => TempStatus): void
            {
                it(`Should start/end ${name}`, async function()
                {
                    const ts = fn(battle.state.status);
                    expect(ts.isActive).to.be.false;

                    await battle.progress(
                        {events: [{type: "-fieldstart", effect: name}]});
                    expect(ts.isActive).to.be.true;
                    expect(ts.turns).to.equal(1);

                    await battle.progress({events: [{type: "turn", num: 3}]});
                    expect(ts.turns).to.equal(2);

                    await battle.progress(
                        {events: [{type: "-fieldend", effect: name}]});
                    expect(ts.isActive).to.be.false;
                });
            }

            testTempStatus("move: Gravity", rs => rs.gravity);
            testTempStatus("move: Trick Room", rs => rs.trickRoom);
        });

        describe("formechange", function()
        {
            it("Should temporarily change form", async function()
            {
                const active = battle.state.teams.us.active;
                expect(active.species).to.equal("Horsea");
                expect(active.traits.species.definiteValue).to.not.be.null;
                expect(active.traits.species.definiteValue!.name)
                    .to.equal("Horsea");

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
                expect(active.species).to.equal("Kingdra");
                expect(active.traits.species.definiteValue).to.not.be.null;
                expect(active.traits.species.definiteValue!.name)
                    .to.equal("Kingdra");
                // base traits shouldn't be changed
                expect(active.baseTraits.species.definiteValue).to.not.be.null;
                expect(active.baseTraits.species.definiteValue!.name)
                    .to.equal("Horsea");
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
                        if (move) ev = {...ev, from: `move: ${move}`};

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
                                event = {...event, from: "stealeat"};
                            }
                            else if (suffix && suffix.move)
                            {
                                event =
                                    {...event, from: `move: ${suffix.move}`};
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
                    test("Should not set lastItem if eaten by opponent", false,
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
                                    from: "move: Covet"
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
                {
                    type: "-activate", id: them1, volatile: "move: Protect",
                    otherArgs: []
                });
                shouldCancelLockedMove("immune", {type: "-immune", id: us1});
                shouldCancelLockedMove("missed",
                    {type: "-miss", id: us1, targetId: them1}, /*miss*/true);
                shouldCancelLockedMove("failed", {type: "-fail", id: us1});
            });

            describe("called", function()
            {
                /**
                 * Tests the effects of a move caller.
                 * @param move Internal name of the move caller.
                 * @param display Display name of the move caller.
                 * @param reveal If provided, the called move should be revealed
                 * as the given Side's active pokemon's moveset.
                 */
                function testCalledMove(move: string, display: string,
                    reveal?: Side)
                {
                    describe(display, function()
                    {
                        it(`Should${reveal ? "" : " not"} reveal called move` +
                            (reveal ? " but not consume pp" : ""),
                        async function()
                        {
                            const moves: {[S in Side]: Moveset} =
                            {
                                us: battle.state.teams.us.active.moveset,
                                them: battle.state.teams.them.active.moveset
                            };

                            if (reveal)
                            {
                                expect(moves[reveal].get("splash")).to.be.null;
                            }

                            await battle.progress(
                            {
                                events:
                                [
                                    // emit the calling move
                                    {type: "move", id: us1, moveName: display},
                                    // splash is called by the above move
                                    {
                                        type: "move", id: us1,
                                        moveName: "Splash", from: display
                                    }
                                ]
                            });

                            if (reveal)
                            {
                                const m = moves[reveal].get("splash");
                                expect(m).to.not.be.null;
                                // called move should not have pp consumed
                                expect(m!.pp).to.equal(m!.maxpp);

                                // the other side shouldn't get the called move
                                expect(moves[otherSide(reveal)].get("splash"))
                                    .to.be.null;
                            }
                            else
                            {
                                // both sides shouldn't get the called move
                                expect(moves.us.get("splash")).to.be.null;
                                expect(moves.them.get("splash")).to.be.null;
                            }
                        });
                    });
                }

                testCalledMove("metronome", "Metronome");
                testCalledMove("sleeptalk", "Sleep Talk", "us");
                testCalledMove("mefirst", "Me First", "them");
            });

            describe("lockedmove", function()
            {
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
                                targetId: us1, from: "lockedmove"
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
                            targetId: them1, from: "lockedmove"
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

                // after starting to prepare a two-turn move, the user becomes
                //  trapped and locked into using the move
                const request1: RequestMessage =
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
                    side: battle.lastRequest!.side
                };
                await battle.request(request1);
                // start preparing the two-turn move
                await battle.progress(
                {
                    events:
                    [
                        {
                            type: "move", id: us1, moveName: "Solar Beam",
                            targetId: them1
                            // note: server also sends |[still] term at eol,
                            //  which supresses animation and is technically
                            //  supposed to hide targetId (applies in doubles)
                        },
                        {
                            type: "-prepare", id: us1, moveName: "Solar Beam",
                            targetId: them1
                        },
                        {type: "upkeep"}, {type: "turn", num: 2}
                    ]
                });

                expect(mon.volatile.twoTurn.type).to.equal("solarbeam");

                // the use of a two-turn move should restrict the client's
                //  choices to only the move being prepared, which temporarily
                //  takes the spot of the first move
                expect(battle.lastChoices).to.have.members(["move 1"]);
                expect(responses).to.have.lengthOf(1);

                // after being interrupted, the user can now act normally
                const request2 = {...request1};
                request2.active =
                [
                    {
                        moves:
                        [
                            {
                                ...request1.active![0].moves[0], pp: 15,
                                maxpp: 16, target: "normal"
                            },
                            {
                                move: "Splash", id: "splash", disabled: false,
                                pp: 64, maxpp: 64, target: "self"
                            }
                        ],
                        trapped: false
                    }
                ];
                await battle.request(request2);

                // absence of twoturn move indicates that the pokemon was
                //  prevented from completing the move
                await battle.progress({events: [{type: "turn", num: 3}]});

                expect(mon.volatile.twoTurn.isActive).to.be.false;

                // should now be able to choose other choices
                expect(battle.lastChoices).to.have.members(
                    ["move 1", "move 2", "switch 2"]);
                expect(responses).to.have.lengthOf(2);
            });

            // TODO: shorted two-turn move (e.g. solarbeam with sun/powerherb)
        });

        describe("sethp", function()
        {
            it("Should set hp", async function()
            {
                const hp1 = battle.state.teams.us.active.hp;
                await battle.progress(
                {
                    events:
                    [
                        {
                            type: "-sethp", id: us1,
                            status: {hp: 1, hpMax: 10, condition: null}
                        }
                    ]
                });
                expect(hp1.current).to.equal(1);
                expect(hp1.max).to.equal(10);
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

            it("Should start/end Tailwind", async function()
            {
                const ts = battle.state.teams.us.status;
                expect(ts.tailwind.isActive).to.be.false;
                await battle.progress(
                {
                    events:
                    [
                        {type: "-sidestart", id: "p1", condition: "Tailwind"}
                    ]
                });
                expect(ts.tailwind.isActive).to.be.true;

                // go thru 2 turns of the status
                ts.tailwind.tick();
                ts.tailwind.tick();
                expect(ts.tailwind.isActive).to.be.true;

                // the 3rd turn will end the status
                await battle.progress(
                {
                    events:
                    [
                        {type: "-sideend", id: "p1", condition: "Tailwind"}
                    ]
                });
                expect(ts.tailwind.isActive).to.be.false;
            });
        });

        describe("singlemove", function()
        {
            function shouldActivate(move: string, field: keyof VolatileStatus)
            {
                it(`Should activate ${move}`, async function()
                {
                    const volatile = battle.state.teams.us.active.volatile;
                    expect(volatile[field]).to.be.false;

                    await battle.progress(
                        {events: [{type: "-singlemove", id: us1, move}]});
                    expect(volatile[field]).to.be.true;
                });
            }

            shouldActivate("Destiny Bond", "destinyBond");
            shouldActivate("Grudge", "grudge");
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
                            {
                                type: "-activate", id: them1,
                                volatile: "Protect", otherArgs: []
                            }
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
                            {
                                type: "-activate", id: them1,
                                volatile: "Protect", otherArgs: []
                            }
                        ]
                    });
                    expect(battle.state.teams.us.active.volatile.lockedMove
                        .isActive).to.be.false;
                });
            });

            /**
             * Tests a simple singeturn boolean status.
             * @param name Name of the status in the test suite.
             * @param status Display name within the message format.
             * @param getter Getter for the VolatileStatus field in question.
             */
            function testSingleTurn(name: string, status: string,
                getter: (v: VolatileStatus) => boolean)
            {
                describe(name, function()
                {
                    it("Should set in volatile", async function()
                    {
                        const v = battle.state.teams.us.active.volatile;
                        expect(getter(v)).to.be.false;

                        // see if the message causes the status to activate
                        await battle.progress(
                            {events: [{type: "-singleturn", id: us1, status}]});
                        expect(getter(v)).to.be.true;
                    });
                });
            }

            testSingleTurn("roost", "move: Roost", v => v.roost);
            testSingleTurn("magic coat", "move: Magic Coat", v => v.magicCoat);
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
                            upkeep: false, from: "ability: Drizzle", of: us1
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

        describe("transform", function()
        {
            it("Should copy appropriate values", async function()
            {
                const source = battle.state.teams.us.active;
                const target = battle.state.teams.them.active;

                target.volatile.boosts.spd = 1;
                target.moveset.reveal("splash");
                const opposingStats = {atk: 5, def: 5, spa: 5, spd: 5, spe: 5};

                await battle.request(
                {
                    active:
                    [
                        {
                            moves:
                            [
                                {
                                    id: "splash", move: "Splash", pp: 5,
                                    maxpp: 64, disabled: false, target: "self"
                                }
                            ]
                        }
                    ],
                    side:
                    {
                        pokemon:
                        [
                            {
                                ...battle.lastRequest!.side.pokemon[0],
                                stats: opposingStats, moves: ["splash"]
                            }
                        ]
                    }
                });
                await battle.progress(
                {
                    events: [{type: "-transform", source: us1, target: them1}]
                });

                expect(source.volatile.boosts.spd).to.equal(1);
                expect(source.moveset.get("splash")).to.not.be.null;
                expect(source.hpType).to.equal(target.hpType);

                expect(source.volatile.overrideTraits.ability)
                    .to.equal(target.volatile.overrideTraits.ability);
                expect(source.volatile.overrideTraits.data)
                    .to.equal(target.volatile.overrideTraits.data);
                expect(source.volatile.overrideTraits.species)
                    .to.equal(target.volatile.overrideTraits.species);
                expect(source.volatile.overrideTraits.stats)
                    .to.equal(target.volatile.overrideTraits.stats);
                expect(source.volatile.overrideTraits.types)
                    .to.equal(target.volatile.overrideTraits.types);
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
                        {events: [{type: "tie", from: "item: Life Orb"}]});
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
                                amount: -1, from: `ability: Intimidate`,
                                of: them2
                            }
                        ]
                    });
                    expect(mon.ability).to.equal("intimidate");
                });

                it("Should handle Trace ability", async function()
                {
                    // reset team so we can switchin something else and fully
                    //  validate ability reavealing mechanics
                    battle.state.teams.us.size = 1;
                    const mon1 = battle.state.teams.us.switchIn("Gardevoir",
                        100, "F", 300, 300)!;
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
                                from: "ability: Trace", of: them1
                            }
                        ]
                    });
                    // mon1 should have the new traced ability
                    expect(mon1.ability).to.equal("swiftswim");
                    expect(mon1.traits.ability.definiteValue).to.not.be.null;
                    expect(mon1.traits.ability.definiteValue!.name)
                        .to.equal("swiftswim");
                    // base traits for mon1 should not change
                    expect(mon1.baseTraits.ability.definiteValue)
                        .to.not.be.null;
                    expect(mon1.baseTraits.ability.definiteValue!.name)
                        .to.equal("trace");
                    // mon2 should have its current ability inferred
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
                        "M", 90, 200)!;
                    expect(mon).to.not.be.null;
                    expect(mon.item.definiteValue).to.be.null;

                    await battle.progress(
                    {
                        events:
                        [
                            {
                                type: "-damage", id: us1,
                                status: {hp: 100, hpMax: 200, condition: null},
                                from: "item: Leftovers"
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
