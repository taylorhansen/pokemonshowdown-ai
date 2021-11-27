/** Callback type to process data. */
export type Callback<T = unknown> = (value: T) => void;

/** Container for callbacks to wait for data. */
export class CallbackRegistry<T = unknown> {
    /** Callback counter. */
    private uid = 0;
    /** Registered callbacks. May contain duplicates. */
    private readonly cbs = new Map<symbol, Callback<T>>();

    /** Calls all currently-registered callbacks with the given value. */
    public resolve(value: T): void {
        for (const [sym, cb] of [...this.cbs]) {
            cb(value);
            this.cbs.delete(sym);
        }
    }

    /**
     * Registers a callback to wait for more information. Evaluated in FIFO
     * order.
     *
     * @param cb Callback to call once {@link resolve} is called. This method
     * can be called with the same callback multiple times to call it multiple
     * times.
     * @returns A callback to deregister this callback prematurely. This is
     * already called automatically after {@link resolve} calls the `cb`.
     */
    public delay(cb: Callback<T>): () => void {
        const sym = Symbol(`CallbackRegistry[${this.uid++}]`);
        this.cbs.set(sym, cb);
        return () => void this.cbs.delete(sym);
    }
}
