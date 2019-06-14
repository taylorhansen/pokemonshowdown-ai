import { pluralTurns } from "./utility";
import { Weather } from "./Weather";

/** Temporary status conditions for the entire field. */
export class RoomStatus
{
    /** Gravity field effect (temporary). */
    public get gravity(): boolean { return this._gravityTurns > 0; }
    public set gravity(value: boolean) { this._gravityTurns = value ? 1 : 0; }
    /** The amount of turns Gravity was in effect. */
    public get gravityTurns(): number { return this._gravityTurns; }
    private _gravityTurns = 0;

    /** Weather effect (usually temporary). */
    public readonly weather = new Weather();

    /** Called at the end of every turn to update temp statuses. */
    public postTurn(): void
    {
        // weather is updated manually by in-game events, whereas with gravity
        //  it's silent
        if (this.gravity) ++this._gravityTurns;
    }

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
