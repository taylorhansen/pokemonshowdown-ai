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

    describe("gravity", function()
    {
        it("Should set gravity", function()
        {
            room.gravity = true;
            // tslint:disable-next-line:no-unused-expression
            expect(room.gravity).to.be.true;
            room.gravity = false;
            // tslint:disable-next-line:no-unused-expression
            expect(room.gravity).to.be.false;
        });
    });

    describe("toArray", function()
    {
        it("Should be the same size as RoomStatus.getArraySize()", function()
        {
            expect(room.toArray()).to.have.lengthOf(RoomStatus.getArraySize());
        });
    });
});
