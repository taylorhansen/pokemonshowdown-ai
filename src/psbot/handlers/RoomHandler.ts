import { Event } from "../parser";

/** Handles messages that come from a battle room. */
export interface RoomHandler
{
    /** Handles an Event. */
    readonly handle: (event: Event) => void | Promise<void>;
    /** Handles a halt signal after parsing a block of events. */
    readonly halt: () => void | Promise<void>;
}
