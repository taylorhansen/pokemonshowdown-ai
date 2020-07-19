import { AnyDriverEvent } from "../../../battle/driver/DriverEvent";
import { StateDriver } from "../../../battle/driver/StateDriver";
import { RewardTracker } from "./RewardTracker";

/** Holds the reward values for different events. */
export enum Reward { faint = -10, turn = -0.1, win = 100, tie = -50 }

/** BattleDriver that keeps track of reward value */
export class RewardStateDriver extends StateDriver
{
    /** Tracks our reward value. */
    private reward = new RewardTracker();

    /** @override */
    public handle(...events: AnyDriverEvent[]): void
    {
        for (const event of events)
        {
            switch (event.type)
            {
                // TODO: manage this with callbacks/DriverContext listener?
                case "postTurn":
                    this.reward.apply("us", Reward.turn);
                    break;
                case "faint":
                    this.reward.apply(event.monRef, Reward.faint);
                    break;
                case "gameOver":
                    if (!event.winner) this.reward.apply("us", Reward.tie);
                    else this.reward.apply(event.winner, Reward.win);
                    break;
            }
        }
        super.handle(...events);
    }

    /** Gets and resets the current reward value. */
    public consumeReward(): number
    {
        const r = this.reward.value;
        this.reward.reset();
        return r;
    }
}
