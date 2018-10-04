import { dex } from "../../../data/dex";
import { PokemonData } from "../../../data/dex-types";

/** Holds all the possibly incomplete info about a pokemon. */
export class Pokemon
{
    /** Whether this pokemon is fainted. */
    public get fainted(): boolean
    {
        return this.hp.current === 0;
    }

    /** Whether this is the current active pokemon. */
    public get active(): boolean
    {
        return this._active;
    }

    /** Species/form name. */
    public get species(): string
    {
        return this.speciesName;
    }
    public set species(species: string)
    {
        this.speciesName = species;
        this.data = dex.pokemon[species];
        this._species = this.data.uid;
    }

    /** Ability id name. */
    public get baseAbility(): string
    {
        return this.baseAbilityName;
    }
    public set baseAbility(baseAbility: string)
    {
        this.baseAbilityName = baseAbility;
        if (!this.data)
        {
            throw new Error("Base ability set before species data");
        }
        this._baseAbility = this.data.abilities[baseAbility];
    }

    /** Item id name. */
    public get item(): string
    {
        return this.itemName;
    }
    public set item(item: string)
    {
        this.itemName = item;
        this._item = dex.items[item];
    }

    /** Pokemon's level. */
    public get level(): number
    {
        return this._level;
    }
    public set level(level: number)
    {
        this._level = Math.max(1, Math.min(level, 100));
    }

    /** Known moveset. */
    public get moves(): Move[]
    {
        return this._moves.slice(0, this.unrevealedMove);
    }

    /** Pokemon's gender. */
    public gender: string | null;

    /** Whether this is the current active pokemon. */
    private _active: boolean = false;
    /** Dex data. */
    private data?: PokemonData;
    /** ID name of the species. */
    private speciesName = "";
    /** Pokemon species/form unique identifier. */
    private _species = 0;
    /** ID name of the held item. */
    private itemName = "";
    /** Item the pokemon is holding. */
    private _item = 0;
    /** ID name of the base ability. */
    private baseAbilityName = "";
    /**
     * Base ability relative to its species. Can be 1 or 2 indicating which
     * ability that is.
     */
    private _baseAbility?: number;
    /** Pokemon's level from 1 to 100. */
    private _level = 0;
    /** Known moveset. */
    private readonly _moves: Move[] = [];
    /** First index of the part of the moveset that is unknown. */
    private unrevealedMove = 0;
    /** Info about the pokemon's hit points. */
    private hp: HP = new HP();
    /** Current major status condition. Not cleared on switch. */
    private majorStatus: MajorStatusName = "";
    /** Minor status conditions. Cleared on switch. */
    private volatileStatus = new VolatileStatus();

    /** Creates a Pokemon. */
    constructor()
    {
        this._active = false;

        // initialize moveset
        for (let i = 0; i < 4; ++i)
        {
            this._moves[i] = new Move();
        }
    }

    /**
     * Gets the size of the return value of `toArray()`.
     * @param active Whether to include active pokemon data, e.g. volatile
     * status.
     * @returns The size of the return value of `toArray()`.
     */
    public static getArraySize(active: boolean): number
    {
        // gender
        return 2 +
            dex.numPokemon +
            dex.numItems +
            // base ability
            2 +
            // level
            1 +
            Move.getArraySize() * 4 +
            HP.getArraySize() +
            // major status names excluding empty status
            Object.keys(majorStatusNames).length - 1 +
            (active ? VolatileStatus.getArraySize() : 0);
    }

    /**
     * Formats pokemon info into an array of numbers.
     * @returns All pokemon data in array form.
     */
    public toArray(): number[]
    {
        // one-hot encode categorical data
        const species = Array.from({length: dex.numPokemon},
            (v, i) => i === this._species ? 1 : 0);
        const item = Array.from({length: dex.numItems},
            (v, i) => i === this._item ? 1 : 0);
        const baseAbility = Array.from({length: 2},
            (v, i) => i === this._baseAbility ? 1 : 0);

        const a =
        [
            this.gender === "M" ? 1 : 0, this.gender === "F" ? 1 : 0,
            ...species, ...item, ...baseAbility,
            this._level,
            ...([] as number[]).concat(
                ...this._moves.map(move => move.toArray())),
            ...this.hp.toArray(),
            this.majorStatus === "brn" ? 1 : 0,
            this.majorStatus === "par" ? 1 : 0,
            this.majorStatus === "psn" ? 1 : 0,
            this.majorStatus === "tox" ? 1 : 0,
            this.majorStatus === "slp" ? 1 : 0,
            this.majorStatus === "frz" ? 1 : 0
        ];
        if (this._active)
        {
            a.push(...this.volatileStatus.toArray());
        }
        return a;
    }

    /**
     * Tells the pokemon that it is currently being switched in.
     * @param volatile Volatile status to set for this pokemon.
     */
    public switchIn(volatile?: VolatileStatus): void
    {
        this._active = true;
        if (volatile)
        {
            this.volatileStatus = volatile;
        }
        else
        {
            this.volatileStatus.clear();
        }
    }

    /**
     * Tells the pokemon that it is currently being switched out.
     * @returns Volatile status before switching out.
     */
    public switchOut(): VolatileStatus
    {
        this._active = false;
        const v = this.volatileStatus.shallowClone();
        this.volatileStatus.clear();
        return v;
    }

    /** Tells the pokemon that it has fainted. */
    public faint(): void
    {
        this.setHP(0, 0);
    }

    /**
     * Sets the pokemon's HP.
     * @param current Current HP.
     * @param max Maximum HP. Omit to assume a percentage.
     */
    public setHP(current: number, max?: number): void
    {
        this.hp = new HP(max);
        this.hp.current = current;
    }

    /**
     * Reveals a move to the client.
     * @param id ID name of the move.
     * @returns The new move.
     */
    public revealMove(id: string): Move
    {
        const move = new Move();
        move.id = id;
        this._moves[this.unrevealedMove++] = move;
        return move;
    }

    /**
     * Indicates that a move has been used.
     * @param id ID name of the move.
     * @param effect ID name of the effect that caused the move.
     */
    public useMove(id: string, effect: string): void
    {
        const move = this.getMove(id) || this.revealMove(id);
        // could be locked into using a move, where no pp is consumed
        if (effect !== "lockedmove")
        {
            move.use();
        }
    }

    /**
     * Checks whether a move can be made.
     * @param index Index of the move.
     * @returns Whether the move can be made.
     */
    public canMove(index: number): boolean
    {
        return index < this._moves.length && index < this.unrevealedMove &&
            this._moves[index].pp > 0 && !this.volatileStatus.isDisabled(index);
    }

    /**
     * Gets the pokemon's move by name.
     * @param id ID name of the move.
     * @returns The pokemon's move that matches the ID name, or null if not
     * found.
     */
    public getMove(id: string): Move | null
    {
        const index = this.moves.findIndex(move => move.id === id);
        return index !== -1 ? this.moves[index] : null;
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
        this.unrevealedMove = index + 1; // TODO: remake this method to reveal?
        this._moves[index].set(dex.moves[id].uid, pp, ppMax);
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

    /**
     * Afflicts the pokemon with a major status condition.
     * @param status Name of condition.
     */
    public afflict(status: MajorStatusName): void
    {
        this.majorStatus = status;
    }

    /** Cures the pokemon of a major status condition. */
    public cure(): void
    {
        this.afflict("");
    }

    /**
     * Encodes all pokemon data into a string.
     * @param indent Indentation level to use.
     * @returns The Pokemon in string form.
     */
    public toString(indent = 0): string
    {
        const s = " ".repeat(indent);
        return `\
${s}${this.speciesName}
${s}active: ${this.active}
${s}level: ${this._level}
${s}gender: ${this.gender ? this.gender : "genderless"}
${s}item: ${this.itemName ? this.itemName : "<unknown>"}
${s}ability: ${this.baseAbilityName ? this.baseAbilityName : "<unknown>"}
${s}hp: ${this.hp.toString()}
${s}majorStatus: ${this.majorStatus ? this.majorStatus : "none"}
${this._moves.map(
        (move, i) => `${s}move${i + 1}:${i < this.unrevealedMove ?
                `\n${move.toString(indent + 4)}` : " <unrevealed>"}`)
    .join("\n")}
${s}volatile: ${this.volatileStatus.toString()}`;
    }
}

/** Information about a certain move. */
export class Move
{
    /** Move id name. */
    public get id(): string
    {
        return this.idName;
    }
    public set id(name: string)
    {
        this.idName = name;
        const data = dex.moves[name];
        this._id = data.uid;
        this._pp = data.pp;
        this.ppMax = data.pp;
    }

    /** Amount of power points left on this move. */
    public get pp(): number
    {
        return this._pp;
    }

    /** Move id name. */
    private idName = "";
    /** Move id. */
    private _id = 0;
    /** Current power points. */
    private _pp = 0;
    /** Maximum amount of power points. */
    private ppMax = 0;

    /**
     * Gets the size of the return value of `toArray()`.
     * status.
     * @returns The size of the return value of `toArray()`.
     */
    public static getArraySize(): number
    {
        // move id
        return dex.numMoves +
            // pp
            1;
    }

    /**
     * Formats move info into an array of numbers.
     * @returns All move data in array form.
     */
    public toArray(): number[]
    {
        // one-hot encode move id
        const id = Array.from({length: dex.numMoves},
            (v, i) => i === this._id ? 1 : 0);

        return [...id, this._pp];
    }

    /**
     * Indicates that the move has been used.
     * @param pp Amount of power points to consume, or 1 by default.
     */
    public use(pp = 1): void
    {
        this._pp = Math.max(0, Math.min(this._pp - pp, this.ppMax));
    }

    /**
     * Overwrites move data.
     * @param id ID number.
     * @param pp Current power points.
     * @param ppMax Maximum amount of power points.
     */
    public set(id: number, pp: number, ppMax: number): void
    {
        this._id = id;
        this._pp = pp;
        this.ppMax = ppMax;
    }

    /**
     * Encodes all move data into a string.
     * @param indent Indentation level to use.
     * @returns The Move in string form.
     */
    public toString(indent = 0): string
    {
        const s = " ".repeat(indent);
        return `\
${s}id: ${this.id}
${s}pp: ${this.pp}
${s}ppMax: ${this.ppMax}`;
    }
}

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

/**
 * Contains the minor or temporary status conditions of a pokemon that are
 * removed upon switch.
 */
export class VolatileStatus
{
    /** Stat boost stages. */
    private statBoosts: {[N in BoostableStatName]: BoostStage};
    /** Whether the corresponding move in the pokemon's moveset is disabled. */
    private disabledMoves: boolean[];
    // TODO: everything else

    /** Creates a VolatileStatus object. */
    constructor()
    {
        this.clear();
    }

    /**
     * Converts a number to a string where positive numbers are preceded by a
     * `+` symbol.
     * @param n Number to convert.
     * @returns The number in string form with explicit sign.
     */
    private static plus(n: number): string
    {
        return (n > 0 ? "+" : "") + n;
    }

    /**
     * Gets the size of the return value of `toArray()`.
     * status.
     * @returns The size of the return value of `toArray()`.
     */
    public static getArraySize(): number
    {
        // boostable stats
        return Object.keys(boostableStatNames).length +
            // disabled moves
            4;
    }

    /**
     * Formats volatile status info into an array of numbers.
     * @returns All volatile status data in array form.
     */
    public toArray(): number[]
    {
        const a =
        [
            ...Object.keys(this.statBoosts).map(
                (key: BoostableStatName) => this.statBoosts[key]),
            ...this.disabledMoves.map(b => b ? 1 : 0)
        ];
        return a;
    }

    /**
     * Creates a shallow clone of this VolatileStatus.
     * @returns A shallow clone of this object.
     */
    public shallowClone(): VolatileStatus
    {
        const v = new VolatileStatus();
        v.statBoosts = this.statBoosts;
        v.disabledMoves = this.disabledMoves;
        return v;
    }

    /**
     * Clears all volatile status conditions. This does not affect shallow
     * clones.
     */
    public clear(): void
    {
        this.statBoosts =
        {
            atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0
        };
        this.disabledMoves = [false, false, false, false];
    }

    /**
     * Checks whether a move is disabled.
     * @param move Index of the move.
     * @returns Whether the move is disabled.
     */
    public isDisabled(move: number): boolean
    {
        return this.disabledMoves[move];
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

    /**
     * Encodes all volatile status data into a string.
     * @returns The VolatileStatus in string form.
     */
    public toString(): string
    {
        return `[${
            Object.keys(this.statBoosts)
            .filter((key: BoostableStatName) => this.statBoosts[key] !== 0)
            .map((key: BoostableStatName) =>
                `${key}: ${VolatileStatus.plus(this.statBoosts[key])}`)
            .concat(this.disabledMoves
                .filter(disabled => disabled)
                .map((disabled, i) => `disabled move ${i + 1}`))
            .join(", ")}]`;
    }
}

/** Holds the set of all boostable stat names. */
export const boostableStatNames =
{
    atk: true, def: true, spa: true, spd: true, spe: true, accuracy: true,
    evasion: true
};
/** Names of pokemon stats that can be boosted. */
export type BoostableStatName = keyof typeof boostableStatNames;

/** Maximum and minimum stat boost stages. */
export type BoostStage = -6 | -5 | -4 | -3 | -2 | -1 | 0 | 1 | 2 | 3 | 4 | 5 |
    6;

/** Hold the set of all major status names. Empty string means no status. */
export const majorStatusNames =
{
    brn: true, par: true, psn: true, tox: true, slp: true, frz: true, "": true
};
/** Major pokemon status conditions. */
export type MajorStatusName = keyof typeof majorStatusNames;

/**
 * Checks if a string matches a major status name.
 * @param condition String to be checked.
 * @returns True if the name matches, false otherwise.
 */
export function isMajorStatus(condition: string): condition is MajorStatusName
{
    return majorStatusNames.hasOwnProperty(condition);
}
