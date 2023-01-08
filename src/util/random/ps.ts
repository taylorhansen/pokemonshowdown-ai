/** @file Utilities for random number generation. */
import {PRNGSeed} from "@pkmn/sim";
import {Rng} from "./rng";

/** Same as `PRNG.generateSeed()` from `@pkmn/sim` but with controled random. */
export const generatePsPrngSeed = (random: Rng = Math.random): PRNGSeed =>
    // 64-bit big-endian [high -> low] integer, where each element is 16 bits.
    Array.from({length: 4}, () => Math.floor(random() * 0x10000)) as PRNGSeed;
