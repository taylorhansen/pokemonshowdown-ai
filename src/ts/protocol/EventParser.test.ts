import {expect} from "chai";
import "mocha";
import {HaltEvent, RoomEvent} from "./Event";
import {EventParser} from "./EventParser";

export const test = () =>
    describe("EventParser", function () {
        const roomid = "some-room-name";

        let parser: EventParser;

        beforeEach("Initialize EventParser", function () {
            parser = new EventParser();
        });

        afterEach("Destroy EventParser", function () {
            parser.destroy();
        });

        it("Should parse events from room", async function () {
            parser.write(`>${roomid}\n|init|battle\n|start\n`);
            parser.end();
            const events: (RoomEvent | HaltEvent)[] = [];
            for await (const event of parser) {
                events.push(event as RoomEvent | HaltEvent);
            }
            expect(events).to.have.deep.members([
                {roomid, args: ["init", "battle"], kwArgs: {}},
                {roomid, args: ["start"], kwArgs: {}},
                // Halt event after every chunk.
                {roomid, args: ["halt"], kwArgs: {}},
            ]);
        });

        it("Should still parse events without room", async function () {
            parser.write("|init|battle\n|start\n");
            parser.end();
            const events: (RoomEvent | HaltEvent)[] = [];
            for await (const event of parser) {
                events.push(event as RoomEvent | HaltEvent);
            }
            expect(events).to.have.deep.members([
                {roomid: "", args: ["init", "battle"], kwArgs: {}},
                {roomid: "", args: ["start"], kwArgs: {}},
                {roomid: "", args: ["halt"], kwArgs: {}},
            ]);
        });

        it("Should parse multiple chunks", async function () {
            const roomid2 = roomid + "2";
            parser.write(`>${roomid}\n|init|battle\n|start\n`);
            parser.write(`>${roomid2}\n|upkeep\n|-weather|SunnyDay|[upkeep]\n`);
            parser.end();
            const events: (RoomEvent | HaltEvent)[] = [];
            for await (const event of parser) {
                events.push(event as RoomEvent | HaltEvent);
            }
            expect(events).to.have.deep.members([
                {roomid, args: ["init", "battle"], kwArgs: {}},
                {roomid, args: ["start"], kwArgs: {}},
                {roomid, args: ["halt"], kwArgs: {}},
                {roomid: roomid2, args: ["upkeep"], kwArgs: {}},
                {
                    roomid: roomid2,
                    args: ["-weather", "SunnyDay"],
                    kwArgs: {upkeep: true},
                },
                {roomid: roomid2, args: ["halt"], kwArgs: {}},
            ]);
        });
    });
