import { BattleInitMessage, BattleProgressMessage, ErrorMessage,
    RequestMessage } from "./dispatcher/Message";

/** Handles messages that come from a battle room. */
export interface RoomHandler
{
    /** Handles initial BattleEvents. */
    init(msg: BattleInitMessage): Promise<void>;

    /** Handles a group of parsed BattleEvents. */
    progress(msg: BattleProgressMessage): Promise<void>;

    /** Handles a request for a battle choice. */
    request(msg: RequestMessage): Promise<void>;

    /** Handles an error message from the server. */
    error(msg: ErrorMessage): Promise<void>;
}
