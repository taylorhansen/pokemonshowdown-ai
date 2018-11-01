/** Hit points info. */
export class HP
{
    /** Current HP. */
    public get current(): number
    {
        return this._current;
    }

    /** Maximum HP. */
    public get max(): number
    {
        return this._max;
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
     * @param isPercent Whether this HP is to be reported as a percentage.
     */
    constructor(isPercent: boolean)
    {
        this.isPercent = isPercent;
        this._current = 0;
        this._max = 0;
    }

    /**
     * Sets the HP.
     * @param current Current HP.
     * @param max Maximum HP.
     */
    public set(current: number, max: number): void
    {
        this._max = max;
        this._current = Math.min(Math.max(0, current), this._max);
    }

    /**
     * Gets the size of the return value of `toArray()`.
     * status.
     * @returns The size of the return value of `toArray()`.
     */
    public static getArraySize(): number
    {
        return /*current*/1 + /*max*/1;
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
