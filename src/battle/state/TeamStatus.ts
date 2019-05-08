import { FutureMove, futureMoves, numFutureMoves } from "../dex/dex";
import { SelfSwitch } from "../dex/dex-types";

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

    /** Spikes layers. */
    public spikes = 0;
    /** Stealth rock layers. */
    public stealthRock = 0;
    /** Toxic Spikes layers. */
    public toxicSpikes = 0;

    /**
     * Called at the end of the turn, after a Choice has been sent to the
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

    /**
     * Gets the size of the return value of `toArray()`.
     * @returns The size of the return value of `toArray()`.
     */
    public static getArraySize(): number
    {
        return /*selfSwitch*/ 2 + /*wish*/ 1 + /*future moves*/numFutureMoves +
            /*entry hazards*/ 3;
    }

    // istanbul ignore next: unstable, hard to test
    /**
     * Formats team status info into an array of numbers.
     * @returns All team status data in array form.
     */
    public toArray(): number[]
    {
        const result =
        [
            this.selfSwitch ? 1 : 0, this.selfSwitch === "copyvolatile" ? 1 : 0,
            this.wishDuration ? 1 : 0, ...Object.values(this._futureMoveTurns),
            this.spikes, this.stealthRock, this.toxicSpikes
        ];
        return result;
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
                this.wishDuration ? ["wishing"] : [],
                Object.entries(this._futureMoveTurns)
                    .filter(([id, turns]) => turns > 0)
                    .map(([id, turns]) => `${id} turns: ${turns}`),
                this.spikes ? [`spikes ${this.spikes}`] : [],
                this.stealthRock ? [`stealth rock ${this.stealthRock}`] : [],
                this.toxicSpikes ? [`toxic spikes ${this.toxicSpikes}`] : [])
            .join(", ")}]`;
    }
}
