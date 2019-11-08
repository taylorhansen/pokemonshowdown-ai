import { BattleState } from "../../src/battle/state/BattleState";
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
    private reward = new RewardTracker();
    private turnCallback = function(num: number) {};
    private gameOverCallback = function(winner?: string) {};

    constructor(username: string, state: BattleState, logger: Logger)
    {
        super(username, state, logger);
    }

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
        i: number): void
    {
        this.reward.apply(this.getSide(event.id.owner), Reward.faint);
        super.handleFaint(event, events, i);
    }

    /** @override */
    protected handleGameOver(event: TieEvent | WinEvent,
        events: readonly AnyBattleEvent[], i: number): void
    {
        super.handleGameOver(event, events, i);
        if (this.gameOverCallback)
        {
            let winner: string | undefined;
            if (event.type === "win") winner = event.winner;
            this.gameOverCallback(winner);
        }
    }

    /** @override */
    protected handleTurn(event: TurnEvent, events: readonly AnyBattleEvent[],
        i: number): void
    {
        this.reward.apply("us", Reward.turn);
        super.handleTurn(event, events, i);
        if (this.turnCallback) this.turnCallback(event.num);
    }

    /** Gets the reward value then resets the counter. */
    public getReward(): number
    {
        const r = this.reward.value;
        this.reward.reset();
        return r;
    }
}
