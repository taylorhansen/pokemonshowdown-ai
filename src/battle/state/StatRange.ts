/** Represents a range of stat values from a base stat. */
export class StatRange
{
    /** Minimum possible stat value. */
    public get min(): number | null { return this._min; }
    private _min: number | null = null;

    /** Maximum possible stat value. */
    public get max(): number | null { return this._max; }
    private _max: number | null = null;

    /** Base stat value used to calculate `#min` and `#max`. */
    public get base(): number | null { return this._base; }
    private _base: number | null = null;

    // TODO: nature, ev, and iv possibilities

    /**
     * Creates a StatRange.
     * @param hp Whether this is an HP stat. Stat calculations are different
     * for this stat.
     */
    constructor(public readonly hp = false)
    {
    }

    /**
     * Initializes and calculates min and max values.
     * @param base Base stat.
     * @param level Pokemon's level.
     */
    public calc(base: number, level: number): void
    {
        this._base = base;
        // calc min and max stats
        this._min = StatRange.calcStat(this.hp, base, level, 0, 0, 0.9);
        this._max = StatRange.calcStat(this.hp, base, level, 252, 31, 1.1);
    }

    /**
     * Calculates a stat value.
     * @param hp Whether this is an HP stat. If true, nature is ignored.
     * @param base Base stat.
     * @param level Pokemon's level.
     * @param evs Effort values, between 0 and 252.
     * @param ivs Individual values, between 0 and 31.
     * @param nature Nature modifier.
     * @returns The calculated stat value.
     */
    public static calcStat(hp: boolean, base: number, level: number,
        evs: number, ivs: number, nature: 0.9 | 1 | 1.1): number
    {
        const x = Math.floor(2 * base + ivs + Math.floor(evs / 4));

        let result: number;
        if (hp) result = Math.floor((x + 100) * level / 100 + 10);
        else result =  Math.floor(x * level / 100 + 5);

        return hp ? result : Math.floor(result * nature);
    }
}
