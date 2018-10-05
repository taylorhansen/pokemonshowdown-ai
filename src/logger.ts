/* istanbul ignore file */

/** Whether the logger is enabled. */
let enabled = true;

/** Enables the logger. This is the default behavior. */
export function enable(): void
{
    enabled = true;
}

/** Disables the logger. */
export function disable(): void
{
    enabled = false;
}

/**
 * Logs a normal debug message to stderr.
 * @param message Message to log.
 */
export function debug(message: string): void
{
    if (enabled) console.error(`debug: ${message}`);
}

/**
 * Logs an error message to stderr.
 * @param message Message to log.
 */
export function error(message: string): void
{
    if (enabled) console.error(`error: ${message}`);
}
