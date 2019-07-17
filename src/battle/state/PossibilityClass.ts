/** Represents a set of possible values. */
export class PossibilityClass<TData>
{
    /** Maps value name to data. */
    public readonly map: {readonly [name: string]: TData};
    /** Function to call when fully narrowed. */
    private readonly onSet?:
        (value: {readonly name: string, readonly data: TData}) => void;

    /** The set of possible values this value can be. */
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

    /**
     * Creates a PossibilityClass.
     * @param map Base dictionary object. Should not change during the lifetime
     * of this object.
     * @param onSet Function to call when fully narrowed.
     */
    constructor(map: {readonly [name: string]: TData},
        onSet?: (value: {readonly name: string, readonly data: TData}) => void)
    {
        this.map = map;
        this.onSet = onSet;
        this._possibleValues = new Set(Object.keys(map));
    }

    /** Resets `possibleValues` to when it was first constructed. */
    public reset(): void
    {
        this._possibleValues = new Set(Object.keys(this.map));
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
            if (this.onSet) this.onSet(this._definiteValue);
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
            if (this.onSet) this.onSet(this._definiteValue);
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
}
