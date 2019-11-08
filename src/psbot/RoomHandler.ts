import { BattleInitMessage, BattleProgressMessage, ErrorMessage,
    RequestMessage } from "./parser/Message";

/** Handles messages that come from a battle room. */
export interface RoomHandler
{
    /** Handles initial BattleEvents. */
    init(msg: Omit<BattleInitMessage, "type">): Promise<void>;

    /** Handles a group of parsed BattleEvents. */
    progress(msg: Omit<BattleProgressMessage, "type">): Promise<void>;

    /** Handles a request for a battle choice. */
    request(msg: Omit<RequestMessage, "type">): Promise<void>;

    /** Handles an error message from the server. */
    error(msg: Omit<ErrorMessage, "type">): Promise<void>;
}
