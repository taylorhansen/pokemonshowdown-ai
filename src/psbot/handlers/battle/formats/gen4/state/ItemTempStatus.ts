import {ItemData} from "../dex";
import {Pokemon} from "./Pokemon";
import {PossibilityClass, ReadonlyPossibilityClass} from "./PossibilityClass";
import {pluralTurns} from "./utility";

/** Readonly {@link ItemTempStatus} representation. */
export interface ReadonlyItemTempStatus<TStatusType extends string> {
    /** Whether a status is active. */
    readonly isActive: boolean;
    /** Current status type. */
    readonly type: TStatusType | "none";
    /** The item of the pokemon that caused the status if there is one. */
    readonly source: ReadonlyPossibilityClass<string, ItemData> | null;
    /** Current number of {@link ItemTempStatus.tick tick} calls. */
    readonly turns: number;
    /**
     * The amount of {@link ItemTempStatus.tick tick} calls this status will
     * last, or `null` if unlimited.
     */
    readonly duration: number | null;
    /** Normal (index `0`) and extended (index `1`) turn durations. */
    readonly durations: readonly [number, number];
    /** Dictionary from which to lookup the extension item for each status. */
    readonly items: {readonly [T in TStatusType]: string};
}

/**
 * TempStatus whose duration can be extended by a held item.
 *
 * @template TStatusType String union of status types that this object can
 * represent. This excludes the `"none"` type, which is automatically added.
 */
export class ItemTempStatus<TStatusType extends string>
    implements ReadonlyItemTempStatus<TStatusType>
{
    // All fields are initialized on #reset() in the constructor.

    /** @override */
    public get isActive(): boolean {
        return this._type !== "none";
    }
    /** @override */
    public get type(): TStatusType | "none" {
        return this._type;
    }
    private _type!: TStatusType | "none";
    // TODO: Should the getter make this a readonly structure?
    /** @override */
    public get source(): PossibilityClass<string, ItemData> | null {
        return this._source;
    }
    private _source!: PossibilityClass<string, ItemData> | null;

    /** @override */
    public get turns(): number {
        return this._turns;
    }
    private _turns!: number;

    /** @override */
    public get duration(): number | null {
        return this._duration;
    }
    private _duration!: number | null;

    /**
     * Creates an ItemTempStatus.
     *
     * @param durations Normal (index 0) and extended (index 1) turn durations.
     * @param items Dictionary from which to lookup the extension item.
     * @param defaultStatus Default status to start if omitted from `#start()`.
     * Default `"none"`. Should be provided if there's only one type of status.
     */
    public constructor(
        public readonly durations: readonly [number, number],
        public readonly items: {readonly [T in TStatusType]: string},
        private readonly defaultStatus: TStatusType | "none" = "none",
    ) {
        this.reset();
    }

    /** Resets status to `"none"`. */
    public reset(): void {
        this._type = "none";
        this._source = null;
        this._duration = null;
        this._turns = 0;
    }

    /**
     * Starts a status.
     *
     * @param source Pokemon that caused the status to start. The actual
     * {@link source} property will be set to the Pokemon's current item
     * {@link PossibilityClass} if needed to determine the duration.
     * @param type Type of status. Leave blank to assume the default one. This
     * doesn't apply if this object has only one type of status.
     * @param infinite Whether this status is infinite.
     */
    public start(
        source: Pokemon | null = null,
        type: TStatusType | "none" = this.defaultStatus,
        infinite = false,
    ): void {
        if (type === "none") {
            this.reset();
            return;
        }

        this._type = type;
        this._source = null;
        this._turns = 0;

        if (infinite) this._duration = null;
        // Initially infer short duration.
        else [this._duration] = this.durations;

        // Everything's all set, no need to handle source item possibilities.
        if (!source || infinite) return;

        // Should currently be possible to have extension item.
        if (!source.item.isSet(this.items[this._type])) return;

        // Duration is certain once the item is known.
        this._source = source.item;
        this._source.onNarrow(key => {
            // Start was called again with a different source before this
            // callback fired, so the old source item is no longer relevant.
            // TODO: Instead cancel callback when this happens?
            if (this._source !== source.item) return;

            // Confirmed extension item.
            if (this._type !== "none" && this.items[this._type] === key) {
                [, this._duration] = this.durations;
            }
        });
    }

    /** Indicates that the status lasted another turn. */
    public tick(): void {
        // No need to check turns if it's none.
        if (this._type === "none") return;
        ++this._turns;
        // Went over duration.
        if (this._duration === null || this._turns < this._duration) return;

        // Should've reset() on last tick(), infer extension item if using the
        // short duration.
        if (this._duration === this.durations[0]) {
            // Currently using short duration, so the source must've had the
            // extension item all along.
            if (this._source?.isSet(this.items[this._type])) {
                this._source.narrow(this.items[this._type]);
                [, this._duration] = this.durations;
                return;
            }
            // Went over short duration without item, should never happen.
        }
        // Went over long duration, should never happen.

        throw new Error(
            `Status '${this._type}' went longer than expected ` +
                `(duration=${this._duration}, turns=${this._turns})`,
        );
    }

    // istanbul ignore next: Only used for logging.
    /** Encodes status data into a log string. */
    public toString(): string {
        if (this._type === "none") return "inactive";
        return pluralTurns(this._type, this._turns, this._duration);
    }
}
