import { expect } from "chai";
import "mocha";
import * as events from "../../../src/battle/driver/BattleEvent";
import { StateDriver } from "../../../src/battle/driver/StateDriver";
import { Logger } from "../../../src/Logger";
import { ditto, smeargle } from "./helpers";

/** Base InitTeam event for testing. */
const initTeam: events.InitTeam =
{
    type: "initTeam",
    team:
    [
        {
            ...smeargle, stats: {atk: 25, def: 40, spa: 25, spd: 50, spe: 80},
            moves: ["splash", "tackle"], baseAbility: "technician",
            item: "lifeorb"
        },
        {
            ...ditto, stats: {atk: 80, def: 80, spa: 80, spd: 80, spe: 80},
            moves: ["transform"], baseAbility: "limber", item: "choicescarf"
        }
    ]
};

/** Base InitOtherTeamSize event for testing. */
const initOtherTeamSize: events.InitOtherTeamSize =
    {type: "initOtherTeamSize", size: 2};

/** Base SwitchIn events for testing. */
const switchIns: readonly events.SwitchIn[] =
[
    {type: "switchIn", monRef: "us", ...smeargle},
    {type: "switchIn", monRef: "them", ...smeargle}
];

describe("StateDriver", function()
{
    let driver: StateDriver;

    beforeEach("Initialize StateDriver", function()
    {
        driver = new StateDriver(Logger.null);
    });

    // how to test? may need to subclass and inject mocks/stubs
    it("Should stack contexts"); // TODO

    describe("#getChoices()", function()
    {
        function init(moves: string[]): void
        {
            driver.handle(
            {
                ...initTeam,
                team:
                [
                    {
                        ...initTeam.team[0],
                        moves
                    },
                    ...initTeam.team.slice(1)
                ]
            });
            driver.handle(initOtherTeamSize, ...switchIns);
        }

        describe("switchOnly = false", function()
        {
            it("Should have move and switch choices normally", function()
            {
                init(["splash", "tackle"]);
                expect(driver.getChoices())
                    .to.have.members(["move 1", "move 2", "switch 2"]);
            });

            it("Should omit move choice if no pp", function()
            {
                init(["splash", "tackle"]);

                driver.handle(
                {
                    type: "modifyPP", monRef: "us", move: "splash",
                    amount: "deplete"
                });
                expect(driver.getChoices())
                    .to.have.members(["move 2", "switch 2"]);
            });

            it("Should omit move choice if Taunted", function()
            {
                init(["substitute", "focuspunch", "spore"]);
                driver.handle(
                {
                    type: "activateStatusEffect", monRef: "us", effect: "taunt",
                    start: true
                });
            });

            it("Should omit move choice if Disabled", function()
            {
                init(["splash", "tackle"]);

                driver.handle(
                    {type: "disableMove", monRef: "us", move: "splash"});
                expect(driver.getChoices())
                    .to.have.members(["move 2", "switch 2"]);
            });

            it("Should omit move choice if known imprison", function()
            {
                init(["splash", "tackle"]);

                driver.handle(
                {
                    type: "activateStatusEffect", monRef: "them",
                    effect: "imprison", start: true
                });
                driver.handle(
                    {type: "revealMove", monRef: "them", move: "splash"});
                expect(driver.getChoices())
                    .to.have.members(["move 2", "switch 2"]);
            });

            it("Should keep [move 1] as struggle choice if all moves are " +
                "unavailable", function()
            {
                init(["splash", "tackle"]);

                driver.handle(
                {
                    type: "modifyPP", monRef: "us", move: "splash",
                    amount: "deplete"
                });
                driver.handle(
                {
                    type: "modifyPP", monRef: "us", move: "tackle",
                    amount: "deplete"
                });
                expect(driver.getChoices())
                    .to.have.members(["move 1", "switch 2"]);
            });

            it("Should omit switch choice if switch-in is fainted", function()
            {
                init(["splash"]);

                driver.handle({type: "faint", monRef: "us"});
                driver.handle({type: "switchIn", monRef: "us", ...ditto});
                expect(driver.getChoices()).to.have.members(["move 1"]);
            });

            describe("Trapping", function()
            {
                beforeEach("Initialize", function()
                {
                    init(["splash"]);
                });

                function testTrapping()
                {
                    it("Should omit switch choice", function()
                    {
                        expect(driver.getChoices()).to.have.members(["move 1"]);
                    });

                    it("Should not omit switch choice if shed shell", function()
                    {
                        driver.handle(
                        {
                            type: "revealItem", monRef: "us", item: "shedshell",
                            gained: true
                        });
                        expect(driver.getChoices())
                            .to.have.members(["move 1", "switch 2"]);
                    });
                }

                describe("Trapped status", function()
                {
                    beforeEach("Set trap status", function()
                    {
                        driver.handle({type: "trap", target: "us", by: "them"});
                    });

                    testTrapping();
                });

                describe("Shadow Tag ability", function()
                {
                    beforeEach("Initialize Shadow Tag opponent", function()
                    {
                        driver.handle(
                        {
                            type: "activateAbility", monRef: "them",
                            ability: "shadowtag"
                        });
                    });

                    testTrapping();

                    it("Should not omit switch choice if user also has " +
                        "Shadow Tag", function()
                    {
                        driver.handle(
                        {
                            type: "activateAbility", monRef: "us",
                            ability: "shadowtag"
                        });
                        expect(driver.getChoices())
                            .to.have.members(["move 1", "switch 2"]);
                    });
                });

                describe("Magnet Pull ability", function()
                {
                    beforeEach("Initialize Magnet Pull opponent", function()
                    {
                        driver.handle(
                        {
                            type: "activateAbility", monRef: "them",
                            ability: "magnetpull"
                        });
                    });

                    beforeEach("Initialize steel type user", function()
                    {
                        driver.handle(
                        {
                            type: "changeType", monRef: "us",
                            newTypes: ["steel", "???"]
                        });
                    });

                    testTrapping();

                    it("Should not omit switch choice if user is not steel " +
                        "type", function()
                    {
                        driver.handle(
                        {
                            type: "changeType", monRef: "us",
                            newTypes: ["normal", "???"]
                        });
                        expect(driver.getChoices())
                            .to.have.members(["move 1", "switch 2"]);
                    });
                });

                describe("Arena Trap ability", function()
                {
                    beforeEach("Initialize Arena Trap opponent", function()
                    {
                        driver.handle(
                        {
                            type: "activateAbility", monRef: "them",
                            ability: "arenatrap"
                        });
                    });

                    testTrapping();

                    it("Should not omit switch choice if user is not grounded ",
                    function()
                    {
                        driver.handle(
                        {
                            type: "changeType", monRef: "us",
                            newTypes: ["flying", "???"]
                        });
                        expect(driver.getChoices())
                            .to.have.members(["move 1", "switch 2"]);
                    });
                });
            });
        });

        describe("switchOnly = true", function()
        {
            it("Should omit move choices", function()
            {
                init(["splash"]);
                expect(driver.getChoices(/*switchOnly*/true))
                    .to.have.members(["switch 2"]);
            });
        });
    });
});
