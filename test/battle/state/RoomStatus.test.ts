import { expect } from "chai";
import "mocha";
import { RoomStatus } from "../../../src/battle/state/RoomStatus";

describe("RoomStatus", function()
{
    let room: RoomStatus;

    beforeEach("Initialize RoomStatus", function()
    {
        room = new RoomStatus();
    });

    describe("#gravity", function()
    {
        it("Should tick on #postTurn()", function()
        {
            room.gravity.start();
            expect(room.gravity.turns).to.equal(0);
            room.postTurn();
            expect(room.gravity.turns).to.equal(1);
        });
    });

    describe("#trickRoom", function()
    {
        it("Should tick on #postTurn()", function()
        {
            room.trickRoom.start();
            expect(room.trickRoom.turns).to.equal(0);
            room.postTurn();
            expect(room.trickRoom.turns).to.equal(1);
        });
    });
});
