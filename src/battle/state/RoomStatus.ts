import { pluralTurns } from "./utility";
import { Weather } from "./Weather";

/** Temporary status conditions for the entire field. */
export class RoomStatus
{
    /** Gravity field effect (temporary). */
    public get gravity(): boolean
    {
        return this._gravityTurns > 0;
    }
    public set gravity(value: boolean)
    {
        this._gravityTurns = value ? 1 : 0;
    }
    /** The amount of turns Gravity was in effect. */
    public get gravityTurns(): number
    {
        return this._gravityTurns;
    }
    // TODO: increment this value every turn until the field effect ends
    private _gravityTurns = 0;

    /** Weather effect (usually temporary). */
    public readonly weather = new Weather();

    // istanbul ignore next: only used in logging
    /**
     * Encodes all room status data into a string.
     * @returns The RoomStatus in string form.
     */
    public toString(): string
    {
        return `[${([] as string[])
            .concat(
                this.gravity ?
                    [pluralTurns("gravity", this._gravityTurns - 1)] : [],
                [`weather: ${this.weather.toString()}`])
            .join(", ")}]`;
    }
}
