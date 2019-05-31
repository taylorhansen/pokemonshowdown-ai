/** Hit points info. */
export class HP
{
    /** Current HP. */
    public get current(): number { return this._current; }
    private _current: number;

    /** Maximum HP. */
    public get max(): number { return this._max; }
    private _max: number;

    /**
     * Whether this is represented as a percentage. If true, `max` is `100` and
     * `current` is the percentage.
     */
    public readonly isPercent: boolean;

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
     * Encodes all hp data into a string.
     * @returns The HP in string form.
     */
    public toString(): string
    {
        return `${this._current}/${this._max}${this.isPercent ? "%" : ""}`;
    }
}
