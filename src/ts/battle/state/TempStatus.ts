import {pluralTurns} from "./utility";

/** Readonly {@link TempStatus} representation. */
export interface ReadonlyTempStatus {
    /** Name of the status. */
    readonly name: string;
    /** Whether the status is currently active. */
    readonly isActive: boolean;
    /** Current number of `#tick()`s. */
    readonly turns: number;
    /**
     * Max amount of {@link TempStatus.tick tick} calls the status will last.
     * {@link TempStatus.end end} should be called in place of the last
     * {@link TempStatus.tick tick} call.
     */
    readonly duration: number;
    /**
     * Whether {@link tick} will call {@link reset} if it hits the
     * {@link duration} limit.
     */
    readonly silent: boolean;

    /** Encodes all temp status data into a string. */
    readonly toString: () => string;
}

/** Counts turns for a temporary status condition. */
export class TempStatus implements ReadonlyTempStatus {
    /** @override */
    public get isActive(): boolean {
        return this._isActive;
    }
    private _isActive = false;

    /** @override */
    public get turns(): number {
        return this._turns;
    }
    private _turns = 0;

    /**
     * Creates a TempStatus.
     *
     * @param name Name of the status.
     * @param duration Max amount of {@link tick} calls the status will last.
     * {@link end} should be called in place of the last {@link tick} call.
     * @param silent Whether {@link tick} will call {@link end} if it hits the
     * {@link duration} limit.
     */
    public constructor(
        public readonly name: string,
        public readonly duration: number,
        public readonly silent = false,
    ) {}

    /**
     * Starts the status' turn counter, restarting by default if not already
     * active.
     *
     * @param noRestart Whether the status should not be restarted if called
     * while still active. Default false.
     */
    public start(noRestart?: boolean): void {
        if (noRestart && this._isActive) {
            return;
        }
        this._isActive = true;
        this._turns = 0;
    }

    /**
     * Increments turn counter if active.
     *
     * If {@link silent} is true, this will also call {@link end} if the
     * {@link duration} was was reached, rather than throwing an error on the
     * next call.
     *
     * @throws Error if {@link silent} is false and the {@link duration} was
     * reached without instead calling {@link end}.
     */
    public tick(): void {
        // Inapplicable.
        if (!this._isActive) {
            return;
        }
        ++this._turns;
        // Still under duration.
        if (this._turns < this.duration) {
            return;
        }
        // Should've called end() on last tick() unless silent.
        if (this.silent) {
            this.end();
            return;
        }
        throw new Error(
            `TempStatus '${this.name}' lasted longer than expected ` +
                `(${pluralTurns(this._turns, this.duration)})`,
        );
    }

    /** Ends this status. */
    public end(): void {
        this._isActive = false;
        this._turns = 0;
    }

    // istanbul ignore next: Only used in logging.
    /** @override */
    public toString(): string {
        return pluralTurns(this.name, this._turns, this.duration);
    }
}
