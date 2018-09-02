import { Pokemon } from "./Pokemon";
import { RoomStatus } from "./Room";
import { Team } from "./Team";

/** Identifies a team's side in the client's perspective. */
export type Side = "us" | "them";

/**
 * Holds all the data about a battle. This is used as input to the nerual
 * network.
 */
export class BattleState
{
    /** Global status conditions for the entire room. */
    private readonly status = new RoomStatus();
    /** Team data. */
    private readonly teams: {readonly [S in Side]: Team} =
        { us: new Team(), them: new Team() };

    /**
     * Sets a team's size.
     * @param side Side of the team.
     * @param size How many pokemon are on that team.
     */
    public setTeamSize(side: Side, size: number): void
    {
        this.teams[side].size = size;
    }

    /**
     * Gets the active pokemon of the given side.
     * @param side The given side.
     * @returns The team's active pokemon.
     */
    public getActive(side: Side): Pokemon
    {
        return this.teams[side].active;
    }

    /**
     * Gets all pokemon on the given side.
     * @param side The given side.
     * @returns The team's pokemon.
     */
    public getPokemon(side: Side): Pokemon[]
    {
        return this.teams[side].pokemon;
    }

    /**
     * Formats battle info into an array of numbers.
     * @returns All battle data in array form.
     */
    public toArray(): number[]
    {
        const a =
        [
            ...this.status.toArray(),
            ...this.teams.us.toArray(),
            ...this.teams.them.toArray()
        ];
        return a;
    }
}
