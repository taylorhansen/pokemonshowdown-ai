import {MajorStatus} from "../dex";
import {pluralTurns} from "./utility";

/** Readonly {@link MajorStatusCounter} representation. */
export interface ReadonlyMajorStatusCounter {
    /** Current status, or `null` if none. */
    readonly current: MajorStatus | null;
    /** Amount of turns this status has been active (if applicable). */
    readonly turns: number;
    /** Max amount of turns this status can be active, or `null` if unknown. */
    readonly duration: number | null;

    /** Stringifies the status, with turn info if applicable. */
    readonly toString: () => string;
}

/** Mutually-exclusive turn-counter manager for major status conditions. */
export class MajorStatusCounter implements ReadonlyMajorStatusCounter {
    /** @override */
    public get current(): MajorStatus | null {
        return this._current;
    }
    private _current: MajorStatus | null = null;

    /** @override */
    public get turns(): number {
        return this._turns;
    }
    private _turns = 0;

    /** @override */
    public get duration(): number | null {
        return this._duration;
    }
    private _duration: number | null = null;

    /**
     * Afflicts a new major status.
     *
     * @param status Status to afflict.
     */
    public afflict(status: MajorStatus): void {
        this._current = status;
        this._turns = 1;
        this._duration = status === "slp" ? 4 : null;
    }

    /** Increments the turn counter if active. */
    public tick(): void {
        if (!this._current) {
            return;
        }

        if (this._duration && this._turns > this._duration) {
            throw new Error(
                `MajorStatus '${this._current}' lasted longer than expected ` +
                    `(${pluralTurns(this._turns - 1, this._duration)})`,
            );
        }

        ++this._turns;
    }

    /** End of turn updates for certain statuses. */
    public postTurn(): void {
        // Note: Only slp and tox care about the turn counter, but slp updates
        // explicitly via game events.
        if (this._current === "tox") {
            this.tick();
        }
    }

    /** Resets the current turn counter. */
    public resetCounter(): void {
        if (this._current) {
            this._turns = 1;
        }
    }

    /** Cures this status. */
    public cure(): void {
        this._current = null;
        this._turns = 0;
        this._duration = null;
    }

    // istanbul ignore next: Only used for logging.
    /** @override */
    public toString(): string {
        const s = this._current;
        // Note: Only slp and tox care about the turn counter.
        if (s === "slp" || s === "tox") {
            return `${s} (${pluralTurns(this._turns - 1, this._duration)})`;
        }
        return s ?? "none";
    }
}
