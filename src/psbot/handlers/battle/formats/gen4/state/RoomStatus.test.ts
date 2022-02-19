import {expect} from "chai";
import "mocha";
import {RoomStatus} from "./RoomStatus";

export const test = () =>
    describe("RoomStatus", function () {
        let room: RoomStatus;

        beforeEach("Initialize RoomStatus", function () {
            room = new RoomStatus();
        });

        describe("#postTurn()", function () {
            for (const type of ["gravity", "trickroom"] as const) {
                it(`Should tick ${type}`, function () {
                    room[type].start();
                    expect(room[type].turns).to.equal(0);
                    room.postTurn();
                    expect(room[type].turns).to.equal(1);
                });
            }
        });
    });
