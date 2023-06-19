/** @file Type layer over `@pkmn/protocol` event types. */
import type {Protocol} from "@pkmn/protocol";

/** Signal after parsing a block of events. */
export interface HaltEvent {
    /** Room that the event originated from. */
    readonly roomid: Protocol.RoomID;
    readonly args: ["halt"];
    readonly kwArgs: Record<string, never>;
}

/** Protocol event type with chat/battle room id. */
export interface RoomEvent<TName extends Protocol.ArgName = Protocol.ArgName>
    extends Event<TName> {
    /** Room that the event originated from. */
    readonly roomid: Protocol.RoomID;
}

/** Protocol event type. */
export interface Event<TName extends Protocol.ArgName = Protocol.ArgName> {
    /** Array arguments. First element is event type. */
    readonly args: Protocol.Args[TName];
    /** Keyword arguments. */
    readonly kwArgs: TName extends Protocol.ArgsWithKWArgName
        ? Protocol.KWArgs[TName]
        : Record<string, never>;
}
