/** Represents a set of possible values. */
export class PossibilityClass<TData>
{
    /** Maps value name to data. */
    public readonly map: {readonly [name: string]: TData};

    /** The set of possible values this object can be. */
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
     */
    constructor(map: {readonly [name: string]: TData})
    {
        this.map = map;
        this._possibleValues = new Set(Object.keys(map));
    }

    /** Adds a listener for when this object gets fully narrowed. */
    public onNarrow(f: (pc: this) => void): void
    {
        this.narrowListeners.push(f);
    }

    /** Removes a type from data possibility. */
    public remove(name: string): void
    {
        if (!this._possibleValues.delete(this.check(name))) return;

        const size = this._possibleValues.size;
        if (size === 1)
        {
            const value = this._possibleValues.values().next().value;
            this._definiteValue = {name: value, data: this.map[name]};
            this.narrowed();
        }
        else if (size < 1)
        {
            throw new Error("All possibilities have been ruled out");
        }
    }

    /** Checks if a value is in the data possibility. */
    public isSet(name: string): boolean
    {
        return this._possibleValues.has(name);
    }

    /** Removes currently set value names that are not in the given array. */
    public narrow(...values: readonly string[]): void
    {
        values.forEach(x => this.check(x));

        // intersect the current set with the given one
        const newValues = [...this._possibleValues]
            .filter(x => values.includes(x));
        this._possibleValues = new Set(newValues);

        if (newValues.length === 1)
        {
            // new definite value
            const name = newValues[0];
            this._definiteValue = {name, data: this.map[name]};
            this.narrowed();
        }
        else if (newValues.length < 1)
        {
            throw new Error("All possibilities have been ruled out");
        }
    }

    /**
     * Returns a comma-separated list of each possible value.
     * @override
     */
    public toString(): string
    {
        return [...this._possibleValues].join(", ");
    }

    /** Checks that a given name is part of this object's map. */
    private check(name: string): string
    {
        if (!this.map.hasOwnProperty(name))
        {
            throw new Error("PossibilityClass has no value name " + name);
        }
        return name;
    }

    /** Calls all `#onNarrow()` listeners. */
    private narrowed(): void { for (const f of this.narrowListeners) f(this); }
}
