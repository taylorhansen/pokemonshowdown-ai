import { MajorStatus, majorStatuses } from "../../dispatcher/messages";
import { dex } from "../dex/dex";
import { PokemonData, Type, types } from "../dex/dex-types";
import { HP } from "./HP";
import { Move } from "./Move";
import { oneHot } from "./utility";
import { VolatileStatus } from "./VolatileStatus";

/** Holds all the possibly incomplete info about a pokemon. */
export class Pokemon
{
    /** Whether this is the current active pokemon. */
    public get active(): boolean
    {
        return this._active;
    }
    /** Whether this is the current active pokemon. */
    private _active: boolean = false;

    /** Species/form display name. */
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
    /** ID name of the species. */
    private speciesName = "";
    /** Pokemon species/form unique identifier. */
    private _species = 0;

    /** Ability id name. Setter allows either id name or display name. */
    public get baseAbility(): string
    {
        return this.baseAbilityName;
    }
    public set baseAbility(baseAbility: string)
    {
        if (!this.data) throw new Error("Base ability set before species data");

        // make sure ability name is converted to an id name
        const name = baseAbility.toLowerCase().replace(/[ -]+/g, "");

        if (!this.data.abilities.hasOwnProperty(name))
        {
            throw new Error(
                `Species ${this.species} can't have ability ${name}`);
        }

        this.baseAbilityName = name;
        this._baseAbility = this.data.abilities[name];
    }
    /** ID name of the base ability. */
    private baseAbilityName = "";
    /**
     * Base ability relative to its species. Can be 1 or 2 indicating which
     * ability that is.
     */
    private _baseAbility?: number;

    /** Item id name. Setter allows either id name or display name. */
    public get item(): string
    {
        return this.itemName;
    }
    public set item(item: string)
    {
        // make sure item name is converted to an id name
        const name = item.toLowerCase().replace(/[ -]+/g, "");

        if (!dex.items.hasOwnProperty(name))
        {
            throw new Error(`Invalid item name ${name}`);
        }

        this.itemName = name;
        this._item = dex.items[item];
    }
    /** ID name of the held item. */
    private itemName = "";
    /** Item the pokemon is holding. */
    private _item = 0;

    /** Possible hidden power types. */
    public get possibleHPTypes(): {readonly [T in Type]: boolean}
    {
        return this._hpTypes;
    }
    /** Rules out all possible hidden power types except this one. */
    public set hpType(type: Type)
    {
        for (const hpType in this._hpTypes)
        {
            // istanbul ignore if
            if (!this._hpTypes.hasOwnProperty(hpType)) continue;
            this._hpTypes[hpType as Type] = hpType === type;
        }
    }
    /** Possible hidden power types. */
    private readonly _hpTypes: {[T in Type]: boolean} = {...types};

    /** Pokemon's level. Clamped between the closed interval `[1, 100]`. */
    public get level(): number
    {
        return this._level;
    }
    public set level(level: number)
    {
        this._level = Math.max(1, Math.min(level, 100));
    }
    /** Pokemon's level from 1 to 100. */
    private _level = 0;

    /** Known moveset. */
    public get moves(): ReadonlyArray<Move>
    {
        return this._moves.slice(0, this.unrevealedMove);
    }
    /** Known moveset. */
    private readonly _moves: Move[];

    /** Pokemon's gender. */
    public gender: string | null;

    /** Whether this pokemon is fainted. */
    public get fainted(): boolean
    {
        return this.hp.current === 0;
    }
    /** Info about the pokemon's hit points. */
    public readonly hp: HP;

    /** Current major status condition. Not cleared on switch. */
    public majorStatus: MajorStatus = "";

    /** Minor status conditions. Cleared on switch. */
    public get volatile(): VolatileStatus
    {
        return this._volatile;
    }
    /** Minor status conditions. Cleared on switch. */
    private _volatile = new VolatileStatus();

    /** Dex data. */
    private data?: PokemonData;
    /** First index of the part of the moveset that is unknown. */
    private unrevealedMove = 0;

    /**
     * Creates a Pokemon.
     * @param hpPercent Whether to report HP as a percentage.
     */
    constructor(hpPercent: boolean)
    {
        this.hp = new HP(hpPercent);
        this._active = false;
        this._moves = Array.from({length: 4}, () => new Move());
    }

    /**
     * Copies volatile status state to another pokemon.
     * @param mon Pokemon that will receive the volatile status.
     */
    public copyVolatile(mon: Pokemon): void
    {
        mon._volatile = this._volatile.shallowClone();
    }

    /** Tells the pokemon that it is currently being switched in. */
    public switchIn(): void
    {
        this._active = true;
    }

    /**
     * Tells the pokemon that it is currently being switched out. Clears
     * volatile status.
     */
    public switchOut(): void
    {
        this._active = false;
        this._volatile.clear();
    }

    /** Tells the pokemon that it has fainted. */
    public faint(): void
    {
        this.hp.set(0, 0);
    }

    /**
     * Rules out a possible hidden power type.
     * @param type Type that can't be the pokemon's hidden power type.
     */
    public ruleOutHPType(type: Type): void
    {
        this._hpTypes[type] = false;
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
     * @param pp Amount of PP to use.
     */
    public useMove(id: string, pp: number): void
    {
        (this.getMove(id) || this.revealMove(id)).use(pp);
    }

    /**
     * Checks whether a move can be made.
     * @param index Index of the move.
     * @returns Whether the move can be made.
     */
    public canMove(index: number): boolean
    {
        return index >= 0 && index < this._moves.length &&
            this._moves[index].pp > 0 && !this._volatile.isDisabled(index);
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
     * Applies the disabled volatile status to a move.
     * @param id ID name of the move.
     */
    public disableMove(id: string): void
    {
        if (!this.getMove(id)) this.revealMove(id);
        const index = this.moves.findIndex(move => move.id === id);
        this.volatile.disableMove(index);
    }

    /**
     * Gets the size of the return value of `toArray()`.
     * @param active Whether to include active pokemon data, e.g. volatile
     * status.
     * @returns The size of the return value of `toArray()`.
     */
    public static getArraySize(active: boolean): number
    {
        return /*gender*/2 + dex.numPokemon + dex.numItems + /*baseAbility*/2 +
            /*level*/1 + Move.getArraySize() * 4 + HP.getArraySize() +
            /*hidden power type*/Object.keys(types).length +
            /*majorStatus except empty*/Object.keys(majorStatuses).length - 1 +
            (active ? VolatileStatus.getArraySize() : 0);
    }

    /**
     * Formats pokemon info into an array of numbers.
     * @returns All pokemon data in array form.
     */
    public toArray(): number[]
    {

        // one-hot encode categorical data
        const species = oneHot(this._species, dex.numPokemon);
        const item = oneHot(this._item, dex.numItems);
        const baseAbility = oneHot(this._baseAbility!, 2);
        const hpTypes = (Object.keys(types) as Type[])
            .map(type => this._hpTypes[type] ? 1 : 0);
        const majorStatus = (Object.keys(majorStatuses) as MajorStatus[])
            // only include actual statuses, not the empty string
            .filter(status => status !== "")
            .map(status => this.majorStatus === status ? 1 : 0);

        const a =
        [
            this.gender === "M" ? 1 : 0, this.gender === "F" ? 1 : 0,
            ...species, ...item, ...baseAbility, ...hpTypes, this._level,
            ...([] as number[]).concat(
                ...this._moves.map(move => move.toArray())),
            ...this.hp.toArray(),
            ...majorStatus
        ];
        if (this._active) a.push(...this._volatile.toArray());
        return a;
    }

    // istanbul ignore next: only used for logging
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
${s}possibleHPTypes: [${(Object.keys(types) as Type[])
    .filter(type => this._hpTypes[type]).join(", ")}]
${this._moves.map(
        (move, i) => `${s}move${i + 1}:${i < this.unrevealedMove ?
                `\n${move.toString(indent + 4)}` : " <unrevealed>"}`)
    .join("\n")}
${s}volatile: ${this._volatile.toString()}`;
    }
}
