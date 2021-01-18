/** Readonly PossibilityClass representation. */
export interface ReadonlyPossibilityClass<TKey extends string, TData = any>
{
    /** Maps value name to data. */
    readonly map: {readonly [K in TKey]: TData};
    /** The set of possible values this object can be. */
    readonly possibleValues: ReadonlySet<TKey>;
    /** Gets the class name if narrowed down sufficiently, otherwise null. */
    readonly definiteValue: TKey | null;

    /**
     * Adds a listener for when this object gets fully narrowed. The provided
     * function can be immediately called if this PossibilityClass is already
     * narrowed.
     */
    then(f: (key: TKey, data: TData) => void): this;

    /** Checks if a value is in the data possibility. */
    isSet(name: TKey): boolean;
}

/**
 * Represents a set of possible values. This can be used in place of the actual
 * value when the actual value can be one of many possible values.
 */
export class PossibilityClass<TKey extends string, TData = any> implements
    ReadonlyPossibilityClass<TKey, TData>
{
    /** @override */
    public readonly map: {readonly [T in TKey]: TData};

    /** @override */
    public get possibleValues(): ReadonlySet<TKey>
    {
        return this._possibleValues;
    }
    private _possibleValues: Set<TKey>;

    /**
     * Gets the class name and data if narrowed down sufficiently, otherwise
     * null.
     */
    public get definiteValue(): TKey | null { return this._definiteValue; }
    private _definiteValue: TKey | null = null;

    /** `#then()` listeners. */
    private readonly listeners: ((key: TKey, data: TData) => void)[] = [];

    /**
     * Creates a PossibilityClass.
     * @param map Base dictionary object. Should not change during the lifetime
     * of this object.
     * @param values Optional values to immediately narrow to. Defaults to all
     * possible values
     */
    constructor(map: {readonly [T in TKey]: TData}, ...values: string[])
    {
        this.map = map;

        if (values.length <= 0)
        {
            this._possibleValues = new Set(Object.keys(map) as TKey[]);
        }
        else
        {
            values.forEach(v => this.check(v));
            this._possibleValues = new Set(values as TKey[]);
        }

        this.checkNarrowed();
    }

    /**
     * Adds a listener for when this object gets fully narrowed. The provided
     * function can be immediately called if this PossibilityClass is already
     * narrowed.
     */
    public then(f: (key: TKey, data: TData) => void): this
    {
        this.listeners.push(f);
        this.checkNarrowed();
        return this;
    }

    /** @override */
    public isSet(name: TKey): boolean
    {
        return this._possibleValues.has(name);
    }

    /** Removes values from the data possibility. */
    public remove(...values: string[]): void
    {
        // guard against overnarrowing
        let amtToRemove = 0;
        for (const value of values)
        {
            this.check(value);
            if (this._possibleValues.has(value)) ++amtToRemove;
        }
        if (amtToRemove >= this._possibleValues.size)
        {
            throw new Error(`Tried to remove ${amtToRemove} possibilities ` +
                `when there were ${this._possibleValues.size} left`);
        }

        for (const value of values) this._possibleValues.delete(value as TKey);

        this.checkNarrowed();
    }

    /** Removes currently set value names that are not in the given array. */
    public narrow(...values: string[]): void
    {
        for (const value of values) this.check(value);

        // intersect the current set with the given one
        const newValues = [...this._possibleValues]
            .filter(x => values.includes(x));

        // guard against overnarrowing
        if (newValues.length < 1)
        {
            throw new Error(`Rejected narrow with [${values.join(", ")}] as ` +
                "it would overnarrow " +
                `{${[...this._possibleValues].join(", ")}}`);
        }

        this._possibleValues = new Set(newValues);
        this.checkNarrowed();
    }

    /** Checks that a given name is part of this object's map. */
    private check(name: string): asserts name is TKey
    {
        if (!this.map.hasOwnProperty(name))
        {
            throw new Error(`PossibilityClass has no value name '${name}'`);
        }
    }

    /**
     * Handles setting `#definiteValue` and calling narrow listeners whenever
     * the base `#possibleValues` set changes.
     */
    private checkNarrowed(): void
    {
        const size = this._possibleValues.size;
        if (size === 1)
        {
            if (!this._definiteValue)
            {
                this._definiteValue =
                    this._possibleValues.values().next().value;
            }
            this.narrowed();
        }
        else if (size < 1)
        {
            throw new Error("All possibilities have been ruled out (should " +
                "never happen)");
        }
        else this._definiteValue = null;
    }

    /** Calls all `#then()` listeners. */
    private narrowed(): void
    {
        if (!this._definiteValue) return;

        const data = this.map[this._definiteValue];
        while (this.listeners.length > 0)
        {
            this.listeners.shift()!(this._definiteValue, data);
        }
    }

    // istanbul ignore next: only used for logging
    /**
     * Returns a comma-separated list of each possible value.
     * @override
     */
    public toString(): string
    {
        return [...this._possibleValues].join(", ");
    }
}
