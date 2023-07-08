import {HpType, PokemonData, StatName} from "../dex";
import {ReadonlyStatRange, StatRange} from "./StatRange";

type ReadonlyStatRanges = {readonly [T in StatName]: ReadonlyStatRange};
type StatRanges = {readonly [T in StatName]: StatRange};

/** Readonly {@link StatTable} representation. */
export interface ReadonlyStatTable extends ReadonlyStatRanges {
    /** Pokemon's level from 1 to 100 used for stat calcs. */
    readonly level: number;
    /** Hidden power type, or `null` if unknown. */
    readonly hpType: HpType | null;

    /** Encodes all stat table data into a string. */
    readonly toString: () => string;
}

/** Tracks stat ranges and species/level for stat calculations. */
export class StatTable implements ReadonlyStatTable, StatRanges {
    /** @override */
    public readonly level: number;
    /** Hit points. */
    public readonly hp: StatRange;
    /** Attack. */
    public readonly atk: StatRange;
    /** Defense. */
    public readonly def: StatRange;
    /** Special Attack. */
    public readonly spa: StatRange;
    /** Special Defense. */
    public readonly spd: StatRange;
    /** Speed. */
    public readonly spe: StatRange;

    /**
     * Creates a StatTable and calculates all the stats.
     *
     * @param species Reference to the species data for looking up base stats.
     * @param level Pokemon's level from 1 to 100, used to calculate stats.
     * @param hp Override HP stat.
     */
    public static base(
        species: PokemonData,
        level: number,
        hp?: StatRange,
    ): StatTable {
        return new StatTable(
            level,
            hp ? {...species.baseStats, hp} : species.baseStats,
        );
    }

    private constructor(
        level: number,
        baseStats: {readonly [T in StatName]: number | StatRange},
        public hpType: HpType | null = null,
    ) {
        // Clamp between 1-100.
        this.level = Math.max(1, Math.min(level, 100));

        this.hp =
            typeof baseStats.hp === "number"
                ? new StatRange(baseStats.hp, this.level, true /*hp*/)
                : baseStats.hp;
        this.atk =
            typeof baseStats.atk === "number"
                ? new StatRange(baseStats.atk, this.level)
                : baseStats.atk;
        this.def =
            typeof baseStats.def === "number"
                ? new StatRange(baseStats.def, this.level)
                : baseStats.def;
        this.spa =
            typeof baseStats.spa === "number"
                ? new StatRange(baseStats.spa, this.level)
                : baseStats.spa;
        this.spd =
            typeof baseStats.spd === "number"
                ? new StatRange(baseStats.spd, this.level)
                : baseStats.spd;
        this.spe =
            typeof baseStats.spe === "number"
                ? new StatRange(baseStats.spe, this.level)
                : baseStats.spe;
    }

    /**
     * Creates a partial shallow copy from a Transform target, overriding the HP
     * stat with that of the Transform user.
     */
    public transform(hp: StatRange): StatTable {
        return new StatTable(
            this.level,
            {
                // Note: Transform preserves hp stat.
                hp,
                atk: this.atk,
                def: this.def,
                spa: this.spa,
                spd: this.spd,
                spe: this.spe,
            },
            // Note(gen4): Transform also copies hpType.
            this.hpType,
        );
    }

    // istanbul ignore next: Only used in logging.
    /** @override */
    public toString(): string {
        return `[${[
            `L${this.level}`,
            `hp: ${this.hp}`,
            `atk: ${this.atk}`,
            `def: ${this.def}`,
            `spa: ${this.spa}`,
            `spd: ${this.spd}`,
            `spe: ${this.spe}`,
        ].join(", ")}]`;
    }
}
