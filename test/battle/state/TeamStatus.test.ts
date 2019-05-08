import { expect } from "chai";
import "mocha";
import { FutureMove } from "../../../src/battle/dex/dex";
import { TeamStatus } from "../../../src/battle/state/TeamStatus";

describe("TeamStatus", function()
{
    let status: TeamStatus;

    beforeEach("Initialize TeamStatus", function()
    {
        status = new TeamStatus();
    });

    describe("#futureMoveTurns", function()
    {
        it("Should be 0 initially", function()
        {
            for (const id of Object.keys(status.futureMoveTurns) as
                FutureMove[])
            {
                expect(status.futureMoveTurns[id]).to.equal(0);
            }
        });
    });

    describe("#startFutureMove()", function()
    {
        it("Should start future move", function()
        {
            status.startFutureMove("doomdesire");
            expect(status.futureMoveTurns.doomdesire).to.equal(3);
        });
    });

    describe("#postTurn()", function()
    {
        it("Should not decrement inactive future moves", function()
        {
            status.postTurn();
            expect(status.futureMoveTurns.futuresight).to.equal(0);
        });

        it("Should decrement future move turns", function()
        {
            status.startFutureMove("doomdesire");
            status.postTurn();
            expect(status.futureMoveTurns.doomdesire).to.equal(2);
        });
    });

    describe("#toArray()", function()
    {
        it("Should be the same size as TeamStatus.getArraySize()", function()
        {
            expect(status.toArray())
                .to.have.lengthOf(TeamStatus.getArraySize());
        });
    });
});
