import { Faint, GameOver, PostTurn } from "../../../battle/driver/DriverEvent";
import { StateDriver } from "../../../battle/driver/StateDriver";
import { RewardTracker } from "./RewardTracker";

/** Holds the reward values for different events. */
export enum Reward { faint = -10, turn = -0.1, win = 100, tie = -50 }

/** BattleDriver that keeps track of reward value */
export class RewardStateDriver extends StateDriver
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

    /** @override */
    public gameOver(event: GameOver): void
    {
        if (event.winner) this.reward.apply(event.winner, Reward.win);
        else this.reward.apply("us", Reward.tie);
        super.gameOver(event);
    }
}
