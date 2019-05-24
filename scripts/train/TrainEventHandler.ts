import { BattleState } from "../../src/battle/state/BattleState";
import { Logger } from "../../src/Logger";
import { PSEventHandler } from "../../src/psbot/PSEventHandler";
import { RewardTracker } from "./RewardTracker";

/** Holds the reward values for different events. */
enum Reward { faint = -10, turn = -0.1 }

/**
 * Event handler for a PokemonShowdown sim, modified for reinforcement
 * learning.
 */
export class TrainEventHandler extends PSEventHandler
{
    /** Tracks the current reward value. */
    private reward = new RewardTracker();

    constructor(username: string, state: BattleState, logger: Logger)
    {
        super(username, state, logger);

        this.listener.on("faint", event =>
            this.reward.apply(this.getSide(event.id.owner), Reward.faint));
        this.listener.on("turn", () => this.reward.apply("us", Reward.turn));
    }

    /** Gets the reward value then resets the counter. */
    public getReward(): number
    {
        const r = this.reward.value;
        this.reward.reset();
        return r;
    }
}
