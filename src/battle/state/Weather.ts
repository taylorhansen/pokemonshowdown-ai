import { weatherItems, WeatherType } from "../dex/dex-util";
import { Pokemon } from "./Pokemon";
import { pluralTurns } from "./utility";

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
        else if (type !== "none" && source.item.definiteValue &&
            source.item.definiteValue.name === weatherItems[type])
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
                    if (!this._source.item.definiteValue)
                    {
                        // must have a weather rock
                        this._source.item.narrow(weatherItems[type]);
                        this._duration = 8;
                    }
                    else throw new Error(errorString());
                }
                else throw new Error(errorString());
            }
        }
    }

    // istanbul ignore next: only used in logging
    /**
     * Encodes weather data into a string.
     * @returns The Weather object in string form.
     */
    public toString(): string
    {
        if (this._type === "none") return "none";
        return pluralTurns(this._type, this._turns,
            this._duration || undefined);
    }
}
