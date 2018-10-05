import { AnyMessageListener, MessageArgs, MessageHandler, Prefix } from
    "../AnyMessageListener";

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
     */
    public abstract parse(message: string): void;

    /**
     * Adds a MessageHandler for a certain message Prefix from a certain room.
     * While parsing, if this prefix and room are found, the provided handler
     * will be called.
     * @template P Prefix type.
     * @param room The room the message should originate from. Empty string
     * means lobby or global, while `null` means an unfamiliar room.
     * @param prefix Message prefix indicating its type.
     * @param handler Function to be called using data from the message.
     * @returns `this` to allow chaining.
     */
    public on<P extends Prefix>(room: string | null, prefix: P,
        handler: MessageHandler<P>): this
    {
        (room !== null ? this.getListener(room) : this.newRoomListener)
            .on(prefix, handler);
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
     * Calls a registered MessageHandler for the current room using the given
     * message prefix.
     * @param prefix Given prefix.
     * @param args Message handler arguments.
     */
    protected handle<P extends Prefix>(prefix: P,
        args: {[A in keyof MessageArgs<P>]: MessageArgs<P>[A] | null}): void
    {
        // early return: message handlers do not accept null arguments
        if ((Object.keys(args) as (keyof MessageArgs<P>)[])
            .some(key => args[key] === null))
        {
            return;
        }

        // unregistered rooms are delegated to a special listener
        const handler = this.messageListeners.hasOwnProperty(this.room) ?
            this.messageListeners[this.room] : this.newRoomListener;
        handler.getHandler(prefix)(args as MessageArgs<P>);
    }
}
