import { Side } from "../../../src/battle/state/Side";

/** Accumulates a reward value for reinforcement learning. */
export class RewardTracker
{
    /** Accumulated reward so far. */
    public get value(): number { return this._reward; }
    private _reward = 0;

    /**
     * Rewards one side of the battle.
     * @param side The team that was rewarded for something.
     * @param reward Value of the reward.
     */
    public apply(side: Side, reward: number): void
    {
        // rewarding one side means punishing the other
        this._reward += reward * (side === "us" ? 1 : -1);
    }

    /** Resets accumulated reward. */
    public reset(): void
    {
        this._reward = 0;
    }
}
