import { Callback, CallbackDispatcher } from "./CallbackDispatcher";
import { Message, MessageType } from "./Message";

/** Callback type that handles a given Message type. */
export type MessageHandler<T extends MessageType> =
    Callback<MessageDispatchArgs[T]>;

/**
 * Maps Message type to callback args, which just includes the Message object
 * and the room it came from.
 */
export type MessageDispatchArgs = {[T in MessageType]: [Message<T>, string]};

/** Manages callbacks registered for specific parsed Messages. */
export class MessageListener extends CallbackDispatcher<MessageDispatchArgs> {}
