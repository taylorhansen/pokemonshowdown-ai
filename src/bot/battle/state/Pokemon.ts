import { dex } from "../../../../data/dex";
import { PokemonData } from "../../../../data/dex-types";

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
    private data: PokemonData;
    /** ID name of the species. */
    private speciesName = "";
    /** Pokemon species/form unique identifier. */
    private _species: number;
    /** ID name of the held item. */
    private itemName = "";
    /** Item the pokemon is holding. */
    private _item: number;
    /** ID name of the base ability. */
    private baseAbilityName = "";
    /**
     * Base ability relative to its species. Can be 1 or 2 indicating which
     * ability that is.
     */
    private _baseAbility: number;
    /** Pokemon's level from 1 to 100. */
    private _level: number;
    /** Known moveset. */
    private readonly _moves: Move[] = [];
    /** First index of the part of the moveset that is unknown. */
    private unrevealedMove = 0; // TODO
    /** Info about the pokemon's hit points. */
    private hp: HP = new HP();
    /** Current major status condition. Not cleared on switch. */
    private status?: MajorStatusName; // TODO
    /** Minor status conditions. Cleared on switch. */
    private readonly volatileStatus = new VolatileStatus();

    /**
     * Creates a Pokemon.
     */
    constructor()
    {
        this._active = false;

        // initialize moveset
        for (let i = 0; i < 4; ++i)
        {
            this._moves[i] = new Move();
        }
    }

    /** Tells the pokemon that it is currently being switched in. */
    public switchIn(): void
    {
        this._active = true;
    }

    /** Tells the pokemon that it is currently being switched out. */
    public switchOut(): void
    {
        this._active = false;
        this.volatileStatus.clear();
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
     */
    public revealMove(id: string): void
    {
        this._moves[this.unrevealedMove++].id = id;
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

    // TODO: replace this method with stuff like revealMove() and useMove()
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
     * Sets the pokemon's major status condition.
     * @param status Name of condition.
     */
    public setMajorStatus(status: MajorStatusName): void
    {
        this.status = status;
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
${s}status: ${this.status ? this.status : "none"}
${this._moves.map(
        (move, i) => `${s}move${i + 1}:${i < this.unrevealedMove ?
                `\n${move.toString(indent + 4)}` : " <unrevealed>"}`)
    .join("\n")}
${s}volatile: ${this.volatileStatus.toString()}`;
    }

    /**
     * Formats pokemon info into an array of numbers.
     * @returns All pokemon data in array form.
     */
    public toArray(): number[]
    {
        const a =
        [
            this.gender === "M" ? 1 : 0,
            this.gender === "F" ? 1 : 0,
            this._species, this._item, this._baseAbility, this._level,
            ...([] as number[]).concat(
                ...this._moves.map(move => move.toArray())),
            ...this.hp.toArray(),
            this.status === "brn" ? 1 : 0,
            this.status === "par" ? 1 : 0,
            this.status === "psn" ? 1 : 0,
            this.status === "tox" ? 1 : 0,
            this.status === "slp" ? 1 : 0,
            this.status === "frz" ? 1 : 0
        ];
        if (this._active)
        {
            a.push(...this.volatileStatus.toArray());
        }
        return a;
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
    private _id: number;
    /** Current power points. */
    private _pp: number;
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

    /**
     * Formats move info into an array of numbers.
     * @returns All move data in array form.
     */
    public toArray(): number[]
    {
        return [this._id, this._pp];
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

    /**
     * Encodes all hp data into a string.
     * @returns The HP in string form.
     */
    public toString(): string
    {
        return `${this._current}/${this._max}${this.isPercent ? "%" : ""}`;
    }

    /**
     * Formats hp info into an array of numbers.
     * @returns All hp data in array form.
     */
    public toArray(): number[]
    {
        return [this._current, this._max];
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
}

/** Names of pokemon stats that can be boosted. */
export type BoostableStatName = "atk" | "def" | "spa" | "spd" | "spe" |
    "accuracy" | "evasion";
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
