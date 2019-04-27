import { Callback } from "./CallbackDispatcher";

/**
 * Holds event callbacks for one specific type of event.
 * @template Args Array of argument types for the callback type.
 */
export class SpecificDispatcher<Args extends any[]>
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
