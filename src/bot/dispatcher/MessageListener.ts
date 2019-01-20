import { Callback, CallbackDispatcher } from "./CallbackDispatcher";
import { Message, MessageType } from "./Message";

/** Callback type that handles a given Message type. */
export type MessageHandler<T extends MessageType> =
    Callback<MessageDispatchArgs[T]>;

/**
 * Maps Message type to callback args, which just includes the Message object.
 */
export type MessageDispatchArgs = {[T in MessageType]: [Message<T>]};

/** Manages callbacks registered for specific parsed Messages. */
export class MessageListener extends CallbackDispatcher<MessageDispatchArgs> {}
