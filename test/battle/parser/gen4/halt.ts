import { expect } from "chai";
import "mocha";
import { BattleAgent } from "../../../../src/battle/agent/BattleAgent";
import { Choice } from "../../../../src/battle/agent/Choice";
import * as events from "../../../../src/battle/parser/BattleEvent";
import { ChoiceSender, SenderResult, SubParser } from
    "../../../../src/battle/parser/BattleParser";
import { getChoices } from "../../../../src/battle/parser/gen4/halt";
import { BattleState } from "../../../../src/battle/state/BattleState";
import { ditto, smeargle } from "../../../helpers/switchOptions";
import { Context } from "./Context";

export function testHalt(f: () => Context,
    setAgent: (agent: BattleAgent) => void,
    setSender: (sender: ChoiceSender) => void)
{
    let state: BattleState;
    let parser: SubParser;

    beforeEach("Extract Context", function()
    {
        ({state, parser} = f());
    });

    describe("reason=wait", function()
    {
        it("Should do nothing", async function()
        {
            await expect(parser.next({type: "halt", reason: "wait"}))
                .to.eventually.become({value: undefined, done: false});
        });
    });

    describe("reason=gameOver", function()
    {
        it("Should cause parser to return true", async function()
        {
            await expect(parser.next({type: "halt", reason: "gameOver"}))
                .to.eventually.become({value: true, done: true});
        });
    });

    const initTeamEvent: events.InitTeam =
    {
        type: "initTeam",
        team:
        [
            {
                ...smeargle,
                stats: {atk: 25, def: 40, spa: 25, spd: 50, spe: 80},
                moves: ["splash", "tackle"], baseAbility: "technician",
                item: "lifeorb"
            },
            {
                ...ditto,
                stats: {atk: 80, def: 80, spa: 80, spd: 80, spe: 80},
                moves: ["transform"], baseAbility: "limber",
                item: "choicescarf"
            }
        ]
    };

    const initOtherTeamSize: events.InitOtherTeamSize =
        {type: "initOtherTeamSize", size: 2};

    const switchIns: readonly events.SwitchIn[] =
    [
        {type: "switchIn", monRef: "us", ...smeargle},
        {type: "switchIn", monRef: "them", ...smeargle}
    ];

    describe("Ability trapping", function()
    {
        let sentPromiseRes: ((choice: Choice) => void) | null;
        /** Resolves on the next `sender` call. */
        let sentPromise: Promise<Choice>;
        /** Resolves the next `sender` promise. */
        let sendResolver: ((result: SenderResult) => void) | null;

        function initSentPromise()
        {
            sentPromiseRes = null;
            sentPromise = new Promise(res => sentPromiseRes = res);
        }

        beforeEach("Override agent/sender", function()
        {
            initSentPromise();
            sendResolver = null;
            setAgent(async function() {});
            setSender(async function sender(choice)
            {
                const result = await new Promise<SenderResult>(res =>
                {
                    sendResolver = res;
                    sentPromiseRes?.(choice);
                    initSentPromise(); // reinit
                });
                sendResolver = null;
                return result;
            });
        });

        it("Should handle rejected switch", async function()
        {
            // setup user's team with one benched mon
            await parser.next(
            {
                type: "initTeam",
                team:
                [
                    {
                        species: "magnezone", level: 50, gender: null,
                        hp: 150, hpMax: 150,
                        stats:
                        {
                            atk: 67, def: 120, spa: 150, spd: 120, spe: 80
                        },
                        moves: ["thunderbolt"],
                        baseAbility: "sturdy", item: "none"
                    },
                    // have a bench pokemon to switch in to
                    {
                        species: "mewtwo", level: 100, gender: null,
                        hp: 353,
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
            await parser.next({type: "initOtherTeamSize", size: 1});
            await parser.next(
            {
                type: "switchIn", monRef: "us", species: "magnezone",
                level: 50, gender: null, hp: 150, hpMax: 150
            });
            await parser.next(
            {
                // opponent can have magnetpull, which traps steel types
                type: "switchIn", monRef: "them", species: "magnezone",
                level: 50, gender: null, hp: 100, hpMax: 100
            });

            // initially the agent should think we're able to switch
            setAgent(async function(s, choices)
            {
                expect(choices).to.have.members(["move 1", "switch 2"]);

                // swap in a switch choice into the top slot
                const i = choices.indexOf("switch 2");
                expect(i).to.be.gte(0);
                if (i === 0) return;
                [choices[0], choices[i]] = [choices[i], choices[0]];
            });

            // driver makes a switch choice
            const haltPromise =
                parser.next({type: "halt", reason: "decide"});
            expect(await sentPromise).to.equal("switch 2");

            // after handling the switch rejection, the available choices
            //  should be narrowed down
            setAgent(async function(s, choices)
            {
                expect(choices).to.have.members(["move 1"]);
            });

            // reject the switch due to being trapped
            // should infer the trapping ability after handling the
            //  rejection
            expect(state.teams.them.active.ability).to.be.empty;
            expect(sendResolver).to.not.be.null;
            sendResolver!("trapped");
            expect(await sentPromise).to.equal("move 1");
            expect(state.teams.them.active.ability).to.equal("magnetpull");

            // accept the choice and continue
            // (not actually necessary for this test, but just to
            //  demonstrate usage)
            expect(sendResolver).to.not.be.null;
            sendResolver!();
            await haltPromise;
            expect(sendResolver).to.be.null;
        });
    });

    describe("getChoice()", function()
    {
        async function init(moves?: string[], item?: string)
        {
            await parser.next(
            {
                ...initTeamEvent,
                team:
                [
                    {
                        ...initTeamEvent.team[0], ...(moves && {moves}),
                        ...(item && {item})
                    },
                    ...initTeamEvent.team.slice(1)
                ]
            });
            await parser.next(initOtherTeamSize);
            for (const event of switchIns) await parser.next(event);
        }

        describe("switchOnly = false", function()
        {
            it("Should have move and switch choices normally",
            async function()
            {
                await init(["splash", "tackle"]);
                expect(getChoices(state, false))
                    .to.have.members(["move 1", "move 2", "switch 2"]);
            });

            it("Should omit move choice if no pp", async function()
            {
                await init(["splash", "tackle"]);
                await parser.next(
                {
                    type: "modifyPP", monRef: "us", move: "splash",
                    amount: "deplete"
                });
                expect(getChoices(state, false))
                    .to.have.members(["move 2", "switch 2"]);
            });

            it("Should omit move choice if Taunted", async function()
            {
                await init(["substitute", "focuspunch", "spore"]);
                await parser.next(
                {
                    type: "activateStatusEffect", monRef: "us",
                    effect: "taunt", start: true
                });
                expect(getChoices(state, false))
                    .to.have.members(["move 2", "switch 2"]);
            });

            it("Should omit move choice if Disabled", async function()
            {
                await init(["splash", "tackle"]);
                await parser.next(
                    {type: "disableMove", monRef: "us", move: "splash"});
                expect(getChoices(state, false))
                    .to.have.members(["move 2", "switch 2"]);
            });

            it("Should omit move choice if known Imprison", async function()
            {
                await init(["splash", "tackle"]);
                await parser.next(
                {
                    type: "activateStatusEffect", monRef: "them",
                    effect: "imprison", start: true
                });
                await parser.next(
                    {type: "revealMove", monRef: "them", move: "splash"});
                expect(getChoices(state, false))
                    .to.have.members(["move 2", "switch 2"]);
            });

            it("Should omit all other move choices if Encored",
            async function()
            {
                await init(["splash", "tackle", "toxic"]);

                // set last move to toxic
                await parser.next(
                    {type: "useMove", monRef: "us", move: "toxic"});
                await parser.next({type: "fail"});
                // start encore
                await parser.next(
                {
                    type: "activateStatusEffect", monRef: "us",
                    effect: "encore", start: true
                });
                expect(getChoices(state, false))
                    .to.have.members(["move 3", "switch 2"]);
            });

            it("Should omit all other move choices if choice locked",
            async function()
            {
                // reveal choice item
                await init(["splash", "tackle", "stoneedge"],
                    "choicespecs");

                // lock choice
                await parser.next(
                    {type: "useMove", monRef: "us", move: "stoneedge"});
                expect(getChoices(state, false))
                    .to.have.members(["move 3", "switch 2"]);
            });

            it("Should keep [move 1] as struggle choice if all moves are " +
                "unavailable",
            async function()
            {
                await init(["splash", "tackle"]);

                await parser.next(
                {
                    type: "modifyPP", monRef: "us", move: "splash",
                    amount: "deplete"
                });
                await parser.next(
                {
                    type: "modifyPP", monRef: "us", move: "tackle",
                    amount: "deplete"
                });
                expect(getChoices(state, false))
                    .to.have.members(["move 1", "switch 2"]);
            });

            it("Should omit switch choice if switch-in is fainted",
            async function()
            {
                await init(["splash"]);

                await parser.next({type: "faint", monRef: "us"});
                await parser.next(
                    {type: "switchIn", monRef: "us", ...ditto});
                expect(getChoices(state, false))
                    .to.have.members(["move 1"]);
            });

            describe("Trapping", async function()
            {
                beforeEach("Initialize", async function()
                {
                    await init(["splash"]);
                });

                function testTrapping()
                {
                    it("Should omit switch choice", function()
                    {
                        expect(getChoices(state, false))
                            .to.have.members(["move 1"]);
                    });

                    it("Should not omit switch choice if shed shell",
                    async function()
                    {
                        await parser.next(
                        {
                            type: "revealItem", monRef: "us",
                            item: "shedshell", gained: true
                        });
                        expect(getChoices(state, false))
                            .to.have.members(["move 1", "switch 2"]);
                    });
                }

                describe("Trapped status", async function()
                {
                    beforeEach("Set trap status", async function()
                    {
                        await parser.next(
                            {type: "trap", target: "us", by: "them"});
                    });

                    testTrapping();
                });

                describe("Shadow Tag ability", async function()
                {
                    beforeEach("Initialize Shadow Tag opponent",
                    async function()
                    {
                        await parser.next(
                        {
                            type: "activateAbility", monRef: "them",
                            ability: "shadowtag"
                        });
                    });

                    testTrapping();

                    it("Should not omit switch choice if user also has " +
                        "Shadow Tag",
                    async function()
                    {
                        await parser.next(
                        {
                            type: "activateAbility", monRef: "us",
                            ability: "shadowtag"
                        });
                        expect(getChoices(state, false))
                            .to.have.members(["move 1", "switch 2"]);
                    });
                });

                describe("Magnet Pull ability", async function()
                {
                    beforeEach("Initialize Magnet Pull opponent",
                    async function()
                    {
                        await parser.next(
                        {
                            type: "activateAbility", monRef: "them",
                            ability: "magnetpull"
                        });
                    });

                    beforeEach("Initialize steel type user",
                    async function()
                    {
                        await parser.next(
                        {
                            type: "changeType", monRef: "us",
                            newTypes: ["steel", "???"]
                        });
                    });

                    testTrapping();

                    it("Should not omit switch choice if user is not " +
                        "steel type",
                    async function()
                    {
                        await parser.next(
                        {
                            type: "changeType", monRef: "us",
                            newTypes: ["normal", "???"]
                        });
                        expect(getChoices(state, false))
                            .to.have.members(["move 1", "switch 2"]);
                    });
                });

                describe("Arena Trap ability", async function()
                {
                    beforeEach("Initialize Arena Trap opponent",
                    async function()
                    {
                        await parser.next(
                        {
                            type: "activateAbility", monRef: "them",
                            ability: "arenatrap"
                        });
                    });

                    testTrapping();

                    it("Should not omit switch choice if user is not " +
                        "grounded ",
                    async function()
                    {
                        await parser.next(
                        {
                            type: "changeType", monRef: "us",
                            newTypes: ["flying", "???"]
                        });
                        expect(getChoices(state, false))
                            .to.have.members(["move 1", "switch 2"]);
                    });
                });
            });
        });

        describe("switchOnly = true", async function()
        {
            it("Should omit move choices", async function()
            {
                await init(["splash"]);
                expect(getChoices(state, /*switchOnly*/true))
                    .to.have.members(["switch 2"]);
            });
        });
    });

}
