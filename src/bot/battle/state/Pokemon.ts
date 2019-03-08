import { MajorStatus, majorStatuses, toIdName } from "../../helpers";
import { dex } from "../dex/dex";
import { PokemonData, types } from "../dex/dex-types";
import { HP } from "./HP";
import { Move } from "./Move";
import { PossibilityClass } from "./PossibilityClass";
import { VolatileStatus } from "./VolatileStatus";

/** Holds all the possibly incomplete info about a pokemon. */
export class Pokemon
{
    /** Whether this is the current active pokemon. */
    public get active(): boolean
    {
        return this._active;
    }
    private _active: boolean = false;

    /** Species/form display name. */
    public get species(): string
    {
        return this.speciesName;
    }
    public set species(species: string)
    {
        // set will throw if species doesn't exist so check for that first
        this._species.set(species);
        this.speciesName = species;
        this.data = dex.pokemon[species];
        this._baseAbility.set(this.data.abilities);
    }
    /** ID name of the species. */
    private speciesName = "";
    /** Pokemon species/form unique identifier. */
    private _species = new PossibilityClass<PokemonData>(dex.pokemon,
        x => x.uid - 1);

    /** Current ability id name. Can temporarily change while active. */
    public get ability(): string
    {
        // ability has been overridden
        if (this.volatile.overrideAbilityName)
        {
            return this.volatile.overrideAbilityName;
        }
        // not overridden/initialized
        return this.baseAbility;
    }
    public set ability(ability: string)
    {
        // make sure ability name is converted to an id name
        const name = toIdName(ability);

        if (!dex.abilities.hasOwnProperty(name))
        {
            throw new Error(`Unknown ability "${ability}"`);
        }

        // narrow down baseAbility
        if (!this._baseAbility.definiteValue)
        {
            if (!this.data)
            {
                throw new Error("Base ability set before species data");
            }
            if (!this.data.abilities.includes(name))
            {
                throw new Error(
                    `Species ${this.species} can't have base ability ${name}`);
            }

            this._baseAbility.set(name);
        }

        // override current ability
        const id = dex.abilities[name];
        this.volatile.overrideAbility = id;
        this.volatile.overrideAbilityName = name;
    }
    /** Base ability id name. May be empty if not yet narrowed. */
    public get baseAbility(): string
    {
        if (!this._baseAbility.definiteValue) return "";
        return this._baseAbility.definiteValue.name;
    }
    /** Base ability possibility tracker. */
    private _baseAbility = new PossibilityClass(dex.abilities);

    /** Item id name. Setter allows either id name or display name. */
    public get item(): string
    {
        return this.itemName;
    }
    public set item(item: string)
    {
        // make sure item name is converted to an id name
        const name = item.toLowerCase().replace(/[ -]+/g, "");

        // can throw if invalid name
        try { this._item.set(name); }
        catch (e) { throw new Error(`Invalid item name ${name}`); }

        this.itemName = name;
    }
    /** ID name of the held item. */
    private itemName = "";
    /** Item the pokemon is holding. */
    private _item = new PossibilityClass(dex.items);

    /** Hidden power type possibility tracker. */
    public readonly hpType = new PossibilityClass(types);

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
        if (this._baseAbility.definiteValue)
        {
            ({
                name: this.volatile.overrideAbilityName,
                id: this.volatile.overrideAbility
            } =
                this._baseAbility.definiteValue);
        }
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
     * Reveals a move to the client.
     * @param id ID name of the move.
     * @returns The new move.
     */
    public revealMove(id: string): Move
    {
        const move = new Move();
        if (id.startsWith("hiddenpower") && id.length > "hiddenpower".length)
        {
            // set hidden power type
            // format: hiddenpower<type><base power if gen2-5>
            this.hpType.set(id.substr("hiddenpower".length).replace(/\d+/, ""));
            id = "hiddenpower";
        }
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
        return /*gender*/2 + dex.numPokemon + dex.numItems + dex.numAbilities +
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
        const majorStatus = (Object.keys(majorStatuses) as MajorStatus[])
            // only include actual statuses, not the empty string
            .filter(status => status !== "")
            .map(status => this.majorStatus === status ? 1 : 0);

        const a =
        [
            this.gender === "M" ? 1 : 0, this.gender === "F" ? 1 : 0,
            ...this._species.toArray(), ...this._item.toArray(),
            ...this._baseAbility.toArray(), ...this.hpType.toArray(),
            this._level,
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
${s}${this.speciesName}${this.gender ? ` ${this.gender}` : ""} lv${this.level} \
${this.hp.toString()}${this.majorStatus ? ` ${this.majorStatus}` : ""}
${s}active: ${this.active}\
${this.active ? `\n${s}volatile: ${this._volatile.toString()}` : ""}
${s}item: ${this.itemName ? this.itemName : "<unrevealed>"}
${s}ability: \
${this._baseAbility.definiteValue ?
    (this.volatile.overrideAbilityName &&
            this.volatile.overrideAbilityName !== this.baseAbility ?
        `${this.volatile.overrideAbilityName} (${this.baseAbility})`
        : this.baseAbility)
    : `possibly ${this._baseAbility.toString()}`}
${s}hiddenpower: \
${this.hpType.definiteValue ?
    this.hpType.definiteValue.name
    : `possibly ${this.hpType.toString()}`}
${s}moves: ${this._moves.map((m, i) =>
    i < this.unrevealedMove ? m.toString() : "<unrevealed>").join(", ")}`;
    }
}
