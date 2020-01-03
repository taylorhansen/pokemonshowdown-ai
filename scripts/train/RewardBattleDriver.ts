import { BattleDriver } from "../../src/battle/driver/BattleDriver";
import { Faint, PostTurn } from "../../src/battle/driver/DriverEvent";
import { RewardTracker } from "./RewardTracker";

/** Holds the reward values for different events. */
export enum Reward { faint = -10, turn = -0.1 }

/** BattleDriver that keeps track of reward value */
export class RewardBattleDriver extends BattleDriver
{
    /** Tracks our reward value. */
    private reward = new RewardTracker();

    /** Gets and resets the current reward value. */
    public consumeReward(): number
    {
        const r = this.reward.value;
        this.reward.reset();
        return r;
    }

    /** @override */
    public postTurn(event: PostTurn): void
    {
        this.reward.apply("us", Reward.turn);
        super.postTurn(event);
    }

    /** @override */
    public faint(event: Faint): void
    {
        this.reward.apply(event.monRef, Reward.faint);
        super.faint(event);
    }
}
