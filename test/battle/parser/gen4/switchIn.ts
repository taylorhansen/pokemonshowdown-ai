import { expect } from "chai";
import "mocha";
import * as events from "../../../../src/battle/parser/BattleEvent";
import { SubParserResult } from "../../../../src/battle/parser/BattleParser";
import { SuccessResult } from "../../../../src/battle/parser/gen4/parsers";
import { expectSwitch, switchIn } from
    "../../../../src/battle/parser/gen4/switchIn";
import { BattleState } from "../../../../src/battle/state/BattleState";
import { Side } from "../../../../src/battle/state/Side";
import { ditto, smeargle } from "../../../helpers/switchOptions";
import { InitialContext, ParserContext } from "./Context";
import { ParserHelpers, setupSubParserPartial, StateHelpers } from "./helpers";

export function testSwitchIn(ictx: InitialContext, getState: () => BattleState,
    sh: StateHelpers)
{
    let state: BattleState;

    beforeEach("Extract BattleState", function()
    {
        state = getState();
    });

    // tests for switchIn()
    describe("Event", function()
    {
        /** Initializes the activateAbility parser. */
        const init = setupSubParserPartial(ictx.startArgs, getState, switchIn);

        let pctx: ParserContext<SubParserResult>;
        const ph = new ParserHelpers(() => pctx, getState);

        afterEach("Close ParserContext", async function()
        {
            await ph.close();
        });

        /** Initializes the activateAbility parser with the initial event. */
        async function initReturn(monRef: Side,
            options: events.SwitchOptions): Promise<void>
        {
            pctx = init();
            await ph.handleEnd({type: "switchIn", monRef, ...options});
        }

        it("Should switch in pokemon", async function()
        {
            state.teams.us.size = 1;
            expect(state.teams.us.active).to.be.null;
            await initReturn("us", ditto);
            expect(state.teams.us.active).to.not.be.null;
            expect(state.teams.us.active.active).to.be.true;
        });
    });

    describe("expectSwitch()", function()
    {
        let pctx: ParserContext<SuccessResult>;
        const ph = new ParserHelpers(() => pctx, getState);

        afterEach("Close ParserContext", async function()
        {
            await ph.close();
        });

        /** Initializes the expectSwitch parser. */
        const init = setupSubParserPartial(ictx.startArgs, getState,
            expectSwitch);

        it("Should handle valid switch-in", async function()
        {
            state.teams.us.size = 1;
            pctx = init("us");
            await ph.handleEnd({type: "switchIn", monRef: "us", ...ditto},
                {success: true});
        });

        it("Should not handle invalid switch-in", async function()
        {
            pctx = init("us")
            const event: events.SwitchIn =
                {type: "switchIn", monRef: "them", ...smeargle};
            await ph.reject(event, {});
        });

        describe("interceptSwitch moves (pursuit)", function()
        {
            it("Should handle Pursuit", async function()
            {
                state.teams.us.size = 2;
                state.teams.us.switchIn(smeargle);
                sh.initActive("them");
                pctx = init("us");
                await ph.handle(
                    {type: "useMove", monRef: "them", move: "pursuit"});
                // ...move damage, etc
                await ph.handleEnd({type: "switchIn", monRef: "us", ...ditto},
                    {success: true});
            });

            it("Should throw if move doesn't have interceptSwitch flag",
            async function()
            {
                state.teams.us.size = 2;
                state.teams.us.switchIn(smeargle);
                sh.initActive("them");
                pctx = init("us");
                await ph.rejectError(
                    {type: "useMove", monRef: "them", move: "tackle"}, Error,
                    "Move 'tackle' cannot be used to intercept a " +
                        "switch-out");
            });

            it("Should throw if mismatched monRef", async function()
            {
                state.teams.us.size = 2;
                state.teams.us.switchIn(smeargle);
                pctx = init("us");
                await ph.rejectError(
                    {type: "useMove", monRef: "us", move: "pursuit"},
                    Error, "Pokemon 'us' was expected to switch out");
            });
        });

        describe("on-switchOut abilities (naturalcure)", function()
        {
            it("Should handle", async function()
            {
                state.teams.us.size = 2;
                const mon = state.teams.us.switchIn(smeargle)!;
                mon.majorStatus.afflict("frz");
                mon.setAbility("naturalcure")

                pctx = init("us");
                await ph.handle(
                {
                    type: "activateAbility", monRef: "us",
                    ability: "naturalcure"
                });
                await ph.handle(
                {
                    type: "activateStatusEffect", monRef: "us", effect: "frz",
                    start: false
                });
                await ph.handleEnd({type: "switchIn", monRef: "us", ...ditto},
                    {success: true});
            });
        });
    });
}
