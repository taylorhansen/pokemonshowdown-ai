/* istanbul ignore file */
/**
 * Logs a normal debug message to stderr.
 * @param message Message to log.
 */
export function debug(message: string): void
{
    console.error(`debug: ${message}`);
}

/**
 * Logs an error message to stderr.
 * @param message Message to log.
 */
export function error(message: string): void
{
    console.error(`error: ${message}`);
}
