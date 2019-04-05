/** Temporary status conditions for the entire field. */
export class RoomStatus
{
    /** Gravity field effect. */
    public gravity = false;

    /**
     * Gets the size of the return value of `toArray()`.
     * @returns The size of the return value of `toArray()`.
     */
    public static getArraySize(): number
    {
        return /*gravity*/1;
    }

    // istanbul ignore next: unstable, hard to test
    /**
     * Formats room info into an array of numbers.
     * @returns All room data in array form.
     */
    public toArray(): number[]
    {
        return [this.gravity ? 1 : 0];
    }

    // istanbul ignore next: only used in logging
    /**
     * Encodes all room status data into a string.
     * @returns The RoomStatus in string form.
     */
    public toString(): string
    {
        return `[${this.gravity ? "gravity" : ""}]`;
    }
}
