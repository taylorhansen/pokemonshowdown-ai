import { FutureMove, futureMoves, numFutureMoves } from "../dex/dex";
import { SelfSwitch } from "../dex/dex-util";

/** Temporary status conditions for a certain team. */
export class TeamStatus
{
    public selfSwitch: SelfSwitch = false;

    /** Starts the Wish move countdown if not already started. */
    public wish(): void
    {
        // after this turn this will be 1
        if (!this.wishDuration) this.wishDuration = 2;
    }
    /** Whether Wish has been used. */
    public get isWishing(): boolean { return this.wishDuration > 0; }
    private wishDuration = 0;

    /** Turns left on each type of future move. */
    public get futureMoveTurns(): {readonly [id in FutureMove]: number}
    {
        return this._futureMoveTurns;
    }
    /** Starts a future move. */
    public startFutureMove(id: FutureMove): void
    {
        // countdown starts at 2 on the next postTurn()
        this._futureMoveTurns[id] = 3;
    }
    /** Ensures that a future move has ended. */
    public endFutureMove(id: FutureMove): void
    {
        if (this._futureMoveTurns[id] > 0)
        {
            throw new Error(`Future move '${id}' not yet completed`);
        }
    }
    private readonly _futureMoveTurns: {[id in FutureMove]: number} =
        (function()
        {
            const result = {...futureMoves};
            for (const id of Object.keys(result) as FutureMove[])
            {
                result[id] = 0;
            }
            return result;
        })();

    /** Spikes layers. Max 3. */
    public spikes = 0;
    /** Stealth rock layers. Max 1. */
    public stealthRock = 0;
    /** Toxic Spikes layers. Max 2. */
    public toxicSpikes = 0;

    /**
     * Called at the end of the turn, before a Choice has been sent to the
     * server.
     */
    public postTurn(): void
    {
        if (this.wishDuration) --this.wishDuration;

        for (const id of Object.keys(this._futureMoveTurns) as FutureMove[])
        {
            if (this._futureMoveTurns[id]) --this._futureMoveTurns[id];
        }
    }

    // istanbul ignore next: only used for logging
    /**
     * Encodes all team status data into a string
     * @returns The TeamStatus in string form.
     */
    public toString(): string
    {
        return `[${([] as string[]).concat(
                this.selfSwitch ? [`selfSwitch: ${this.selfSwitch}`] : [],
                this.isWishing ? ["wishing"] : [],
                Object.entries(this._futureMoveTurns)
                    .filter(([id, turns]) => turns > 0)
                    .map(([id, turns]) => `${id} turns: ${turns}`),
                this.spikes ? [`spikes ${this.spikes}`] : [],
                this.stealthRock ? [`stealth rock ${this.stealthRock}`] : [],
                this.toxicSpikes ? [`toxic spikes ${this.toxicSpikes}`] : [])
            .join(", ")}]`;
    }
}
