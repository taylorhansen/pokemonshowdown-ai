import { expect } from "chai";
import "mocha";
import { AbilityContext } from
    "../../../../src/battle/driver/context/AbilityContext";
import { BattleState } from "../../../../src/battle/state/BattleState";
import { Pokemon } from "../../../../src/battle/state/Pokemon";
import { Side } from "../../../../src/battle/state/Side";
import { Logger } from "../../../../src/Logger";
import { smeargle } from "../helpers";

describe("AbilityContext", function()
{
    let state: BattleState;

    beforeEach("Initialize BattleState", function()
    {
        state = new BattleState();
    });

    function initActive(monRef: Side, options = smeargle,
        teamSize = 1): Pokemon
    {
        state.teams[monRef].size = teamSize;
        return state.teams[monRef].switchIn(options)!;
    }

    function initCtx(monRef: Side, ability: string): AbilityContext
    {
        return new AbilityContext(state,
            {type: "activateAbility", monRef, ability}, Logger.null);
    }

    describe("constructor", function()
    {
        it("Should reveal ability", function()
        {
            const mon = initActive("them");
            expect(mon.ability).to.equal("");
            initCtx("them", "swiftswim");
            expect(mon.ability).to.equal("swiftswim");
        });
    });

    describe("#handle()", function()
    {
        describe("setWeather", function()
        {
            it("Should infer infinite duration if ability matches weather",
            function()
            {
                initActive("them");
                expect(initCtx("them", "drought")
                        .handle({type: "setWeather", weatherType: "SunnyDay"}))
                    .to.equal("stop");
                expect(state.status.weather.type).to.equal("SunnyDay");
                expect(state.status.weather.duration).to.be.null;
            });

            it("Should expire if mismatched ability", function()
            {
                initActive("them");
                expect(initCtx("them", "snowwarning")
                        .handle({type: "setWeather", weatherType: "SunnyDay"}))
                    .to.equal("expire");
                expect(state.status.weather.type).to.equal("none");
            });
        });
    });
});
