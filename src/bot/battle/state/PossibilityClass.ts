/** Represents a class of possible items. */
export class PossibilityClass
{
    /** Contains the onehot array. */
    private readonly data: boolean[];
    /** Maps value name to its unique 0-based index. */
    private readonly map: {readonly [name: string]: number};
    /** Amount of ones currently in data. */
    private numOnes: number;

    /**
     * Gets the class value and index if narrowed down sufficiently, otherwise
     * null.
     */
    public get definiteValue(): {name: string, id: number} | null
    {
        return this._definiteValue;
    }
    private _definiteValue: {name: string, id: number} | null = null;

    /** Gets all the possible values/indexes that haven't been ruled out. */
    public get possibleValues(): {name: string, id: number}[]
    {
        const result: {name: string, id: number}[] = [];
        for (const name in this.map)
        {
            // istanbul ignore if
            if (!this.map.hasOwnProperty(name)) continue;
            if (this.isSet(name)) result.push({name, id: this.map[name]});
        }
        return result;
    }

    /**
     * Creates a PossibilityClass.
     * @param map Maps value name to its unique 0-based index.
     * @param size Number of indexes.
     */
    constructor(map: {readonly [name: string]: number})
    {
        this.map = map;
        this.data = Array.from({length: Object.keys(map).length}, () => true);
        this.numOnes = this.data.length;
    }

    /** Removes a type from data possibility. */
    public remove(name: string): void
    {
        this.check(name);
        // istanbul ignore else: can't test for else case
        if (this.data[this.map[name]])
        {
            this.data[this.map[name]] = false;
            --this.numOnes;

            // set definiteValue if we've removed all other possibilities
            if (this.numOnes === 1)
            {
                this._definiteValue = this.possibleValues[0];
            }
            else this._definiteValue = null;
        }
    }

    /** Checks if a value is in the data possibility. */
    public isSet(name: string): boolean
    {
        return this.data[this.map[name]];
    }

    /** Rules out all possible types except what's given. */
    public set(values: string | string[]): void
    {
        for (let i = 0; i < this.data.length; ++i) this.data[i] = false;
        this.numOnes = 0;
        this._definiteValue = null;

        let name: string | null = null;
        if (typeof values === "string") name = values;
        else if (values.length === 1) name = values[0];

        if (name !== null)
        {
            // only one value to add
            this.check(name);
            const id = this.map[name];
            this.data[id] = true;

            this.numOnes = 1;
            this._definiteValue = {name, id};
        }
        else if (values.length > 1)
        {
            // multiple values have to be added
            for (const value of values)
            {
                this.check(value);
                this.data[this.map[value]] = true;
            }

            this.numOnes = values.length;
        }
    }

    /** Gets NN data array form. */
    public toArray(): number[]
    {
        if (this.numOnes === 0)
        {
            return Array.from({length: this.data.length}, () => 0);
        }

        const sumReciprocal = 1 / this.numOnes;
        return Array.from({length: this.data.length},
            (v, i) => this.data[i] ? sumReciprocal : 0);
    }

    /**
     * Returns a comma-separated list of each possible value.
     * @override
     */
    public toString(): string
    {
        return this.possibleValues.map(value => value.name).join(", ");
    }

    private check(name: string): void
    {
        if (!this.map.hasOwnProperty(name))
        {
            throw new Error("PossibilityClass has no value name " + name);
        }
    }
}
