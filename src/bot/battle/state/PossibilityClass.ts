/** Represents a class of possible items. */
export class PossibilityClass
{
    /** Contains the onehot array. */
    private readonly data: boolean[];
    /** Maps value name to its unique 0-based index. */
    private readonly map: {readonly [name: string]: number};

    /** Gets all the possible values. */
    public get possibleValues(): string[]
    {
        const result: string[] = [];
        for (const name in this.map)
        {
            // istanbul ignore if
            if (!this.map.hasOwnProperty(name)) continue;
            if (this.isSet(name)) result.push(name);
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
    }

    /** Removes a type from data possibility. */
    public remove(name: string): void
    {
        this.check(name);
        this.data[this.map[name]] = false;
    }

    /** Checks if a value is in the data possibility. */
    public isSet(name: string): boolean
    {
        return this.data[this.map[name]];
    }

    /** Rules out all possible types except this one */
    public set(name: string): void
    {
        this.check(name);
        for (let i = 0; i < this.data.length; ++i) this.data[i] = false;
        this.data[this.map[name]] = true;
    }

    /** Gets NN data array form. */
    public toArray(): number[]
    {
        // sum up all the trues so that each value in the return value array
        //  adds up to 1.0 probability
        const sum = this.data.reduce<number>(
                (a, b) => (a ? 1 : 0) + (b ? 1 : 0), 0);
        if (sum === 0) return Array.from({length: this.data.length}, () => 0);

        const sumReciprocal = 1 / sum;
        return Array.from({length: this.data.length},
            (v, i) => this.data[i] ? sumReciprocal : 0);
    }

    private check(name: string): void
    {
        if (!this.map.hasOwnProperty(name))
        {
            throw new Error("PossibilityClass has no value name " + name);
        }
    }
}
