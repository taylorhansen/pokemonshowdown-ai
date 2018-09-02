import { Pokemon } from "./Pokemon";

/** Team state. */
export class Team
{
    /** Gets the active pokemon. */
    public get active(): Pokemon
    {
        return this.pokemon[0];
    }

    /** The pokemon that compose this team. First one is always active. */
    public readonly pokemon: Pokemon[] = [];

    /** Team-related status conditions. */
    private readonly status: TeamStatus = new TeamStatus();

    /**
     * Size of the team. This should be called before the battle officially
     * starts, or the entire list of pokemon will be cleared.
     */
    public set size(size: number)
    {
        for (let i = 0 ; i < size; ++i)
        {
            this.pokemon[i] = new Pokemon(/*active=*/ i === 0);
        }

        // delete any other element slots if they exist
        if (this.pokemon.length > size)
        {
            this.pokemon.splice(size);
        }
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
     * Formats team status info into an array of numbers.
     * @returns All team status data in array form.
     */
    public toArray(): number[]
    {
        return [];
    }
}
