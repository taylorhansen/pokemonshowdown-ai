import { Event } from "../parser";

/** Handles messages that come from a battle room. */
export interface RoomHandler
{
    /** Handles an Event. */
    handle(event: Event): void | Promise<void>;
    /** Handles a halt signal after parsing a block of events. */
    halt(): void | Promise<void>;
}
