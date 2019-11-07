/** Readonly PossibilityClass representation. */
export interface ReadonlyPossibilityClass<TData>
{
    /** Maps value name to data. */
    readonly map: {readonly [name: string]: TData};
    /** The set of possible values this object can be. */
    readonly possibleValues: ReadonlySet<string>;
    /**
     * Gets the class name and data if narrowed down sufficiently, otherwise
     * null.
     */
    readonly definiteValue:
        {readonly name: string, readonly data: TData} | null;

    /** Checks if a value is in the data possibility. */
    isSet(name: string): boolean;
}

/** Represents a set of possible values. */
export class PossibilityClass<TData> implements ReadonlyPossibilityClass<TData>
{
    /** @override */
    public readonly map: {readonly [name: string]: TData};

    /** @override */
    public get possibleValues(): ReadonlySet<string>
    {
        return this._possibleValues;
    }
    private _possibleValues: Set<string>;

    /**
     * Gets the class name and data if narrowed down sufficiently, otherwise
     * null.
     */
    public get definiteValue():
        {readonly name: string, readonly data: TData} | null
    {
        return this._definiteValue;
    }
    private _definiteValue:
        {readonly name: string, readonly data: TData} | null = null;

    /** Listeners for when fully narrowed. */
    private narrowListeners: ((pc: this) => void)[] = [];

    /**
     * Creates a PossibilityClass.
     * @param map Base dictionary object. Should not change during the lifetime
     * of this object.
     * @param values Optional values to immediately narrow to. Defaults to all
     * possible values
     */
    constructor(map: {readonly [name: string]: TData}, ...values: string[])
    {
        this.map = map;

        if (values.length <= 0)
        {
            this._possibleValues = new Set(Object.keys(map));
        }
        else this._possibleValues = new Set(values.map(v => this.check(v)));

        this.checkNarrowed();
    }

    /** @override */
    public isSet(name: string): boolean
    {
        return this._possibleValues.has(name);
    }

    /**
     * Adds a listener for when this object gets fully narrowed. The provided
     * function can be immediately called if this PossibilityClass is already
     * narrowed.
     */
    public onNarrow(f: (pc: this) => void): void
    {
        // may already be narrowed
        if (this._definiteValue) f(this);
        else this.narrowListeners.push(f);
    }

    /** Removes values from the data possibility. */
    public remove(...values: string[]): void
    {
        for (const value of values)
        {
            this._possibleValues.delete(this.check(value));
        }

        this.checkNarrowed();
    }

    /** Removes currently set value names that are not in the given array. */
    public narrow(...values: string[]): void
    {
        values.forEach(x => this.check(x));

        // intersect the current set with the given one
        const newValues = [...this._possibleValues]
            .filter(x => values.includes(x));
        this._possibleValues = new Set(newValues);

        this.checkNarrowed();
    }

    /** Checks that a given name is part of this object's map. */
    private check(name: string): string
    {
        if (!this.map.hasOwnProperty(name))
        {
            throw new Error(`PossibilityClass has no value name '${name}'`);
        }
        return name;
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
            const value = this._possibleValues.values().next().value;
            this._definiteValue = {name: value, data: this.map[value]};
            this.narrowed();
        }
        else if (size < 1)
        {
            throw new Error("All possibilities have been ruled out");
        }
        else this._definiteValue = null;
    }

    /** Calls all `#onNarrow()` listeners. */
    private narrowed(): void { for (const f of this.narrowListeners) f(this); }

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
