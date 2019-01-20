/** Converts an array type to a sync/async function type with the given args. */
export type Callback<Args extends any[]> =
    (...args: Args) => void | Promise<void>;

/**
 * Manages and dispatches callbacks for named events.
 * @template DispatchArgs Dictionary type that maps event name to an array of
 * arguments for its type of callback function.
 */
export class CallbackDispatcher<DispatchArgs extends {[type: string]: any[]}>
{
    /** Contains the callback dispatchers for each event type. */
    private readonly dispatchers:
        {[T in keyof DispatchArgs]?: SpecificDispatcher<DispatchArgs[T]>} =
            {} as any;

    /**
     * Adds a callback for a certain event type.
     * @param type Event type.
     * @param callback Function to be called when the event is dispatched.
     * @returns `this` to allow chaining.
     */
    public on<T extends keyof DispatchArgs>(type: T,
        callback: Callback<DispatchArgs[T]>): this
    {
        this.getDispatcher(type).addCallback(callback);
        return this;
    }

    /**
     * Dispatches an event. Every function registered to this event (via the
     * `on` method) will be called using the same args.
     * @param type Event type.
     * @param args Arguments to be supplied to each registered function.
     */
    public dispatch<T extends keyof DispatchArgs>(type: T,
        ...args: DispatchArgs[T]): Promise<void>
    {
        return this.getDispatcher(type).dispatch(...args);
    }

    /**
     * Gets a SpecificDispatcher, or creates one if it doesn't already exist.
     * @param type Event type.
     */
    private getDispatcher<T extends keyof DispatchArgs>(type: T):
        SpecificDispatcher<DispatchArgs[T]>
    {
        if (!this.dispatchers.hasOwnProperty(type))
        {
            this.dispatchers[type] = new SpecificDispatcher<any[]>() as any;
        }
        return this.dispatchers[type] as SpecificDispatcher<DispatchArgs[T]>;
    }
}

/**
 * Holds event callbacks for one specific type of event.
 * @template Args Array of argument types for the callback type.
 */
class SpecificDispatcher<Args extends any[]>
{
    /** Currently registered callback functions. */
    private readonly callbacks: Callback<Args>[] = [];

    /**
     * Adds a callback for this event type.
     * @param callback Function to be called once `dispatch` is called.
     */
    public addCallback(callback: Callback<Args>): void
    {
        this.callbacks.push(callback);
    }

    /**
     * Calls every registered function using the provided arguments.
     * @param args Provided arguments.
     * @returns A Promise to compute every callback in the order they were
     * added.
     */
    public async dispatch(...args: Args): Promise<void>
    {
        await Promise.all(this.callbacks.map(callback => callback(...args)));
    }
}
