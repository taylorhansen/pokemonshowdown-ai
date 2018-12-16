import { expect } from "chai";
import "mocha";
import { AnyMessageListener, BattleInitArgs, RequestArgs } from
    "../../../src/bot/AnyMessageListener";
import { Choice } from "../../../src/bot/battle/Choice";
import { Type } from "../../../src/bot/battle/dex/dex-types";
import { BattleEvent, MoveEvent, PokemonDetails, PokemonID, PokemonStatus,
    SetHPEvent } from "../../../src/bot/messageData";
import * as testArgs from "../../helpers/battleTestArgs";
import { MockBattle } from "./MockBattle";

describe("Battle", function()
{
    /**
     * Adds to the responses array.
     * @param choice Response to add.
     */
    function sender(choice: Choice): void
    {
        responses.push(choice);
    }

    let responses: Choice[];
    let listener: AnyMessageListener;
    let battle: MockBattle;

    beforeEach("Initialize Battle", function()
    {
        responses = [];
        listener = new AnyMessageListener();
        battle = new MockBattle(testArgs.username[0], listener, sender);
    });

    /**
     * Checks the `side` property of a RequestArgs object.
     * @param args Args object.
     */
    function checkRequestSide(args: RequestArgs): void
    {
        const team = battle.state.teams.us;
        expect(team.size).to.equal(args.side.pokemon.length);

        for (const data of args.side.pokemon)
        {
            const details: PokemonDetails = data.details;
            const status: PokemonStatus = data.condition;
            const mon = team.pokemon.find(p => p.species === details.species)!;

            // tslint:disable-next-line:no-unused-expression
            expect(mon).to.exist;
            expect(mon.species).to.equal(details.species);
            expect(mon.level).to.equal(details.level);
            expect(mon.hp.current).to.equal(status.hp);
            expect(mon.hp.max).to.equal(status.hpMax);
            expect(mon.item).to.equal(data.item);
            expect(mon.baseAbility).to.equal(data.baseAbility);
            expect(mon.majorStatus).to.equal(status.condition);
            expect(mon.active).to.equal(data.active);

            for (let moveId of data.moves)
            {
                if (moveId.startsWith("hiddenpower"))
                {
                    const hpType = moveId.substr("hiddenpower".length)
                            .replace(/\d+/, "");
                    (Object.keys(mon.possibleHPTypes) as Type[])
                        .forEach(type => expect(mon.possibleHPTypes[type])
                            .to.be[type === hpType ? "true" : "false"]);
                    moveId = "hiddenpower";
                }

                const move = mon.getMove(moveId)!;
                // tslint:disable-next-line:no-unused-expression
                expect(move).to.not.be.null;
                expect(move.id).to.equal(moveId);
            }
        }
    }

    /**
     * Checks the `active` property of a RequestArgs object.
     * @param args Args object.
     */
    function checkRequestActive(args: RequestArgs): void
    {
        if (!args.active) return;
        for (let i = 0; i < args.active[0].moves.length; ++i)
        {
            // tslint:disable-next-line:no-unused-expression
            expect(battle.state.teams.us.active.volatile.isDisabled(i))
                .to.be.false;
        }
    }

    describe("request", function()
    {
        for (const args of testArgs.request)
        {
            it("Should handle request", function()
            {
                listener.getHandler("request")(args);
                checkRequestSide(args);
                checkRequestActive(args);
            });
        }

        it("Should not handle request a second time", function()
        {
            listener.getHandler("request")(testArgs.request[0]);
            listener.getHandler("request")(testArgs.request[1]);
            checkRequestSide(testArgs.request[0]);
            checkRequestActive(testArgs.request[1]);
        });
    });

    describe("request + battleinit", function()
    {
        function testBattleInit(args: BattleInitArgs): void
        {
            it("Should initialize battle", async function()
            {
                // testArgs: even/0 indexes are p1, odd are p2
                const i = args.id === "p1" ? 0 : 1;
                const req: RequestArgs =
                {
                    side: {pokemon: [testArgs.request[i].side.pokemon[0]]}
                };
                await listener.getHandler("request")(req);
                checkRequestSide(req);
                await listener.getHandler("battleinit")(args);

                // shouldn't modify current team data
                checkRequestSide(req);
                expect(battle.getSide("p1")).to.equal("us");
                expect(battle.getSide("p2")).to.equal("them");
                expect(battle.state.teams.them.size).to.equal(3);

                expect(responses).to.have.lengthOf(1);
            });
        }

        const a: BattleInitArgs =
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
        testBattleInit({...a});

        a.id = "p2";
        a.username = testArgs.username[1];
        testBattleInit(a);
    });

    describe("battleprogress", function()
    {
        // PokemonIDs of the setup teams
        const us1: Readonly<PokemonID> =
            {owner: "p1", position: "a", nickname: "Magikarp"};
        const us2: Readonly<PokemonID> =
            {owner: "p1", position: "a", nickname: "Gyarados"};
        const them1: Readonly<PokemonID> =
            {owner: "p2", position: "a", nickname: "Magikarp"};

        beforeEach("Setup state", async function()
        {
            // an initial request+battleinit is required to start tracking the
            //  state properly
            await listener.getHandler("request")({side: {pokemon: []}});
            await listener.getHandler("battleinit")(
            {
                id: "p1", username: testArgs.username[0], gameType: "singles",
                gen: 4, teamSizes: {p1: 2, p2: 2}, events: []
            });

            // clear invalid response from battleinit handler
            // tslint:disable-next-line:no-unused-expression
            expect(battle.lastChoices).to.be.empty;
            responses = [];

            // setup teams
            const us = battle.state.teams.us;
            us.size = 2;
            // tslint:disable:no-unused-expression
            expect(us.switchIn("Magikarp", 100, "M", 10, 10)).to.not.be.null;
            expect(us.reveal("Gyarados", 100, "M", 1000, 1000)).to.not.be.null;
            const them = battle.state.teams.them;
            them.size = 2;
            expect(them.switchIn("Magikarp", 100, "M", 10, 10)).to.not.be.null;
            // tslint:enable:no-unused-expression
        });

        it("Should not choose action if given empty event", async function()
        {
            await listener.getHandler("battleprogress")({events: []});
            // tslint:disable-next-line:no-unused-expression
            expect(responses).to.be.empty;
        });

        it("Should not choose disabled moves", async function()
        {
            const mon = battle.state.teams.us.active;
            mon.revealMove("splash");
            mon.volatile.disableMove(0, true);
            mon.revealMove("tackle");

            await listener.getHandler("battleprogress")(
                {events: [{type: "upkeep"}, {type: "turn", num: 1}]});

            expect(battle.lastChoices).to.have.members(["move 2", "switch 2"]);
            expect(responses).to.have.lengthOf(1);
        });

        describe("event processing", function()
        {
            it("Should process events", async function()
            {

                // move hasn't been revealed yet
                // tslint:disable-next-line:no-unused-expression
                expect(battle.state.teams.us.active.getMove("splash"))
                    .to.be.null;

                await listener.getHandler("battleprogress")(
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

                const move = battle.state.teams.us.active.getMove("splash");
                // tslint:disable-next-line:no-unused-expression
                expect(move).to.not.be.null;
                expect(move!.pp).to.equal(63);

                expect(battle.lastChoices).to.have.members(
                    ["move 1", "switch 2"]);
                expect(responses).to.have.lengthOf(1);
            });
        });

        describe("switch", function()
        {
            it("Should choose new switch replacement if replacement faints",
            async function()
            {
                const a = battle.state.teams.us.active;
                a.switchOut();
                await listener.getHandler("battleprogress")(
                {
                    events:
                    [
                        // switchin as a replacement (upkeep already sent)
                        {
                            type: "switch", id: us1,
                            details:
                            {
                                species: a.species, gender: a.gender,
                                level: a.level, shiny: false
                            },
                            status:
                            {
                                hp: a.hp.current, hpMax: a.hp.max,
                                condition: a.majorStatus
                            }
                        },
                        // replacement ends up fainting
                        {type: "faint", id: us1}
                    ]
                });
                expect(battle.lastChoices).to.have.members(["switch 2"]);
                expect(responses).to.have.lengthOf(1);
            });
        });

        describe("selfSwitch", function()
        {
            // uturn used by us
            const event: MoveEvent =
                {type: "move", id: us1, moveName: "U-Turn", targetId: them1};

            it("Should process selfSwitch move", async function()
            {
                await listener.getHandler("battleprogress")({events: [event]});
                expect(battle.lastChoices).to.have.members(["switch 2"]);
                expect(responses).to.have.lengthOf(1);
            });

            it("Should selfSwitch if opponent faints", async function()
            {
                await listener.getHandler("battleprogress")(
                {
                    events: [event, {type: "faint", id: event.targetId}]
                });
                expect(battle.lastChoices).to.have.members(["switch 2"]);
                expect(responses).to.have.lengthOf(1);
            });

            it("Should not selfSwitch if prevented from switching",
            async function()
            {
                battle.state.teams.us.pokemon[1].faint();

                // adding an upkeep+turn means that the move was completed, so a
                //  selfSwitch choice should not be needed
                await listener.getHandler("battleprogress")(
                {
                    events: [event, {type: "upkeep"}, {type: "turn", num: 2}]
                });

                expect(battle.lastChoices).to.have.members(["move 1"]);
                expect(responses).to.have.lengthOf(1);
            });

            // uturn used by them
            const event2: MoveEvent =
                {type: "move", id: them1, moveName: "U-Turn", targetId: us1};

            it("Should wait for opponent selfSwitch choice", async function()
            {
                await listener.getHandler("battleprogress")({events: [event2]});
                // tslint:disable-next-line:no-unused-expression
                expect(responses).to.be.empty;
            });

            it("Should wait for opponent selfSwitch if client's pokemon faints",
            async function()
            {
                await listener.getHandler("battleprogress")(
                    {events: [event2, {type: "faint", id: event2.targetId}]});
                expect(responses).to.have.lengthOf(0);
            });

            it("Should switchin if both faint after selfswitch move",
            async function()
            {
                await listener.getHandler("battleprogress")(
                {
                    events:
                    [
                        event2, {type: "faint", id: us1},
                        {type: "faint", id: them1}, {type: "upkeep"}
                    ]
                });
                expect(battle.lastChoices).to.have.members(["switch 2"]);
                expect(responses).to.have.lengthOf(1);
            });
        });

        describe("copyVolatile", function()
        {
            // batonpass used by us
            const event1: MoveEvent =
            {
                type: "move", id: us1, moveName: "Baton Pass", targetId: them1
            };

            it("Should copy volatile", async function()
            {
                const us1Mon = battle.state.teams.us.pokemon[0];
                const us2Mon = battle.state.teams.us.pokemon[1];

                us1Mon.volatile.boost("atk", 2);
                await listener.getHandler("battleprogress")(
                {
                    events:
                    [
                        event1,
                        {
                            type: "switch", id: us2,
                            details:
                            {
                                species: us2Mon.species, gender: us2Mon.gender,
                                level: us2Mon.level, shiny: false
                            },
                            status:
                            {
                                hp: us2Mon.hp.current, hpMax: us2Mon.hp.max,
                                condition: us2Mon.majorStatus
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
                const them1Mon = battle.state.teams.them.pokemon[0];

                them1Mon.volatile.boost("atk", 2);
                await listener.getHandler("battleprogress")(
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
                            status: {hp: 100, hpMax: 100, condition: ""}
                        },
                        {type: "upkeep"}, {type: "turn", num: 2}
                    ]
                });
                const them2Mon = battle.state.teams.them.pokemon[0];
                expect(them1Mon).to.not.equal(them2Mon);
                expect(them2Mon.volatile.boosts.atk).to.equal(2);
            });
        });

        describe("abiliy", function()
        {
            it("Should set ability", async function()
            {
                expect(battle.state.teams.us.active.baseAbility).to.equal("");
                await listener.getHandler("battleprogress")(
                {
                    events: [{type: "ability", id: us1, ability: "Swift Swim"}]
                });
                expect(battle.state.teams.us.active.baseAbility)
                    .to.equal("swiftswim");
            });

            it("Should set opponent ability", async function()
            {
                expect(battle.state.teams.them.active.baseAbility).to.equal("");
                await listener.getHandler("battleprogress")(
                {
                    events:
                    [
                        {type: "ability", id: them1, ability: "Swift Swim"}
                    ]
                });
                expect(battle.state.teams.them.active.baseAbility)
                    .to.equal("swiftswim");
            });
        });

        describe("activate/end/start", function()
        {
            it("Should activate/end/start confusion", async function()
            {
                // tslint:disable:no-unused-expression
                const volatile = battle.state.teams.us.active.volatile;

                expect(volatile.isConfused).to.be.false;
                await listener.getHandler("battleprogress")(
                {
                    events: [{type: "start", id: us1, volatile: "confusion"}]
                });
                expect(volatile.isConfused).to.be.true;
                expect(volatile.confuseTurns).to.equal(1);

                await listener.getHandler("battleprogress")(
                {
                    events: [{type: "activate", id: us1, volatile: "confusion"}]
                });
                expect(volatile.isConfused).to.be.true;
                expect(volatile.confuseTurns).to.equal(2);

                await listener.getHandler("battleprogress")(
                    {events: [{type: "end", id: us1, volatile: "confusion"}]});
                expect(volatile.isConfused).to.be.false;
                expect(volatile.confuseTurns).to.equal(0);
                // tslint:enable:no-unused-expression
            });

            it("Should ignore invalid volatiles", async function()
            {
                const volatile = battle.state.teams.us.active.volatile;

                // tslint:disable-next-line:no-unused-expression
                expect(volatile.isConfused).to.be.false;
                await listener.getHandler("battleprogress")(
                    {events: [{type: "start", id: us1, volatile: ""}]});
                // tslint:disable-next-line:no-unused-expression
                expect(volatile.isConfused).to.be.false;
            });
        });

        describe("boost", function()
        {
            it("Should boost stat", async function()
            {
                const boosts = battle.state.teams.us.active.volatile.boosts;
                expect(boosts.def).to.equal(0);
                await listener.getHandler("battleprogress")(
                {
                    events: [{type: "boost", id: us1, stat: "def", amount: 1}]
                });
                expect(boosts.def).to.equal(1);
                await listener.getHandler("battleprogress")(
                {
                    events: [{type: "boost", id: us1, stat: "def", amount: -3}]
                });
                expect(boosts.def).to.equal(-2);
            });
        });

        describe("cant", function()
        {
            it("Should reveal failed move", async function()
            {
                const mon = battle.state.teams.them.active;
                // tslint:disable-next-line:no-unused-expression
                expect(mon.getMove("thunderwave")).to.be.null;

                await listener.getHandler("battleprogress")(
                {
                    events:
                    [
                        {
                            type: "cant", id: them1, reason: "taunt",
                            moveName: "Thunder Wave"
                        }
                    ]
                });
                // tslint:disable-next-line:no-unused-expression
                expect(mon.getMove("thunderwave")).to.not.be.null;
            });
        });

        describe("curestatus", function()
        {
            it("Should cure status", async function()
            {
                const mon = battle.state.teams.us.active;
                mon.majorStatus = "psn";
                await listener.getHandler("battleprogress")(
                {
                    events: [{type: "curestatus", id: us1, majorStatus: "psn"}]
                });
                expect(mon.majorStatus).to.equal("");
            });
        });

        describe("cureteam", function()
        {
            it("Should cure team", async function()
            {
                const mon1 = battle.state.teams.us.pokemon[0];
                const mon2 = battle.state.teams.us.pokemon[1];
                mon1.majorStatus = "slp";
                mon2.majorStatus = "par";
                await listener.getHandler("battleprogress")(
                    {events: [{type: "cureteam", id: us1}]});
                expect(mon1.majorStatus).to.equal("");
                expect(mon2.majorStatus).to.equal("");
            });
        });

        for (const type of ["damage", "heal"] as ("damage" | "heal")[])
        {
            describe(type, function()
            {
                it("Should set hp", async function()
                {
                    await listener.getHandler("battleprogress")(
                    {
                        events:
                        [
                            {
                                type, id: us1,
                                status: {hp: 1, hpMax: 10, condition: "brn"}
                            }
                        ]
                    });
                    const mon = battle.state.teams.us.active;
                    expect(mon.hp.current).to.equal(1);
                    expect(mon.hp.max).to.equal(10);
                    expect(mon.majorStatus).to.equal("brn");
                });
            });
        }

        describe("faint", function()
        {

            it("Should handle faint", async function()
            {
                // tslint:disable-next-line:no-unused-expression
                expect(battle.state.teams.us.active.fainted).to.be.false;

                await listener.getHandler("battleprogress")(
                    {events: [{type: "faint", id: us1}, {type: "upkeep"}]});

                // tslint:disable-next-line:no-unused-expression
                expect(battle.state.teams.us.active.fainted).to.be.true;

                expect(battle.lastChoices).to.have.members(["switch 2"]);
                expect(responses).to.have.lengthOf(1);
            });

            it("Should wait for opponent replacement", async function()
            {
                // tslint:disable-next-line:no-unused-expression
                expect(battle.state.teams.them.active.fainted).to.be.false;

                await listener.getHandler("battleprogress")(
                    {events: [{type: "faint", id: them1}, {type: "upkeep"}]});

                // tslint:disable-next-line:no-unused-expression
                expect(responses).to.be.empty;
            });
        });

        describe("move", function()
        {
            // sample move event
            const event: MoveEvent =
            {
                type: "move", id: us1, moveName: "Splash", targetId: us1
            };

            it("Should reveal move", async function()
            {
                const mon = battle.state.teams.us.active;
                let move = mon.getMove("splash")!;
                // tslint:disable-next-line:no-unused-expression
                expect(move).to.be.null;

                await listener.getHandler("battleprogress")({events: [event]});

                move = mon.getMove("splash")!;
                // tslint:disable-next-line:no-unused-expression
                expect(move).to.not.be.null;
                expect(move.id).to.equal("splash");
                expect(move.pp).to.equal(63);
            });

            it("Should not reveal Struggle as a move slot", async function()
            {
                const event1 = {...event};
                event1.moveName = "Struggle";

                const mon = battle.state.teams.us.active;
                // tslint:disable-next-line:no-unused-expression
                expect(mon.getMove(event1.moveName)).to.be.null;

                await listener.getHandler("battleprogress")({events: [event1]});

                // tslint:disable-next-line:no-unused-expression
                expect(mon.getMove(event1.moveName)).to.be.null;
            });

            describe("lockedmove", function()
            {
                it("Should activate lockedmove status and restrict choices",
                async function()
                {
                    // tslint:disable-next-line:no-unused-expression
                    expect(battle.state.teams.us.active.volatile.lockedMove)
                        .to.be.false;
                    // certain moves cause the lockedmove status
                    await listener.getHandler("battleprogress")(
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
                    // tslint:disable-next-line:no-unused-expression
                    expect(battle.state.teams.us.active.volatile.lockedMove)
                        .to.be.true;
                    expect(battle.lastChoices).to.have.members(["move 1"]);
                    expect(responses).to.have.lengthOf(1);
                });

                it("Should not consume pp", async function()
                {
                    let move = battle.state.teams.us.active.getMove("splash");
                    // tslint:disable-next-line:no-unused-expression
                    expect(move).to.be.null;

                    await listener.getHandler("battleprogress")(
                    {
                        events:
                        [
                            {
                                type: "move", id: us1, moveName: "Splash",
                                targetId: us1, cause: {type: "lockedmove"}
                            }
                        ]
                    });

                    move = battle.state.teams.us.active.getMove("splash")!;
                    // tslint:disable-next-line:no-unused-expression
                    expect(move).to.not.be.null;
                    expect(move.pp).to.equal(64);
                });
            });

            describe("pressure", function()
            {
                // id of the pokemon that has the pressure ability
                const them2: PokemonID =
                    {owner: "p2", position: "a", nickname: "Zapdos"};

                beforeEach("Switchin a Pressure pokemon", function()
                {
                    battle.state.teams.them.switchIn("Zapdos", 100, "", 100,
                            100)!.baseAbility = "Pressure";
                });

                beforeEach("Reveal an attacking move", function()
                {
                    const move = battle.state.teams.us.active.revealMove(
                        "tackle");
                    expect(move.pp).to.equal(56);
                });

                it("Should use double pp if targeted", async function()
                {
                    await listener.getHandler("battleprogress")(
                    {
                        events:
                        [
                            {
                                type: "move", id: us1, moveName: "Tackle",
                                targetId: them2
                            }
                        ]
                    });
                    const move = battle.state.teams.us.active.getMove(
                        "tackle")!;
                    // tslint:disable-next-line:no-unused-expression
                    expect(move).to.not.be.null;
                    expect(move.pp).to.equal(54);
                });

                it("Should not use double pp not if targeted", async function()
                {
                    await listener.getHandler("battleprogress")(
                    {
                        events:
                        [
                            {
                                type: "move", id: us1, moveName: "Tackle",
                                targetId: us1
                            }
                        ]
                    });
                    const move = battle.state.teams.us.active.getMove(
                        "tackle")!;
                    // tslint:disable-next-line:no-unused-expression
                    expect(move).to.not.be.null;
                    expect(move.pp).to.equal(55);
                });
            });
        });

        describe("mustrecharge", function()
        {
            it("Should recharge after recharge move", async function()
            {
                await listener.getHandler("battleprogress")(
                {
                    events:
                    [
                        {
                            type: "move", id: us1, moveName: "Hyper Beam",
                            targetId: them1
                        },
                        {type: "upkeep"}, {type: "turn", num: 4},
                        {type: "mustrecharge", id: us1}
                    ]
                });
                expect(battle.lastChoices).to.have.members(["move 1"]);
                expect(responses).to.have.lengthOf(1);

                await listener.getHandler("battleprogress")(
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
                battle.state.teams.us.active.revealMove("splash");
                await listener.getHandler("battleprogress")(
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
                            type: "prepare", id: us1, moveName: "Solar Beam",
                            targetId: them1
                        },
                        {type: "upkeep"}, {type: "turn", num: 10}
                    ]
                });
                // the use of a two-turn move should restrict the client's
                //  choices to only the move being prepared, which temporarily
                //  takes the spot of the first move
                expect(battle.lastChoices).to.have.members(["move 1"]);
                expect(responses).to.have.lengthOf(1);

                // release the charged move
                await listener.getHandler("battleprogress")(
                {
                    events:
                    [
                        {
                            type: "move", id: us1, moveName: "Solar Beam",
                            targetId: them1, cause: {type: "lockedmove"}
                        },
                        {type: "upkeep"}, {type: "turn", num: 11}
                    ]
                });
                // should now be able to choose other choices
                expect(battle.lastChoices).to.have.members(
                    ["move 1", "move 2", "switch 2"]);
                expect(responses).to.have.lengthOf(2);
            });

            // TODO: interrupted two-turn moves
        });

        describe("sethp", function()
        {
            it("Should set hp", async function()
            {
                const hp1 = battle.state.teams.us.active.hp;
                const hp2 = battle.state.teams.them.active.hp;
                const event: SetHPEvent =
                {
                    type: "sethp",
                    newHPs:
                    [
                        {id: us1, status: {hp: 1, hpMax: 10, condition: ""}},
                        {id: them1, status: {hp: 2, hpMax: 20, condition: ""}}
                    ]
                };
                await listener.getHandler("battleprogress")({events: [event]});
                expect(hp1.current).to.equal(1);
                expect(hp1.max).to.equal(10);
                expect(hp2.current).to.equal(2);
                expect(hp2.max).to.equal(20);
            });
        });

        describe("singleturn", function()
        {
            describe("stall", function()
            {
                it("Should increment/reset stallTurns", async function()
                {
                    const volatile = battle.state.teams.us.active.volatile;
                    expect(volatile.stallTurns).to.equal(0);

                    await listener.getHandler("battleprogress")(
                    {
                        events:
                        [
                            {type: "singleturn", id: us1, status: "Protect"}
                        ]
                    });
                    expect(volatile.stallTurns).to.equal(1);

                    // uses protect again
                    await listener.getHandler("battleprogress")(
                    {
                        events:
                        [
                            {type: "singleturn", id: us1, status: "Protect"}
                        ]
                    });
                    expect(volatile.stallTurns).to.equal(2);

                    // tries to use protect again but fails
                    await listener.getHandler("battleprogress")({events: []});
                    expect(volatile.stallTurns).to.equal(0);
                });

                it("Should stop locked moves on the first move",
                async function()
                {
                    await listener.getHandler("battleprogress")(
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
                            {type: "activate", id: them1, volatile: "Protect"}
                        ]
                    });
                    // tslint:disable-next-line:no-unused-expression
                    expect(battle.state.teams.us.active.volatile.lockedMove)
                        .to.be.false;
                });

                it("Should interrupt locked moves", async function()
                {
                    await listener.getHandler("battleprogress")(
                    {
                        events:
                        [
                            {
                                type: "move", id: us1, moveName: "Outrage",
                                targetId: them1
                            }
                        ]
                    });
                    // tslint:disable-next-line:no-unused-expression
                    expect(battle.state.teams.us.active.volatile.lockedMove)
                        .to.be.true;

                    await listener.getHandler("battleprogress")(
                    {
                        events:
                        [
                            {
                                type: "move", id: us1, moveName: "Outrage",
                                targetId: them1
                            },
                            {type: "activate", id: them1, volatile: "Protect"}
                        ]
                    });
                    // tslint:disable-next-line:no-unused-expression
                    expect(battle.state.teams.us.active.volatile.lockedMove)
                        .to.be.false;
                });
            });
        });

        describe("status", function()
        {
            it("Should afflict with status", async function()
            {
                const mon = battle.state.teams.us.active;
                expect(mon.majorStatus).to.equal("");
                await listener.getHandler("battleprogress")(
                    {events: [{type: "status", id: us1, majorStatus: "frz"}]});
                expect(mon.majorStatus).to.equal("frz");
            });
        });

        describe("tie/win", function()
        {
            it("Should not choose action after winning", async function()
            {
                await listener.getHandler("battleprogress")(
                    {events: [{type: "win", winner: testArgs.username[0]}]});
                // tslint:disable-next-line:no-unused-expression
                expect(responses).to.be.empty;
            });

            it("Should not choose action after losing", async function()
            {
                await listener.getHandler("battleprogress")(
                    {events: [{type: "win", winner: testArgs.username[1]}]});
                // tslint:disable-next-line:no-unused-expression
                expect(responses).to.be.empty;
            });

            it("Should not choose action after tie", async function()
            {
                await listener.getHandler("battleprogress")(
                    {events: [{type: "tie"}]});
                // tslint:disable-next-line:no-unused-expression
                expect(responses).to.be.empty;
            });

            for (const value of [true, false])
            {
                describe(`saveAlways = ${value}`, function()
                {
                    beforeEach("Set saveAlways", function()
                    {
                        battle.saveAlways = value;
                        expect(battle.saved).to.equal(false);
                    });

                    it("Should save after win", async function()
                    {
                        await listener.getHandler("battleprogress")(
                        {
                            events:
                            [
                                {type: "win", winner: testArgs.username[0]}
                            ]
                        });
                        expect(battle.saved).to.equal(true);
                    });

                    it(`Should ${value ? "" : "not "}save after loss`,
                    async function()
                    {
                        await listener.getHandler("battleprogress")(
                        {
                            events:
                            [
                                {type: "win", winner: testArgs.username[1]}
                            ]
                        });
                        expect(battle.saved).to.equal(value);
                    });

                    it(`Should ${value ? "" : "not "}save after tie`,
                    async function()
                    {
                        await listener.getHandler("battleprogress")(
                            {events: [{type: "tie"}]});
                        expect(battle.saved).to.equal(value);
                    });
                });
            }
        });

        describe("cause", function()
        {
            function shouldntHandle(event: BattleEvent): void
            {
                // sample event cause
                event.cause = {type: "fatigue"};

                it(`Shouldn't handle Causes from ${event.type} messages`,
                async function()
                {
                    battle.state.teams.us.active.volatile.lockedMove = true;
                    await listener.getHandler("battleprogress")(
                        {events: [event]});
                    // tslint:disable-next-line:no-unused-expression
                    expect(battle.state.teams.us.active.volatile.lockedMove)
                        .to.be.true;
                });
            }
            shouldntHandle({type: "sethp", newHPs: []});
            shouldntHandle({type: "tie"});
            shouldntHandle({type: "win", winner: testArgs.username[0]});

            describe("fatigue", function()
            {
                it("Should end lockedmove status", async function()
                {
                    battle.state.teams.us.active.volatile.lockedMove = true;
                    await listener.getHandler("battleprogress")(
                    {
                        events:
                        [
                            {
                                type: "start", id: us1, volatile: "confusion",
                                cause: {type: "fatigue"}
                            }
                        ]
                    });
                    // tslint:disable-next-line:no-unused-expression
                    expect(battle.state.teams.us.active.volatile.lockedMove)
                        .to.be.false;
                });
            });

            describe("item", function()
            {
                it("Should reveal item", async function()
                {
                    await listener.getHandler("battleprogress")(
                    {
                        events:
                        [
                            {
                                type: "heal", id: us1,
                                status: {hp: 10, hpMax: 10, condition: ""},
                                cause: {type: "item", item: "Leftovers"}
                            }
                        ]
                    });
                    expect(battle.state.teams.us.active.item)
                        .to.equal("leftovers");
                });
            });
        });
    });
});
