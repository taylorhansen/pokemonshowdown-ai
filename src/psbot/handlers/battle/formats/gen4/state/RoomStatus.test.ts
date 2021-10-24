import {expect} from "chai";
import "mocha";
import {RoomStatus} from "./RoomStatus";

export const test = () =>
    describe("RoomStatus", function () {
        let room: RoomStatus;

        beforeEach("Initialize RoomStatus", function () {
            room = new RoomStatus();
        });

        describe("#gravity", function () {
            it("Should tick on #postTurn()", function () {
                room.gravity.start();
                expect(room.gravity.turns).to.equal(0);
                room.postTurn();
                expect(room.gravity.turns).to.equal(1);
            });
        });

        describe("#trickRoom", function () {
            it("Should tick on #postTurn()", function () {
                room.trickroom.start();
                expect(room.trickroom.turns).to.equal(0);
                room.postTurn();
                expect(room.trickroom.turns).to.equal(1);
            });
        });
    });
