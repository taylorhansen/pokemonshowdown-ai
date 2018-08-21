/** Logs debug messages to stderr. */
export const Logger =
{
    /**
     * Logs a normal debug message.
     * @param message Message to log.
     */
    debug(message: string): void
    {
        console.error(`debug: ${message}`);
    },

    /**
     * Logs an error message.
     * @param message Message to log.
     */
    error(message: string): void
    {
        console.error(`error: ${message}`);
    }
};
