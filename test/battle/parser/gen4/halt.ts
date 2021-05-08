import { expect } from "chai";
import "mocha";
import { Choice } from "../../../../src/battle/agent/Choice";
import * as events from "../../../../src/battle/parser/BattleEvent";
import { SenderResult, SubParserResult } from
    "../../../../src/battle/parser/BattleParser";
import { getChoices, halt } from "../../../../src/battle/parser/gen4/halt";
import { BattleState } from "../../../../src/battle/state/BattleState";
import { ditto, smeargle } from "../../../helpers/switchOptions";
import { BattleParserContext, InitialContext, ParserContext } from "./Context";
import { ParserHelpers, setupSubParserPartial, StateHelpers } from "./helpers";

export function testHalt(ictx: InitialContext, getState: () => BattleState,
    sh: StateHelpers, pctx2: () => BattleParserContext,
    ph2 = new ParserHelpers(pctx2, getState))
{
    /** Initializes the halt parser. */
    const init = setupSubParserPartial(ictx.startArgs, getState, halt);

    // only use this for trivial cases to test return value
    // the pctx2/ph2 are for tests that require the main parser loop
    // TODO: remove need for pctx2/ph2
    let pctx: ParserContext<SubParserResult>;
    const ph = new ParserHelpers(() => pctx, getState);

    afterEach("Close ParserContext", async function()
    {
        await ph.close();
    });

    let state: BattleState;

    beforeEach("Extract BattleState", function()
    {
        state = getState();
    });

    describe("reason=wait", function()
    {
        it("Should do nothing", async function()
        {
            pctx = init();
            await ph.handleEnd({type: "halt", reason: "wait"}, {});
        });
    });

    describe("reason=gameOver", function()
    {
        it("Should cause parser to return permHalt result", async function()
        {
            pctx = init();
            await ph.handleEnd({type: "halt", reason: "gameOver"},
                {permHalt: true});
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
            ictx.agent = async function() {};
            ictx.sender = async function sender(choice)
            {
                const result = await new Promise<SenderResult>(res =>
                {
                    sendResolver = res;
                    sentPromiseRes?.(choice);
                    initSentPromise(); // reinit
                });
                sendResolver = null;
                return result;
            };
        });

        it("Should handle rejected switch", async function()
        {
            // setup user's team with one benched mon
            await ph2.handle(
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
            await ph2.handle({type: "initOtherTeamSize", size: 1});
            await ph2.handle(
            {
                type: "switchIn", monRef: "us", species: "magnezone",
                level: 50, gender: null, hp: 150, hpMax: 150
            });
            await ph2.handle(
            {
                // opponent can have magnetpull, which traps steel types
                type: "switchIn", monRef: "them", species: "magnezone",
                level: 50, gender: null, hp: 100, hpMax: 100
            });

            // initially the agent should think we're able to switch
            ictx.agent = async function(s, choices)
            {
                expect(choices).to.have.members(["move 1", "switch 2"]);

                // swap in a switch choice into the top slot
                const i = choices.indexOf("switch 2");
                expect(i).to.be.gte(0);
                if (i === 0) return;
                [choices[0], choices[i]] = [choices[i], choices[0]];
            };

            // driver makes a switch choice
            const haltPromise = ph2.handle({type: "halt", reason: "decide"});
            expect(await sentPromise).to.equal("switch 2");

            // after handling the switch rejection, the available choices
            //  should be narrowed down
            ictx.agent = async function(s, choices)
            {
                expect(choices).to.have.members(["move 1"]);
            };

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
        async function setup(moves?: string[], item?: string)
        {
            await ph2.handle(
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
            await ph2.handle(initOtherTeamSize);
            for (const event of switchIns) await ph2.handle(event);
        }

        describe("switchOnly = false", function()
        {
            it("Should have move and switch choices normally",
            async function()
            {
                await setup(["splash", "tackle"]);
                expect(getChoices(state, false))
                    .to.have.members(["move 1", "move 2", "switch 2"]);
            });

            it("Should omit move choice if no pp", async function()
            {
                await setup(["splash", "tackle"]);
                await ph2.handle(
                {
                    type: "modifyPP", monRef: "us", move: "splash",
                    amount: "deplete"
                });
                expect(getChoices(state, false))
                    .to.have.members(["move 2", "switch 2"]);
            });

            it("Should omit move choice if Taunted", async function()
            {
                await setup(["substitute", "focuspunch", "spore"]);
                await ph2.handle(
                {
                    type: "activateStatusEffect", monRef: "us",
                    effect: "taunt", start: true
                });
                expect(getChoices(state, false))
                    .to.have.members(["move 2", "switch 2"]);
            });

            it("Should omit move choice if Disabled", async function()
            {
                await setup(["splash", "tackle"]);
                await ph2.handle(
                    {type: "disableMove", monRef: "us", move: "splash"});
                expect(getChoices(state, false))
                    .to.have.members(["move 2", "switch 2"]);
            });

            it("Should omit move choice if known Imprison", async function()
            {
                await setup(["splash", "tackle"]);
                await ph2.handle(
                {
                    type: "activateStatusEffect", monRef: "them",
                    effect: "imprison", start: true
                });
                await ph2.handle(
                    {type: "revealMove", monRef: "them", move: "splash"});
                expect(getChoices(state, false))
                    .to.have.members(["move 2", "switch 2"]);
            });

            it("Should omit all other move choices if Encored",
            async function()
            {
                await setup(["splash", "tackle", "toxic"]);

                // set last move to toxic
                await ph2.handle(
                    {type: "useMove", monRef: "us", move: "toxic"});
                await ph2.handle({type: "fail"});
                // start encore
                await ph2.handle(
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
                await setup(["splash", "tackle", "stoneedge"],
                    "choicespecs");

                // lock choice
                await ph2.handle(
                    {type: "useMove", monRef: "us", move: "stoneedge"});
                expect(getChoices(state, false))
                    .to.have.members(["move 3", "switch 2"]);
            });

            it("Should keep [move 1] as struggle choice if all moves are " +
                "unavailable",
            async function()
            {
                await setup(["splash", "tackle"]);

                await ph2.handle(
                {
                    type: "modifyPP", monRef: "us", move: "splash",
                    amount: "deplete"
                });
                await ph2.handle(
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
                await setup(["splash"]);

                await ph2.handle({type: "faint", monRef: "us"});
                await ph2.handle(
                    {type: "switchIn", monRef: "us", ...ditto});
                expect(getChoices(state, false))
                    .to.have.members(["move 1"]);
            });

            describe("Trapping", async function()
            {
                beforeEach("Initialize", async function()
                {
                    await setup(["splash"]);
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
                        await ph2.handle(
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
                        await ph2.handle(
                            {type: "trap", target: "us", by: "them"});
                    });

                    testTrapping();
                });

                describe("Shadow Tag ability", async function()
                {
                    beforeEach("Initialize Shadow Tag opponent",
                    async function()
                    {
                        await ph2.handle(
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
                        await ph2.handle(
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
                        await ph2.handle(
                        {
                            type: "activateAbility", monRef: "them",
                            ability: "magnetpull"
                        });
                    });

                    beforeEach("Initialize steel type user",
                    async function()
                    {
                        await ph2.handle(
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
                        await ph2.handle(
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
                        await ph2.handle(
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
                        await ph2.handle(
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
                await setup(["splash"]);
                expect(getChoices(state, /*switchOnly*/true))
                    .to.have.members(["switch 2"]);
            });
        });
    });

}
