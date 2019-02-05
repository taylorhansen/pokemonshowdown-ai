import { SelfSwitch } from "../dex/dex-types";

/** Temporary status conditions for a certain team. */
export class TeamStatus
{
    public selfSwitch: SelfSwitch = false;

    /**
     * Gets the size of the return value of `toArray()`.
     * @returns The size of the return value of `toArray()`.
     */
    public static getArraySize(): number
    {
        return /*selfSwitch*/ 2;
    }

    /**
     * Formats team status info into an array of numbers.
     * @returns All team status data in array form.
     */
    public toArray(): number[]
    {
        const result =
        [
            this.selfSwitch ? 1 : 0, this.selfSwitch === "copyvolatile" ? 1 : 0
        ];
        return result;
    }

    // istanbul ignore next: only used for logging
    /**
     * Encodes all team status data into a string
     * @returns The TeamStatus in string form.
     */
    public toString(): string
    {
        return `[${this.selfSwitch ? `selfSwitch: ${this.selfSwitch}` : ""}]`;
    }
}
