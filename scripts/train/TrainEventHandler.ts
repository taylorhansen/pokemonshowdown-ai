import { Logger } from "../../src/Logger";
import { AnyBattleEvent, FaintEvent, TieEvent, TurnEvent, WinEvent } from
    "../../src/psbot/parser/BattleEvent";
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
    private readonly reward = new RewardTracker();

    private turnCallback = function(num: number) {};
    private gameOverCallback = function(winner?: string) {};

    constructor(username: string, logger: Logger) { super(username, logger); }

    /** Sets the callback for when the current turn has ended. */
    public onTurn(callback: (num: number) => void): void
    {
        this.turnCallback = callback;
    }

    /** Sets the callback for when the game is ended. */
    public onGameOver(callback: (winner?: string) => void): void
    {
        this.gameOverCallback = callback;
    }

    /** @override */
    protected handleFaint(event: FaintEvent, events: AnyBattleEvent[],
        i: number)
    {
        this.reward.apply(this.getSide(event.id.owner), Reward.faint);
        return super.handleFaint(event, events, i);
    }

    /** @override */
    protected handleGameOver(event: TieEvent | WinEvent,
        events: readonly AnyBattleEvent[], i: number)
    {
        const result = super.handleGameOver(event, events, i);
        if (this.gameOverCallback)
        {
            let winner: string | undefined;
            if (event.type === "win") winner = event.winner;
            this.gameOverCallback(winner);
        }
        return result;
    }

    /** @override */
    protected handleTurn(event: TurnEvent, events: readonly AnyBattleEvent[],
        i: number)
    {
        this.reward.apply("us", Reward.turn);
        const result = super.handleTurn(event, events, i);
        if (this.turnCallback) this.turnCallback(event.num);
        return result;
    }

    /** Gets the reward value then resets the counter. */
    public getReward(): number
    {
        const r = this.reward.value;
        this.reward.reset();
        return r;
    }
}
