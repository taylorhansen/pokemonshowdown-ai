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
     * @param duration Max amount of turns the status can last.
     */
    constructor(public readonly name: string, public readonly duration: number)
    {
    }

    /** Starts the status. */
    public start(): void { this._turns = 1; }

    /** Increments turn counter if active. */
    public tick(): void
    {
        if (!this.isActive) return;

        if (this.duration && this._turns > this.duration)
        {
            throw new Error("TurnCounter status lasted longer than expected (" +
                `${pluralTurns(this._turns, this.duration)})`);
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
