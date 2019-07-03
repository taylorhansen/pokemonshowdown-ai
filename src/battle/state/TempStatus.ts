import { pluralTurns } from "./utility";

/** Counts turns for a temporary status condition. */
export class TempStatus
{
    /** Whether the status is currently active. */
    public get isActive(): boolean { return this._turns > 0; }
    /**
     * The amount of turns this status has been active, including the current
     * turn.
     */
    public get turns(): number { return this._turns; }
    private _turns = 0;

    /**
     * Creates a TempStatus.
     * @param name Name of the status.
     * @param duration Max amount of `#tick()`s the status will last. After the
     * last tick, `#end()` should be called.
     * @param silent Default false. Indicates whether the status can or should
     * end silently once its duration is reached on the last `#tick()` call.
     */
    constructor(public readonly name: string, public readonly duration: number,
        public readonly silent = false)
    {
    }

    /**
     * Starts the status' turn counter. If not already active.
     * @param restart Default true. Whether the status should be restarted if
     * called while active.
     */
    public start(restart = true): void
    {
        if (restart || !this.isActive) this._turns = 1;
    }

    /**
     * Increments turn counter if active. If the `silent` field is true, this
     * will automatically call `#end()` if the duration was reached, rather
     * than throwing an error on the next call.
     */
    public tick(): void
    {
        if (!this.isActive) return;

        if (!this.silent)
        {
            if (this._turns > this.duration)
            {

                throw new Error(
                    `TempStatus '${this.name}' lasted longer than expected (` +
                    `${pluralTurns(this._turns, this.duration)})`);
            }
        }
        else if (this._turns + 1 > this.duration)
        {
            this.end();
            return;
        }

        ++this._turns;
    }

    /** Ends this status. */
    public end(): void { this._turns = 0; }

    /**
     * Copies turn data over to another TempStatus object, as long as the names
     * and durations match.
     * @override
     */
    public copyTo(ts: this): void
    {
        if (this.name !== ts.name || this.duration !== ts.duration)
        {
            throw new Error(`TempStatus '${this.name}' of duration ` +
                `${this.duration} can't be copied to TempStatus '${ts.name}' ` +
                `of duration ${ts.duration}`);
        }

        ts._turns = this._turns;
    }

    // istanbul ignore next: only used in logging
    /** Stringifies this TempStatus. */
    public toString(): string
    {
        return pluralTurns(this.name, this._turns - 1, this.duration);
    }
}
