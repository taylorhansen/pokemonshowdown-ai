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
     * Gets the given side's team.
     * @param side The given side.
     * @returns The appropriate team.
     */
    public getTeam(side: Side): Team
    {
        return this.teams[side];
    }

    /**
     * Encodes all state data into a string.
     * @param indent Indentation level to use.
     * @returns The BattleState in string form.
     */
    public toString(indent = 0): string
    {
        const s = " ".repeat(indent);
        return `\
${s}status: ${this.status.toString()}
${s}us:
${this.teams.us.toString(indent + 4)}
${s}them:
${this.teams.them.toString(indent + 4)}`;
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
