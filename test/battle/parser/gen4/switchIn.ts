import { expect } from "chai";
import "mocha";
import * as events from "../../../../src/battle/parser/BattleEvent";
import { ParserState, SubParser, SubParserResult } from
    "../../../../src/battle/parser/BattleParser";
import { expectSwitch, switchIn } from
    "../../../../src/battle/parser/gen4/switchIn";
import { BattleState } from "../../../../src/battle/state/BattleState";
import { Pokemon } from "../../../../src/battle/state/Pokemon";
import { Side } from "../../../../src/battle/state/Side";
import { ditto, smeargle } from "../../../helpers/switchOptions";
import { Context } from "./Context";
import { createParserHelpers } from "./helpers";

export function testSwitchIn(f: () => Context,
    initActive: (monRef: Side, options?: events.SwitchOptions) => Pokemon)
{
    let state: BattleState;
    let pstate: ParserState;
    let parser: SubParser;

    beforeEach("Extract Context", function()
    {
        ({state, pstate, parser} = f());
    });

    async function altParser<TParser extends SubParser>(gen: TParser):
        Promise<TParser>
    {
        parser = gen;
        // first yield doesn't return anything
        await expect(parser.next())
            .to.eventually.become({value: undefined, done: false});
        return gen;
    }

    async function rejectParser<TResult = SubParserResult>(
        gen: SubParser<TResult>, baseResult?: TResult):
        Promise<SubParser<TResult>>
    {
        parser = gen;
        await expect(parser.next())
            .to.eventually.become({value: baseResult ?? {}, done: true});
        return gen;
    }

    const {handle, handleEnd} = createParserHelpers(() => parser);

    // tests for switchIn()
    describe("Event", function()
    {
        it("Should switch in pokemon", async function()
        {
            state.teams.us.size = 1;
            expect(state.teams.us.active).to.be.null;
            await rejectParser(switchIn(pstate,
                    {type: "switchIn", monRef: "us", ...ditto}));
            expect(state.teams.us.active).to.not.be.null;
            expect(state.teams.us.active.active).to.be.true;
        });
    });

    describe("expectSwitch()", function()
    {
        it("Should handle valid switch-in", async function()
        {
            state.teams.us.size = 1;
            await altParser(expectSwitch(pstate, "us"));
            await handleEnd({type: "switchIn", monRef: "us", ...ditto},
                {success: true});
        });

        it("Should not handle invalid switch-in", async function()
        {
            await altParser(expectSwitch(pstate, "us"));
            const event: events.SwitchIn = 
                {type: "switchIn", monRef: "them", ...smeargle};
            await handleEnd(event, {event});
        });

        describe("interceptSwitch moves (pursuit)", function()
        {
            it("Should handle Pursuit", async function()
            {
                state.teams.us.size = 2;
                state.teams.us.switchIn(smeargle);
                initActive("them");
                await altParser(expectSwitch(pstate, "us"));
                await handle(
                    {type: "useMove", monRef: "them", move: "pursuit"});
                // ...move damage, etc
                await handleEnd({type: "switchIn", monRef: "us", ...ditto},
                    {success: true});
            });

            it("Should throw if move doesn't have interceptSwitch flag",
            async function()
            {
                state.teams.us.size = 2;
                state.teams.us.switchIn(smeargle);
                initActive("them");
                await altParser(expectSwitch(pstate, "us"));
                await expect(handle(
                        {type: "useMove", monRef: "them", move: "tackle"}))
                    .to.eventually.be.rejectedWith(Error,
                        "Move 'tackle' cannot be used to intercept a " +
                        "switch-out");
            });

            it("Should throw if mismatched monRef", async function()
            {
                state.teams.us.size = 2;
                state.teams.us.switchIn(smeargle);
                await altParser(expectSwitch(pstate, "us"));
                await expect(handle(
                        {type: "useMove", monRef: "us", move: "pursuit"}))
                    .to.eventually.be.rejectedWith(Error,
                        "Pokemon 'us' was expected to switch out");
            });
        });

        describe("on-switchOut abilities (naturalcure)", function()
        {
            it("Should handle", async function()
            {
                state.teams.us.size = 2;
                const mon = state.teams.us.switchIn(smeargle)!;
                mon.majorStatus.afflict("frz");
                // could have naturalcure
                mon.traits.setAbility("naturalcure", "illuminate");
                await altParser(expectSwitch(pstate, "us"));
                await handle(
                {
                    type: "activateAbility", monRef: "us",
                    ability: "naturalcure"
                });
                await handle(
                {
                    type: "activateStatusEffect", monRef: "us", effect: "frz",
                    start: false
                });
                await handleEnd({type: "switchIn", monRef: "us", ...ditto},
                    {success: true});
            });
        });
    });
}
