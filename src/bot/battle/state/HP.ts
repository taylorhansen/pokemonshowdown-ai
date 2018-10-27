/** Hit points info. */
export class HP
{
    /** Current HP. */
    public get current(): number
    {
        return this._current;
    }
    public set current(hp: number)
    {
        this._current = Math.min(Math.max(0, hp), this._max);
    }

    /** Maximum HP. */
    public set max(max: number)
    {
        this._max = max;
        // re-check bounds
        this.current = this._current;
    }

    /**
     * Whether this is represented as a percentage. If true, `max` is `100` and
     * `current` is the percentage.
     */
    public readonly isPercent: boolean;

    /** Current HP backing field. */
    private _current: number;
    /** Maximum HP backing field. */
    private _max: number;

    /**
     * Creates a full HP object.
     * @param max Maximum HP. If omitted, this is assumed to be a percentage.
     */
    constructor(max?: number)
    {
        if (max !== undefined)
        {
            this._current = max;
            this._max = max;
            this.isPercent = false;
        }
        else
        {
            this._current = 100;
            this._max = 100;
            this.isPercent = true;
        }
    }

    /**
     * Gets the size of the return value of `toArray()`.
     * status.
     * @returns The size of the return value of `toArray()`.
     */
    public static getArraySize(): number
    {
        // current + max
        return 1 + 1;
    }

    /**
     * Formats hp info into an array of numbers.
     * @returns All hp data in array form.
     */
    public toArray(): number[]
    {
        return [this._current, this._max];
    }

    /**
     * Encodes all hp data into a string.
     * @returns The HP in string form.
     */
    public toString(): string
    {
        return `${this._current}/${this._max}${this.isPercent ? "%" : ""}`;
    }
}
