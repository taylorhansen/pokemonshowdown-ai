import { expect } from "chai";
import "mocha";
import { BattleAgent } from "../../../src/battle/agent/BattleAgent";
import { Choice } from "../../../src/battle/agent/Choice";
import { BattleDriver, ChoiceSender } from
    "../../../src/battle/driver/BattleDriver";
import { Logger } from "../../../src/Logger";

describe("BattleDriver", function()
{
    let driver: BattleDriver;

    // wrap battle agent so reassigning the agent variable will change the
    //  underlying agent
    const agentWrapper: BattleAgent = (state, choices) => agent(state, choices);
    let agent: BattleAgent;

    const sender: ChoiceSender = async function(choice)
    {
        sent.push(choice);
    };
    let sent: Choice[];

    beforeEach("Initialize BattleDriver", function()
    {
        agent = async function() {};
        sent = [];
        driver = new BattleDriver(agentWrapper, sender, Logger.null);
    });

    describe("ability trapping", function()
    {
        it("Should handle rejected switch", async function()
        {
            // setup user's team with one benched mon
            // while BattleDriver#handle() can take more than 1 event, keeping
            //  them separate for testing makes for better stack traces
            driver.handle(
            {
                type: "initTeam",
                team:
                [
                    {
                        species: "Magnezone", level: 50, gender: null, hp: 150,
                        hpMax: 150,
                        stats: {atk: 67, def: 120, spa: 150, spd: 120, spe: 80},
                        moves: ["thunderbolt"],
                        baseAbility: "sturdy", item: "none"
                    },
                    // have a bench pokemon to switch in to
                    {
                        species: "Mewtwo", level: 100, gender: null, hp: 353,
                        hpMax: 353,
                        stats:
                        {
                            atk: 256, def: 216, spa: 344, spd: 216, spe: 296
                        },
                        moves: ["psychocut"], baseAbility: "pressure",
                        item: "leftovers"
                    }
                ]
            });
            // setup game and opponent
            driver.handle({type: "initOtherTeamSize", size: 1});
            driver.handle(
            {
                type: "switchIn", monRef: "us", species: "Magnezone", level: 50,
                gender: null, hp: 150, hpMax: 150
            });
            driver.handle(
            {
                // opponent can have magnetpull, which traps steel types
                type: "switchIn", monRef: "them", species: "Magnezone",
                level: 50, gender: null, hp: 100, hpMax: 100
            });

            // agent selects switch
            agent = async function(state, choices)
            {
                if (sent.length === 0)
                {
                    // initially it should think we're able to switch
                    expect(choices).to.have.members(["move 1", "switch 2"]);
                }
                else if (sent.length === 1)
                {
                    // after handling the switch rejection, the available
                    //  choices should be narrowed down
                    expect(choices).to.have.members(["move 1"]);
                }

                // swap in a switch choice into the top slot
                const i = choices.indexOf("switch 2");
                if (i < 0) return;
                [choices[0], choices[i]] = [choices[i], choices[0]];
            };

            // driver makes a switch choice
            await driver.halt("decide");
            expect(sent).to.have.ordered.members(["switch 2"]);

            // reject the switch due to being trapped
            // should infer the trapping ability after handling the rejection
            expect(driver.state.teams.them.active.ability).to.be.empty;
            await driver.reject("trapped");
            expect(driver.state.teams.them.active.ability)
                .to.equal("magnetpull");
            expect(sent).to.have.ordered.members(["switch 2", "move 1"]);

            // re-enable the driver
            // (not actually necessary for this test, but just to demonstrate
            //  usage)
            driver.accept();
        });
    });
});
