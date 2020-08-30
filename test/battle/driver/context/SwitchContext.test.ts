import { expect } from "chai";
import "mocha";
import { DriverSwitchOptions } from "../../../../src/battle/driver/BattleEvent";
import { SwitchContext } from
    "../../../../src/battle/driver/context/SwitchContext";
import { BattleState } from "../../../../src/battle/state/BattleState";
import { Side } from "../../../../src/battle/state/Side";
import { Logger } from "../../../../src/Logger";
import { smeargle } from "../helpers";

describe("SwitchContext", function()
{
    let state: BattleState;

    beforeEach("Initialize BattleState", function()
    {
        state = new BattleState();
    });

    function initTeam(teamRef: Side, size: number): void
    {
        state.teams[teamRef].size = size;
    }

    function initCtx(monRef: Side, options: DriverSwitchOptions): SwitchContext
    {
        return new SwitchContext(state, {type: "switchIn", monRef, ...options},
            Logger.null);
    }

    describe("constructor", function()
    {
        it("Should switch in pokemon", function()
        {
            initTeam("us", 1);
            expect(state.teams.us.active).to.be.null;
            initCtx("us", smeargle);
            expect(state.teams.us.active).to.not.be.null;
            expect(state.teams.us.active.active).to.be.true;
        });
    });

    describe("#handle()", function()
    {
        // TODO: expand behavior
        it("Should expire", function()
        {
            initTeam("us", 1);
            expect(initCtx("us", smeargle).handle({type: "clearSelfSwitch"}))
                .to.equal("expire");
        });
    });
});
