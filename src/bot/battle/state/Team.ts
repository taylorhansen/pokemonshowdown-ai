import { Pokemon } from "./Pokemon";

/** Team state. */
export class Team
{
    /** Gets the active pokemon. */
    public get active(): Pokemon
    {
        return this.pokemon[0];
    }

    /**
     * Size of the team. This should be set before the battle officially starts,
     * or the entire list of pokemon will be cleared.
     */
    public get size(): number
    {
        return this.pokemon.length;
    }
    public set size(size: number)
    {
        for (let i = 0 ; i < size; ++i)
        {
            this.pokemon[i] = new Pokemon();
        }

        // delete any other element slots if they exist
        if (this.pokemon.length > size)
        {
            this.pokemon.splice(size);
        }
        this.unrevealed = 0;
    }

    /** The pokemon that compose this team. First one is always active. */
    public readonly pokemon: Pokemon[] = [];

    /** Team-related status conditions. */
    private readonly status: TeamStatus = new TeamStatus();
    /**
     * Index of the next pokemon that hasn't been revealed to the user yet.
     * Indexes to the `pokemon` field after or equal to this value are invalid.
     */
    private unrevealed = 0;

    /**
     * Finds the first pokemon with the species name.
     * @param species Species name.
     * @returns The index of the pokemon that was found, or -1 otherwise.
     */
    public find(species: string): number
    {
        return this.pokemon.findIndex(mon => mon.species === species);
    }

    /**
     * Indicates that a new pokemon has been switched in and will replace the
     * current active pokemon.
     * @param species Species name.
     * @param level Pokemon's level.
     * @param gender Pokemon's gender.
     * @param hp Current HP.
     * @param hpMax Maximum HP. Omit to assume percentage.
     * @returns The index of the new pokemon, or -1 if already full.
     */
    public newSwitchin(species: string, level: number,
        gender: string | null, hp: number, hpMax?: number): number
    {
        // early return: team already full
        if (this.unrevealed >= this.size) return -1;

        // switch active status
        this.active.switchOut();
        const revealed = this.reveal(species, level, gender, hp, hpMax);
        this.switchIn(revealed);

        return revealed;
    }

    /**
     * Indicates that a pokemon has been switched in and will replace the
     * current active pokemon.
     * @param index Index of the pokemon being switched in.
     */
    public switchIn(index: number): void
    {
        // early return: trying to access an invalid pokemon
        if (index < 0 || index >= this.unrevealed) return;

        // switch active status
        this.active.switchOut();
        this.pokemon[index].switchIn();

        const tmp = this.pokemon[0];
        this.pokemon[0] = this.pokemon[index];
        this.pokemon[index] = tmp;
    }

    /**
     * Indicates that a new pokemon has been revealed.
     * @param species Species name.
     * @param level Pokemon's level.
     * @param gender Pokemon's gender.
     * @param hp Current HP.
     * @param hpMax Maximum HP. Omit to assume percentage.
     * @returns The index of the new pokemon, or -1 if already full.
     */
    public reveal(species: string, level: number,
        gender: string | null, hp: number, hpMax?: number): number
    {
        this.pokemon[this.unrevealed] = new Pokemon();

        // initialize new pokemon
        const newMon = this.pokemon[this.unrevealed];
        newMon.species = species;
        newMon.level = level;
        newMon.gender = gender;
        newMon.setHP(hp, hpMax);

        return this.unrevealed++;
    }

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
${this.pokemon.map(
        // FIXME: some kind of off by one error displaying 1 more unrevealed
        //  pokemon data than needed
        (mon, i) => `${s}mon${i + 1}:${i < this.unrevealed ?
                `\n${mon.toString(indent + 4)}` : " <unrevealed>"}`)
    .join("\n")}`;
    }

    /**
     * Formats all the team info into an array of numbers.
     * @returns All team data in array form.
     */
    public toArray(): number[]
    {
        const a =
        [
            ...this.status.toArray(),
            ...([] as number[]).concat(
                ...this.pokemon.map(mon => mon.toArray()))
        ];
        return a;
    }
}

/** Temporary status conditions for a certain team. */
export class TeamStatus
{
    // TODO

    /**
     * Encodes all team status data into a string
     * @returns The TeamStatus in string form.
     */
    public toString(): string
    {
        return "[]";
    }

    /**
     * Formats team status info into an array of numbers.
     * @returns All team status data in array form.
     */
    public toArray(): number[]
    {
        return [];
    }
}
