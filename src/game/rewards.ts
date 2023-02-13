/** @file Defines reward constants for reinforcement learning. */

/** Reward for winning the game. */
export const win = 1;
/** Reward for losing the game. */
export const lose = -1;
/** Reward for tying the game. */
export const tie = 0;

/** Max possible reward in a single game. */
export const max = win;
/** Min possible reward in a single game. */
export const min = lose;
