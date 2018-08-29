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
    private status: TeamStatus;

    /**
     * Size of the team. This should be called before the battle officially
     * starts, or the entire list of pokemon will be cleared.
     */
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
    }
}

/** Temporary status conditions for a certain team. */
export class TeamStatus
{
    // TODO
}
