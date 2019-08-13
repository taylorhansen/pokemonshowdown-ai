import { weatherItems } from "../dex/dex-util";
import { ItemTempStatus } from "./ItemTempStatus";
import { TempStatus } from "./TempStatus";

/** Temporary status conditions for the entire field. */
export class RoomStatus
{
    /** Gravity field effect. */
    public readonly gravity = new TempStatus("gravity", 5);

    /** Trick Room status. */
    public readonly trickRoom = new TempStatus("trick room", 5);

    /** Weather effect (usually temporary). */
    public readonly weather = new ItemTempStatus([5, 8], weatherItems);

    /** Called at the end of every turn to update temp statuses. */
    public postTurn(): void
    {
        // weather is updated manually by in-game events, whereas with these
        //  effects they're silent
        this.gravity.tick();
        this.trickRoom.tick();
    }

    // istanbul ignore next: only used in logging
    /**
     * Encodes all room status data into a string.
     * @returns The RoomStatus in string form.
     */
    public toString(): string
    {
        return `[${([] as string[]).concat(
                this.gravity.isActive ? [this.gravity.toString()] : [],
                this.trickRoom.isActive ? [this.trickRoom.toString()] : [],
                [`weather: ${this.weather.toString()}`])
            .join(", ")}]`;
    }
}
