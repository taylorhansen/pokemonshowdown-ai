import { RoomStatus } from "./Room";
import { Team } from "./Team";

/** Identifies a team's side in the client's perspective. */
export type Side = "us" | "them";

/** Returns the other side. */
export function otherSide(side: Side): Side
{
    return side === "us" ? "them" : "us";
}

/**
 * Holds all the data about a battle. This is used as input to the nerual
 * network.
 */
export class BattleState
{
    /** Team data. */
    public readonly teams: {readonly [S in Side]: Team} =
        { us: new Team(), them: new Team() };

    /** Global status conditions for the entire room. */
    private readonly status = new RoomStatus();

    /**
     * Gets the size of the return value of `toArray()`.
     * @returns The size of the return value of `toArray()`.
     */
    public static getArraySize(): number
    {
        // status + 2 teams
        return RoomStatus.getArraySize() + Team.getArraySize() * 2;
    }

    /**
     * Formats battle info into an array of numbers. As the battle state
     * changes, the length of this array should not change.
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
}
