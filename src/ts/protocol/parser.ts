import {Protocol} from "@pkmn/protocol";
import {HaltEvent, RoomEvent} from "./Event";

/** Parses a chunk of the PS protocol events from the server. */
export function protocolParser(chunk: string): (RoomEvent | HaltEvent)[] {
    const events: (RoomEvent | HaltEvent)[] = [];
    const rooms = new Set<Protocol.RoomID>();
    for (const event of Protocol.parse(chunk)) {
        events.push(event);
        rooms.add(event.roomid);
    }
    for (const roomid of rooms) {
        // Also send a "halt" signal after parsing a block in each room.
        // Note: Protocol should only really allow one roomid per chunk but just
        // in case.
        const event: HaltEvent = {roomid, args: ["halt"], kwArgs: {}};
        events.push(event);
    }
    return events;
}
