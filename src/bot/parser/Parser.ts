import { AnyMessageListener, MessageArgs, MessageHandler } from
    "../AnyMessageListener";
import { MessageType } from "../messageData";
import { ShallowNullable } from "../types";

/** Base class for parsers. */
export abstract class Parser
{
    /** Current room we're parsing messages from. */
    public abstract get room(): string;

    /** Registered message listeners. */
    private readonly messageListeners: {[room: string]: AnyMessageListener} =
        {};
    /** Listener for unfamiliar rooms. */
    private readonly newRoomListener = new AnyMessageListener();

    /**
     * Parses the message sent from the server.
     * @param message Unparsed message or packet of messages.
     * @returns A promise that resolves once all the listeners are executed.
     */
    public abstract parse(message: string): Promise<void>;

    /**
     * Adds a MessageHandler for a certain message Prefix from a certain room.
     * While parsing, if this prefix and room are found, the provided handler
     * will be called.
     * @param room The room the message should originate from. Empty string
     * means lobby or global, while `null` means an unfamiliar room.
     * @param type Type of message to listen for.
     * @param handler Function to be called using data from the message.
     * @returns `this` to allow chaining.
     */
    public on<T extends MessageType>(room: string | null, type: T,
        handler: MessageHandler<T>): this
    {
        (room !== null ? this.getListener(room) : this.newRoomListener)
            .on(type, handler);
        return this;
    }

    /**
     * Gets a message listener for the given room. If the room is unfamiliar,
     * then a new listener is created and returned.
     * @param room The room this message originates from. Empty string means
     * lobby or global.
     * @returns A message listener for the given room.
     */
    public getListener(room: string): AnyMessageListener
    {
        if (!this.messageListeners.hasOwnProperty(room))
        {
            this.messageListeners[room] = new AnyMessageListener();
        }
        return this.messageListeners[room];
    }

    /**
     * Removes a room message listener.
     * @param room Room to stop tracking.
     */
    public removeListener(room: string): void
    {
        delete this.messageListeners[room];
    }

    /**
     * Calls a registered MessageHandler for the current room using the given
     * message prefix.
     * @param type Message type to invoke.
     * @param args Message handler arguments. These are allowed to be null, but
     * will cause the parser to reject the message as a whole if any are found.
     * @returns A promise that resolves once all the listeners are executed.
     */
    protected handle<T extends MessageType>(type: T,
        args: ShallowNullable<MessageArgs<T>>): Promise<void>
    {
        // early return: message handlers do not accept null arguments
        if ((Object.keys(args) as (keyof MessageArgs<T>)[])
            .some(key => args[key] === null))
        {
            return Promise.resolve();
        }

        // unregistered rooms are delegated to a special listener
        const handler = this.messageListeners.hasOwnProperty(this.room) ?
            this.messageListeners[this.room] : this.newRoomListener;
        return handler.getHandler(type)(args as MessageArgs<T>);
    }
}
