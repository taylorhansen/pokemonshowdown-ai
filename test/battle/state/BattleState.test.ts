import { expect } from "chai";
import "mocha";
import { isNumber } from "util";
import { BattleState } from "../../../src/battle/state/BattleState";

describe("BattleState", function()
{
    let state: BattleState;

    beforeEach("Initialize BattleState", function()
    {
        state = new BattleState();
    });

    describe("toArray", function()
    {
        beforeEach("Initialize with valid data", function()
        {
            for (const team of [state.teams.us, state.teams.them])
            {
                team.size = 1;
                team.switchIn("Magikarp", 100, "M", 100, 100);
            }
        });

        it("Should be the same size as BattleState.getArraySize()", function()
        {
            // can take a while to create such a huge array
            this.slow(1000);

            expect(state.toArray()).to.have.lengthOf(
                    BattleState.getArraySize());
        });

        it("Should contain only finite numbers", function()
        {
            // can take a while to iterate over such a huge array
            this.slow(2000);

            for (const i of state.toArray())
            {
                expect(isNumber(i)).to.be.true;
                expect(isFinite(i)).to.be.true;
            }
        });
    });
});
