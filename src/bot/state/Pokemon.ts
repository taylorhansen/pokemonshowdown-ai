import { dex, PokemonData } from "../../../data/dex";

/** Holds all the possibly incomplete info about a pokemon. */
export class Pokemon
{
    public set species(species: string)
    {
        this.data = dex.pokemon[species];
        this._species = this.data.uid;
    }

    public set baseAbility(baseAbility: string)
    {
        this._baseAbility = this.data.abilities[baseAbility];
    }

    public set item(item: string)
    {
        this._item = dex.items[item];
    }

    public set level(level: number)
    {
        this._level = Math.max(1, Math.min(level, 100));
    }

    /** Pokemon's gender. */
    public gender: string | null;

    /** Dex data. */
    private data: PokemonData;
    /** Pokemon species/form unique identifier. */
    private _species: number;
    /** Item the pokemon is holding. */
    private _item: number;
    /**
     * Base ability relative to its species. Can be 1 or 2 indicating which
     * ability that is.
     */
    private _baseAbility: number;
    /** Pokemon's level from 1 to 100. */
    private _level: number;
    /** Known moveset. */
    private moves: Move[];
    /** Info about the pokemon's hit points. */
    private hp: HP;
    /** Current major status condition. Not cleared on switch. */
    private status?: MajorStatusName; // TODO
    /** Minor status conditions. Cleared on switch. */
    private readonly volatileStatus = new VolatileStatus();

    /**
     * Does some initialization steps on first switchin.
     * @param species Unique form/species id number.
     * @param level Pokemon's level.
     * @param maxHp Max HP. If omitted, the HP is interpreted as a percentage.
     */
    public firstSwitchin(species: number, level: number, maxHp?: number): void
    {
        this._species = species;
        this.level = level;
        this.hp = new HP(maxHp);
    }

    /**
     * Clears all volatile status conditions. This happens when the pokemon is
     * switched out usually.
     */
    public clearVolatile(): void
    {
        this.volatileStatus.clear();
    }

    /**
     * Sets the data about a move.
     * @param index Index of the move.
     * @param id Move ID name.
     * @param pp Current PP.
     * @param ppMax Maximum PP.
     */
    public setMove(index: number, id: string, pp: number, ppMax: number): void
    {
        this.moves[index].set(dex.moves[id], pp, ppMax);
    }

    /**
     * Disables a certain move.
     * @param index Index of the move.
     * @param disabled Disabled status. Omit to assume true.
     */
    public disableMove(index: number, disabled: boolean = true): void
    {
        this.volatileStatus.disableMove(index, disabled);
    }

    public setHP(current: number, max: number): void
    {
        this.hp.max = max;
        this.hp.current = current;
    }

    public setMajorStatus(status: MajorStatusName): void
    {
        this.status = status;
    }
}

/** Information about a certain move. */
export class Move
{
    /** Amount of power points left on this move. */
    public get ppLeft(): number
    {
        return this.ppMax - this.pp;
    }

    /** Move id. */
    private id: number;
    /** Current power points. */
    private pp: number;
    /** Maximum amount of power points. */
    private ppMax: number;

    /**
     * Overwrites move data.
     * @param id ID number.
     * @param pp Current power points.
     * @param ppMax Maximum amount of power points.
     */
    public set(id: number, pp: number, ppMax: number): void
    {
        this.id = id;
        this.pp = pp;
        this.ppMax = ppMax;
    }
}

/** Hit points info. */
export class HP
{
    /** Current HP. */
    public set current(hp: number)
    {
        this._current = Math.min(Math.max(0, hp), this._max);
    }

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
        if (max)
        {
            this.current = max;
            this.max = max;
            this.isPercent = false;
        }
        else
        {
            this.current = 100;
            this.max = 100;
            this.isPercent = true;
        }
    }
}

/** Major pokemon status conditions. */
export type MajorStatusName = "brn" | "par" | "psn" | "tox" | "slp" | "frz";

/**
 * Contains the minor or temporary status conditions of a pokemon that are
 * removed upon switch.
 */
export class VolatileStatus
{
    /** Stat boost stages. */
    private statBoosts: {[N in BoostableStatName]: BoostStage};
    private disabledMoves: boolean[];
    // TODO: everything else

    /** Creates a VolatileStatus object. */
    constructor()
    {
        this.clear();
    }

    /** Clears all volatile status conditions. */
    public clear(): void
    {
        this.statBoosts =
        {
            atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0
        };
        this.disabledMoves = [];
    }

    /**
     * Disables a certain move.
     * @param index Index of the move.
     * @param disabled Disabled status. Omit to assume true.
     */
    public disableMove(move: number, disabled: boolean = true): void
    {
        this.disabledMoves[move] = disabled;
    }
}

/** Names of pokemon stats that can be boosted. */
export type BoostableStatName = "atk" | "def" | "spa" | "spd" | "spe" |
    "accuracy" | "evasion";
/** Maximum and minimum stat boost stages. */
export type BoostStage = -6 | -5 | -4 | -3 | -2 | -1 | 0 | 1 | 2 | 3 | 4 | 5 |
    6;
