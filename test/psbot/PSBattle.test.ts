import { expect } from "chai";
import "mocha";
import { BattleAgent } from "../../src/battle/agent/BattleAgent";
import { Logger } from "../../src/Logger";
import { RequestMessage } from "../../src/psbot/parser/Message";
import { PSBattle } from "../../src/psbot/PSBattle";
import { Sender } from "../../src/psbot/PSBot";

describe("PSBattle", function()
{
    const username = "username";

    const sender: Sender = function(msg)
    {
        sent.push(msg);
    };
    let sent: string[];

    // wrap battle agent so reassigning the agent variable will change the
    //  underlying agent
    const agentWrapper: BattleAgent = (state, choices) => agent(state, choices);
    let agent: BattleAgent;
    let battle: PSBattle;

    beforeEach("Initialize PSBattle", function()
    {
        sent = [];
        agent = async function() {};
        battle = new PSBattle(username, agentWrapper, sender, Logger.null);
    });

    describe("ability trapping", function()
    {
        it("Should handle unavailable choice", async function()
        {
            // configure agent to try and switch out each turn
            agent = async function(state, choices)
            {
                // swap in a switch choice into the top slot
                const i = choices.indexOf("switch 2");
                if (i < 0) return;
                [choices[0], choices[i]] = [choices[i], choices[0]];
            };

            // receive request
            const request: RequestMessage =
            {
                type: "request",
                active:
                [{
                    moves:
                    [{
                        move: "Thunderbolt", id: "thunderbolt", pp: 24,
                        maxpp: 24, target: "adjacentFoe", disabled: false
                    }]
                }],
                side: {pokemon:
                [
                    {
                        owner: "p1", nickname: "Magnezone",
                        species: "Magnezone", shiny: true, gender: null,
                        level: 50, hp: 150, hpMax: 150, condition: null,
                        active: true,
                        stats: {atk: 67, def: 120, spa: 150, spd: 120, spe: 80},
                        moves: ["thunderbolt"], baseAbility: "sturdy",
                        item: "lifeorb", pokeball: "pokeball"
                    },
                    {
                        owner: "p1", nickname: "Mewtwo",
                        species: "Mewtwo", shiny: false, gender: null,
                        level: 100, hp: 353, hpMax: 353, condition: null,
                        active: false,
                        stats:
                        {
                            atk: 256, def: 216, spa: 344, spd: 216, spe: 296
                        },
                        moves: ["psychocut"], baseAbility: "pressure",
                        item: "leftovers", pokeball: "masterball"
                    }
                ]}
            };
            await battle.request(request);

            // receive switchins
            // opponent switches in a pokemon that can have shadowtag
            await battle.init(
            {
                type: "battleinit", id: "p1", username, gameType: "singles",
                gen: 4, teamSizes: {p1: 2, p2: 1},
                events:
                [
                    {
                        type: "switch",
                        id: {owner: "p1", nickname: "Magnezone"},
                        species: "Magnezone", shiny: true, gender: null,
                        level: 50, hp: 150, hpMax: 150, condition: null
                    },
                    {
                        type: "switch",
                        id: {owner: "p2", nickname: "Magnezone"},
                        species: "Magnezone", shiny: false, gender: null,
                        level: 50, hp: 100, hpMax: 100, condition: null
                    }
                ]
            });

            // client sends a switch decision
            expect(sent).to.have.members(["|/choose switch 2"]);

            // unavailable choice
            await battle.error(
            {
                type: "error",
                reason: "[Unavailable choice] Can't switch: The active " +
                    "Pokémon is trapped"
            });

            // new request with trapped=true
            await battle.request(
            {
                ...request,
                active:
                [{
                    ...request.active![0],
                    trapped: true
                }]
            });

            // make a move decision
            expect(sent).to.have.members(
                ["|/choose switch 2", "|/choose move 1"]);
        });
    });

    // TODO: handle all other move restrictions before testing imprison
    describe.skip("imprison disabling", function()
    {
        it("Should handle unavailable choice", async function()
        {
            // receive request
            const request: RequestMessage =
            {
                type: "request",
                active:
                [
                    {
                        moves:
                        [
                            {
                                move: "Tackle", id: "tackle", pp: 56, maxpp: 56,
                                target: "adjacentFoe", disabled: false
                            },
                            {
                                move: "Splash", id: "splash", pp: 64, maxpp: 64,
                                target: "self", disabled: false
                            },
                            {
                                move: "Bounce", id: "bounce", pp: 8, maxpp: 8,
                                target: "adjacentFoe", disabled: false
                            },
                            {
                                move: "Flail", id: "Flail", pp: 24, maxpp: 24,
                                target: "adjacentFoe", disabled: false
                            }
                        ]
                    }
                ],
                side:
                {
                    pokemon:
                    [{
                        owner: "p1", nickname: "Magikarp", species: "Magikarp",
                        shiny: true, gender: "M", level: 50, hp: 100,
                        hpMax: 100, condition: null, active: true,
                        stats: {atk: 30, def: 75, spa: 35, spd: 40, spe: 100},
                        moves: ["tackle", "splash", "bounce", "flail"],
                        baseAbility: "swiftswim", item: "lifeorb",
                        pokeball: "pokeball"
                    }]
                }
            };
            await battle.request(request);

            // receive switchins
            // opponent switches in a pokemon that can have imprison and tackle
            await battle.init(
            {
                type: "battleinit", id: "p1", username, gameType: "singles",
                gen: 4, teamSizes: {p1: 2, p2: 1},
                events:
                [
                    {
                        type: "switch", id: {owner: "p1", nickname: "Magikarp"},
                        species: "Magikarp", shiny: true, gender: "M",
                        level: 50, hp: 100, hpMax: 100, condition: null
                    },
                    {
                        type: "switch", id: {owner: "p2", nickname: "Bronzor"},
                        species: "Bronzor", shiny: false, gender: "M",
                        level: 50, hp: 100, hpMax: 100, condition: null
                    },
                    // set imprison status for opponent
                    {
                        type: "-start", id: {owner: "p2", nickname: "Bronzor"},
                        volatile: "move: Imprison", otherArgs: []
                    }
                ]
            });

            // shouldn't reveal yet
            expect(battle.state.teams.them.active.moveset.get("tackle"))
                .to.be.null;

            // client sends a move decision (tackle)
            expect(sent).to.have.members(["|/choose move 1"]);

            // unavailable choice
            await battle.error(
            {
                type: "error",
                reason: "[Unavailable choice] Can't move: Magikarp's Tackle " +
                    "is disabled"
            });

            // new request with disabled=true for tackle
            await battle.request(
            {
                ...request,
                active:
                [{
                    ...request.active![0],
                    moves:
                    [
                        {
                            ...request.active![0].moves[0],
                            disabled: true
                        },
                        ...request.active![0].moves.slice(1)
                    ]
                }]
            });
            // since opponent has imprison, the move should be inferred for it
            expect(battle.state.teams.them.active.moveset.get("tackle"))
                .to.not.be.null;

            // make a move decision
            expect(sent).to.have.members(
                ["|/choose move 1", "|/choose move 2"]);
        });
    });
});
