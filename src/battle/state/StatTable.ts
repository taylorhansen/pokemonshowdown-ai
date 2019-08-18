import { PokemonData, StatName, statNames } from "../dex/dex-util";
import { Pokemon } from "./Pokemon";
import { StatRange } from "./StatRange";

/** Tracks stat ranges and level for stat calculations. */
export class StatTable
{
    public readonly hp = new StatRange(/*hp*/true);
    public readonly atk = new StatRange();
    public readonly def = new StatRange();
    public readonly spa = new StatRange();
    public readonly spd = new StatRange();
    public readonly spe = new StatRange();

    // other fields initialized in constructor on #reset()

    /** Pokemon's level from 1 to 100. */
    public get level(): number | null { return this._level; }
    public set level(level: number | null)
    {
        if (level === null) return;
        this._level = Math.max(1, Math.min(level, 100));
        this.initStats();
    }
    private _level!: number | null;

    /** Reference to the linked Pokemon. Setting this will re-set data/level. */
    public get linked(): Pokemon | null { return this._linked; }
    public set linked(mon: Pokemon | null)
    {
        this._linked = mon;
        if (mon && mon.hasSpecies)
        {
            this._data = mon.species;
            // trigger setter which will calc stats
            // should still work if mon.stats refers to this
            this.level = mon.stats.level;
        }
    }
    private _linked!: Pokemon | null;

    /** Reference to the base species data. Setting this will re-calc stats. */
    public get data(): PokemonData | null { return this._data; }
    public set data(data: PokemonData | null)
    {
        this._data = data;
        this.initStats();
    }
    private _data!: PokemonData | null;

    /** Creates a StatTable. */
    constructor() { this.reset(); }

    /** Unlinks this StatTable and resets everything. */
    public reset(): void
    {
        this.hp.reset();
        this.atk.reset();
        this.def.reset();
        this.spa.reset();
        this.spd.reset();
        this.spe.reset();
        this._level = null;
        this._linked = null;
        this._data = null;
    }

    /** Attempts to calculate stats. Silently fails if incomplete info. */
    private initStats(): void
    {
        if (!this.data || !this._level) return;

        for (const stat in statNames)
        {
            // istanbul ignore if
            if (!statNames.hasOwnProperty(stat)) continue;
            this[stat as StatName].calc(this.data.baseStats[stat as StatName],
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
