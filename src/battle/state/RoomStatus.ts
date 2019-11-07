import { weatherItems, WeatherType } from "../dex/dex-util";
import { ItemTempStatus, ReadonlyItemTempStatus } from "./ItemTempStatus";
import { ReadonlyTempStatus, TempStatus } from "./TempStatus";

/** Readonly RoomStatus representation. */
export interface ReadonlyRoomStatus
{
    /** Gravity field effect. */
    readonly gravity: ReadonlyTempStatus;
    /** Trick Room status. */
    readonly trickRoom: ReadonlyTempStatus;
    /** Weather effect (usually temporary). */
    readonly weather: ReadonlyItemTempStatus<WeatherType>;
}

/** Temporary status conditions for the entire field. */
export class RoomStatus implements ReadonlyRoomStatus
{
    /** @override */
    public readonly gravity = new TempStatus("gravity", 5);
    /** @override */
    public readonly trickRoom = new TempStatus("trick room", 5);
    /** @override */
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
