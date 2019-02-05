import { Pokemon } from "./Pokemon";
import { Side } from "./Side";
import { TeamStatus } from "./TeamStatus";

/** Options for switchin methods. */
export interface SwitchInOptions
{
    /** Whether volatile status should be copied onto the replacing pokemon. */
    copyVolatile?: boolean;
}

/** Team state. */
export class Team
{
    /** Maximum team size. */
    public static readonly MAX_SIZE = 6;

    /** Gets the active pokemon. */
    public get active(): Pokemon
    {
        return this._pokemon[0];
    }

    /**
     * Size of the team. This should be set before the battle officially starts,
     * or the entire list of pokemon will be cleared.
     */
    public get size(): number
    {
        return this._size;
    }
    public set size(size: number)
    {
        this._size = Math.max(1, Math.min(size, Team.MAX_SIZE));

        // clear pokemon array
        for (let i = 0; i < Team.MAX_SIZE; ++i)
        {
            this._pokemon[i] = new Pokemon(/*hpPercent*/ this.side === "them");
        }
        this.unrevealed = 0;
    }

    /** The pokemon that compose this team. First one is always active. */
    public get pokemon(): ReadonlyArray<Pokemon>
    {
        return this._pokemon;
    }

    /** List of pokemon. */
    private readonly _pokemon = new Array<Pokemon>(Team.MAX_SIZE);
    /** Team size for this battle. */
    private _size = 0;

    /** Team-related status conditions. */
    public readonly status: TeamStatus = new TeamStatus();
    private readonly side: Side;

    /**
     * Index of the next pokemon that hasn't been revealed to the user yet.
     * Indexes to the `pokemon` field after or equal to this value point to
     * newly constructed Pokemon objects that haven't been fully initialized
     * yet.
     */
    private unrevealed = 0;

    /**
     * Creates a Team object.
     * @param side The Side this Team is on.
     */
    constructor(side: Side)
    {
        this.side = side;
    }

    /**
     * Indicates that a new pokemon has been switched in and will replace the
     * current active pokemon.
     * @param species Species name.
     * @param level Pokemon's level.
     * @param gender Pokemon's gender.
     * @param hp Current HP.
     * @param hpMax Maximum HP.
     * @param options Circumstances of switchin.
     * @returns The new active pokemon, or null if invalid.
     */
    public switchIn(species: string, level: number, gender: string | null,
        hp: number, hpMax: number, options: SwitchInOptions = {}):
        Pokemon | null
    {
        let index = this._pokemon.findIndex(mon => mon.species === species);
        if (index < 0)
        {
            // revealing a new pokemon
            index = this.revealIndex(species, level, gender, hp, hpMax);
        }

        // early return: trying to access an invalid pokemon
        if (index < 0 || index >= this.unrevealed) return null;

        // switch active status
        if (options.copyVolatile)
        {
            this.active.copyVolatile(this._pokemon[index]);
        }
        this.active.switchOut();
        this._pokemon[index].switchIn();

        const tmp = this._pokemon[0];
        this._pokemon[0] = this._pokemon[index];
        this._pokemon[index] = tmp;
        return this.active;
    }

    /**
     * Indicates that a new pokemon has been revealed.
     * @param species Species name.
     * @param level Pokemon's level.
     * @param gender Pokemon's gender.
     * @param hp Current HP.
     * @param hpMax Maximum HP.
     * @returns The new pokemon, or null if the operation would overflow the
     * current team size.
     */
    public reveal(species: string, level: number, gender: string | null,
        hp: number, hpMax: number): Pokemon | null
    {
        const index = this.revealIndex(species, level, gender, hp, hpMax);
        if (index < 0) return null;
        return this._pokemon[index];
    }

    /**
     * Indicates that a new pokemon has been revealed.
     * @param species Species name.
     * @param level Pokemon's level.
     * @param gender Pokemon's gender.
     * @param hp Current HP.
     * @param hpMax Maximum HP.
     * @returns The index of the new pokemon, or -1 if the operation would
     * overflow the current team size.
     */
    private revealIndex(species: string, level: number, gender: string | null,
        hp: number, hpMax: number): number
    {
        // early return: team already full
        if (this.unrevealed === this._size) return -1;

        this._pokemon[this.unrevealed] =
            new Pokemon(/*hpPercent*/ this.side === "them");

        // initialize new pokemon
        const newMon = this._pokemon[this.unrevealed];
        newMon.species = species;
        newMon.level = level;
        newMon.gender = gender;
        newMon.hp.set(hp, hpMax);

        return this.unrevealed++;
    }

    /** Cures all pokemon of any major status conditions. */
    public cure(): void
    {
        for (const mon of this._pokemon) mon.majorStatus = "";
    }

    /**
     * Gets the size of the return value of `toArray()`.
     * @returns The size of the return value of `toArray()`.
     */
    public static getArraySize(): number
    {
        // size field
        return 1 +
            // active pokemon
            Pokemon.getArraySize(/*active*/ true) +
            // side pokemon
            (Team.MAX_SIZE - 1) * Pokemon.getArraySize(/*active*/ false) +
            // status
            TeamStatus.getArraySize();
    }

    /**
     * Formats all the team info into an array of numbers.
     * @returns All team data in array form.
     */
    public toArray(): number[]
    {
        const a =
        [
            this._size,
            ...([] as number[]).concat(
                ...this._pokemon.map(mon => mon.toArray())),
            ...this.status.toArray()
        ];
        return a;
    }

    // istanbul ignore next: only used for logging
    /**
     * Encodes all team data into a string.
     * @param indent Indentation level to use.
     * @returns The Team in string form.
     */
    public toString(indent = 0): string
    {
        const s = " ".repeat(indent);
        return `\
${s}status: ${this.status.toString()}
${this._pokemon.map(
        (mon, i) => `${s}mon${i + 1}:${i < this.unrevealed ?
                `\n${mon.toString(indent + 4)}` : " <unrevealed>"}`)
    .join("\n")}`;
    }
}
