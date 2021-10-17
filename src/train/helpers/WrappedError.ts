/** Error that wraps the message of another Error. */
export class WrappedError extends Error
{
    /**
     * Creates a WrappedError.
     * @param err Error whose message is to be wrapped. Displayed after this
     * error's stack.
     * @param wrapper Wrapper function for the Error message. Displayed as the
     * main error message.
     */
    constructor(err: Error, wrapper: (message: string) => string)
    {
        super(wrapper(err.message));
        this.name = this.constructor.name;
        if (Error.captureStackTrace)
        {
            Error.captureStackTrace(this, this.constructor);
            this.stack += "\ncaused by: " + err.stack;
        }
    }

    public override toString(): string
    {
        return `${this.name}: ${this.message}`;
    }
}
