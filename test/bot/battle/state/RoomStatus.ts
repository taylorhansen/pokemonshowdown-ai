import { expect } from "chai";
import "mocha";
import { RoomStatus } from "../../../../src/bot/battle/state/RoomStatus";

describe("Room", function()
{
    let room: RoomStatus;

    beforeEach("Initialize RoomStatus", function()
    {
        room = new RoomStatus();
    });

    describe("toArray", function()
    {
        it("Should be the same size as RoomStatus.getArraySize()", function()
        {
            expect(room.toArray()).to.have.lengthOf(RoomStatus.getArraySize());
        });
    });

    describe("toString", function()
    {
        it("Should initially be empty brackets", function()
        {
            expect(room.toString()).to.equal("[]");
        });
    });
});
