import { HPType, hpTypes, PokemonData, StatName, statNames } from
    "../dex/dex-util";
import { PossibilityClass, ReadonlyPossibilityClass } from "./PossibilityClass";
import { ReadonlyStatRange, StatRange } from "./StatRange";

type ReadonlyStatRanges = {readonly [T in StatName]: ReadonlyStatRange};
type StatRanges = {readonly [T in StatName]: StatRange};

/** Readonly StatTable representation. */
export interface ReadonlyStatTable extends ReadonlyStatRanges
{
    /** Pokemon's level from 1 to 100 used for stat calculations. */
    readonly level: number | null;
    /** Reference to the base species data. Setting this will re-calc stats. */
    readonly data: PokemonData | null;
    /** Hidden power type possibility tracker. */
    readonly hpType: ReadonlyPossibilityClass<typeof hpTypes[HPType]>;
}

/** Tracks stat ranges and species/level for stat calculations. */
export class StatTable implements ReadonlyStatTable, StatRanges
{
    public readonly hp = new StatRange(/*hp*/true);
    public readonly atk = new StatRange();
    public readonly def = new StatRange();
    public readonly spa = new StatRange();
    public readonly spd = new StatRange();
    public readonly spe = new StatRange();

    // TODO: when doing damage calcs, only the base level should be considered
    // stat calcs use the current form's level
    /** @override */
    public get level(): number | null { return this._level; }
    public set level(level: number | null)
    {
        if (level === null) return;
        const recalc = level !== this._level;

        this._level = Math.max(1, Math.min(level, 100));
        if (recalc) this.initStats();
    }
    private _level: number | null = null;

    /** @override */
    public get data(): PokemonData | null { return this._data; }
    public set data(data: PokemonData | null)
    {
        const recalc = data !== this._data;

        this._data = data;
        if (recalc) this.initStats();
    }
    private _data: PokemonData | null = null;

    /** @override */
    public readonly hpType = new PossibilityClass(hpTypes);

    /** Attempts to calculate stats. Silently fails if incomplete info. */
    private initStats(): void
    {
        if (!this._data || !this._level) return;

        for (const stat in statNames)
        {
            // istanbul ignore if
            if (!statNames.hasOwnProperty(stat)) continue;
            this[stat as StatName].calc(this._data.baseStats[stat as StatName],
                this._level);
        }
    }

    // istanbul ignore next: only used in logging
    /** Encodes all stat table data into a string. */
    public toString(): string
    {
        return `[${([] as string[]).concat(
            `L${this._level ? this._level : "??"}`,
            `hp: ${this.hp}`,
            `atk: ${this.atk}`,
            `def: ${this.def}`,
            `spa: ${this.spa}`,
            `spd: ${this.spd}`,
            `spe: ${this.spe}`
        ).join(", ")}]`;
    }
}
