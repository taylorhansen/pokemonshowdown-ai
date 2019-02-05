import { Message, MessageType } from "../dispatcher/Message";
import { MessageHandler, MessageListener } from "../dispatcher/MessageListener";
import { ShallowNullable } from "../helpers";

/** Base class for parsers. */
export abstract class Parser
{
    /** Current room we're parsing messages from. */
    public abstract get room(): string;

    /** Registered message listeners. */
    private readonly messageListeners: {[room: string]: MessageListener} =
        {};
    /** Listener for unfamiliar rooms. */
    private readonly newRoomListener = new MessageListener();

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
     * Gets a MessageListener for the given room. If the room is unfamiliar,
     * then a new listener is created and returned.
     * @param room The room this message originates from. Empty string means
     * lobby or global.
     * @returns A message listener for the given room.
     */
    public getListener(room: string): MessageListener
    {
        if (!this.messageListeners.hasOwnProperty(room))
        {
            this.messageListeners[room] = new MessageListener();
        }
        return this.messageListeners[room];
    }

    /**
     * Unregisters a room's MessageListener.
     * @param room Room to stop tracking.
     */
    public removeListener(room: string): void
    {
        delete this.messageListeners[room];
    }

    /**
     * Dispatches registered callbacks for the current room and Message type.
     * @param type Message type.
     * @param message Message object.
     * @returns A Promise to resolve all the listeners for this Message type.
     */
    protected dispatch<T extends MessageType>(type: T, message: Message<T>):
        Promise<void>
    {
        // unregistered rooms are delegated to a special listener
        const listener = this.messageListeners.hasOwnProperty(this.room) ?
            this.messageListeners[this.room] : this.newRoomListener;

        return listener.dispatch(type, message);
    }
}
