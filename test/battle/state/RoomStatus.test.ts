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
        it("Should set gravity", function()
        {
            room.gravity = true;
            expect(room.gravity).to.be.true;
            room.gravity = false;
            expect(room.gravity).to.be.false;
        });
    });
});
