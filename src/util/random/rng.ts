import seedrandom from "seedrandom";

/**
 * Function type for random number generators. Should produce numbers between 0
 * and 1 like `Math.random()`.
 */
export type Rng = () => number;

/**
 * Creates an {@link Rng} function which produces random numbers from a string
 * seed.
 */
export const rng = (seed?: string): Rng => seedrandom.alea(seed);
