import {pluralTurns} from "./utility";

/** Readonly {@link MultiTempStatus} representation. */
export interface ReadonlyMultiTempStatus<TStatusType extends string> {
    /** Whether this status is currently active and not `"none"`. */
    readonly isActive: boolean;
    /** Current status type. */
    readonly type: TStatusType | "none";
    /** Current number of {@link MultiTempStatus.tick tick} calls. */
    readonly turns: number;
    /** Whether the current status has infinite duration. */
    readonly infinite: boolean;
    /** Stores all the {@link TStatusType} keys for iterating. */
    readonly map: {readonly [T in TStatusType]: unknown};
    /**
     * Max amount of {@link MultiTempStatus.tick tick} calls the status will
     * last. {@link MultiTempStatus.reset reset} should be called in place of
     * the last {@link MultiTempStatus.tick tick} call.
     */
    readonly duration: number;
    /**
     * Whether {@link tick} will call {@link reset} if it hits the
     * {@link duration} limit.
     */
    readonly silent: boolean;

    /** Encodes status data into a log string. */
    readonly toString: () => string;
}

/**
 * TempStatus with different status types.
 *
 * Similar to a set of mutually exclusive TempStatuses.
 *
 * @template TStatusType String union of status types that this object can
 * represent. This excludes the `"none"` type, which is automatically added.
 */
export class MultiTempStatus<TStatusType extends string>
    implements ReadonlyMultiTempStatus<TStatusType>
{
    /** @override */
    public get isActive(): boolean {
        return this._type !== "none";
    }

    /** @override */
    public get type(): TStatusType | "none" {
        return this._type;
    }
    private _type: TStatusType | "none" = "none";

    /** @override */
    public get turns(): number {
        return this._turns;
    }
    private _turns = 0;

    /** @override */
    public get infinite(): boolean {
        return this._infinite;
    }
    private _infinite = false;

    /**
     * Creates a MultiTempStatus.
     *
     * @param map Used to provide type info.
     * @param duration Max amount of {@link tick} calls the status will last.
     * {@link reset} should be called in place of the last {@link tick} call.
     * @param silent Whether {@link tick} will call {@link reset} if it hits the
     * {@link duration} limit.
     */
    public constructor(
        public readonly map: {readonly [T in TStatusType]: unknown},
        public readonly duration: number,
        public readonly silent = false,
    ) {}

    /** Resets status to `"none"`. */
    public reset(): void {
        this._type = "none";
        this._turns = 0;
        this._infinite = false;
    }

    /** Starts (or restarts) a status. */
    public start(type: TStatusType, infinite = false): void {
        this._type = type;
        this._turns = 0;
        this._infinite = infinite;
    }

    /** Indicates that the status lasted another turn. */
    public tick(): void {
        // No need to increment turns if it's none.
        if (this._type === "none") {
            return;
        }
        ++this._turns;

        // Went over duration.
        if (this._infinite) {
            return;
        }
        if (this._turns < this.duration) {
            return;
        }
        // Should've reset() on last tick() unless silent.
        if (this.silent) {
            return this.reset();
        }
        throw new Error(
            `Status '${this._type}' went longer than expected ` +
                `(duration=${this.duration}, turns=${this._turns})`,
        );
    }

    // istanbul ignore next: Only used in logging.
    /** @override */
    public toString(): string {
        if (this._type === "none") {
            return this._type;
        }
        return pluralTurns(
            this._type,
            this._turns,
            this._infinite ? null : this.duration,
        );
    }
}
