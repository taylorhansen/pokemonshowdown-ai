import { expect } from "chai";
import "mocha";
import { BattleAgent } from "../../src/battle/agent/BattleAgent";
import { Logger } from "../../src/Logger";
import * as psmsg from "../../src/psbot/parser/PSMessage";
import { PSBattle } from "../../src/psbot/PSBattle";
import { Sender } from "../../src/psbot/PSBot";

describe("PSBattle", function()
{
    const username = "username";

    const sender: Sender = function(...responses)
    {
        if (!sentPromiseRes) return false;
        sentPromiseRes(responses);
        initSentPromise(); // reinit
        return true;
    };
    let sentPromiseRes: ((responses: string[]) => void) | null;
    /** Resolves on the next `sender` call. */
    let sentPromise: Promise<string[]>;

    function initSentPromise()
    {
        sentPromiseRes = null;
        sentPromise = new Promise(res => sentPromiseRes = res);
    }

    beforeEach("Initialize Sender", function()
    {
        initSentPromise();
    });

    // wrap battle agent so reassigning the agent variable will change the
    //  underlying agent
    const agent: BattleAgent = (state, choices) => innerAgent(state, choices);
    let innerAgent: BattleAgent;
    let battle: PSBattle;

    beforeEach("Initialize PSBattle", function()
    {
        innerAgent = async function() {};
        battle = new PSBattle(username, agent, sender, Logger.null);
    });

    it("Should not call BattleAgent if PSEventHandler gives no events",
    async function()
    {
        innerAgent = async () => { throw new Error("BattleAgent was called"); };
        await battle.progress(
        {
            type: "battleProgress",
            events:
            [{
                type: "-activate", id: {owner: "p1", nickname: "x"},
                volatile: "move: Struggle", otherArgs: []
            }]
        });
        await battle.forceFinish();
    });

    describe("ability trapping", function()
    {
        it("Should handle unavailable choice", async function()
        {
            // configure agent to try and switch out each turn
            innerAgent = async function(state, choices)
            {
                // swap in a switch choice into the top slot
                const i = choices.indexOf("switch 2");
                if (i <= 0) return;
                [choices[0], choices[i]] = [choices[i], choices[0]];
            };

            // receive request
            const request: psmsg.Request =
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
            // need to copy the sentPromise ref since it resets after the
            //  battle.init() call when it calls the sender function
            let lastSentPromise = sentPromise;
            await battle.init(
            {
                type: "battleInit", id: "p1", username,
                teamSizes: {p1: 2, p2: 1}, gen: 4, rules: [],
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
            expect(await lastSentPromise)
                .to.have.members(["|/choose switch 2"]);

            // unavailable choice
            await battle.error(
            {
                type: "error",
                reason: "[Unavailable choice] Can't switch: The active " +
                    "Pokémon is trapped"
            });

            // new request with trapped=true
            // copy sentPromise ref like before
            lastSentPromise = sentPromise;
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
            expect(await lastSentPromise).to.have.members(["|/choose move 1"]);

            // indicate choice was accepted
            await battle.progress({type: "battleProgress", events: []});
            await battle.forceFinish();
        });
    });
});
