/** @file Utilities for random number generation. */
import {PRNGSeed} from "@pkmn/sim";
import seedrandom from "seedrandom";
import {hash} from "./hash";

/**
 * Function type that produces random strings to be used as seeds for multiple
 * {@link Rng}s.
 */
export type Seeder = () => string;

/**
 * Creates a {@link Seeder} function that produces random strings to be used as
 * seeds for multiple {@link Rng}s.
 */
export const seeder = (seed: string): Seeder =>
    (function () {
        let i = 0;
        return () => hash(seed + String(i++));
    })();

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

/** Same as `PRNG.generateSeed()` from `@pkmn/sim` but with controled random. */
export const generatePsPrngSeed = (random: Rng = Math.random): PRNGSeed =>
    // 64-bit big-endian [high -> low] integer, where each element is 16 bits.
    Array.from({length: 4}, () => Math.floor(random() * 0x10000)) as PRNGSeed;
