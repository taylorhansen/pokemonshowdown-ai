import {weatherItems, WeatherType} from "../dex";
import {ReadonlyMultiTempStatus, MultiTempStatus} from "./MultiTempStatus";
import {ReadonlyTempStatus, TempStatus} from "./TempStatus";

/** Readonly {@link RoomStatus} representation. */
export interface ReadonlyRoomStatus {
    /** Gravity field effect. */
    readonly gravity: ReadonlyTempStatus;
    /** Trick Room status. */
    readonly trickroom: ReadonlyTempStatus;
    /** Weather effect (usually temporary). */
    readonly weather: ReadonlyMultiTempStatus<WeatherType>;

    /** Encodes all room status data into a string. */
    readonly toString: () => string;
}

/** Temporary status conditions for the entire field. */
export class RoomStatus implements ReadonlyRoomStatus {
    /** @override */
    public readonly gravity = new TempStatus("gravity", 5);
    /** @override */
    public readonly trickroom = new TempStatus("trickroom", 5);
    /** @override */
    public readonly weather = new MultiTempStatus(weatherItems, 8);

    /** Called at the end of every turn to update temp statuses. */
    public postTurn(): void {
        // Weather is updated manually by in-game events, whereas with these
        // pseudo-weather effects they're updated silently.
        this.gravity.tick();
        this.trickroom.tick();
    }

    // istanbul ignore next: Only used in logging.
    /** @override */
    public toString(): string {
        return `[${([] as string[])
            .concat(
                this.gravity.isActive ? [this.gravity.toString()] : [],
                this.trickroom.isActive ? [this.trickroom.toString()] : [],
                [`weather: ${this.weather.toString()}`],
            )
            .join(", ")}]`;
    }
}
