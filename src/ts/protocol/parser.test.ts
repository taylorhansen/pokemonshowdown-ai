import {expect} from "chai";
import "mocha";
import {protocolParser} from "./parser";

export const test = () =>
    describe("parser", function () {
        const roomid = "some-room-name";

        it("Should parse events from room", function () {
            expect(
                protocolParser(`>${roomid}\n|init|battle\n|start\n`),
            ).to.have.deep.members([
                {roomid, args: ["init", "battle"], kwArgs: {}},
                {roomid, args: ["start"], kwArgs: {}},
                // Halt event after every chunk.
                {roomid, args: ["halt"], kwArgs: {}},
            ]);
        });

        it("Should still parse events without roomid", function () {
            expect(
                protocolParser("|init|battle\n|start\n"),
            ).to.have.deep.members([
                {roomid: "", args: ["init", "battle"], kwArgs: {}},
                {roomid: "", args: ["start"], kwArgs: {}},
                {roomid: "", args: ["halt"], kwArgs: {}},
            ]);
        });
    });
