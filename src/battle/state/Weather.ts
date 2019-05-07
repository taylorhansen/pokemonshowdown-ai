import { Pokemon } from "./Pokemon";
import { limitedStatusTurns, pluralTurns } from "./utility";

/** Types of weather conditions. */
export type WeatherType = "none" | "SunnyDay" | "RainDance" | "Sandstorm" |
    "Hail";

/** Maps weather type to its weather-extending item name. */
const weatherItems: {readonly [T in WeatherType]: string} =
{
    none: "", SunnyDay: "heatrock", RainDance: "damprock",
    Sandstorm: "smoothrock", Hail: "icyrock"
};

/** Tracks weather effects. */
export class Weather
{
    // all fields are initialized on #reset() in the constructor

    /** Current weather type. */
    public get type(): WeatherType
    {
        return this._type;
    }
    private _type!: WeatherType;

    /** The pokemon that caused the weather condition if there is one. */
    public get source(): Pokemon | null
    {
        return this._source;
    }
    private _source!: Pokemon | null;

    /** Number gives duration, null means infinite. */
    public get duration(): number | null
    {
        return this._duration;
    }
    private _duration!: number | null;

    /** Number of turns the weather has been active. */
    public get turns(): number
    {
        return this._turns;
    }
    private _turns!: number;

    /** Creates a Weather object. */
    constructor()
    {
        this.reset();
    }

    /** Resets weather to `none`. */
    public reset(): void
    {
        this._type = "none";
        this._source = null;
        this._duration = null;
        this._turns = 0;
    }

    /**
     * Changes the current weather.
     * @param type Type of weather being activated.
     * @param source The Pokemon that caused the change.
     * @param ability Whether this was caused by an ability.
     */
    public set(type: WeatherType, source: Pokemon, ability?: boolean): void
    {
        this._type = type;
        this._source = source;

        // gen<6: ability-caused weather lasts forever
        if (ability) this._duration = null;
        else if (type !== "none" && source.item === weatherItems[type])
        {
            this._duration = 8;
        }
        else this._duration = 5;

        this._turns = 0;
    }

    /**
     * Indicates that the weather will last for another turn.
     * @param type Type of weather being upkept.
     */
    public upkeep(type: WeatherType): void
    {
        if (this._type !== type)
        {
            throw new Error(`Missed a change in weather \
(previous=${this._type}, new=${type})`);
        }
        // istanbul ignore next: should never happen, but nothing should happen
        //  if it does
        if (type === "none") return;

        if (this._duration !== null)
        {
            ++this._turns;
            if (this._turns >= this._duration && this._source)
            {
                // error string in case handling fails
                const errorString = () => `Weather going longer than expected \
(duration=${this._duration}, turns=${this._turns})`;

                // hit weather duration cap
                if (this._duration === 5)
                {
                    // somehow still going
                    if (!this._source.item)
                    {
                        // must have a weather rock
                        this._source.item = weatherItems[type];
                        this._duration = 8;
                    }
                    else throw new Error(errorString());
                }
                else throw new Error(errorString());
            }
        }
    }

    /**
     * Gets the size of the return value of `toArray()`.
     * @returns The size of the return value of `toArray()`.
     */
    public static getArraySize(): number
    {
        return /*weather types excluding none*/Object.keys(weatherItems)
            .length - 1;
    }

    // istanbul ignore next: unstable, hard to test
    /**
     * Formats weather info into an array of numbers.
     * @returns All weather data in array form.
     */
    public toArray(): number[]
    {
        // encode likelihood of the weather persisting for next turn
        // -1 = no, 0 = n/a, 1 = yes, in between = maybe
        let persistence: number;

        // weather not applicable
        if (this._type === "none") persistence = 0;
        // infinite duration
        else if (this._duration === null) persistence = 1;
        // 1 turn left
        else if (this._duration - this._turns === 1)
        {
            // possibly no, but could have a weather rock
            // TODO: scale by likelihood that it has the item
            if (this._duration === 5 && this._source && !this._source.item)
            {
                persistence = -0.5;
            }
            else persistence = -1;
        }
        // could have weather rock so take average of both durations
        // TODO: interpolate instead by likelihood that it has the item
        else if (this._duration === 5 && this._source && !this._source.item)
        {
            persistence = limitedStatusTurns(this._turns, 6.5);
        }
        else persistence = limitedStatusTurns(this._turns, this._duration);

        // one-hot encode weather type, inserting persistence value as the "one"
        return (Object.keys(weatherItems) as WeatherType[])
            .filter(t => t !== "none")
            .map(t => t === this._type ? persistence : 0);
    }

    // istanbul ignore next: only used in logging
    /**
     * Encodes weather data into a string.
     * @returns The Weather object in string form.
     */
    public toString(): string
    {
        if (this._type === "none") return "none";
        return pluralTurns(this._type, this.turns, this._duration || undefined);
    }
}
