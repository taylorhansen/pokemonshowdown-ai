import {hash} from "../hash";

/**
 * Function type that produces random strings to be used as seeds for multiple
 * random number generators.
 */
export type Seeder = () => string;

/**
 * Creates a {@link Seeder} function that produces random strings to be used as
 * seeds for multiple random number generators.
 */
export const seeder = (seed: string): Seeder =>
    (function () {
        let i = 0;
        return () => hash(seed + String(i++));
    })();
